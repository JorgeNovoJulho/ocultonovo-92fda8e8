/**
 * Retention Engine — hooks consolidados.
 * Backend: Supabase externo. Sem polling, sem canal realtime novo.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

function markMissionCompletedInCache(qc: ReturnType<typeof useQueryClient>, userId: string, missionKey?: string) {
  if (!missionKey) return;

  qc.setQueryData(['retention-missions', userId], (current: RetentionMission[] | undefined) => {
    if (!Array.isArray(current)) return current;
    return current.map((mission) =>
      mission.key === missionKey ? { ...mission, completed: true } : mission,
    );
  });

  qc.setQueryData(['retention-state', userId], (current: RetentionState | null | undefined) => {
    if (!current) return current;
    const completed = new Set(current.completed_missions ?? []);
    completed.add(missionKey);
    return {
      ...current,
      completed_missions: Array.from(completed),
    };
  });
}

export interface RetentionState {
  retention_day: number;
  first_seen_at: string;
  last_active_at: string;
  hours_since_active: number;
  completed_missions: string[];
  abandon_card_dismissed_at: string | null;
}

export interface RetentionMission {
  key: string;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_route: string | null;
  icon: string | null;
  hue: number;
  reward: string | null;
  sort_order: number;
  completed: boolean;
  claimed: boolean;
  xp_reward: number;
  day: number;
  is_last_chance: boolean;
}

export interface SocialCycle {
  key: string;
  label: string;
  emoji: string;
  intensity: 'low' | 'medium' | 'high' | 'rare';
  hue: number;
  message: string | null;
}

export function useRetentionTouch() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const syncRetentionDay = async () => {
      try {
        const { error } = await (supabase as any).rpc('retention_touch');
        if (error || cancelled) return;
        qc.invalidateQueries({ queryKey: ['retention-missions', user.id] });
        qc.invalidateQueries({ queryKey: ['retention-state', user.id] });
      } catch {
        /* noop */
      }
    };

    void syncRetentionDay();
    return () => {
      cancelled = true;
    };
  }, [qc, user?.id]);
}

export function useRetentionState() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['retention-state', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RetentionState | null> => {
      const { data } = await (supabase as any).rpc('retention_state_get');
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        retention_day: row.retention_day ?? 1,
        first_seen_at: row.first_seen_at,
        last_active_at: row.last_active_at,
        hours_since_active: Number(row.hours_since_active ?? 0),
        completed_missions: Array.isArray(row.completed_missions) ? row.completed_missions : [],
        abandon_card_dismissed_at: row.abandon_card_dismissed_at ?? null,
      };
    },
  });
}

export function useRetentionMissions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['retention-missions', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: async (): Promise<RetentionMission[]> => {
      const { data } = await (supabase as any).rpc('retention_missions_for_me');
      return ((data ?? []) as any[]).map((m) => ({
        ...m,
        claimed: !!m.claimed,
      })) as RetentionMission[];
    },
  });

  // Realtime: quando o progresso do próprio usuário muda em
  // oculto_retention_progress, revalidamos missões e state em tempo real.
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable('oculto_retention_progress', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.user_id !== user.id) return;
      qc.invalidateQueries({ queryKey: ['retention-missions', user.id] });
      qc.invalidateQueries({ queryKey: ['retention-state', user.id] });
    });
    return () => { unsub(); };
  }, [user?.id, qc]);


  // Safety net: revalida ao voltar para a aba/janela
  // (cobre o caso em que realtime não está habilitado no projeto).
  useEffect(() => {
    if (!user?.id) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        qc.invalidateQueries({ queryKey: ['retention-missions', user.id] });
        qc.invalidateQueries({ queryKey: ['retention-state', user.id] });
      }
    };
    const onFocus = () => {
      qc.invalidateQueries({ queryKey: ['retention-missions', user.id] });
      qc.invalidateQueries({ queryKey: ['retention-state', user.id] });
    };
    const onMissionDone = (event: Event) => {
      const missionKey = (event as CustomEvent<{ key?: string }>)?.detail?.key;
      markMissionCompletedInCache(qc, user.id, missionKey);
      qc.invalidateQueries({ queryKey: ['retention-missions', user.id] });
      qc.invalidateQueries({ queryKey: ['retention-state', user.id] });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('retention:mission-completed', onMissionDone as EventListener);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('retention:mission-completed', onMissionDone as EventListener);
    };
  }, [user?.id, qc]);

  // ── Rotação diária às 00:00 (horário local) ──
  // O "Dia X/7" é calculado server-side (date diff vs first_seen_at),
  // então o que precisamos é apenas invalidar a cache exatamente quando
  // o relógio do usuário cruza a meia-noite. Isso garante que o card
  // pula de "Dia 1/7" para "Dia 2/7" sozinho, sem precisar de F5,
  // troca de aba ou clique. Reagenda a cada noite enquanto a aba viver,
  // e também faz um "catch up" se a aba ficou suspensa e acordou
  // depois da meia-noite (via visibilitychange acima já cobre, mas o
  // timer dá a transição imediata para abas ativas).
  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const msUntilSpMidnight = () => {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
      const h = Number(parts.hour || 0);
      const m = Number(parts.minute || 0);
      const s = Number(parts.second || 0);
      const elapsed = ((h * 60) + m) * 60 + s;
      return Math.max(1000, ((24 * 3600) - elapsed + 2) * 1000);
    };

    const scheduleMidnight = () => {
      const delay = msUntilSpMidnight();
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['retention-missions', user.id] });
        qc.invalidateQueries({ queryKey: ['retention-state', user.id] });
        scheduleMidnight(); // reagenda para a próxima noite
      }, delay);
    };

    scheduleMidnight();
    return () => { if (timer) clearTimeout(timer); };
  }, [user?.id, qc]);



  const complete = useMutation({
    mutationFn: async (key: string) => {
      const { data } = await (supabase as any).rpc('retention_mission_complete', { p_key: key });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retention-missions'] });
      qc.invalidateQueries({ queryKey: ['retention-state'] });
    },
  });

  const claimXp = useMutation({
    mutationFn: async (key: string) => {
      const { data, error } = await (supabase as any).rpc('retention_mission_claim_xp', { p_key: key });
      if (error) throw error;
      return data as { ok: boolean; xp_awarded?: number; multiplier?: number; reason?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retention-missions'] });
      qc.invalidateQueries({ queryKey: ['retention-state'] });
    },
  });

  return {
    ...query,
    complete: complete.mutateAsync,
    claimXp: claimXp.mutateAsync,
    isClaiming: claimXp.isPending,
  };
}

export function useSocialCycle() {
  return useQuery({
    queryKey: ['social-cycle-current'],
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
    queryFn: async (): Promise<SocialCycle | null> => {
      const { data } = await (supabase as any).rpc('social_cycle_current');
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
  });
}

export function useFounderProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['founder-progress', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('founder_progress_get');
      const row = Array.isArray(data) ? data[0] : data;
      return row ? { points: row.points ?? 0, tier: row.tier ?? 0, perks_unlocked: row.perks_unlocked ?? [] } : null;
    },
  });
}

export async function dismissAbandonCard() {
  try { await (supabase as any).rpc('retention_dismiss_abandon_card'); } catch { /* noop */ }
}
