/**
 * useOcultoPlayCollections — Etapa 17.
 * Coleções pessoais (playlists) do OCULTO PLAY.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';
import type { OcultoPlayItem } from './useOcultoPlayContent';

export interface OcultoPlayCollection {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  cover_url: string | null;
  item_count: number;
  updated_at: string;
}

const KEY_LIST = ['oculto-play', 'collections', 'mine'] as const;
const KEY_ITEMS = (id: string) => ['oculto-play', 'collections', 'items', id] as const;

export function useMyOcultoPlayCollections() {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<OcultoPlayCollection[]>({
    queryKey: KEY_LIST,
    enabled: canAccess,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_my_collections');
      if (error) throw error;
      return (data ?? []) as OcultoPlayCollection[];
    },
  });
}

export function useOcultoPlayCollectionItems(collectionId: string | null) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<OcultoPlayItem[]>({
    queryKey: KEY_ITEMS(collectionId ?? 'none'),
    enabled: canAccess && !!collectionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_collection_items_list', {
        p_collection_id: collectionId,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as OcultoPlayItem[];
    },
  });
}

export function useOcultoPlayCollectionActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['oculto-play', 'collections'] });

  const create = useMutation({
    mutationFn: async (input: { name: string; description?: string; isPublic?: boolean }) => {
      const { data, error } = await supabase.rpc('oculto_play_collection_create', {
        p_name: input.name,
        p_description: input.description ?? null,
        p_is_public: input.isPublic ?? false,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (collectionId: string) => {
      const { error } = await supabase.rpc('oculto_play_collection_delete', {
        p_collection_id: collectionId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addItem = useMutation({
    mutationFn: async (input: { collectionId: string; itemId: string }) => {
      const { error } = await supabase.rpc('oculto_play_collection_add', {
        p_collection_id: input.collectionId,
        p_item_id: input.itemId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: async (input: { collectionId: string; itemId: string }) => {
      const { error } = await supabase.rpc('oculto_play_collection_remove', {
        p_collection_id: input.collectionId,
        p_item_id: input.itemId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, remove, addItem, removeItem };
}
