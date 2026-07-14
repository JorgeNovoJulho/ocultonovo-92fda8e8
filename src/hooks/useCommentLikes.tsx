import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { resolveActorId } from '@/lib/ensureProfile';

// Verificar se o usuário curtiu comentários específicos
export function useCommentLikeStatus(commentIds: string[]) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['comment-like-status', commentIds, user?.id],
    queryFn: async () => {
      if (!user?.id || commentIds.length === 0) return new Set<string>();
      
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
        
      if (!profile) return new Set<string>();
      
      const { data, error } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .in('comment_id', commentIds)
        .eq('user_id', profile.id);
        
      if (error) {
        console.error('Error fetching comment like status:', error);
        return new Set<string>();
      }
      return new Set((data || []).map(d => d.comment_id));
    },
    enabled: !!user?.id && commentIds.length > 0,
  });
}

// Curtir/descurtir comentário
export function useLikeComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ commentId, isLiked }: { commentId: string; isLiked: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const actorId = await resolveActorId();
      if (!actorId) throw new Error('Profile not found');
      const profile = { id: actorId };
      
      if (isLiked) {
        // Remover like
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', profile.id);
        
        if (error) throw error;
      } else {
        // Adicionar like
        const { error } = await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: profile.id });
          
        if (error) throw error;
      }
      
      return { commentId, liked: !isLiked };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments'] });
      queryClient.invalidateQueries({ queryKey: ['comment-like-status'] });
    },
    onError: (error) => {
      console.error('Error liking comment:', error);
      toast.error('Erro ao curtir comentário');
    }
  });
}
