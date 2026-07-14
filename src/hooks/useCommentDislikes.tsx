/**
 * useCommentDislikes — leitura/escrita de "dislikes" em comentários.
 * Tabela: public.comment_dislikes (story_id+user_id UNIQUE, semelhante a comment_likes).
 * SQL: ver supabase/external_sql/2026_06_04_comment_dislikes.sql
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { resolveActorId } from '@/lib/ensureProfile';

export function useCommentDislikeStatus(commentIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['comment-dislike-status', commentIds, user?.id],
    queryFn: async () => {
      if (!user?.id || commentIds.length === 0) return new Set<string>();
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!profile) return new Set<string>();
      const { data, error } = await (supabase as any)
        .from('comment_dislikes')
        .select('comment_id')
        .in('comment_id', commentIds)
        .eq('user_id', profile.id);
      if (error) return new Set<string>();
      return new Set((data || []).map((d: any) => d.comment_id));
    },
    enabled: !!user?.id && commentIds.length > 0,
    staleTime: 30_000,
  });
}

export function useCommentDislikeCounts(commentIds: string[]) {
  return useQuery({
    queryKey: ['comment-dislike-counts', commentIds],
    queryFn: async () => {
      if (commentIds.length === 0) return new Map<string, number>();
      const { data, error } = await (supabase as any)
        .from('comment_dislikes')
        .select('comment_id')
        .in('comment_id', commentIds);
      if (error) return new Map<string, number>();
      const map = new Map<string, number>();
      for (const row of data || []) {
        map.set(row.comment_id, (map.get(row.comment_id) || 0) + 1);
      }
      return map;
    },
    enabled: commentIds.length > 0,
    staleTime: 30_000,
  });
}

export function useDislikeComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ commentId, isDisliked }: { commentId: string; isDisliked: boolean }) => {
      if (!user?.id) throw new Error('Não autenticado');
      const actorId = await resolveActorId();
      if (!actorId) throw new Error('Perfil não encontrado');
      if (isDisliked) {
        const { error } = await (supabase as any)
          .from('comment_dislikes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', actorId);
        if (error) throw error;
      } else {
        // Remove like se existir, garantindo exclusão mútua
        await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', actorId);
        const { error } = await (supabase as any)
          .from('comment_dislikes')
          .insert({ comment_id: commentId, user_id: actorId });
        if (error) throw error;
      }
      return { commentId, disliked: !isDisliked };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments'] });
      queryClient.invalidateQueries({ queryKey: ['comment-dislike-status'] });
      queryClient.invalidateQueries({ queryKey: ['comment-dislike-counts'] });
      queryClient.invalidateQueries({ queryKey: ['comment-like-status'] });
    },
    onError: (e: any) => {
      console.error('[useDislikeComment]', e);
      toast.error(e?.message || 'Erro ao deslikar comentário');
    },
  });
}
