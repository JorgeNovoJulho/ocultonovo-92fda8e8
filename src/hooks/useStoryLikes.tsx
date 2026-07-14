import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

interface LikeProfile {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  plan_type: string;
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

// Hook para dar/remover like em story (com exclusividade mutual + optimistic update)
export function useLikeStory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ storyId, isLiked }: { storyId: string; isLiked: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const profileId = await getProfileId(user.id);
      if (!profileId) throw new Error('Profile not found');

      if (isLiked) {
        const { error } = await (supabase as any)
          .from('story_likes')
          .delete()
          .eq('story_id', storyId)
          .eq('user_id', profileId);
        if (error) throw error;
      } else {
        await (supabase as any)
          .from('story_dislikes')
          .delete()
          .eq('story_id', storyId)
          .eq('user_id', profileId);
        const { error } = await (supabase as any)
          .from('story_likes')
          .insert({ story_id: storyId, user_id: profileId });
        if (error) throw error;
      }
    },
    onMutate: async ({ storyId, isLiked }) => {
      await queryClient.cancelQueries({ queryKey: ['story-like-status', storyId] });
      await queryClient.cancelQueries({ queryKey: ['story-dislike-status', storyId] });
      await queryClient.cancelQueries({ queryKey: ['story-like-count', storyId] });
      await queryClient.cancelQueries({ queryKey: ['story-dislike-count', storyId] });

      const prevLiked = queryClient.getQueriesData<boolean>({ queryKey: ['story-like-status', storyId] });
      const prevDisliked = queryClient.getQueriesData<boolean>({ queryKey: ['story-dislike-status', storyId] });
      const prevLikeCount = queryClient.getQueryData<number>(['story-like-count', storyId]) ?? 0;
      const prevDislikeCount = queryClient.getQueryData<number>(['story-dislike-count', storyId]) ?? 0;
      const wasDisliked = prevDisliked.some(([, v]) => v === true);

      queryClient.setQueriesData({ queryKey: ['story-like-status', storyId] }, !isLiked);
      if (!isLiked) queryClient.setQueriesData({ queryKey: ['story-dislike-status', storyId] }, false);

      queryClient.setQueryData<number>(['story-like-count', storyId], Math.max(0, prevLikeCount + (isLiked ? -1 : 1)));
      if (!isLiked && wasDisliked) {
        queryClient.setQueryData<number>(['story-dislike-count', storyId], Math.max(0, prevDislikeCount - 1));
      }

      return { prevLiked, prevDisliked, prevLikeCount, prevDislikeCount };
    },
    onError: (_e, { storyId }, ctx) => {
      if (!ctx) return;
      ctx.prevLiked.forEach(([k, v]) => queryClient.setQueryData(k, v));
      ctx.prevDisliked.forEach(([k, v]) => queryClient.setQueryData(k, v));
      queryClient.setQueryData(['story-like-count', storyId], ctx.prevLikeCount);
      queryClient.setQueryData(['story-dislike-count', storyId], ctx.prevDislikeCount);
    },
    onSettled: (_d, _e, { storyId }) => {
      // Refetch IMEDIATO (não apenas invalidate) — garante saldo correto
      // mesmo se a query estiver com staleTime ativo em outro dispositivo.
      queryClient.refetchQueries({ queryKey: ['story-like-status', storyId] });
      queryClient.refetchQueries({ queryKey: ['story-dislike-status', storyId] });
      queryClient.refetchQueries({ queryKey: ['story-like-count', storyId] });
      queryClient.refetchQueries({ queryKey: ['story-dislike-count', storyId] });
      queryClient.invalidateQueries({ queryKey: ['story-likers', storyId] });
      queryClient.invalidateQueries({ queryKey: ['story-dislikers', storyId] });
    },
  });
}

// Hook para dar/remover dislike em story (com optimistic update)
export function useDislikeStory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ storyId, isDisliked }: { storyId: string; isDisliked: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const profileId = await getProfileId(user.id);
      if (!profileId) throw new Error('Profile not found');

      if (isDisliked) {
        const { error } = await (supabase as any)
          .from('story_dislikes')
          .delete()
          .eq('story_id', storyId)
          .eq('user_id', profileId);
        if (error) throw error;
      } else {
        await (supabase as any)
          .from('story_likes')
          .delete()
          .eq('story_id', storyId)
          .eq('user_id', profileId);
        const { error } = await (supabase as any)
          .from('story_dislikes')
          .insert({ story_id: storyId, user_id: profileId });
        if (error) throw error;
      }
    },
    onMutate: async ({ storyId, isDisliked }) => {
      await queryClient.cancelQueries({ queryKey: ['story-like-status', storyId] });
      await queryClient.cancelQueries({ queryKey: ['story-dislike-status', storyId] });
      await queryClient.cancelQueries({ queryKey: ['story-like-count', storyId] });
      await queryClient.cancelQueries({ queryKey: ['story-dislike-count', storyId] });

      const prevLiked = queryClient.getQueriesData<boolean>({ queryKey: ['story-like-status', storyId] });
      const prevDisliked = queryClient.getQueriesData<boolean>({ queryKey: ['story-dislike-status', storyId] });
      const prevLikeCount = queryClient.getQueryData<number>(['story-like-count', storyId]) ?? 0;
      const prevDislikeCount = queryClient.getQueryData<number>(['story-dislike-count', storyId]) ?? 0;
      const wasLiked = prevLiked.some(([, v]) => v === true);

      queryClient.setQueriesData({ queryKey: ['story-dislike-status', storyId] }, !isDisliked);
      if (!isDisliked) queryClient.setQueriesData({ queryKey: ['story-like-status', storyId] }, false);

      queryClient.setQueryData<number>(['story-dislike-count', storyId], Math.max(0, prevDislikeCount + (isDisliked ? -1 : 1)));
      if (!isDisliked && wasLiked) {
        queryClient.setQueryData<number>(['story-like-count', storyId], Math.max(0, prevLikeCount - 1));
      }

      return { prevLiked, prevDisliked, prevLikeCount, prevDislikeCount };
    },
    onError: (_e, { storyId }, ctx) => {
      if (!ctx) return;
      ctx.prevLiked.forEach(([k, v]) => queryClient.setQueryData(k, v));
      ctx.prevDisliked.forEach(([k, v]) => queryClient.setQueryData(k, v));
      queryClient.setQueryData(['story-like-count', storyId], ctx.prevLikeCount);
      queryClient.setQueryData(['story-dislike-count', storyId], ctx.prevDislikeCount);
    },
    onSettled: (_d, _e, { storyId }) => {
      queryClient.refetchQueries({ queryKey: ['story-like-status', storyId] });
      queryClient.refetchQueries({ queryKey: ['story-dislike-status', storyId] });
      queryClient.refetchQueries({ queryKey: ['story-like-count', storyId] });
      queryClient.refetchQueries({ queryKey: ['story-dislike-count', storyId] });
      queryClient.invalidateQueries({ queryKey: ['story-likers', storyId] });
      queryClient.invalidateQueries({ queryKey: ['story-dislikers', storyId] });
    },
  });
}

// Hook para verificar se o usuário curtiu o story
export function useStoryLikeStatus(storyId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['story-like-status', storyId, user?.id],
    queryFn: async () => {
      if (!storyId || !user?.id) return false;

      const profileId = await getProfileId(user.id);
      if (!profileId) return false;

      const { data, error } = await (supabase as any)
        .from('story_likes')
        .select('id')
        .eq('story_id', storyId)
        .eq('user_id', profileId)
        .maybeSingle();

      if (error) return false;
      return !!data;
    },
    enabled: !!storyId && !!user?.id,
  });
}

// Hook para verificar se o usuário descurtiu o story
export function useStoryDislikeStatus(storyId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['story-dislike-status', storyId, user?.id],
    queryFn: async () => {
      if (!storyId || !user?.id) return false;

      const profileId = await getProfileId(user.id);
      if (!profileId) return false;

      const { data, error } = await (supabase as any)
        .from('story_dislikes')
        .select('id')
        .eq('story_id', storyId)
        .eq('user_id', profileId)
        .maybeSingle();

      if (error) return false;
      return !!data;
    },
    enabled: !!storyId && !!user?.id,
  });
}

// Hook para contar likes de um story (usa RPC que bypassa RLS para counts reais)
export function useStoryLikeCount(storyId: string | null | undefined) {
  return useQuery({
    queryKey: ['story-like-count', storyId],
    queryFn: async () => {
      if (!storyId) return 0;
      const { data, error } = await (supabase as any).rpc('story_metrics_get', { p_story_id: storyId });
      if (error) {
        // fallback para count direto
        const { count } = await (supabase as any)
          .from('story_likes')
          .select('*', { count: 'exact', head: true })
          .eq('story_id', storyId);
        return count || 0;
      }
      return Number(data?.[0]?.like_count ?? 0);
    },
    enabled: !!storyId,
    staleTime: 5_000,
  });
}

// Hook para contar dislikes de um story
export function useStoryDislikeCount(storyId: string | null | undefined) {
  return useQuery({
    queryKey: ['story-dislike-count', storyId],
    queryFn: async () => {
      if (!storyId) return 0;
      const { data, error } = await (supabase as any).rpc('story_metrics_get', { p_story_id: storyId });
      if (error) {
        const { count } = await (supabase as any)
          .from('story_dislikes')
          .select('*', { count: 'exact', head: true })
          .eq('story_id', storyId);
        return count || 0;
      }
      return Number(data?.[0]?.dislike_count ?? 0);
    },
    enabled: !!storyId,
    staleTime: 5_000,
  });
}

// Hook para listar quem deu like (apenas para o dono do story)
export function useStoryLikers(storyId: string | null | undefined) {
  return useQuery({
    queryKey: ['story-likers', storyId],
    queryFn: async (): Promise<LikeProfile[]> => {
      if (!storyId) return [];

      const { data, error } = await (supabase as any)
        .from('story_likes')
        .select('user_id, created_at')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      const userIds = data.map((d: any) => d.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, plan_type')
        .in('id', userIds);

      return (profiles || []) as LikeProfile[];
    },
    enabled: !!storyId,
  });
}

// Hook para listar quem deu dislike (apenas para o dono do story)
export function useStoryDislikers(storyId: string | null | undefined) {
  return useQuery({
    queryKey: ['story-dislikers', storyId],
    queryFn: async (): Promise<LikeProfile[]> => {
      if (!storyId) return [];

      const { data, error } = await (supabase as any)
        .from('story_dislikes')
        .select('user_id, created_at')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      const userIds = data.map((d: any) => d.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, plan_type')
        .in('id', userIds);

      return (profiles || []) as LikeProfile[];
    },
    enabled: !!storyId,
  });
}
