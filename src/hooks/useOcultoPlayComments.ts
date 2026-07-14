/**
 * useOcultoPlayComments — Etapa 12
 *
 * Comentários nos itens do OCULTO PLAY, atrás do gate Play.
 * Backend: RPCs SECURITY DEFINER + RLS + trigger de contagem.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';
import { toast } from 'sonner';

export interface OcultoPlayComment {
  id: string;
  item_id: string;
  author_id: string;
  body: string;
  is_hidden: boolean;
  created_at: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  mine: boolean;
}

export function useOcultoPlayComments(itemId: string | null | undefined, limit = 50) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<OcultoPlayComment[]>({
    queryKey: ['oculto-play', 'comments', itemId, limit],
    enabled: !!itemId && canAccess,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_comments_list', {
        p_item_id: itemId,
        p_limit: limit,
        p_before: null,
      });
      if (error) throw error;
      return (data ?? []) as OcultoPlayComment[];
    },
  });
}

export function useOcultoPlayCommentActions(itemId: string | null | undefined) {
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: async (body: string) => {
      if (!itemId) throw new Error('item missing');
      const { data, error } = await supabase.rpc('oculto_play_comments_add', {
        p_item_id: itemId,
        p_body: body,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'comments', itemId] });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao comentar.'),
  });

  const remove = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('oculto_play_comments')
        .delete()
        .eq('id', commentId);
      if (error) throw error;
      return commentId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'comments', itemId] });
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao apagar.'),
  });

  const moderate = useMutation({
    mutationFn: async (input: { commentId: string; action: 'hide' | 'restore' | 'delete'; reason?: string }) => {
      const { data, error } = await supabase.rpc('oculto_play_comments_moderate', {
        p_comment_id: input.commentId,
        p_action: input.action,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oculto-play', 'comments', itemId] }),
    onError: (e: any) => toast.error(e?.message ?? 'Falha na moderação.'),
  });

  return { add, remove, moderate };
}
