import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface PairMatchRecord {
  matchId: string;
  profileId: string;
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  planType: string;
  matchedAt: string;
  sharedTags: string[];
}

type NormalizedLike = {
  id: string;
  timestamp: string;
};

function dedupeLikes(rows: NormalizedLike[]) {
  const map = new Map<string, string>();

  rows.forEach((row) => {
    const current = map.get(row.id);
    if (!current || new Date(row.timestamp).getTime() > new Date(current).getTime()) {
      map.set(row.id, row.timestamp);
    }
  });

  return Array.from(map.entries()).map(([id, timestamp]) => ({ id, timestamp }));
}

export function usePairMatches() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pair-matches', user?.id],
    queryFn: async (): Promise<PairMatchRecord[]> => {
      if (!user?.id) return [];

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('id, tags_social, tags_adult')
        .eq('user_id', user.id)
        .single();

      if (!myProfile) return [];

      const myProfileId = myProfile.id;
      const myTags = [...(myProfile.tags_social || []), ...(myProfile.tags_adult || [])];

      const [myProfileLikesResult, myActionLikesResult, myLegacyLikesResult] = await Promise.all([
        (supabase as any)
          .from('profile_likes')
          .select('receiver_id, created_at')
          .eq('sender_id', myProfileId),
        (supabase as any)
          .from('perfect_pair_actions')
          .select('target_id, updated_at')
          .eq('user_id', myProfileId)
          .in('action_type', ['like', 'super_like']),
        (supabase as any)
          .from('perfect_pairs')
          .select('target_id, created_at')
          .eq('user_id', myProfileId)
          .in('action', ['like', 'super_like']),
      ]);

      const myLikes = dedupeLikes([
        ...((myProfileLikesResult.data || []) as any[]).map((like) => ({
          id: like.receiver_id,
          timestamp: like.created_at || new Date().toISOString(),
        })),
        ...((myActionLikesResult.data || []) as any[]).map((like) => ({
          id: like.target_id,
          timestamp: like.updated_at || new Date().toISOString(),
        })),
        ...((myLegacyLikesResult.data || []) as any[]).map((like) => ({
          id: like.target_id,
          timestamp: like.created_at || new Date().toISOString(),
        })),
      ]);

      if (myLikes.length === 0) return [];

      const likedIds = myLikes.map((like) => like.id);

      const [mutualProfileLikesResult, mutualActionLikesResult, mutualLegacyLikesResult] = await Promise.all([
        (supabase as any)
          .from('profile_likes')
          .select('sender_id, created_at')
          .eq('receiver_id', myProfileId)
          .in('sender_id', likedIds),
        (supabase as any)
          .from('perfect_pair_actions')
          .select('user_id, updated_at')
          .eq('target_id', myProfileId)
          .in('action_type', ['like', 'super_like'])
          .in('user_id', likedIds),
        (supabase as any)
          .from('perfect_pairs')
          .select('user_id, created_at')
          .eq('target_id', myProfileId)
          .in('action', ['like', 'super_like'])
          .in('user_id', likedIds),
      ]);

      const mutualLikes = dedupeLikes([
        ...((mutualProfileLikesResult.data || []) as any[]).map((like) => ({
          id: like.sender_id,
          timestamp: like.created_at || new Date().toISOString(),
        })),
        ...((mutualActionLikesResult.data || []) as any[]).map((like) => ({
          id: like.user_id,
          timestamp: like.updated_at || new Date().toISOString(),
        })),
        ...((mutualLegacyLikesResult.data || []) as any[]).map((like) => ({
          id: like.user_id,
          timestamp: like.created_at || new Date().toISOString(),
        })),
      ]);

      if (mutualLikes.length === 0) return [];

      const matchedProfileIds = mutualLikes.map((like) => like.id);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, name, username, avatar_url, plan_type, tags_social, tags_adult')
        .in('id', matchedProfileIds);

      if (!profiles) return [];

      return profiles.map((profile: any) => {
        const theirTags = [...(profile.tags_social || []), ...(profile.tags_adult || [])];
        const sharedTags = myTags.filter((tag) => theirTags.includes(tag));
        const myLike = myLikes.find((like) => like.id === profile.id);
        const theirLike = mutualLikes.find((like) => like.id === profile.id);
        const matchedAt = [myLike?.timestamp, theirLike?.timestamp]
          .filter(Boolean)
          .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] || new Date().toISOString();

        return {
          matchId: profile.id,
          profileId: profile.id,
          userId: profile.user_id,
          name: profile.name || profile.username || 'Usuário',
          username: profile.username || null,
          avatarUrl: profile.avatar_url,
          planType: profile.plan_type || 'free',
          matchedAt,
          sharedTags: sharedTags.slice(0, 5),
        } as PairMatchRecord;
      });
    },
    enabled: !!user?.id,
    staleTime: 0,
    gcTime: 30 * 1000,
  });

  useEffect(() => {
    if (!user?.id) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['pair-matches', user.id] });
    };

    const unsubActions = subscribeTable('perfect_pair_actions', () => invalidate());
    const unsubPairs = subscribeTable('perfect_pairs', () => invalidate());

    return () => {
      unsubActions();
      unsubPairs();
    };
  }, [user?.id, queryClient]);

  return query;
}

export function useUndoPairMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (profileId: string) => {
      if (!user?.id) throw new Error('Não autenticado');

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myProfile) throw new Error('Perfil não encontrado');

      await Promise.allSettled([
        (supabase as any)
          .from('perfect_pair_actions')
          .delete()
          .eq('user_id', myProfile.id)
          .eq('target_id', profileId)
          .in('action_type', ['like', 'super_like']),
        (supabase as any)
          .from('perfect_pairs')
          .delete()
          .eq('user_id', myProfile.id)
          .eq('target_id', profileId)
          .in('action', ['like', 'super_like']),
      ]);
    },
    onSuccess: () => {
      toast.success('Match desfeito');
      queryClient.invalidateQueries({ queryKey: ['pair-matches'] });
    },
    onError: () => toast.error('Erro ao desfazer match'),
  });
}

export function useBlockPairMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ profileId }: { profileId: string; blockedUserId: string }) => {
      if (!user?.id) throw new Error('Não autenticado');

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myProfile) throw new Error('Perfil não encontrado');

      const { error } = await (supabase as any)
        .from('blocked_contacts')
        .upsert(
          { user_id: myProfile.id, blocked_user_id: profileId, block_type: 'blocked' },
          { onConflict: 'user_id,blocked_user_id' }
        );

      if (error && !error.message.includes('duplicate')) throw error;

      await Promise.allSettled([
        (supabase as any)
          .from('perfect_pair_actions')
          .delete()
          .or(`and(user_id.eq.${myProfile.id},target_id.eq.${profileId}),and(user_id.eq.${profileId},target_id.eq.${myProfile.id})`),
        (supabase as any)
          .from('perfect_pairs')
          .delete()
          .or(`and(user_id.eq.${myProfile.id},target_id.eq.${profileId}),and(user_id.eq.${profileId},target_id.eq.${myProfile.id})`),
      ]);
    },
    onSuccess: () => {
      toast.success('Usuário bloqueado');
      queryClient.invalidateQueries({ queryKey: ['pair-matches'] });
    },
    onError: () => toast.error('Erro ao bloquear'),
  });
}
