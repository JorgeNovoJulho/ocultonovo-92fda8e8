/**
 * useOcultoPlayWatchLater — Etapa 32
 *
 * Lista, adiciona e remove itens da fila "Assistir Depois" do usuário.
 * Tabela: oculto_play_watch_later (RLS por user_id).
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface WatchLaterItem {
  item_id: string;
  kind: string;
  title: string | null;
  thumb_url: string | null;
  media_url: string | null;
  view_count: number;
  like_count: number;
  author_id: string | null;
  saved_at: string;
}

export function useOcultoPlayWatchLater(opts?: { limit?: number; enabled?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const limit = opts?.limit ?? 60;
  const enabled = (opts?.enabled ?? true) && !!user;

  const query = useQuery({
    queryKey: ['oculto-play-watch-later', user?.id, limit],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<WatchLaterItem[]> => {
      const { data, error } = await supabase.rpc('oculto_play_watch_later_list', {
        p_limit: limit,
      });
      if (error) {
        console.warn('[useOcultoPlayWatchLater] list error', error);
        return [];
      }
      return (data ?? []) as WatchLaterItem[];
    },
  });

  const idSet = useMemo(
    () => new Set((query.data ?? []).map((it) => it.item_id)),
    [query.data],
  );

  const add = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error('Faça login.');
      const { error } = await (supabase as any)
        .from('oculto_play_watch_later')
        .insert({ user_id: user.id, item_id: itemId });
      // Ignora duplicidade
      if (error && !String(error.message ?? '').toLowerCase().includes('duplicate')) {
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play-watch-later', user?.id] });
      toast.success('Salvo em Assistir Depois');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não consegui salvar.'),
  });

  const remove = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) throw new Error('Faça login.');
      const { error } = await (supabase as any)
        .from('oculto_play_watch_later')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play-watch-later', user?.id] });
    },
  });

  return { ...query, idSet, add, remove };
}
