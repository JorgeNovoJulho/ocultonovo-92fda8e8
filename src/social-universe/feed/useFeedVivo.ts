/**
 * useFeedVivo — Onda C
 * Eventos do universo no feed (não é spam: cap de 8 itens, expiração curta).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface FeedVivoItem {
  id: string;
  kind: 'noite' | 'tempestade' | 'season' | 'destiny' | 'hidden' | 'real_exp' | 'milestone';
  payload: Record<string, any>;
  hue: number;
  emoji: string;
  pinned: boolean;
  expires_at: string;
  created_at: string;
  remaining_seconds: number;
}

export function useFeedVivo(limit = 8) {
  return useQuery({
    queryKey: ['feed-vivo', limit],
    queryFn: async (): Promise<FeedVivoItem[]> => {
      const { data } = await (supabase as any).rpc('feed_vivo_recent', { p_limit: limit });
      return (data ?? []) as FeedVivoItem[];
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
