import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from 'sonner';
import { resolveActorId } from '@/lib/ensureProfile';

function updatePostCollections(old: any, postId: string, updater: (post: any) => any) {
  if (!old) return old;

  if (old.pages) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        const items = Array.isArray(page?.posts) ? page.posts : Array.isArray(page) ? page : null;
        if (!items) return page;

        const nextItems = items.map((p: any) => (p.id === postId ? updater(p) : p));
        return Array.isArray(page) ? nextItems : { ...page, posts: nextItems };
      }),
    };
  }

  if (Array.isArray(old)) {
    return old.map((p: any) => (p.id === postId ? updater(p) : p));
  }

  return old;
}

interface DislikeProfile {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
}

async function getProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (error) return null;
  return data?.id || null;
}

// Hook para dar/remover dislike
export function useDislikePost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: async ({ postId, isDisliked }: { postId: string; isDisliked: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const dislikeActorId = await resolveActorId(profile?.id);
      if (!dislikeActorId) throw new Error('Profile not found');

      if (isDisliked) {
        const { error } = await supabase
          .from('post_dislikes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', dislikeActorId);

        if (error) throw error;
      } else {
        // Remove like first if exists (mutual exclusivity)
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', dislikeActorId);

        const { error } = await supabase
          .from('post_dislikes')
          .insert({ post_id: postId, user_id: dislikeActorId });

        if (error) throw error;

        // Send dislike notification (best-effort)
        try {
          const { data: post } = await supabase
            .from('posts')
            .select('author_id, user_id')
            .eq('id', postId)
            .maybeSingle();

          if (post) {
            const ownerProfileId = (post as any).author_id || (post as any).user_id;
            if (!ownerProfileId) return;

            const { data: ownerProfile } = await supabase
              .from('profiles')
              .select('user_id, is_seed')
              .eq('id', ownerProfileId)
              .maybeSingle();

            if (ownerProfile && !ownerProfile.is_seed && ownerProfile.user_id !== user.id && profile) {
              const displayName = profile.username || profile.name || 'Alguém';
              await supabase.from('notifications').insert({
                user_id: ownerProfile.user_id,
                type: 'like',
                title: `@${displayName} reagiu à sua publicação`,
                body: null,
                data: { actor_id: profile.id, actor_user_id: user.id, post_id: postId },
              });
            }
          }
        } catch (e) {
          console.warn('Dislike notification failed (non-critical):', e);
        }
      }
    },
    onMutate: async ({ postId, isDisliked }) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['posts-infinite'] });
      await queryClient.cancelQueries({ queryKey: ['creator-posts'] });

      const previousPosts = queryClient.getQueriesData({ queryKey: ['posts'] });
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['posts-infinite'] });
      const previousCreatorPosts = queryClient.getQueriesData({ queryKey: ['creator-posts'] });

      const updatePostsCache = (old: any) =>
        updatePostCollections(old, postId, (p) => ({
          ...p,
          is_disliked: !isDisliked,
          is_liked: false,
          dislikes_count: isDisliked
            ? Math.max(0, (p.dislikes_count || 0) - 1)
            : (p.dislikes_count || 0) + 1,
          likes_count: !isDisliked && p.is_liked
            ? Math.max(0, (p.likes_count || 0) - 1)
            : p.likes_count,
        }));

      queryClient.setQueriesData({ queryKey: ['posts'] }, updatePostsCache);
      queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, updatePostsCache);
      queryClient.setQueriesData({ queryKey: ['creator-posts'] }, updatePostsCache);

      return { previousPosts, previousInfinite, previousCreatorPosts };
    },
    onError: (_err, _vars, context: any) => {
      context?.previousPosts?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
      context?.previousInfinite?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
      context?.previousCreatorPosts?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
      toast.error('Erro ao reagir', {
        description: 'Não foi possível registrar sua reação. Tente novamente.',
      });
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.isDisliked ? 'Reação removida' : '👎 Reação registrada');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
      queryClient.invalidateQueries({ queryKey: ['post-dislikes'] });
      queryClient.invalidateQueries({ queryKey: ['post-dislike-status'] });
    },
  });
}

// Hook para verificar se o usuário deu dislike em posts
export function usePostDislikeStatus(postIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['post-dislike-status', postIds, user?.id],
    queryFn: async () => {
      if (!user?.id || postIds.length === 0) return new Set<string>();

      const profileId = await getProfileId(user.id);
      if (!profileId) return new Set<string>();

      const { data, error } = await supabase
        .from('post_dislikes')
        .select('post_id')
        .in('post_id', postIds)
        .eq('user_id', profileId);

      if (error) return new Set<string>();
      return new Set((data || []).map(d => d.post_id));
    },
    enabled: !!user?.id && postIds.length > 0,
  });
}

// Hook para listar quem deu dislike em um post
export function usePostDislikers(postId: string | undefined) {
  return useQuery({
    queryKey: ['post-dislikers', postId],
    queryFn: async () => {
      if (!postId) return [];

      const { data, error } = await supabase
        .from('post_dislikes')
        .select('user_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (error) return [];

      const userIds = (data || []).map(d => d.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('id', userIds);

      return (profiles || []) as DislikeProfile[];
    },
    enabled: !!postId,
  });
}
