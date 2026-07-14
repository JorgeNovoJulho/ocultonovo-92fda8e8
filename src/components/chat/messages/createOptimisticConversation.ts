import type { Conversation } from '@/hooks/useChat';
import type { ChatTargetProfile } from './types';

export const createOptimisticConversation = (
  conversationId: string,
  profile?: ChatTargetProfile | null,
): Conversation => ({
  id: conversationId,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  self_is_archived: false,
  participants: profile
    ? [
        {
          user_id: profile.user_id,
          is_archived: false,
          last_read_at: null,
          has_unread_priority: false,
          total_priority_amount: 0,
          profile: {
            id: profile.id,
            user_id: profile.user_id,
            name: profile.username ? `@${profile.username}` : 'Misterioso(a)',
            username: profile.username ?? null,
            avatar_url: profile.avatar_url ?? null,
            is_online: profile.is_online ?? false,
            last_seen: profile.last_seen ?? null,
            show_online_status: profile.show_online_status ?? true,
            profile_type: profile.profile_type || 'single',
            is_verified: profile.is_verified ?? false,
            is_verified_couple: profile.is_verified_couple ?? false,
            plan_type: profile.plan_type || 'free',
            is_creator: profile.is_creator ?? false,
            accept_super_dm: profile.accept_super_dm,
            min_super_dm_price: profile.min_super_dm_price ?? null,
          },
        },
      ]
    : [],
  unread_count: 0,
  has_unread_priority: false,
  total_priority_amount: 0,
});
