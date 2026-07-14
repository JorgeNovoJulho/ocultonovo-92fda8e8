import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  distance_km: number;
  matched_at: string;
  user1_chat_started: boolean;
  user2_chat_started: boolean;
  is_expired: boolean;
  is_super_match: boolean;
  created_at: string;
  updated_at: string;
  other_user: {
    id: string;
    name: string;
    username?: string | null;
    avatar_url: string | null;
    is_looking_now: boolean;
    is_online: boolean;
    profile_type: string;
    is_verified: boolean;
    is_verified_couple: boolean;
    plan_type: string;
  };
  chat_started: boolean;
}

export function useMatches() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const profileId = (profile as any)?.id;

  const { data: matches = [], isLoading, refetch } = useQuery({
    queryKey: ['looking-now-matches', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      // Fetch matches where user is either user1 or user2
      const { data, error } = await supabase
        .from('looking_now_matches')
        .select('id,user1_id,user2_id,distance_km,matched_at,user1_chat_started,user2_chat_started,is_expired,is_super_match,created_at,updated_at')
        .or(`user1_id.eq.${profileId},user2_id.eq.${profileId}`)
        .order('matched_at', { ascending: false });

      if (error) throw error;

      // Get the other user's profile for each match
      const otherUserIds = (data || []).map(match => 
        match.user1_id === profileId ? match.user2_id : match.user1_id
      );

      if (otherUserIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, name, username, avatar_url, is_looking_now, is_online, profile_type, is_verified, is_verified_couple, plan_type')
        .or(`id.in.(${otherUserIds.join(',')}),user_id.in.(${otherUserIds.join(',')})`);

      if (profilesError) throw profilesError;

      const profilesMap = new Map();
      (profiles || []).forEach((p: any) => {
        profilesMap.set(p.id, p);
        if (p.user_id) profilesMap.set(p.user_id, p);
      });

      return (data || []).map(match => {
        const isUser1 = match.user1_id === profileId;
        const otherUserId = isUser1 ? match.user2_id : match.user1_id;
        const otherUser = profilesMap.get(otherUserId);

        return {
          id: match.id,
          user1_id: match.user1_id,
          user2_id: match.user2_id,
          distance_km: Number(match.distance_km),
          matched_at: match.matched_at,
          user1_chat_started: match.user1_chat_started,
          user2_chat_started: match.user2_chat_started,
          is_expired: match.is_expired || false,
          is_super_match: match.is_super_match || false,
          created_at: match.created_at,
          updated_at: match.updated_at,
          other_user: otherUser ? {
            ...otherUser,
            plan_type: otherUser.plan_type || 'free',
          } : {
            id: otherUserId,
            name: 'Usuário',
            avatar_url: null,
            is_looking_now: false,
            is_online: false,
            profile_type: 'single',
            is_verified: false,
            is_verified_couple: false,
            plan_type: 'free',
          },
          chat_started: isUser1 ? match.user1_chat_started : match.user2_chat_started,
        } as Match;
      });
    },
    enabled: !!profileId,
    staleTime: 30000,
  });

  // Subscribe to realtime changes
  useEffect(() => {
    if (!profileId) return;
    const unsub = subscribeTable('looking_now_matches', () => {
      refetch();
    });
    return unsub;
  }, [profileId, refetch]);

  const markChatStartedMutation = useMutation({
    mutationFn: async (matchId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const match = matches.find(m => m.id === matchId);
      if (!match) throw new Error('Match not found');

      const isUser1 = match.user1_id === profileId;
      const updateField = isUser1 ? 'user1_chat_started' : 'user2_chat_started';

      const { error } = await supabase
        .from('looking_now_matches')
        .update({ [updateField]: true })
        .eq('id', matchId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['looking-now-matches', profileId] });
    },
  });

  const activeMatches = useMemo(
    () => matches.filter(m => !m.is_expired),
    [matches]
  );

  const expiredMatches = useMemo(
    () => matches.filter(m => m.is_expired),
    [matches]
  );

  return {
    matches,
    activeMatches,
    expiredMatches,
    loading: isLoading,
    markChatStarted: (matchId: string) => markChatStartedMutation.mutate(matchId),
    refetch,
  };
}
