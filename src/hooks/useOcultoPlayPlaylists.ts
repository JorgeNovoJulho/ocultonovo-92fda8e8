/**
 * useOcultoPlayPlaylists — Etapa 23.
 * Lista admin (todas) e CRUD via RPC. Filtragem por is_active opcional.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface OcultoPlayPlaylist {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  is_active: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OcultoPlayPlaylistItem {
  id: string;
  playlist_id: string;
  item_id: string;
  position: number;
  added_at: string;
}

const ADMIN_KEY = ['oculto-play', 'playlists', 'admin'];

export function useAdminOcultoPlayPlaylists() {
  return useQuery({
    queryKey: ADMIN_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_play_playlists' as never)
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OcultoPlayPlaylist[];
    },
  });
}

export function useOcultoPlayPlaylistItems(playlistId: string | null) {
  return useQuery({
    queryKey: ['oculto-play', 'playlist-items', playlistId],
    enabled: !!playlistId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_play_playlist_items' as never)
        .select('*')
        .eq('playlist_id', playlistId!)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OcultoPlayPlaylistItem[];
    },
  });
}

export function useUpsertPlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id?: string | null;
      slug: string;
      title: string;
      description?: string | null;
      cover_url?: string | null;
      is_active?: boolean;
      position?: number;
    }) => {
      const { data, error } = await supabase.rpc(
        'oculto_play_admin_playlist_upsert' as never,
        {
          p_id: p.id ?? null,
          p_slug: p.slug,
          p_title: p.title,
          p_description: p.description ?? null,
          p_cover_url: p.cover_url ?? null,
          p_is_active: p.is_active ?? true,
          p_position: p.position ?? 0,
        } as never,
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEY }),
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(
        'oculto_play_admin_playlist_delete' as never,
        { p_id: id } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ADMIN_KEY }),
  });
}

export function useAddPlaylistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { playlistId: string; itemId: string; position?: number }) => {
      const { error } = await supabase.rpc(
        'oculto_play_admin_playlist_add_item' as never,
        {
          p_playlist_id: p.playlistId,
          p_item_id: p.itemId,
          p_position: p.position ?? null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['oculto-play', 'playlist-items', vars.playlistId] }),
  });
}

export function useRemovePlaylistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { playlistId: string; itemId: string }) => {
      const { error } = await supabase.rpc(
        'oculto_play_admin_playlist_remove_item' as never,
        { p_playlist_id: p.playlistId, p_item_id: p.itemId } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['oculto-play', 'playlist-items', vars.playlistId] }),
  });
}
