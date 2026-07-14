import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

export interface DuelRow {
  id: string;
  role: 'challenger' | 'opponent';
  opponent_user_id: string;
  opponent_name: string | null;
  opponent_avatar: string | null;
  status: 'pending' | 'accepted' | 'resolved' | 'declined' | 'expired';
  week_key: string;
  created_at: string;
  winner_id: string | null;
  my_xp: number;
  opp_xp: number;
}

export type DuelActionKind = 'resolve' | 'refresh' | 'respond' | 'challenge';
export interface DuelActionLog {
  id: string;
  kind: DuelActionKind;
  ok: boolean;
  message: string;
  at: number;
  duelId?: string;
}

export type ResolveStep = 'idle' | 'sending' | 'computing' | 'awarding' | 'syncing' | 'done' | 'error';

const HISTORY_KEY = 'aura_duels_action_history_v1';
const MAX_HISTORY = 12;

function loadHistory(): DuelActionLog[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory(items: DuelActionLog[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch {}
}

// Roda uma promise com timeout configurável
async function withTimeout<T>(p: Promise<T>, ms: number, label = 'operação'): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Tempo esgotado: ${label} demorou mais de ${Math.round(ms/1000)}s`)), ms)),
  ]);
}

function classifyError(err: any): string {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('tempo esgotado') || msg.includes('timeout')) return 'Tempo de resposta esgotado. Verifique sua conexão e tente novamente.';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network')) return 'Sem conexão com o servidor. Verifique sua internet — vamos tentar recuperar automaticamente.';
  if (msg.includes('fetch')) return 'Falha de rede ao falar com o servidor. Tentando recuperar…';
  return err?.message || 'Erro desconhecido';
}

export function useAuraDuels() {
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveStep, setResolveStep] = useState<ResolveStep>('idle');
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<DuelActionLog[]>(() => loadHistory());
  const recoveryTimerRef = useRef<number | null>(null);

  const pushLog = useCallback((entry: Omit<DuelActionLog, 'id' | 'at'>) => {
    setHistory((prev) => {
      const next = [{ ...entry, id: crypto.randomUUID?.() || String(Math.random()), at: Date.now() }, ...prev].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async (opts?: { silent?: boolean; logResult?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setSyncing(true);
    try {
      const { data, error } = await withTimeout<any>(
        (supabase as any).rpc('aura_duels_my_list'),
        12_000,
        'sincronizar duelos'
      );
      if (error) throw error;
      setDuels((data as DuelRow[]) || []);
      if (opts?.logResult) pushLog({ kind: 'refresh', ok: true, message: 'Lista atualizada' });
      return true;
    } catch (err: any) {
      const msg = classifyError(err);
      if (opts?.logResult) pushLog({ kind: 'refresh', ok: false, message: msg });
      throw new Error(msg);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [pushLog]);

  // Auto-recover: reagenda refresh silencioso após falha
  const scheduleAutoRecover = useCallback((delayMs = 5000) => {
    if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = window.setTimeout(async () => {
      try {
        await refresh({ silent: true });
        toast.success('Status do duelo recuperado automaticamente');
      } catch {
        // tenta novamente em janela maior, até no máximo ~30s
        if (delayMs < 25_000) scheduleAutoRecover(Math.min(delayMs * 2, 25_000));
      }
    }, delayMs) as unknown as number;
  }, [refresh]);

  useEffect(() => {
    // Difere a 1ª carga para depois do paint (não bloqueia o above-the-fold do Aura Match)
    // e silencia o erro de timeout inicial — o auto-recover já cuida da retomada.
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: any) => number)
      | undefined;
    const kick = () => {
      refresh({ silent: true }).catch(() => {
        scheduleAutoRecover(4000);
      });
    };
    const handle = idle ? idle(kick, { timeout: 1500 }) : window.setTimeout(kick, 600);
    return () => {
      if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
      const cancelIdle = (window as any).cancelIdleCallback as ((h: number) => void) | undefined;
      if (idle && cancelIdle) cancelIdle(handle as number);
      else window.clearTimeout(handle as number);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const challenge = useCallback(async (opponent: string) => {
    setBusy(true);
    try {
      const { data, error } = await withTimeout<any>(
        (supabase as any).rpc('aura_duel_challenge', { p_opponent: opponent }),
        12_000,
        'enviar desafio'
      );
      const res = Array.isArray(data) ? data[0] : data;
      if (error || !res?.ok) {
        const msg = res?.message || 'Não foi possível desafiar';
        toast.error(msg);
        pushLog({ kind: 'challenge', ok: false, message: msg });
        return false;
      }
      toast.success('Desafio enviado! ⚔️');
      pushLog({ kind: 'challenge', ok: true, message: 'Desafio enviado' });
      await refresh({ silent: true });
      return true;
    } catch (err: any) {
      const msg = classifyError(err);
      toast.error(msg);
      pushLog({ kind: 'challenge', ok: false, message: msg });
      scheduleAutoRecover(4000);
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh, pushLog, scheduleAutoRecover]);

  const respond = useCallback(async (duelId: string, accept: boolean) => {
    setBusy(true);
    try {
      const fn = accept ? 'aura_duel_accept' : 'aura_duel_decline';
      const { data, error } = await withTimeout<any>(
        (supabase as any).rpc(fn, { p_duel: duelId }),
        12_000,
        accept ? 'aceitar duelo' : 'recusar duelo'
      );
      const res = Array.isArray(data) ? data[0] : data;
      if (error || !res?.ok) {
        const msg = res?.message || 'Erro ao responder ao duelo';
        toast.error(msg);
        pushLog({ kind: 'respond', ok: false, message: msg, duelId });
        return;
      }
      const okMsg = accept ? 'Duelo aceito' : 'Duelo recusado';
      toast.success(okMsg + (accept ? '!' : ''));
      pushLog({ kind: 'respond', ok: true, message: okMsg, duelId });
      await refresh({ silent: true });
    } catch (err: any) {
      const msg = classifyError(err);
      toast.error(msg);
      pushLog({ kind: 'respond', ok: false, message: msg, duelId });
      scheduleAutoRecover(4000);
    } finally {
      setBusy(false);
    }
  }, [refresh, pushLog, scheduleAutoRecover]);

  const resolve = useCallback(async (duelId: string) => {
    setResolvingId(duelId);
    setResolveStep('sending');
    try {
      // pequena animação de etapas — não bloqueia
      setTimeout(() => setResolveStep((s) => (s === 'sending' ? 'computing' : s)), 350);
      setTimeout(() => setResolveStep((s) => (s === 'computing' ? 'awarding' : s)), 900);

      const { data, error } = await withTimeout<any>(
        (supabase as any).rpc('aura_duel_resolve', { p_duel: duelId }),
        15_000,
        'resolver duelo'
      );
      const res = Array.isArray(data) ? data[0] : data;
      if (error || !res?.ok) {
        const msg = res?.message || 'Não foi possível resolver o duelo';
        toast.error(msg);
        pushLog({ kind: 'resolve', ok: false, message: msg, duelId });
        setResolveStep('error');
        setTimeout(() => setResolveStep('idle'), 1500);
        return;
      }

      setResolveStep('syncing');
      const okMsg = res?.message || 'Duelo resolvido! 🏆';
      toast.success(okMsg, {
        description: res?.winner_name ? `Vencedor: ${res.winner_name}` : undefined,
        duration: 3500,
      });
      pushLog({ kind: 'resolve', ok: true, message: res?.winner_name ? `Vencedor: ${res.winner_name}` : okMsg, duelId });

      try { await refresh({ silent: true }); } catch { scheduleAutoRecover(3000); }
      setResolveStep('done');
      setTimeout(() => setResolveStep('idle'), 1200);
    } catch (err: any) {
      const msg = classifyError(err);
      toast.error(msg);
      pushLog({ kind: 'resolve', ok: false, message: msg, duelId });
      setResolveStep('error');
      setTimeout(() => setResolveStep('idle'), 1800);
      scheduleAutoRecover(4000);
    } finally {
      setResolvingId(null);
    }
  }, [refresh, pushLog, scheduleAutoRecover]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return {
    duels, loading, busy, resolvingId, resolveStep, syncing,
    history, clearHistory,
    refresh, challenge, respond, resolve,
  };
}
