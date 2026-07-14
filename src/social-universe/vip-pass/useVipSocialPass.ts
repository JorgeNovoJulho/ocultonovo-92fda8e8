/**
 * useVipSocialPass — Onda C
 * Status do Pass VIP Social (entrada antecipada, salas raras, eventos premium).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type VipPassTier = 'standard' | 'plus' | 'elite';

export interface VipPassStatus {
  active: boolean;
  tier?: VipPassTier;
  ends_at?: string;
  perks?: Record<string, unknown>;
}

export function useVipSocialPass() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['vip-social-pass', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<VipPassStatus> => {
      const { data } = await (supabase as any).rpc('vip_social_pass_status');
      return (data as VipPassStatus) || { active: false };
    },
    staleTime: 5 * 60_000,
  });
}
