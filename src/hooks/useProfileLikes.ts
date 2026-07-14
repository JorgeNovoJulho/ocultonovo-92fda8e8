import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useCallback } from 'react';

export interface ProfileLike {
  id: string;
  liker_id: string;
  liked_id: string;
  created_at: string;
  liker?: {
    id: string;
    name: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean;
    is_online: boolean;
    plan_type: string;
  };
}

async function getProfileId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id || null;
}

/**
 * Fetches received profile likes from the external schema.
 */
export function useReceivedProfileLikes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['received-profile-likes', user?.id],
    staleTime: 60_000, // 1 min — evita refetch agressivo
    gcTime: 5 * 60_000,
    queryFn: async () => {
      if (!user?.id) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      // 1 round-trip via RPC otimizada (substitui 3 queries sequenciais)
      const { data, error } = await (supabase as any).rpc('get_received_likes_with_profiles', {
        p_receiver_id: profileId,
        p_limit: 50,
      });

      if (error || !data) return [];

      return (data as any[]).map((row) => ({
        id: row.id,
        liker_id: row.sender_id,
        liked_id: row.receiver_id,
        created_at: row.created_at,
        liker: row.liker_name
          ? {
              id: row.sender_id,
              name: row.liker_name,
              username: row.liker_username,
              avatar_url: row.liker_avatar_url,
              is_verified: row.liker_is_verified,
              is_online: row.liker_is_online,
              plan_type: row.liker_plan_type,
            }
          : undefined,
      })) as ProfileLike[];
    },
    enabled: !!user?.id,
  });

  const markAllAsSeen = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['received-profile-likes-count'] });
    queryClient.invalidateQueries({ queryKey: ['received-profile-likes'] });
  }, [queryClient]);

  return { ...query, markAllAsSeen };
}

/**
 * Returns total received likes count + IDs (for unseen tracking).
 */
export function useReceivedLikesCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['received-profile-likes-count', user?.id],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      if (!user?.id) return { total: 0, ids: [] as string[] };

      const profileId = await getProfileId(user.id);
      if (!profileId) return { total: 0, ids: [] as string[] };

      const { data, count } = await (supabase as any)
        .from('profile_likes')
        .select('id', { count: 'exact' })
        .eq('receiver_id', profileId)
        .order('created_at', { ascending: false })
        .limit(200);

      return {
        total: count || 0,
        ids: (data || []).map((r: any) => r.id) as string[],
      };
    },
    enabled: !!user?.id,
  });
}
