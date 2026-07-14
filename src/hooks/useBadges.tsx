import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Badge {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  category: string;
  points: number;
  is_automatic: boolean;
  criteria: Record<string, unknown> | null;
}

interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  metadata: Record<string, unknown> | null;
  badge?: Badge;
}

// Fetch all available badges
export function useAllBadges() {
  return useQuery({
    queryKey: ['badges', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('badges')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      return data as Badge[];
    },
  });
}

// Fetch user's earned badges
export function useUserBadges(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-badges', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('user_badges')
        .select(`
          *,
          badge:badges(*)
        `)
        .eq('user_id', targetUserId)
        .order('earned_at', { ascending: false });

      if (error) throw error;
      return data as (UserBadge & { badge: Badge })[];
    },
    enabled: !!targetUserId,
  });
}

// Grant a badge to a user
export function useGrantBadge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, badgeCode }: { userId: string; badgeCode: string }) => {
      // First get the badge ID
      const { data: badge, error: badgeError } = await supabase
        .from('badges')
        .select('id')
        .eq('code', badgeCode)
        .single();

      if (badgeError) throw badgeError;

      // Then grant it
      const { data, error } = await supabase
        .from('user_badges')
        .insert({
          user_id: userId,
          badge_id: badge.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Usuário já possui este badge');
        }
        throw error;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-badges', variables.userId] });
      toast.success('Badge concedido com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao conceder badge');
    },
  });
}

// Check and auto-grant badges based on criteria
export function useCheckBadges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      // Fetch automatic badges
      const { data: badges } = await supabase
        .from('badges')
        .select('*')
        .eq('is_automatic', true);

      if (!badges) return [];

      // Fetch user's current badges
      const { data: userBadges } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', user.id);

      const earnedBadgeIds = new Set(userBadges?.map(ub => ub.badge_id) || []);
      const newBadges: string[] = [];

      // Check each badge's criteria
      for (const badge of badges) {
        if (earnedBadgeIds.has(badge.id)) continue;

        const criteria = badge.criteria as Record<string, unknown>;
        if (!criteria) continue;

        let eligible = false;

        // Profile completion check
        if (criteria.profile_completion) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, avatar_url, bio, location_lat')
            .eq('id', user.id)
            .single();

          if (profile) {
            const fields = [profile.name, profile.avatar_url, profile.bio, profile.location_lat];
            const completion = (fields.filter(Boolean).length / fields.length) * 100;
            eligible = completion >= (criteria.profile_completion as number);
          }
        }

        // Trust score check
        if (criteria.trust_score) {
          const { data: trustScore } = await supabase
            .from('user_trust_scores')
            .select('score')
            .eq('user_id', user.id)
            .single();

          eligible = (trustScore?.score || 0) >= (criteria.trust_score as number);
        }

        // Total tips check
        if (criteria.total_tips) {
          const { data: tips } = await supabase
            .from('transactions')
            .select('amount')
            .eq('user_id', user.id)
            .eq('type', 'tip')
            .eq('status', 'completed');

          const total = tips?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
          eligible = total >= (criteria.total_tips as number);
        }

        if (eligible) {
          await supabase.from('user_badges').insert({
            user_id: user.id,
            badge_id: badge.id,
          });
          newBadges.push(badge.name);
        }
      }

      return newBadges;
    },
    onSuccess: (newBadges) => {
      if (newBadges.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['user-badges'] });
        toast.success(`🏆 Novo badge conquistado: ${newBadges.join(', ')}`);
      }
    },
  });
}
