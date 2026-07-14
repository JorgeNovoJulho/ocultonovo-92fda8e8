/**
 * useOcultoPlayGamification — XP/Nível do OCULTO PLAY (Etapa 6).
 *
 * Idempotente no backend (uma ação por dia por item). Cap diário 300 XP.
 * Não interfere em Aura, Social Score ou Prestige.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useOcultoPlayAccess, useOcultoPlayConfig } from './useOcultoPlayAccess';

export type OcultoPlayXpAction =
  | 'view' | 'like' | 'save' | 'share' | 'upload' | 'daily_bonus';

export interface OcultoPlayXpSummary {
  xp_total: number;
  xp_today: number;
  level: number;
  next_level_xp: number;
  cap: number;
}

export function useOcultoPlayXp() {
  const { user } = useAuth();
  const { canAccess } = useOcultoPlayAccess();
  const cfg = useOcultoPlayConfig();
  const enabled = !!user?.id && canAccess && cfg.data?.gamification_on !== false;

  return useQuery<OcultoPlayXpSummary>({
    queryKey: ['oculto-play', 'xp', user?.id],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_my_xp');
      if (error) throw error;
      return (data ?? { xp_total: 0, xp_today: 0, level: 1, next_level_xp: 100, cap: 300 }) as OcultoPlayXpSummary;
    },
  });
}

export function useOcultoPlayXpActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const cfg = useOcultoPlayConfig();
  const gamifOn = cfg.data?.gamification_on !== false;

  const grant = useCallback(
    async (action: OcultoPlayXpAction, itemId?: string) => {
      if (!user?.id || !gamifOn) return null;
      const { data, error } = await supabase.rpc('oculto_play_xp_grant', {
        p_action: action,
        p_item_id: itemId ?? null,
        p_xp_override: null,
      });
      if (!error) {
        qc.invalidateQueries({ queryKey: ['oculto-play', 'xp', user.id] });
      }
      return data ?? null;
    },
    [user?.id, gamifOn, qc],
  );

  const dailyBonus = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_xp_grant', {
        p_action: 'daily_bonus',
        p_item_id: null,
        p_xp_override: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oculto-play', 'xp'] }),
  });

  return { grant, dailyBonus };
}

// "Hoje no Oculto" — curadoria diária (master)
export interface OcultoPlayTodayPick {
  item_id: string;
  pos: number;
  note: string | null;
  title: string | null;
  caption: string | null;
  thumb_url: string | null;
  media_url: string | null;
  kind: string;
  visibility: string;
  author_id: string;
  view_count: number;
  like_count: number;
}

export function useOcultoPlayToday(day?: string) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<OcultoPlayTodayPick[]>({
    queryKey: ['oculto-play', 'today', day ?? 'auto'],
    enabled: canAccess,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_today_list', { p_day: day ?? null });
      if (error) throw error;
      return (data ?? []) as OcultoPlayTodayPick[];
    },
  });
}

export function useOcultoPlayTodayCuration() {
  const qc = useQueryClient();

  const pick = useMutation({
    mutationFn: async (input: { itemId: string; position?: number; note?: string }) => {
      const { data, error } = await supabase.rpc('oculto_play_today_set', {
        p_item_id: input.itemId,
        p_position: input.position ?? 0,
        p_note: input.note ?? null,
        p_day: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oculto-play', 'today'] }),
  });

  const unpick = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc('oculto_play_today_unset', {
        p_item_id: itemId,
        p_day: null,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oculto-play', 'today'] }),
  });

  return { pick, unpick };
}
