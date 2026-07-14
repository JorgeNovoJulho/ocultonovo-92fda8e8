/**
 * Hooks do programa Ganhe Indicando v2.
 * RPCs: affiliate_level_get, affiliate_campaigns_active, affiliate_top_ranking,
 *       affiliate_ranking_optin_set.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface AffiliateLevel {
  level_id: string;
  level_name: string;
  badge_hue: number;
  total_referrals: number;
  total_revenue: number;
  next_level_id: string | null;
  next_level_name: string | null;
  next_min_referrals: number | null;
  next_min_revenue: number | null;
}

export interface AffiliateCampaign {
  id: string;
  title: string;
  body: string | null;
  cta_label: string;
  cta_route: string;
  hue: number;
  sort_order: number;
}

export interface AffiliateRankingRow {
  rank: number;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_referrals: number;
  total_revenue: number;
  level_id: string | null;
  badge_hue: number | null;
}

export function useAffiliateLevel() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-level', user?.id ?? 'anon'],
    queryFn: async (): Promise<AffiliateLevel | null> => {
      const { data } = await (supabase as any).rpc('affiliate_level_get', { p_user_id: user?.id ?? null });
      return (Array.isArray(data) ? data[0] : data) ?? null;
    },
    staleTime: 2 * 60_000,
  });
}

export function useAffiliateCampaigns() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-campaigns', user?.id ?? 'anon'],
    queryFn: async (): Promise<AffiliateCampaign[]> => {
      const { data } = await (supabase as any).rpc('affiliate_campaigns_active');
      return (data ?? []) as AffiliateCampaign[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useAffiliateRanking(limit = 20) {
  return useQuery({
    queryKey: ['affiliate-ranking', limit],
    queryFn: async (): Promise<AffiliateRankingRow[]> => {
      const { data } = await (supabase as any).rpc('affiliate_top_ranking', { p_limit: limit });
      return (data ?? []) as AffiliateRankingRow[];
    },
    staleTime: 60_000,
  });
}

export function useAffiliateRankingOptIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: boolean) => {
      const { data, error } = await (supabase as any).rpc('affiliate_ranking_optin_set', { p_value: value });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affiliate-ranking'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
