/**
 * Hook to verify if creator has approved monetization (replaces ASAAS wallet check).
 * Now: uses centralized monetization_status + payout_frozen on profiles.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export function useCreatorWalletCheck() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['creator-monetization-check', user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from('profiles')
        .select('monetization_status, payout_frozen')
        .eq('user_id', user.id)
        .maybeSingle();
      const d: any = data;
      return d?.monetization_status === 'approved' && !d?.payout_frozen;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  return {
    hasWallet: data ?? true, // optimistic default
    isCheckingWallet: isLoading,
  };
}
