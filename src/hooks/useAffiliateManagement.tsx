import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';

export type AffiliateStatus = 'active' | 'frozen' | 'blocked' | 'removed';

export interface AffiliateRankingRow {
  referral_id: string;
  madrinha_id: string;
  afilhada_id: string;
  afilhada_name: string | null;
  afilhada_username: string | null;
  afilhada_avatar: string | null;
  status: AffiliateStatus;
  total_commission_earned: number;
  last_commission_at: string | null;
  started_at: string;
}

async function getProfileId(userId: string) {
  const { data } = await (supabase as any).from('v_public_profiles').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

/** Limite global x atual por criador. */
export function useCreatorAffiliateLimit(madrinhaId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['affiliate-limit', madrinhaId, user?.id],
    queryFn: async () => {
      const id = madrinhaId ?? (user ? await getProfileId(user.id) : null);
      if (!id) return null;
      const { data, error } = await (supabase as any).rpc('check_creator_affiliate_limit', {
        p_madrinha_id: id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { current_count: number; max_allowed: number; can_add_more: boolean };
    },
    enabled: !!(madrinhaId || user),
    staleTime: 30_000,
  });
}

/** Ranking (criador vê os seus, admin vê todos). */
export function useAffiliateRanking(madrinhaId?: string | null, limit = 50) {
  return useQuery({
    queryKey: ['affiliate-ranking', madrinhaId, limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_creator_affiliate_ranking', {
        p_madrinha_id: madrinhaId ?? null,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as AffiliateRankingRow[];
    },
    staleTime: 15_000,
  });
}

/** Recompensas concedidas a um criador. */
export function useAffiliateRewards(madrinhaId?: string | null) {
  return useQuery({
    queryKey: ['affiliate-rewards', madrinhaId],
    queryFn: async () => {
      let q = supabase.from('affiliate_rewards' as any).select('*').order('created_at', { ascending: false }).limit(100);
      if (madrinhaId) q = q.eq('madrinha_id', madrinhaId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Admin: muda status (active/frozen/blocked/removed). */
export function useSetAffiliateStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: {
      referralId: string;
      status: AffiliateStatus;
      reason?: string;
      frozenDays?: number;
      notes?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('admin_set_affiliate_status', {
        p_referral_id: params.referralId,
        p_status: params.status,
        p_reason: params.reason ?? null,
        p_frozen_days: params.frozenDays ?? null,
        p_notes: params.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affiliate-ranking'] });
      qc.invalidateQueries({ queryKey: ['affiliate-limit'] });
      toast({ title: 'Status do afiliado atualizado.' });
    },
    onError: (e: any) => toast({ title: 'Falha ao atualizar', description: e.message, variant: 'destructive' }),
  });
}

/** Admin: concede recompensa manual. */
export function useAwardAffiliateReward() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: { madrinhaId: string; amount: number; reason: string; milestone?: string }) => {
      const { data, error } = await (supabase as any).rpc('admin_award_affiliate_reward', {
        p_madrinha_id: params.madrinhaId,
        p_amount: params.amount,
        p_reason: params.reason,
        p_milestone: params.milestone ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affiliate-rewards'] });
      toast({ title: 'Recompensa concedida!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

/** Admin: lê/atualiza o limite global na platform_settings. */
export function usePlatformAffiliateLimitSetting() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['platform-setting', 'max_affiliates_per_creator'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings' as any)
        .select('value')
        .eq('key', 'max_affiliates_per_creator')
        .maybeSingle();
      if (error) throw error;
      const v = (data as any)?.value;
      return typeof v === 'number' ? v : Number(v ?? 50);
    },
  });

  const update = useMutation({
    mutationFn: async (newLimit: number) => {
      const { error } = await supabase
        .from('platform_settings' as any)
        .upsert({ key: 'max_affiliates_per_creator', value: newLimit as any, updated_at: new Date().toISOString() });
      if (error) throw error;
      return newLimit;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-setting', 'max_affiliates_per_creator'] });
      qc.invalidateQueries({ queryKey: ['affiliate-limit'] });
      toast({ title: 'Limite atualizado.' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return { ...query, update };
}
