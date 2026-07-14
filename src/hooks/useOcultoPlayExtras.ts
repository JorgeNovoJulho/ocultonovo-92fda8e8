/**
 * useOcultoPlayExtras — RPCs das Etapas 54, 55, 57, 58 do Oculto Play.
 * Tudo via Supabase EXTERNO.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';

// ───────── Etapa 54: Desafio da Semana ─────────
export interface PlayWeeklyChallenge {
  id: string;
  week_start: string;
  week_end: string;
  theme_title: string;
  theme_description: string | null;
  hashtag: string | null;
  prize_description: string | null;
  submissions_count: number;
}
export interface PlayChallengeLeaderboardRow {
  item_id: string;
  title: string | null;
  thumb_url: string | null;
  media_url: string | null;
  kind: string;
  author_id: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  view_count: number;
  recent_reactions: number;
  score: string | number;
}

export function useOcultoPlayWeeklyChallenge() {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery({
    queryKey: ['oculto-play', 'weekly-challenge'] as const,
    enabled: canAccess,
    staleTime: 60_000,
    queryFn: async (): Promise<PlayWeeklyChallenge | null> => {
      const { data, error } = await (supabase as any).rpc('oculto_play_current_challenge');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as PlayWeeklyChallenge | null;
    },
  });
}

export function useOcultoPlayChallengeLeaderboard(challengeId: string | null | undefined) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery({
    queryKey: ['oculto-play', 'challenge-leaderboard', challengeId ?? 'none'] as const,
    enabled: canAccess && !!challengeId,
    staleTime: 30_000,
    queryFn: async (): Promise<PlayChallengeLeaderboardRow[]> => {
      const { data, error } = await (supabase as any).rpc(
        'oculto_play_challenge_leaderboard',
        { p_challenge_id: challengeId },
      );
      if (error) throw error;
      return (data ?? []) as PlayChallengeLeaderboardRow[];
    },
  });
}

export function useSubmitToWeeklyChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { challengeId: string; itemId: string }) => {
      const { error } = await (supabase as any)
        .from('oculto_play_challenge_submissions')
        .insert({ challenge_id: input.challengeId, item_id: input.itemId, user_id: (await supabase.auth.getUser()).data.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'weekly-challenge'] });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'challenge-leaderboard'] });
    },
  });
}

// ───────── Etapa 55: Top por Kind (Memes/Áudio dedicados) ─────────
export interface PlayTopByKindItem {
  id: string;
  kind: string;
  title: string | null;
  caption: string | null;
  thumb_url: string | null;
  media_url: string | null;
  audio_url: string | null;
  audio_preview_url?: string | null;
  visibility: string;
  view_count: number;
  like_count: number;
  published_at: string;
  author_id: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  recent_reactions: number;
  score: string | number;
  preview_start_seconds?: number | null;
  preview_end_seconds?: number | null;
}

export function useOcultoPlayTopByKind(kind: 'meme' | 'audio' | 'short_video' | null, days = 7) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery({
    queryKey: ['oculto-play', 'top-by-kind', kind, days] as const,
    enabled: canAccess && !!kind,
    staleTime: 60_000,
    queryFn: async (): Promise<PlayTopByKindItem[]> => {
      const { data, error } = await (supabase as any).rpc('oculto_play_top_by_kind', {
        p_kind: kind,
        p_days: days,
      });
      if (error) throw error;
      return (data ?? []) as PlayTopByKindItem[];
    },
  });
}

// ───────── Etapa 57: Play → Comunidade ─────────
export function useSharePlayToCommunity() {
  return useMutation({
    mutationFn: async (input: { itemId: string; communityId: string; message?: string }) => {
      const { data, error } = await (supabase as any).rpc('oculto_play_share_to_community', {
        p_item_id: input.itemId,
        p_community_id: input.communityId,
        p_message: input.message ?? null,
      });
      if (error) throw error;
      return data as string; // topic_id
    },
  });
}

// ───────── Etapa 58: Itens do Play por criador (Canal VIP) ─────────
export interface PlayItemByCreator {
  id: string;
  kind: string;
  title: string | null;
  caption: string | null;
  thumb_url: string | null;
  media_url: string | null;
  audio_url: string | null;
  visibility: string;
  view_count: number;
  like_count: number;
  published_at: string;
}

export function useOcultoPlayItemsByCreator(creatorId: string | null | undefined, limit = 24) {
  return useQuery({
    queryKey: ['oculto-play', 'by-creator', creatorId ?? 'none', limit] as const,
    enabled: !!creatorId,
    staleTime: 60_000,
    queryFn: async (): Promise<PlayItemByCreator[]> => {
      const { data, error } = await (supabase as any).rpc('oculto_play_items_by_creator', {
        p_creator_id: creatorId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as PlayItemByCreator[];
    },
  });
}
