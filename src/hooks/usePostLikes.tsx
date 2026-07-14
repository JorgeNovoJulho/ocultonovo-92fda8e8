import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useShadowbanInterceptor } from './useShadowbanInterceptor';
import { useRef } from 'react';
import { toast } from 'sonner';

interface LikeProfile {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  is_creator?: boolean;
  liked_at?: string;
}

function getLikeErrorFeedback(error: any) {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const code = String(error?.code || '');
  const combined = `${message} ${details} ${hint}`;

  if (message === 'self-like-not-allowed') {
    return {
      title: 'Ação não permitida',
      description: 'Você não pode curtir suas próprias publicações.',
    };
  }

  if (code === '23503' || combined.includes('foreign key')) {
    return {
      title: 'Não foi possível salvar sua curtida',
      description: 'Seu perfil não foi vinculado corretamente. Atualize a página e tente novamente.',
    };
  }

  if (code === '42703' || combined.includes('column') && combined.includes('does not exist')) {
    return {
      title: 'Curtida bloqueada por configuração do banco',
      description: 'A rotina de curtidas do banco externo precisa estar alinhada com a estrutura atual dos posts.',
    };
  }

  if (code === '42501' || combined.includes('row-level security') || combined.includes('violates row-level security')) {
    return {
      title: 'Curtida bloqueada',
      description: 'Seu usuário não tem permissão para registrar esta curtida agora.',
    };
  }

  if (message === 'profile not found') {
    return {
      title: 'Perfil não encontrado',
      description: 'Seu perfil ainda não está pronto para curtir postagens.',
    };
  }

  return {
    title: 'Erro ao curtir postagem',
    description: 'Não foi possível concluir sua curtida. Tente novamente.',
  };
}

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

// Hook para listar quem curtiu um post
export function usePostLikers(postId: string | undefined) {
  return useQuery({
    queryKey: ['post-likers', postId],
    queryFn: async () => {
      if (!postId) return [];

      const { data, error } = await supabase
        .from('post_likes')
        .select('user_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (error) return [];

      const userIds = (data || []).map(l => l.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, is_verified, is_creator')
        .in('id', userIds);

      const likedAtMap = new Map((data || []).map(l => [l.user_id, l.created_at]));
      const ordered = userIds
        .map(uid => {
          const p = (profiles || []).find((pr: any) => pr.id === uid);
          if (!p) return null;
          return { ...p, liked_at: likedAtMap.get(uid) } as LikeProfile;
        })
        .filter(Boolean) as LikeProfile[];

      return ordered;
    },
    enabled: !!postId,
  });
}

// Hook de like com update otimista real + debounce 300ms
export function useLikePostExclusive() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isSimulatingAsBannedUser } = useShadowbanInterceptor();
  const lastClickRef = useRef(0);

  return useMutation({
    mutationFn: async ({ postId, isLiked }: { postId: string; isLiked: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      if (isSimulatingAsBannedUser) {
        await new Promise(resolve => setTimeout(resolve, 200));
        return;
      }

      const profileId = profile?.id;
      if (!profileId) throw new Error('Profile not found');

      // Garante sessão ativa no MESMO cliente Supabase (auth.uid precisa estar setado para a RLS aprovar)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('Not authenticated');

      // Confirma que profile.id existe no DB (evita FK error com perfil em fallback local)
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .maybeSingle();
      if (!profileCheck) throw new Error('Profile not found');

      // post_likes.user_id has FK to profiles(id), so we MUST use profile.id, not auth.uid
      const likeActorId = profileId;

      if (isLiked) {
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', likeActorId);
        if (error) throw error;
      } else {
        // Remove dislike first (mutual exclusivity)
        await supabase
          .from('post_dislikes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', likeActorId);

        // Idempotent: if already liked (race), treat as success
        const { data: existing } = await supabase
          .from('post_likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', likeActorId)
          .maybeSingle();
        if (existing) return;

        const { error } = await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: likeActorId });
        // 23505 = unique_violation: já curtido por race condition, tratar como sucesso
        if (error && (error as any).code !== '23505') throw error;

        // Notification + likes_count são criados por triggers no DB (notify_on_post_like + update_post_likes_count)
      }
    },
    // TRUE OPTIMISTIC UPDATE: instant UI change
    onMutate: async ({ postId, isLiked }) => {
      // Debounce 300ms
      const now = Date.now();
      if (now - lastClickRef.current < 300) {
        throw new Error('debounce');
      }
      lastClickRef.current = now;

      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['posts-infinite'] });
      await queryClient.cancelQueries({ queryKey: ['creator-posts'] });

      const previousPosts = queryClient.getQueriesData({ queryKey: ['posts'] });
      const previousInfinite = queryClient.getQueriesData({ queryKey: ['posts-infinite'] });
      const previousCreatorPosts = queryClient.getQueriesData({ queryKey: ['creator-posts'] });

      const updatePostsCache = (old: any) =>
        updatePostCollections(old, postId, (p) => ({
          ...p,
          is_liked: !isLiked,
          is_disliked: false,
          likes_count: isLiked
            ? Math.max(0, (p.likes_count || 0) - 1)
            : (p.likes_count || 0) + 1,
          dislikes_count: !isLiked && p.is_disliked
            ? Math.max(0, (p.dislikes_count || 0) - 1)
            : p.dislikes_count,
        }));

      queryClient.setQueriesData({ queryKey: ['posts'] }, updatePostsCache);
      queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, updatePostsCache);
      queryClient.setQueriesData({ queryKey: ['creator-posts'] }, updatePostsCache);

      return { previousPosts, previousInfinite, previousCreatorPosts };
    },
    onError: (_err, _vars, context: any) => {
      if (_err?.message === 'debounce') return;
      context?.previousPosts?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
      context?.previousInfinite?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
      context?.previousCreatorPosts?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));

      const feedback = getLikeErrorFeedback(_err);
      toast.error(feedback.title, {
        description: feedback.description,
      });
    },
    onSuccess: (_data, vars) => {
      if (!vars?.isLiked) {
        // Quest tracker (já existente)
        void import('@/lib/auraQuests').then(({ progressAuraQuest }) =>
          progressAuraQuest('like_post', 1, { bypassLock: true, reason: 'post curtido' })
        ).catch(() => {});

        // Economia de XP: debita do ator, premia o autor (idempotente via ref_key)
        const actorPid = profile?.id;
        if (actorPid && vars.postId) {
          void import('@/lib/auraInteractionXp').then(({ chargeInteractionXp }) =>
            chargeInteractionXp({
              actionKey: 'post_like',
              postId: vars.postId,
              receiverId: (vars as any).authorId ?? null,
              refKey: `like:${vars.postId}:${actorPid}`,
            }),
          ).catch(() => {});
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['creator-posts'] });
      queryClient.invalidateQueries({ queryKey: ['post-likers'] });
      queryClient.invalidateQueries({ queryKey: ['post-dislike-status'] });
    },
  });
}
