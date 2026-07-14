/**
 * useSocialSeason — Onda C
 * React Query: temporada ativa + progresso pessoal + top 20.
 * Cache compartilhado, staleTime alto (temporadas mudam devagar).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface SeasonCurrent {
  id: string; code: string; title: string; narrative: string | null;
  starts_at: string; ends_at: string;
  theme_hue: number; emoji: string;
  rewards: any[];
  remaining_seconds: number; total_seconds: number; progress_pct: number;
}

export interface SeasonProgress {
  season_id: string | null;
  xp: number;
  rank: number | null;
  total_players: number;
}

export interface SeasonTopRow {
  rank: number; user_id: string; xp: number;
  username: string | null; display_name: string | null; avatar_url: string | null;
}

export function useSocialSeason() {
  const { user } = useAuth();
  const seasonQ = useQuery({
    queryKey: ['social-season-current'],
    queryFn: async (): Promise<SeasonCurrent | null> => {
      const { data } = await (supabase as any).rpc('season_current');
      return (data && data[0]) || null;
    },
    staleTime: 5 * 60_000,
  });
  const progressQ = useQuery({
    queryKey: ['social-season-progress', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<SeasonProgress | null> => {
      const { data } = await (supabase as any).rpc('season_get_my_progress');
      return data || null;
    },
    staleTime: 60_000,
  });
  return {
    season: seasonQ.data ?? null,
    progress: progressQ.data ?? null,
    isLoading: seasonQ.isLoading || progressQ.isLoading,
  };
}

export function useSeasonTop(limit = 20) {
  return useQuery({
    queryKey: ['social-season-top', limit],
    queryFn: async (): Promise<SeasonTopRow[]> => {
      const { data } = await (supabase as any).rpc('season_top', { p_limit: limit });
      return (data ?? []) as SeasonTopRow[];
    },
    staleTime: 60_000,
  });
}
