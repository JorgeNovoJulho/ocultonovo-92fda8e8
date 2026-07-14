/**
 * Hook para gerenciar limites do plano gratuito
 * Controla restrições configuráveis pelo admin
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useSystemSettings } from './useSystemSettings';
import { toast } from '@/hooks/use-toast';
import { isFreePlan } from '@/lib/planType';
import { useAdminBypass } from './useAdminBypass';
import { usePlatformPhase } from './usePlatformPhase';

export interface FreePlanLimits {
  maxMessagesPerDay: number;
  maxRadarSearchesPerDay: number;
  blockComments: boolean;
  blockVipContent: boolean;
  blockAffiliate: boolean;
  blockRadar: boolean;
  blockPerfectPair: boolean;
  blockLikes: boolean;
  blockFollowersView: boolean;
  blockGifts: boolean;
  blurLikes: boolean;
  blurFollowers: boolean;
}

export interface UserDailyUsage {
  messages: number;
  radarSearches: number;
}

// Fetch free plan limits from system settings
export function useFreePlanLimits(): FreePlanLimits {
  const { data: settings } = useSystemSettings();

  return {
    maxMessagesPerDay: parseInt(String(settings?.['free_max_messages_per_day']?.value || '10')),
    maxRadarSearchesPerDay: parseInt(String(settings?.['free_max_radar_searches_per_day']?.value || '5')),
    blockComments: settings?.['free_block_comments']?.value === 'true',
    blockVipContent: settings?.['free_block_vip_content']?.value === 'true',
    blockAffiliate: settings?.['free_block_affiliate']?.value === 'true',
    blockRadar: settings?.['free_block_radar']?.value === 'true',
    blockPerfectPair: settings?.['free_block_perfect_pair']?.value === 'true',
    blockLikes: settings?.['free_block_likes']?.value === 'true',
    blockFollowersView: settings?.['free_block_followers_view']?.value === 'true',
    blockGifts: settings?.['free_block_gifts']?.value === 'true',
    blurLikes: settings?.['free_blur_likes']?.value === 'true',
    blurFollowers: settings?.['free_blur_followers']?.value === 'true',
  };
}

// Check if user is on free plan (normaliza variantes 'Gratuito', 'free', etc.)
// Admin Master nunca é tratado como Free — tem acesso total irrestrito.
export function useIsFreePlan(): boolean {
  const { profile } = useProfile();
  const { shouldBypass } = useAdminBypass();
  const { freeGetsPremiumSocial } = usePlatformPhase();
  if (shouldBypass) return false;
  // Durante o BETA, FREE recebe benefícios sociais de Premium.
  if (freeGetsPremiumSocial) return false;
  return isFreePlan(profile?.plan_type);
}

// Get user's daily usage
export function useUserDailyUsage() {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: ['user-daily-limits', user?.id, today],
    queryFn: async (): Promise<UserDailyUsage> => {
      if (!user) return { messages: 0, radarSearches: 0 };

      const { data, error } = await supabase
        .from('user_daily_limits')
        .select('limit_type,current_count')
        .eq('user_id', user.id)
        .eq('reset_date', today);

      if (error) throw error;

      const usage: UserDailyUsage = { messages: 0, radarSearches: 0 };
      
      data?.forEach((row: any) => {
        if (row.limit_type === 'messages') {
          usage.messages = row.current_count;
        } else if (row.limit_type === 'radar_searches') {
          usage.radarSearches = row.current_count;
        }
      });

      return usage;
    },
    enabled: !!user,
    staleTime: 30000, // 30 seconds
  });
}

// Increment usage counter
export function useIncrementUsage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  return useMutation({
    mutationFn: async (limitType: 'messages' | 'radar_searches') => {
      if (!user) throw new Error('Not authenticated');

      // Check if record exists for today
      const { data: existing } = await supabase
        .from('user_daily_limits')
        .select('id,current_count')
        .eq('user_id', user.id)
        .eq('limit_type', limitType)
        .eq('reset_date', today)
        .single();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('user_daily_limits')
          .update({ 
            current_count: (existing as any).current_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existing as any).id);
        
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('user_daily_limits')
          .insert({
            user_id: user.id,
            limit_type: limitType,
            current_count: 1,
            reset_date: today,
          });
        
        if (error) throw error;
      }
    },
    // Optimistic update: incrementa o contador na cache imediatamente
    // para que "X/10 mensagens restantes" atualize sem esperar o round-trip.
    onMutate: async (limitType) => {
      if (!user) return { prev: undefined };
      const queryKey = ['user-daily-limits', user.id, today];
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<UserDailyUsage>(queryKey);
      const key = limitType === 'messages' ? 'messages' : 'radarSearches';
      const base: UserDailyUsage = prev ?? { messages: 0, radarSearches: 0 };
      queryClient.setQueryData<UserDailyUsage>(queryKey, {
        ...base,
        [key]: (base as any)[key] + 1,
      } as UserDailyUsage);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // Reverte se falhar
      if (!user || !ctx?.prev) return;
      queryClient.setQueryData(['user-daily-limits', user.id, today], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user-daily-limits'] });
    },
  });
}

// Check if user has reached a specific limit
export function useHasReachedLimit(limitType: 'messages' | 'radar_searches'): boolean {
  const { shouldBypass } = useAdminBypass();
  const isFreePlan = useIsFreePlan();
  const limits = useFreePlanLimits();
  const { data: usage } = useUserDailyUsage();

  if (shouldBypass) return false; // Admin Master imune
  if (!isFreePlan) return false;
  if (!usage) return false;

  if (limitType === 'messages') {
    return usage.messages >= limits.maxMessagesPerDay;
  }
  
  if (limitType === 'radar_searches') {
    return usage.radarSearches >= limits.maxRadarSearchesPerDay;
  }

  return false;
}

// Get remaining uses for a limit
export function useRemainingUses(limitType: 'messages' | 'radar_searches'): number {
  const { shouldBypass } = useAdminBypass();
  const isFreePlan = useIsFreePlan();
  const limits = useFreePlanLimits();
  const { data: usage } = useUserDailyUsage();

  if (shouldBypass) return Infinity; // Admin Master imune
  if (!isFreePlan) return Infinity;
  if (!usage) return 0;

  if (limitType === 'messages') {
    return Math.max(0, limits.maxMessagesPerDay - usage.messages);
  }
  
  if (limitType === 'radar_searches') {
    return Math.max(0, limits.maxRadarSearchesPerDay - usage.radarSearches);
  }

  return 0;
}

// Hook to check all restrictions at once
export function useFreePlanRestrictions() {
  const isFreePlan = useIsFreePlan();
  const limits = useFreePlanLimits();
  const { data: usage } = useUserDailyUsage();

  return {
    isFreePlan,
    limits,
    usage: usage || { messages: 0, radarSearches: 0 },
    canSendMessage: !isFreePlan || (usage?.messages || 0) < limits.maxMessagesPerDay,
    canSearchRadar: !isFreePlan || (usage?.radarSearches || 0) < limits.maxRadarSearchesPerDay,
    canComment: !isFreePlan || !limits.blockComments,
    canCreateVipContent: !isFreePlan || !limits.blockVipContent,
    canUseAffiliate: !isFreePlan || !limits.blockAffiliate,
    canViewRadar: !isFreePlan || !limits.blockRadar,
    canViewPerfectPair: !isFreePlan || !limits.blockPerfectPair,
    canViewLikes: !isFreePlan || !limits.blockLikes,
    canViewFollowers: !isFreePlan || !limits.blockFollowersView,
    canReceiveGifts: !isFreePlan || !limits.blockGifts,
    shouldBlurLikes: isFreePlan && limits.blurLikes,
    shouldBlurFollowers: isFreePlan && limits.blurFollowers,
    remainingMessages: isFreePlan ? Math.max(0, limits.maxMessagesPerDay - (usage?.messages || 0)) : Infinity,
    remainingRadarSearches: isFreePlan ? Math.max(0, limits.maxRadarSearchesPerDay - (usage?.radarSearches || 0)) : Infinity,
  };
}
