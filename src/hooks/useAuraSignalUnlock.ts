import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { toast } from 'sonner';
import { useAuraSignalUnlockStore, type AuraSignalKind as StoreKind } from '@/store/useAuraSignalUnlockStore';

export type AuraSignalKind = StoreKind;

export interface AuraSignalRow {
  id: string;
  signal_kind: string;
  happened_at: string;
  summary: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_username: string | null;
  actor_avatar: string | null;
  locked: boolean;
  cost_xp: number;
  seconds_left: number;
}

export interface AuraSignalUnlockStatus {
  signal_kind: string;
  reveal_cost_xp: number;
  balance_xp: number;
  unlocked: boolean;
  seconds_left: number;        // saldo de orçamento restante
  history_days: number;        // 3
  budget_seconds: number;      // 30*60 = 1800
  actors_count: number;        // pessoas únicas
  expires_at: string | null;
}

const fmt = (d: any) => (Array.isArray(d) ? d[0] : d);

/**
 * Histórico bloqueável com ORÇAMENTO de tempo.
 * - Pague 100 XP → libera 30 min de tempo de leitura, válido por 3 dias.
 * - Tempo só decai quando `consumeOpen` está true (modal aberto).
 * - Heartbeat manda RPC a cada 10s para debitar no servidor.
 */
export function useAuraSignalUnlock(kind: AuraSignalKind, limit = 25, consumeOpen = false) {
  const [items, setItems] = useState<AuraSignalRow[]>([]);
  const [status, setStatus] = useState<AuraSignalUnlockStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const setUnlockStore = useAuraSignalUnlockStore((s) => s.setUnlock);
  const clearUnlockStore = useAuraSignalUnlockStore((s) => s.clearUnlock);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const debounceRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data: hist }, { data: st }] = await Promise.all([
      (supabase as any).rpc('aura_signal_history', { p_signal_kind: kind, p_limit: limit }),
      (supabase as any).rpc('aura_signal_unlock_status', { p_signal_kind: kind }),
    ]);
    setLoading(false);
    if (Array.isArray(hist)) setItems(hist as AuraSignalRow[]);
    const s = fmt(st) as AuraSignalUnlockStatus | undefined;
    if (s) {
      setStatus(s);
      const srv = s.seconds_left || 0;
      if (srv > 0 && s.unlocked) {
        setUnlockStore(kind, srv);
        setSecondsLeft(srv);
      } else {
        clearUnlockStore(kind);
        setSecondsLeft(0);
      }
    }
  }, [kind, limit, setUnlockStore, clearUnlockStore]);

  useEffect(() => { refresh(); }, [refresh]);

  // Tick local SEMPRE que houver tempo restante (mesmo com modal fechado),
  // para que o cronômetro do card-resumo não fique congelado em 30:00.
  // O débito no servidor continua acontecendo apenas com o modal aberto
  // (heartbeat abaixo), mantendo a regra de "tempo de leitura".
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const i = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(i);
  }, [secondsLeft > 0]);

  // Heartbeat: a cada 10s com modal aberto, debita 10s no servidor
  useEffect(() => {
    if (!consumeOpen) return;
    if (secondsLeft <= 0) return;
    const id = window.setInterval(async () => {
      const { data } = await (supabase as any).rpc('aura_signal_consume_time', {
        p_signal_kind: kind, p_seconds: 10,
      });
      const r = fmt(data) as { seconds_left: number; exhausted: boolean } | undefined;
      if (r) {
        setSecondsLeft(r.seconds_left);
        if (r.exhausted) {
          clearUnlockStore(kind);
          window.setTimeout(refresh, 50);
        }
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [consumeOpen, kind, refresh, clearUnlockStore, secondsLeft > 0]);

  // Realtime: nova atenção/visita refresca contador e lista
  useEffect(() => {
    const debounced = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => { refresh(); }, 600);
    };
    const tableForKind = kind === 'attention' ? 'oculto_aura_attentions' : 'profile_visits';
    const unsubA = subscribeTable(tableForKind, debounced);
    const unsubB = subscribeTable('oculto_aura_signal_unlocks', debounced);
    return () => { unsubA(); unsubB(); };
  }, [kind, refresh]);


  const unlock = useCallback(async () => {
    setBusy(true);
    const { data, error } = await (supabase as any).rpc('aura_unlock_signal', { p_signal_kind: kind });
    setBusy(false);
    if (error) { toast.error('Não foi possível desbloquear', { description: error.message }); return false; }
    const r = fmt(data) as { ok: boolean; cost_xp: number; remaining_xp: number; expires_at: string; seconds_left: number; message: string } | undefined;
    if (!r) return false;
    if (r.ok) {
      toast.success('🔓 Histórico revelado!', {
        description: `Custou ${r.cost_xp} XP · ${Math.round((r.seconds_left || 0) / 60)} min de leitura · válido 3 dias`,
      });
      setUnlockStore(kind, r.seconds_left || 0);
      setSecondsLeft(r.seconds_left || 0);
      await refresh();
      return true;
    }
    toast.warning(r.message || 'Não foi possível desbloquear');
    await refresh();
    return false;
  }, [kind, refresh, setUnlockStore]);

  return {
    items, status, loading, busy, secondsLeft, refresh, unlock,
    xpBalance: status?.balance_xp ?? 0,
    revealCost: status?.reveal_cost_xp ?? 100,
    budgetSeconds: status?.budget_seconds ?? 1800,
    actorsCount: status?.actors_count ?? 0,
    historyDays: status?.history_days ?? 3,
    unlocked: !!status?.unlocked && secondsLeft > 0,
  };
}
