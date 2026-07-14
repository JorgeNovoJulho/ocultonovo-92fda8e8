import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface Referral {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  subscription_id: string | null;
  started_at: string;
  is_active: boolean;
  commission_ended_at: string | null;
  // Joined data
  referred_profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    username: string | null;
  };
  subscription?: {
    price: number;
    status: string;
  };
}

// Get profile ID from auth user
async function getProfileId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id || null;
}

// Check if commission was already paid (one-time model)
export function isCommissionPaid(referral: Referral): boolean {
  return !!referral.commission_ended_at;
}

// Calculate commission amount (one-time: 5% of subscription price)
export function calculateCommission(price: number): number {
  return price * 0.05; // 5% commission
}

// Fetch user's referrals (as referrer)
export function useMyReferrals() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-referrals', user?.id],
    queryFn: async (): Promise<Referral[]> => {
      if (!user) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      const { data: referrals, error } = await (supabase as any)
        .from('referrals')
        .select('*')
        .eq('referrer_id', profileId)
        .order('started_at', { ascending: false });

      if (error) throw error;
      if (!referrals || referrals.length === 0) return [];

      const referredUserIds = referrals.map((r: any) => r.referred_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, username')
        .in('id', referredUserIds);

      const subscriptionIds = referrals
        .filter((r: any) => r.subscription_id)
        .map((r: any) => r.subscription_id);
      
      let subscriptions: any[] = [];
      if (subscriptionIds.length > 0) {
        const { data } = await supabase
          .from('subscriptions')
          .select('id, price, status')
          .in('id', subscriptionIds);
        subscriptions = data || [];
      }

      return referrals.map((referral: any) => ({
        ...referral,
        referred_profile: profiles?.find(p => p.id === referral.referred_user_id),
        subscription: subscriptions.find(s => s.id === referral.subscription_id),
      })) as Referral[];
    },
    enabled: !!user,
  });
}

// Create a referral when someone signs up with a referral code
export function useCreateReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      referrerCode,
      referredUserId,
      subscriptionId,
    }: {
      referrerCode: string;
      referredUserId: string;
      subscriptionId?: string;
    }) => {
      const usernameFromCode = referrerCode.replace(/\d+$/, '').toLowerCase();
      
      const { data: referrerProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', usernameFromCode)
        .single();

      if (!referrerProfile) throw new Error('Referrer not found');

      const { data, error } = await (supabase as any)
        .from('referrals')
        .insert({
          referrer_id: referrerProfile.id,
          referred_user_id: referredUserId,
          subscription_id: subscriptionId || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return null;
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-referrals'] });
    },
  });
}

// Calculate referral statistics
// Comissão única: 5% sobre a primeira assinatura de cada indicado
export function useReferralStats() {
  const { data: referrals, isLoading } = useMyReferrals();

  const stats = {
    totalReferred: referrals?.length || 0,
    commissionPaid: 0,        // already paid (one-time)
    pendingCommission: 0,     // waiting for first subscription
    totalEarnings: 0,
  };

  if (referrals) {
    referrals.forEach(referral => {
      const subscriptionPrice = referral.subscription?.price || 29.90;
      const commission = calculateCommission(subscriptionPrice);

      if (isCommissionPaid(referral)) {
        stats.commissionPaid++;
        stats.totalEarnings += commission;
      } else if (referral.is_active) {
        stats.pendingCommission++;
      }
    });
  }

  return { stats, isLoading };
}

// Check if referrer is eligible for commission (has active subscription)
export async function isReferrerEligibleForCommission(referrerId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_type')
    .eq('id', referrerId)
    .single();
  
  if (!profile) return false;
  
  return profile.plan_type === 'premium' || profile.plan_type === 'vip';
}

// Calculate commission with eligibility check
export function calculateEligibleCommission(
  price: number, 
  referrerPlanType: string | null
): number {
  if (!referrerPlanType || referrerPlanType === 'free') {
    return 0;
  }
  return price * 0.05;
}
