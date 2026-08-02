import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export type OcultoFeedNewsItem = {
  id: string;
  title: string;
  emoji: string | null;
  position: number;
  is_active: boolean;
};

/** Novidades do Oculto — geridas pelo admin master (tabela oculto_feed_news). */
export function useOcultoFeedNews(limit = 4) {
  return useQuery({
    queryKey: ['oculto-feed-news', limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OcultoFeedNewsItem[]> => {
      const { data, error } = await supabase
        .from('oculto_feed_news')
        .select('id, title, emoji, position, is_active')
        .eq('is_active', true)
        .order('position', { ascending: true })
        .limit(limit);
      if (error) return [];
      return (data ?? []) as OcultoFeedNewsItem[];
    },
  });
}

/** Versão admin — traz todos (ativos e inativos). */
export function useOcultoFeedNewsAdmin() {
  return useQuery({
    queryKey: ['oculto-feed-news-admin'],
    staleTime: 0,
    queryFn: async (): Promise<OcultoFeedNewsItem[]> => {
      const { data, error } = await supabase
        .from('oculto_feed_news')
        .select('id, title, emoji, position, is_active')
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OcultoFeedNewsItem[];
    },
  });
}

/** Últimos títulos do Oculto Play por tipo (audio = músicas, link = filmes). */
export function useLatestPlayTitles(kind: 'audio' | 'link', limit = 4) {
  return useQuery({
    queryKey: ['oculto-play-latest-titles', kind, limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string; title: string }[]> => {
      const { data, error } = await supabase
        .from('oculto_play_items')
        .select('id, title, kind, is_published, created_at')
        .eq('kind', kind)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      return ((data ?? []) as { id: string; title: string | null }[])
        .filter((r) => !!r.title)
        .map((r) => ({ id: r.id, title: r.title as string }));
    },
  });
}
