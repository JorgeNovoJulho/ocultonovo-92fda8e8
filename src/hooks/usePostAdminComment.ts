/**
 * usePostAdminComment — Comentário do @ocultomaster fixado no topo do post.
 *
 * - Leitura pública (qualquer usuário vê o comentário renderizado no topo).
 * - Escrita restrita ao master admin via RLS na tabela oculto_post_admin_comments.
 * - Cache por postId; invalidação manual após upsert/delete.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface PostAdminComment {
  post_id: string;
  content: string;
  bg_color: string;
  text_color: string;
  font_size: number;
  font_family: string;
  bold?: boolean;
  author_id: string;
  updated_at: string;
}

const KEY = (postId: string) => ['post-admin-comment', postId] as const;

export function usePostAdminComment(postId: string | null | undefined) {
  return useQuery({
    queryKey: KEY(postId ?? ''),
    enabled: !!postId,
    staleTime: 60_000,
    queryFn: async (): Promise<PostAdminComment | null> => {
      if (!postId) return null;
      const { data, error } = await (supabase as any)
        .from('oculto_post_admin_comments')
        .select('*')
        .eq('post_id', postId)
        .maybeSingle();
      if (error) return null;
      return (data as PostAdminComment) ?? null;
    },
  });
}

export interface UpsertPostAdminCommentInput {
  post_id: string;
  content: string;
  bg_color: string;
  text_color: string;
  font_size: number;
  font_family: string;
  bold?: boolean;
  author_id: string;
}

export function useUpsertPostAdminComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertPostAdminCommentInput) => {
      const { error } = await (supabase as any)
        .from('oculto_post_admin_comments')
        .upsert(input, { onConflict: 'post_id' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEY(vars.post_id) });
    },
  });
}

export function useDeletePostAdminComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await (supabase as any)
        .from('oculto_post_admin_comments')
        .delete()
        .eq('post_id', postId);
      if (error) throw error;
    },
    onSuccess: (_d, postId) => {
      qc.invalidateQueries({ queryKey: KEY(postId) });
    },
  });
}
