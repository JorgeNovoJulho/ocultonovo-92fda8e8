/**
 * useOcultoPlayCreatorPlaylistPresence — Etapa 27.
 * Quantas playlists editoriais ativas contêm itens do criador atual.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorPlaylistPresence {
  playlists_count: number;
  items_in_playlists: number;
  top_playlists: Array<{
    playlist_id: string;
    title: string;
    slug: string;
    item_count: number;
  }>;
}

export function useOcultoPlayCreatorPlaylistPresence() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto-play', 'creator-playlist-presence', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CreatorPlaylistPresence> => {
      const { data, error } = await supabase.rpc(
        'oculto_play_creator_playlist_presence' as never,
        { p_user_id: user!.id } as never,
      );
      if (error || !data) {
        return { playlists_count: 0, items_in_playlists: 0, top_playlists: [] };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return {
        playlists_count: Number(row?.playlists_count ?? 0),
        items_in_playlists: Number(row?.items_in_playlists ?? 0),
        top_playlists: Array.isArray(row?.top_playlists) ? row.top_playlists : [],
      };
    },
  });
}
