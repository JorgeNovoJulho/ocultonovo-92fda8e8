import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface GraveyardEntry {
  id: string;
  original_user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  reason: string | null;
  initiated_by: string;
  archived_at: string;
  purge_after: string;
  total: number;
}

export interface GraveyardSnapshot {
  id: string;
  original_user_id: string;
  original_profile_id: string | null;
  email: string | null;
  username: string | null;
  display_name: string | null;
  reason: string | null;
  initiated_by: string;
  archived_at: string;
  purge_after: string;
  profile_snapshot: Record<string, any>;
  content_snapshot: Record<string, any>;
  metadata: Record<string, any>;
}

export function useGraveyardList(search: string = '', limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['graveyard-list', search, limit, offset],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('master_list_graveyard', {
        p_search: search || null,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      return (data || []) as GraveyardEntry[];
    },
    staleTime: 30_000,
  });
}

export function useGraveyardEntry(id: string | null) {
  return useQuery({
    queryKey: ['graveyard-entry', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any).rpc('master_get_graveyard_entry', {
        p_id: id,
      });
      if (error) throw error;
      return data as GraveyardSnapshot | null;
    },
    enabled: !!id,
  });
}
