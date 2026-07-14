import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { notifyEnterRoomMissionCompleted } from '@/lib/retentionMissionEvents';

export interface RoomPresent {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  plan_type: string | null;
  is_observer: boolean;
  entered_at: string;
}
export interface RoomState {
  exists: boolean;
  within_window: boolean;
  presents: RoomPresent[];
  count: number;
  reactions_60s: number;
  dominant_user_id: string | null;
  energy: number;
  hue: number;
  glow_intensity: number;
  mood?: string | null;
  rising?: boolean;
  bonded_pairs?: Array<[string, string]>;
  reputation_score?: number;
}

const EMPTY: RoomState = {
  exists: false, within_window: true, presents: [], count: 0,
  reactions_60s: 0, dominant_user_id: null, energy: 0, hue: 280, glow_intensity: 50,
  mood: 'calmo', rising: false, bonded_pairs: [], reputation_score: 0,
};

type ReactKind = 'energy' | 'observe' | 'approach' | 'highlight';

export function useAuraRoomLive(slug: string | null, opts?: { active?: boolean }) {
  // `active=false` → não faz join automático (apenas observa estado da sala).
  // O join só acontece após o usuário clicar "Entrar" e chamar `joinNow()`.
  const active = opts?.active !== false;
  const [state, setState] = useState<RoomState>(EMPTY);
  const [joined, setJoined] = useState<{ allowed: boolean; observer: boolean; reason: string | null; reasons?: string[]; queued?: boolean; position?: number; capacity?: number }| null>(null);
  const [incomingReaction, setIncomingReaction] = useState<{ kind: ReactKind; from: string; at: number } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const fetchState = useCallback(async (slugArg: string) => {
    const [{ data }, { data: presenceRows }] = await Promise.all([
      (supabase as any).rpc('aura_room_state', { p_slug: slugArg }),
      (supabase as any).rpc('aura_room_presence', { p_slug: slugArg }),
    ]);

    if (data && (data as any).exists) setState(data as RoomState);
    else if ((presenceRows as any[])?.length) {
      setState({
        ...EMPTY,
        exists: true,
        presents: presenceRows as RoomPresent[],
        count: (presenceRows as any[]).length,
        energy: Math.min(100, Math.max(8, (presenceRows as any[]).length * 12)),
      });
    } else setState(EMPTY);
  }, []);

  const joinNow = useCallback(async () => {
    if (!slug) return null;
    setJoinLoading(true);
    setJoinError(null);
    try {
      const { data, error } = await (supabase as any).rpc('aura_room_join', { p_slug: slug });
      if (error) throw error;
      const allowed = !!((data as any)?.allowed || (data as any)?.master || (data as any)?.open);
      const reasonsArr: string[] | undefined = Array.isArray((data as any)?.reasons)
        ? (data as any).reasons
        : ((data as any)?.reason ? [(data as any).reason] : undefined);
      const nextJoined = {
        allowed,
        observer: !allowed,
        reason: (data as any)?.reason ?? (reasonsArr?.[0] ?? null),
        reasons: reasonsArr,
        queued: !!(data as any)?.queued,
        position: (data as any)?.position ?? undefined,
        capacity: (data as any)?.capacity ?? undefined,
      };
      setJoined(nextJoined);
      await fetchState(slug);
      // Marca missão de retenção "Entrar em sala" como concluída em tempo real.
      if (allowed) {
        void notifyEnterRoomMissionCompleted();
      }
      return nextJoined;
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : 'Falha ao consultar a sala. Verifique sua conexão.');
      setJoinError(msg);
      setJoined(null);
      return null;
    } finally {
      setJoinLoading(false);
    }
  }, [fetchState, slug]);

  const retryJoin = useCallback(() => {
    setJoinError(null);
    return joinNow();
  }, [joinNow]);

  const scheduleFetch = useCallback((slugArg: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchState(slugArg), 500);
  }, [fetchState]);

  // Pré-checa requisitos (preview) — popula `joined` em modo "não-entrou ainda"
  // para que o badge mostre Cumpro/Não cumpro em tempo real antes do clique.
  const previewGate = useCallback(async (slugArg: string) => {
    const { data, error } = await (supabase as any).rpc('aura_room_preview_gate', { p_slug: slugArg });
    if (error) return;
    const allowed = !!((data as any)?.allowed || (data as any)?.master);
    const reasonsArr: string[] = Array.isArray((data as any)?.reasons) ? (data as any).reasons : [];
    setJoined((prev) => {
      // Se o usuário já entrou de fato (allowed + presence), não sobrescreve.
      if (prev?.allowed && !prev?.queued) return prev;
      return {
        allowed,
        observer: !allowed,
        reason: reasonsArr[0] ?? null,
        reasons: reasonsArr,
      };
    });
  }, []);

  // Observação + ping loop (apenas quando `active` e após entrada manual)
  useEffect(() => {
    if (!slug) { setState(EMPTY); setJoined(null); return; }
    let cancelled = false;
    let pingTimer: number | null = null;
    let pollTimer: number | null = null;

    setJoinLoading(false);
    setJoinError(null);
    setJoined(null);
    fetchState(slug);
    previewGate(slug);

    // Ping/keep-alive da presença + re-join silencioso se cair.
    // Frequência alta (20s) para nunca passar do TTL do servidor — evita o
    // efeito de "entrar e sair sozinho" que aparecia com o intervalo de 60s.
    const pingNow = async () => {
      try {
        const { data } = await (supabase as any).rpc('aura_room_ping', { p_slug: slug });
        // Se o ping indicar que não estamos mais presentes (TTL expirou),
        // re-entra silenciosamente para manter o usuário na sala.
        if (data && (data.ok === false || data.present === false)) {
          try { await (supabase as any).rpc('aura_room_join', { p_slug: slug }); } catch {}
        }
      } catch {}
    };

    if (active) {
      // Ping imediato + a cada 20s
      void pingNow();
      pingTimer = window.setInterval(pingNow, 20_000);
    }

    pollTimer = window.setInterval(() => fetchState(slug), 30_000);

    // Quando a aba volta a ficar visível, navegadores já podem ter
    // pausado o setInterval por muito tempo — pinga na hora.
    const onVis = () => {
      if (document.visibilityState === 'visible' && active) {
        void pingNow();
        fetchState(slug);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);

    const unsubP = subscribeTable('oculto_aura_room_presence', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.room_slug !== slug) return;
      scheduleFetch(slug);
    });
    const unsubR = subscribeTable('oculto_aura_room_reactions', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const row = payload.new;
      if (row?.room_slug !== slug) return;
      setIncomingReaction({ kind: row.kind, from: row.from_user, at: Date.now() });
      scheduleFetch(slug);
    }, { events: ['INSERT'] });
    const unsubW = subscribeTable('oculto_aura_room_waitlist', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.room_slug !== slug) return;
      scheduleFetch(slug);
    });
    const unsubO = subscribeTable('oculto_aura_room_slot_offers', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.room_slug !== slug) return;
      scheduleFetch(slug);
    });

    return () => {
      cancelled = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (pollTimer) window.clearInterval(pollTimer);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      unsubP(); unsubR(); unsubW(); unsubO();
    };
  }, [slug, active, fetchState, scheduleFetch]);


  // Refetch da posição na fila quando presença/waitlist mudam (realtime)
  useEffect(() => {
    if (!slug || !joined?.queued) return;
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: rows } = await (supabase as any)
        .from('oculto_aura_room_waitlist')
        .select('user_id, enqueued_at')
        .eq('room_slug', slug)
        .order('enqueued_at', { ascending: true });
      if (cancelled) return;
      const list = (rows || []) as Array<{ user_id: string }>;
      const idx = list.findIndex((r) => r.user_id === uid);
      if (idx >= 0) {
        setJoined((j) => (j ? { ...j, position: idx + 1 } : j));
      } else {
        // Saiu da fila → tenta promover (provavelmente recebeu offer)
        setJoined((j) => (j ? { ...j, queued: false } : j));
      }
    })();
    return () => { cancelled = true; };
  }, [slug, joined?.queued, state.presents.length]);


  const react = useCallback(async (kind: ReactKind, toUser: string | null = null) => {
    if (!slug) return { ok: false, reason: 'no_slug' };
    const { data } = await (supabase as any).rpc('aura_room_react', { p_slug: slug, p_kind: kind, p_to: toUser });
    return data as { ok: boolean; reason?: string };
  }, [slug]);

  const leave = useCallback(async () => {
    if (!slug) return { ok: false };
    const { data } = await (supabase as any).rpc('aura_room_leave', { p_slug: slug });
    setState(EMPTY);
    return (data as any) ?? { ok: true };
  }, [slug]);

  const leaveAll = useCallback(async () => {
    const { data } = await (supabase as any).rpc('aura_room_leave_all');
    return (data as any) ?? { ok: true };
  }, []);

  return { state, joined, incomingReaction, react, leave, leaveAll, joinError, joinLoading, retryJoin, joinNow };
}
