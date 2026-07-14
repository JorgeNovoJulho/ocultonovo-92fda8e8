/**
 * useItemsInActivePlaylists — Etapa 26.
 * Retorna um Set<string> com os IDs de itens do OCULTO PLAY que
 * estão atualmente vinculados a qualquer playlist editorial ativa.
 *
 * Usado para renderizar o badge "Em playlist" nos cards do feed.
 * Pesa pouco: uma única query a oculto_play_playlist_items + filtro
 * por playlists ativas, cacheado por 60s.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export function useItemsInActivePlaylists() {
  const query = useQuery({
    queryKey: ['oculto-play', 'items-in-active-playlists'],
    staleTime: 60_000,
    queryFn: async () => {
      // 1) playlists ativas
      const { data: pls, error: e1 } = await supabase
        .from('oculto_play_playlists' as never)
        .select('id')
        .eq('is_active', true);
      if (e1 || !pls || pls.length === 0) return [] as string[];
      const playlistIds = (pls as Array<{ id: string }>).map((p) => p.id);

      // 2) items dessas playlists
      const { data: items, error: e2 } = await supabase
        .from('oculto_play_playlist_items' as never)
        .select('item_id')
        .in('playlist_id', playlistIds);
      if (e2 || !items) return [] as string[];
      return (items as Array<{ item_id: string }>).map((i) => i.item_id);
    },
  });

  const set = useMemo(() => new Set(query.data ?? []), [query.data]);

  return {
    isInPlaylist: (id: string) => set.has(id),
    set,
    isLoading: query.isLoading,
  };
}
