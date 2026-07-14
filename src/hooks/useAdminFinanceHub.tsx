import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface FinancialSummary {
  total_revenue: number;
  monthly_revenue: number;
  weekly_revenue: number;
  platform_profit: number;
  tax_reserve: number;
  subscription_revenue: number;
  content_revenue: number;
  message_revenue: number;
  tip_revenue: number;
  total_transactions: number;
  monthly_transactions: number;
}

export interface RecentTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  status: string;
  description: string | null;
  created_at: string;
  provider: string | null;
  user_name?: string;
}

const EMPTY_SUMMARY: FinancialSummary = {
  total_revenue: 0, monthly_revenue: 0, weekly_revenue: 0,
  platform_profit: 0, tax_reserve: 0, subscription_revenue: 0,
  content_revenue: 0, message_revenue: 0, tip_revenue: 0,
  total_transactions: 0, monthly_transactions: 0,
};

/** Light query — loads totals from the view first */
export function useFinancialSummary() {
  return useQuery({
    queryKey: ['admin-financial-summary'],
    queryFn: async (): Promise<FinancialSummary> => {
      const { data, error } = await (supabase as any)
        .from('admin_financial_master_view')
        .select('*')
        .single();
      if (error) {
        console.error('Financial view error:', error);
        return EMPTY_SUMMARY;
      }
      return (data as FinancialSummary) ?? EMPTY_SUMMARY;
    },
    staleTime: 3 * 60_000,
    placeholderData: EMPTY_SUMMARY,
  });
}

/** Lazy-loaded recent transactions with user names */
export function useRecentTransactions(limit = 20, enabled = false) {
  return useQuery({
    queryKey: ['admin-recent-transactions', limit],
    queryFn: async (): Promise<RecentTransaction[]> => {
      // Fetch transactions
      const { data: txns, error } = await (supabase as any)
        .from('transactions')
        .select('id, user_id, amount, type, status, description, created_at, provider')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) { console.error(error); return []; }
      if (!txns || txns.length === 0) return [];

      // Fetch user names in batch
      const userIds = [...new Set((txns as any[]).map(t => t.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      
      const nameMap = new Map((profiles || []).map(p => [p.id, p.name]));
      
      return (txns as any[]).map(t => ({
        ...t,
        user_name: nameMap.get(t.user_id) || 'Usuário',
      }));
    },
    enabled,
    staleTime: 2 * 60_000,
  });
}

/** Pending withdrawal count for the badge */
export function usePendingWithdrawalsCount() {
  return useQuery({
    queryKey: ['admin-pending-withdrawals-count'],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from('withdrawal_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count || 0;
    },
    staleTime: 60_000,
  });
}
