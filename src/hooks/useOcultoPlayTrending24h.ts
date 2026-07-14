/**
 * useOcultoPlayTrending24h — Etapa 53.3
 *
 * Top itens em alta nas últimas 24h.
 * Ranking real: views_24h * 1 + likes_24h * 3.
 * Reordena automaticamente ao receber novas views/likes (realtime).
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface TrendingItem {
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
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  trend_score: number;
  views_24h: number;
  likes_24h: number;
  recent_reactions: number;
  source_url?: string | null;
  link_provider?: string | null;
  is_adult?: boolean;
}

const QK = ['oculto-play', 'trending-24h'] as const;

export function useOcultoPlayTrending24h() {
  const qc = useQueryClient();

  const q = useQuery<TrendingItem[]>({
    queryKey: QK,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_trending_24h' as never);
      if (error || !Array.isArray(data)) return [];
      return (data as Array<Record<string, unknown>>).map((r) => ({
        ...r,
        views_24h: Number(r.views_24h ?? 0),
        likes_24h: Number(r.likes_24h ?? r.recent_reactions ?? 0),
        trend_score: Number(r.trend_score ?? 0),
        is_adult: r.is_adult === true,
      })) as TrendingItem[];
    },
  });

  // Sem debounce: reordena imediatamente quando entra item/view/like nova.
  useEffect(() => {
    const invalidate = () => qc.invalidateQueries({ queryKey: QK });
    const ch = supabase
      .channel('oculto-play-trending-24h')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_play_likes' }, invalidate)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_play_views' }, invalidate)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_play_items' }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return { data: q.data ?? [], loading: q.isLoading, refetch: q.refetch };
}
