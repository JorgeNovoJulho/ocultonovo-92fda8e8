import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// Types
export interface UserLevel {
  id: string;
  user_id: string;
  current_level: number;
  current_xp: number;
  total_xp: number;
  level_up_xp: number;
  streak_days: number;
  last_activity_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface LevelDefinition {
  id: string;
  level_number: number;
  name: string;
  xp_required: number;
  icon: string;
  color: string;
  perks: string[];
  created_at: string;
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  category: string;
  xp_reward: number;
  is_secret: boolean;
  is_active: boolean;
  criteria: any;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  sort_order: number;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  progress: number;
  notified: boolean;
  achievement?: Achievement;
}

export interface XPTransaction {
  id: string;
  user_id: string;
  amount: number;
  action_type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  reward_type: 'credits' | 'badge' | 'feature' | 'discount' | 'physical';
  value: any;
  cost_xp: number;
  cost_credits: number;
  stock: number | null;
  is_active: boolean;
  is_limited: boolean;
  available_from: string | null;
  available_until: string | null;
  min_level: number;
  redemption_count: number;
  created_at: string;
}

export interface RewardRedemption {
  id: string;
  user_id: string;
  reward_id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  cost_xp: number | null;
  cost_credits: number | null;
  delivery_details: any;
  completed_at: string | null;
  created_at: string;
  reward?: Reward;
}

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'all_time';
  period_start: string;
  period_end: string;
  total_xp: number;
  achievements_count: number;
  rank: number | null;
  created_at: string;
  profile?: {
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
}

// Hook: Get user level
export function useUserLevel(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-level', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null;

      const { data, error } = await supabase
        .from('user_levels')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (error) throw error;
      return data as UserLevel | null;
    },
    enabled: !!targetUserId,
  });
}

// Hook: Get all level definitions
export function useLevelDefinitions() {
  return useQuery({
    queryKey: ['level-definitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('level_definitions')
        .select('*')
        .order('level_number', { ascending: true });

      if (error) throw error;
      return (data || []).map(d => ({
        ...d,
        perks: Array.isArray(d.perks) ? d.perks : JSON.parse(d.perks as string || '[]')
      })) as LevelDefinition[];
    },
  });
}

// Hook: Get all achievements
export function useAchievements() {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as Achievement[];
    },
  });
}

// Hook: Get user achievements
export function useUserAchievements(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-achievements', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('user_achievements')
        .select(`
          *,
          achievement:achievements(*)
        `)
        .eq('user_id', targetUserId)
        .order('unlocked_at', { ascending: false });

      if (error) throw error;
      return data as UserAchievement[];
    },
    enabled: !!targetUserId,
  });
}

// Hook: Get XP history
export function useXPHistory(userId?: string, limit = 20) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['xp-history', targetUserId, limit],
    queryFn: async () => {
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('xp_transactions')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as XPTransaction[];
    },
    enabled: !!targetUserId,
  });
}

// Hook: Get all rewards
export function useRewards() {
  return useQuery({
    queryKey: ['rewards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('is_active', true)
        .order('cost_xp', { ascending: true });

      if (error) throw error;
      return data as Reward[];
    },
  });
}

// Hook: Get all rewards (admin)
export function useAllRewards() {
  return useQuery({
    queryKey: ['all-rewards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Reward[];
    },
  });
}

// Hook: Get user redemptions
export function useUserRedemptions(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-redemptions', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('reward_redemptions')
        .select(`
          *,
          reward:rewards(*)
        `)
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as RewardRedemption[];
    },
    enabled: !!targetUserId,
  });
}

// Hook: Add XP
export function useAddXP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      amount: number;
      actionType: string;
      description?: string;
      referenceId?: string;
    }) => {
      const { data, error } = await supabase.rpc('add_user_xp', {
        p_user_id: params.userId,
        p_amount: params.amount,
        p_action_type: params.actionType,
        p_description: params.description || null,
        p_reference_id: params.referenceId || null,
      });

      if (error) throw error;
      return data as { success: boolean; leveled_up?: boolean; current_level?: number } | null;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-level', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['xp-history', variables.userId] });
      
      if (data?.leveled_up) {
        toast.success(`🎉 Subiu para o nível ${data.current_level}!`);
      }
    },
    onError: (error) => {
      console.error('Error adding XP:', error);
      toast.error('Erro ao adicionar XP');
    },
  });
}

// Hook: Unlock achievement
export function useUnlockAchievement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { userId: string; achievementCode: string }) => {
      const { data, error } = await supabase.rpc('unlock_achievement', {
        p_user_id: params.userId,
        p_achievement_code: params.achievementCode,
      });

      if (error) throw error;
      return data as { success: boolean; achievement?: { name: string } } | null;
    },
    onSuccess: (data, variables) => {
      if (data?.success) {
        queryClient.invalidateQueries({ queryKey: ['user-achievements', variables.userId] });
        queryClient.invalidateQueries({ queryKey: ['user-level', variables.userId] });
        toast.success(`🏆 Achievement desbloqueado: ${data.achievement?.name}`);
      }
    },
    onError: (error) => {
      console.error('Error unlocking achievement:', error);
    },
  });
}

// Hook: Redeem reward
export function useRedeemReward() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (rewardId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('redeem_reward', {
        p_user_id: user.id,
        p_reward_id: rewardId,
      });

      if (error) throw error;
      return data as { success: boolean; reward?: { name: string }; error?: string } | null;
    },
    onSuccess: (data) => {
      if (data?.success) {
        queryClient.invalidateQueries({ queryKey: ['user-level'] });
        queryClient.invalidateQueries({ queryKey: ['user-redemptions'] });
        queryClient.invalidateQueries({ queryKey: ['rewards'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        toast.success(`🎁 Resgatado: ${data.reward?.name}`);
      } else {
        toast.error(data?.error || 'Erro ao resgatar');
      }
    },
    onError: (error) => {
      console.error('Error redeeming reward:', error);
      toast.error('Erro ao resgatar recompensa');
    },
  });
}

// Hook: Create/Update achievement (admin)
export function useManageAchievement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (achievement: Partial<Achievement> & { id?: string }) => {
      if (achievement.id) {
        const { data, error } = await supabase
          .from('achievements')
          .update(achievement as any)
          .eq('id', achievement.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('achievements')
          .insert(achievement as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
      toast.success('Achievement salvo com sucesso');
    },
    onError: (error) => {
      console.error('Error managing achievement:', error);
      toast.error('Erro ao salvar achievement');
    },
  });
}

// Hook: Create/Update reward (admin)
export function useManageReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reward: Partial<Reward> & { id?: string }) => {
      if (reward.id) {
        const { data, error } = await supabase
          .from('rewards')
          .update(reward as any)
          .eq('id', reward.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('rewards')
          .insert(reward as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      queryClient.invalidateQueries({ queryKey: ['all-rewards'] });
      toast.success('Recompensa salva com sucesso');
    },
    onError: (error) => {
      console.error('Error managing reward:', error);
      toast.error('Erro ao salvar recompensa');
    },
  });
}

// Hook: Get gamification stats (admin)
export function useGamificationStats() {
  return useQuery({
    queryKey: ['gamification-stats'],
    queryFn: async () => {
      // Get total users with levels
      const { count: usersWithLevels } = await supabase
        .from('user_levels')
        .select('*', { count: 'exact', head: true });

      // Get total achievements unlocked
      const { count: totalAchievements } = await supabase
        .from('user_achievements')
        .select('*', { count: 'exact', head: true });

      // Get total XP distributed
      const { data: xpData } = await supabase
        .from('xp_transactions')
        .select('amount');
      const totalXP = xpData?.reduce((sum, t) => sum + t.amount, 0) || 0;

      // Get total redemptions
      const { count: totalRedemptions } = await supabase
        .from('reward_redemptions')
        .select('*', { count: 'exact', head: true });

      // Get level distribution
      const { data: levelDist } = await supabase
        .from('user_levels')
        .select('current_level');
      
      const levelDistribution: Record<number, number> = {};
      levelDist?.forEach(u => {
        levelDistribution[u.current_level] = (levelDistribution[u.current_level] || 0) + 1;
      });

      return {
        usersWithLevels: usersWithLevels || 0,
        totalAchievements: totalAchievements || 0,
        totalXP,
        totalRedemptions: totalRedemptions || 0,
        levelDistribution,
      };
    },
  });
}

// Utility: Get rarity color
export function getRarityColor(rarity: string): string {
  switch (rarity) {
    case 'common': return '#9CA3AF';
    case 'uncommon': return '#10B981';
    case 'rare': return '#3B82F6';
    case 'epic': return '#8B5CF6';
    case 'legendary': return '#FFD700';
    default: return '#9CA3AF';
  }
}

// Utility: Get rarity label
export function getRarityLabel(rarity: string): string {
  switch (rarity) {
    case 'common': return 'Comum';
    case 'uncommon': return 'Incomum';
    case 'rare': return 'Raro';
    case 'epic': return 'Épico';
    case 'legendary': return 'Lendário';
    default: return rarity;
  }
}
