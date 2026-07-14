import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface Transaction {
  id: string;
  user_id: string;
  seller_id?: string | null;
  affiliate_id?: string | null;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'subscription' | 'tip' | 'payout';
  status: 'pending' | 'completed' | 'failed';
  description: string | null;
  created_at: string;
  external_id?: string | null;
  provider?: string | null;
  metadata?: Record<string, any> | null;
  expires_at?: string | null;
  updated_at?: string | null;
}

export interface CreatorEarningsSummary {
  creator_id: string;
  creator_name: string;
  username: string;
  balance: number;
  total_bruto: number;
  total_imposto: number;
  total_taxa_plataforma: number;
  total_taxa_afiliado: number;
  total_liquido: number;
  total_pendente: number;
  total_sacado: number;
  ganhos_mes_atual: number;
  total_vendas: number;
}

async function getProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (error) return null;
  return data?.id || null;
}

export function useTransactions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      const { data, error } = await supabase
        .from('transactions' as any)
        .select('*')
        .eq('user_id', profileId)
        .eq('category', 'creator_content')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching transactions:', error);
        return [];
      }
      return (data as any[] || []) as Transaction[];
    },
    enabled: !!user?.id,
  });
}

export interface TransactionFilters {
  startDate?: Date;
  endDate?: Date;
  type?: string;
  status?: string;
}

export function useFilteredTransactions(filters: TransactionFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['transactions', user?.id, filters],
    queryFn: async () => {
      if (!user?.id) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      let query = supabase
        .from('transactions' as any)
        .select('*')
        .eq('user_id', profileId)
        .eq('category', 'creator_content')
        .order('created_at', { ascending: false });

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }
      if (filters.type && filters.type !== 'all') {
        query = query.eq('type', filters.type);
      }
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching transactions:', error);
        return [];
      }
      return (data as any[] || []) as Transaction[];
    },
    enabled: !!user?.id,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (transaction: {
      amount: number;
      type: Transaction['type'];
      description?: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const profileId = await getProfileId(user.id);
      if (!profileId) throw new Error('Profile not found');

      const { data, error } = await supabase
        .from('transactions' as any)
        .insert({
          user_id: profileId,
          amount: transaction.amount,
          type: transaction.type,
          description: transaction.description,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useEarningsSummary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['earnings-summary', user?.id],
    queryFn: async () => {
      const defaults = { total: 0, pending: 0, withdrawn: 0, thisMonth: 0, balance: 0, totalBruto: 0, totalImposto: 0, totalTaxa: 0, totalAfiliado: 0, totalLiquido: 0, totalVendas: 0 };
      if (!user?.id) return defaults;

      const profileId = await getProfileId(user.id);
      if (!profileId) return defaults;

      // Try the SQL view first (all calculations done in DB)
      const { data: viewData, error: viewError } = await supabase
        .from('creator_earnings_summary' as any)
        .select('*')
        .eq('creator_id', profileId)
        .maybeSingle();

      if (!viewError && viewData) {
        const v = viewData as any;
        return {
          total: Number(v.total_bruto) || 0,
          pending: Number(v.total_pendente) || 0,
          withdrawn: Number(v.total_sacado) || 0,
          thisMonth: Number(v.ganhos_mes_atual) || 0,
          balance: Number(v.balance) || 0,
          totalBruto: Number(v.total_bruto) || 0,
          totalImposto: Number(v.total_imposto) || 0,
          totalTaxa: Number(v.total_taxa_plataforma) || 0,
          totalAfiliado: Number(v.total_taxa_afiliado) || 0,
          totalLiquido: Number(v.total_liquido) || 0,
          totalVendas: Number(v.total_vendas) || 0,
        };
      }

      // Fallback: calculate from profile balance if view unavailable
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', profileId)
        .single();

      return {
        ...defaults,
        balance: (profile as any)?.balance || 0,
      };
    },
    enabled: !!user?.id,
  });
}
