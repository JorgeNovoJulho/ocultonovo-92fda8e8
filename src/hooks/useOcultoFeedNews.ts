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

/* ------------------------------------------------------------------ */
/* Cards do carrossel "Novidades do Oculto" (ativar/desativar/ordenar)  */
/* ------------------------------------------------------------------ */

export type OcultoFeedCardKey = 'link' | 'news' | 'musics' | 'movies';

export type OcultoFeedCard = {
  card_key: OcultoFeedCardKey;
  label: string;
  position: number;
  is_active: boolean;
};

export const DEFAULT_FEED_CARDS: OcultoFeedCard[] = [
  { card_key: 'link', label: 'Divulgue seu Link exclusivo', position: 1, is_active: true },
  { card_key: 'news', label: 'Novidades Recentes do Oculto', position: 2, is_active: true },
  { card_key: 'musics', label: 'Novas músicas no Oculto Play', position: 3, is_active: true },
  { card_key: 'movies', label: 'Novos filmes no Oculto Play', position: 4, is_active: true },
];

async function fetchFeedCards(): Promise<OcultoFeedCard[]> {
  const { data, error } = await supabase
    .from('oculto_feed_cards')
    .select('card_key, label, position, is_active')
    .order('position', { ascending: true });
  if (error || !data || data.length === 0) return DEFAULT_FEED_CARDS;
  return data as OcultoFeedCard[];
}

export function useOcultoFeedCards() {
  return useQuery({
    queryKey: ['oculto-feed-cards'],
    staleTime: 5 * 60_000,
    queryFn: fetchFeedCards,
  });
}

export function useOcultoFeedCardsAdmin() {
  return useQuery({
    queryKey: ['oculto-feed-cards-admin'],
    staleTime: 0,
    queryFn: fetchFeedCards,
  });
}

/* ------------------------------------------------------------------ */
/* Curadoria manual de músicas/filmes exibidos no carrossel             */
/* ------------------------------------------------------------------ */

export type OcultoFeedPlayPick = {
  id: string;
  kind: 'audio' | 'link';
  item_id: string | null;
  title: string;
  position: number;
  is_active: boolean;
};

export function useOcultoFeedPlayPicks(kind: 'audio' | 'link', limit = 4) {
  return useQuery({
    queryKey: ['oculto-feed-play-picks', kind, limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OcultoFeedPlayPick[]> => {
      const { data, error } = await supabase
        .from('oculto_feed_play_picks')
        .select('id, kind, item_id, title, position, is_active')
        .eq('kind', kind)
        .eq('is_active', true)
        .order('position', { ascending: true })
        .limit(limit);
      if (error) return [];
      return (data ?? []) as OcultoFeedPlayPick[];
    },
  });
}

export function useOcultoFeedPlayPicksAdmin(kind: 'audio' | 'link') {
  return useQuery({
    queryKey: ['oculto-feed-play-picks-admin', kind],
    staleTime: 0,
    queryFn: async (): Promise<OcultoFeedPlayPick[]> => {
      const { data, error } = await supabase
        .from('oculto_feed_play_picks')
        .select('id, kind, item_id, title, position, is_active')
        .eq('kind', kind)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OcultoFeedPlayPick[];
    },
  });
}

/** Catálogo publicado do Oculto Play para seleção no painel. */
export function usePlayCatalog(kind: 'audio' | 'link', limit = 60) {
  return useQuery({
    queryKey: ['oculto-play-catalog', kind, limit],
    staleTime: 60_000,
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
