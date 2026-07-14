/**
 * useOcultoPlayTrendingTags — Etapa 31
 *
 * Lê RPC `oculto_play_trending_tags` para alimentar a strip de tags em alta.
 * Stateless, sem mutações; cache de 3 minutos.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface TrendingTag {
  tag: string;
  item_count: number;
  total_views: number;
  total_likes: number;
}

export function useOcultoPlayTrendingTags(opts?: {
  windowHours?: number;
  limit?: number;
  enabled?: boolean;
}) {
  const { user } = useAuth();
  const windowHours = opts?.windowHours ?? 48;
  const limit = opts?.limit ?? 12;
  const enabled = (opts?.enabled ?? true) && !!user;

  return useQuery({
    queryKey: ['oculto-play-trending-tags', windowHours, limit],
    enabled,
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<TrendingTag[]> => {
      const { data, error } = await supabase.rpc('oculto_play_trending_tags', {
        p_window_hours: windowHours,
        p_limit: limit,
      });
      if (error) {
        console.warn('[useOcultoPlayTrendingTags] error', error);
        return [];
      }
      return (data ?? []) as TrendingTag[];
    },
  });
}
