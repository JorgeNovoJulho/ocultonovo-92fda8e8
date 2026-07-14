import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from './use-toast';
import { useAuth } from './useAuth';

// Types
interface ReferralProgram {
  id: string;
  name: string;
  description?: string;
  program_type: string;
  commission_type: string;
  commission_rate: number;
  recurring_commission: boolean;
  recurring_months: number;
  max_levels: number;
  level_rates: unknown;
  min_referrals_to_activate: number;
  min_revenue_to_withdraw: number;
  signup_bonus: number;
  first_sale_bonus: number;
  milestone_bonuses: unknown;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
}

interface ReferralAffiliate {
  id: string;
  user_id: string;
  program_id: string;
  referral_code: string;
  custom_slug?: string;
  total_clicks: number;
  total_signups: number;
  total_conversions: number;
  total_revenue_generated: number;
  total_commission_earned: number;
  total_commission_paid: number;
  pending_commission: number;
  current_level: number;
  parent_affiliate_id?: string;
  status: string;
  approved_at?: string;
  payout_method?: string;
  payout_details?: unknown;
  created_at: string;
  program?: ReferralProgram;
}

interface ReferralCommission {
  id: string;
  affiliate_id: string;
  referral_user_id?: string;
  source_type: string;
  source_id?: string;
  source_amount: number;
  commission_rate: number;
  commission_amount: number;
  level: number;
  status: string;
  paid_at?: string;
  created_at: string;
}

interface ReferralPayout {
  id: string;
  affiliate_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  payout_method: string;
  status: string;
  processed_at?: string;
  transaction_id?: string;
  error_message?: string;
  commissions_count: number;
  created_at: string;
}

interface ReferralStats {
  total_affiliates: number;
  active_affiliates: number;
  total_clicks: number;
  total_signups: number;
  total_conversions: number;
  total_revenue: number;
  total_commissions: number;
  pending_commissions: number;
  conversion_rate: number;
}

// Hook para programas
export function useReferralPrograms() {
  return useQuery({
    queryKey: ['referral-programs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_programs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as ReferralProgram[];
    },
  });
}

export function useCreateReferralProgram() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (program: {
      name: string;
      description?: string;
      program_type: string;
      commission_rate: number;
      recurring_commission?: boolean;
      max_levels?: number;
    }) => {
      const { data, error } = await supabase
        .from('referral_programs')
        .insert([program])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-programs'] });
      toast({ title: 'Programa criado!' });
    },
  });
}

export function useUpdateReferralProgram() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('referral_programs')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-programs'] });
      toast({ title: 'Programa atualizado!' });
    },
  });
}

// Hook para affiliates
export function useReferralAffiliates() {
  return useQuery({
    queryKey: ['referral-affiliates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_affiliates')
        .select('*, referral_programs(*)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as (ReferralAffiliate & { referral_programs: ReferralProgram })[];
    },
  });
}

export function useMyAffiliate() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['my-affiliate', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('referral_affiliates')
        .select('*, referral_programs(*)')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as unknown as (ReferralAffiliate & { referral_programs: ReferralProgram }) | null;
    },
    enabled: !!user,
  });
}

export function useJoinReferralProgram() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (programId: string) => {
      if (!user) throw new Error('Usuário não autenticado');
      
      // Gerar código único
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_referral_code');
      
      if (codeError) throw codeError;
      
      const { data, error } = await supabase
        .from('referral_affiliates')
        .insert([{
          user_id: user.id,
          program_id: programId,
          referral_code: codeData,
          status: 'active',
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-affiliate'] });
      queryClient.invalidateQueries({ queryKey: ['referral-affiliates'] });
      toast({ title: 'Você entrou no programa de afiliados!' });
    },
  });
}

export function useApproveAffiliate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'suspended' | 'banned' }) => {
      const { data, error } = await supabase
        .from('referral_affiliates')
        .update({ 
          status,
          approved_at: status === 'active' ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-affiliates'] });
      toast({ title: 'Status atualizado!' });
    },
  });
}

// Hook para comissões
export function useReferralCommissions(affiliateId?: string) {
  return useQuery({
    queryKey: ['referral-commissions', affiliateId],
    queryFn: async () => {
      let query = supabase
        .from('referral_commissions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (affiliateId) {
        query = query.eq('affiliate_id', affiliateId);
      }
      
      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      return data as ReferralCommission[];
    },
  });
}

export function useApproveCommission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'cancelled' }) => {
      const { data, error } = await supabase
        .from('referral_commissions')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-commissions'] });
      toast({ title: 'Comissão atualizada!' });
    },
  });
}

// Hook para payouts
export function useReferralPayouts(affiliateId?: string) {
  return useQuery({
    queryKey: ['referral-payouts', affiliateId],
    queryFn: async () => {
      let query = supabase
        .from('referral_payouts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (affiliateId) {
        query = query.eq('affiliate_id', affiliateId);
      }
      
      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      return data as ReferralPayout[];
    },
  });
}

export function useProcessPayout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status, transaction_id }: { 
      id: string; 
      status: 'completed' | 'failed'; 
      transaction_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('referral_payouts')
        .update({ 
          status,
          transaction_id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-payouts'] });
      toast({ title: 'Payout processado!' });
    },
  });
}

// Hook para estatísticas
export function useReferralStats() {
  return useQuery({
    queryKey: ['referral-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_referral_stats');
      
      if (error) throw error;
      return (data?.[0] || {
        total_affiliates: 0,
        active_affiliates: 0,
        total_clicks: 0,
        total_signups: 0,
        total_conversions: 0,
        total_revenue: 0,
        total_commissions: 0,
        pending_commissions: 0,
        conversion_rate: 0,
      }) as ReferralStats;
    },
  });
}

// Hook para tracking de cliques
export function useTrackReferralClick() {
  return useMutation({
    mutationFn: async ({ 
      affiliateId, 
      landingPage,
      utmSource,
      utmMedium,
      utmCampaign,
    }: { 
      affiliateId: string;
      landingPage?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
    }) => {
      const { data, error } = await supabase
        .from('referral_clicks')
        .insert([{
          affiliate_id: affiliateId,
          landing_page: landingPage || window.location.pathname,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          user_agent: navigator.userAgent,
          device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
  });
}
