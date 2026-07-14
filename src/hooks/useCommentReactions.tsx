import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type CommentReactionType = 'like' | 'dislike';

export interface CommentReactionState {
  likes: number;
  dislikes: number;
  myReaction: CommentReactionType | null;
}

export interface CommentReactionsMap {
  [commentId: string]: CommentReactionState;
}

const EMPTY: CommentReactionState = { likes: 0, dislikes: 0, myReaction: null };

/**
 * Lê reações (like/dislike) de uma lista de comment IDs de uma vez.
 * Retorna mapa { commentId: { likes, dislikes, myReaction } }.
 */
export function useCommentReactions(commentIds: string[]) {
  const { user } = useAuth();
  const stable = [...new Set(commentIds.filter(Boolean))].sort();

  return useQuery<CommentReactionsMap>({
    queryKey: ['comment-reactions', stable.join(','), user?.id ?? null],
    enabled: stable.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_post_comment_reactions')
        .select('comment_id,user_id,reaction')
        .in('comment_id', stable);

      if (error) {
        console.warn('[CommentReactions] fetch failed:', error.message);
        return {};
      }

      const map: CommentReactionsMap = {};
      for (const id of stable) map[id] = { ...EMPTY };

      for (const row of (data as any[]) ?? []) {
        const entry = map[row.comment_id] ?? { ...EMPTY };
        if (row.reaction === 'like') entry.likes += 1;
        else if (row.reaction === 'dislike') entry.dislikes += 1;
        if (user?.id && row.user_id === user.id) entry.myReaction = row.reaction;
        map[row.comment_id] = entry;
      }
      return map;
    },
  });
}

/**
 * Aplica/troca/remove reação no comentário (toggle).
 * Optimistic update sobre todas as queries 'comment-reactions'.
 */
export function useReactToComment() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      reaction,
      current,
    }: {
      commentId: string;
      reaction: CommentReactionType;
      current: CommentReactionType | null;
    }) => {
      if (!user) throw new Error('Faça login para reagir');

      // Toggle: mesma reação → remove
      if (current === reaction) {
        const { error } = await (supabase as any)
          .from('oculto_post_comment_reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);
        if (error) throw error;
        return { commentId, removed: true, reaction: null as CommentReactionType | null };
      }

      // Upsert (unique key em comment_id+user_id) — substitui qualquer reação prévia
      const { error } = await (supabase as any)
        .from('oculto_post_comment_reactions')
        .upsert(
          { comment_id: commentId, user_id: user.id, reaction },
          { onConflict: 'comment_id,user_id' },
        );
      if (error) throw error;
      return { commentId, removed: false, reaction };
    },

    onMutate: async ({ commentId, reaction, current }) => {
      // Atualiza otimisticamente todas as queries 'comment-reactions' que contenham esse commentId
      const queries = qc.getQueriesData<CommentReactionsMap>({ queryKey: ['comment-reactions'] });
      const snapshot: Array<[any, CommentReactionsMap | undefined]> = [];
      for (const [key, data] of queries) {
        snapshot.push([key, data ? { ...data } : undefined]);
        if (!data || !data[commentId]) continue;
        const entry = { ...data[commentId] };
        // Remove reação atual
        if (current === 'like') entry.likes = Math.max(0, entry.likes - 1);
        if (current === 'dislike') entry.dislikes = Math.max(0, entry.dislikes - 1);
        // Aplica nova (se diferente)
        if (current === reaction) {
          entry.myReaction = null;
        } else {
          if (reaction === 'like') entry.likes += 1;
          else entry.dislikes += 1;
          entry.myReaction = reaction;
        }
        qc.setQueryData(key, { ...data, [commentId]: entry });
      }
      return { snapshot };
    },

    onError: (err: any, _vars, ctx) => {
      // Reverte snapshots
      if (ctx?.snapshot) {
        for (const [key, data] of ctx.snapshot) {
          qc.setQueryData(key, data);
        }
      }
      toast.error(err?.message || 'Falha ao reagir ao comentário');
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['comment-reactions'] });
    },
  });
}
