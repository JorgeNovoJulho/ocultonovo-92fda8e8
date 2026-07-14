import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

interface ChurnAlert {
  id: string;
  user_id: string;
  checkout_started_at: string;
  abandoned_at: string | null;
  recovery_sent_at: string | null;
  recovered_at: string | null;
  product_type: string;
  product_id: string | null;
  amount: number;
  status: 'pending' | 'abandoned' | 'recovered' | 'expired';
}

interface ChurnMetrics {
  totalAbandoned: number;
  totalRecovered: number;
  recoveryRate: number;
  totalLostRevenue: number;
  totalRecoveredRevenue: number;
}

function normalizeTransactionType(productType: string) {
  return ['deposit', 'withdrawal', 'subscription', 'tip', 'payout'].includes(productType)
    ? productType
    : 'subscription';
}

/**
 * Hook to track checkout abandonment (churn alerts)
 */
export function useChurnTracking() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Start tracking a checkout
  const startCheckout = useMutation({
    mutationFn: async ({ 
      productType, 
      productId, 
      amount 
    }: { 
      productType: string; 
      productId?: string; 
      amount: number;
    }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data: existing } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('transactions')
          .update({
            amount,
            type: normalizeTransactionType(productType),
            description: productId ? `Checkout iniciado: ${productType}:${productId}` : `Checkout iniciado: ${productType}`,
          })
          .eq('id', (existing as any).id);

        if (error) throw error;
        return (existing as any).id;
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          amount,
          type: normalizeTransactionType(productType),
          status: 'pending',
          description: productId ? `Checkout iniciado: ${productType}:${productId}` : `Checkout iniciado: ${productType}`,
        })
        .select('id')
        .maybeSingle();

      if (error) throw error;
      return (data as any).id;
    },
  });

  // Mark checkout as abandoned
  const abandonCheckout = useMutation({
    mutationFn: async (checkoutId: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'failed',
        })
        .eq('id', checkoutId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churn-alerts'] });
    },
  });

  // Mark checkout as recovered
  const recoverCheckout = useMutation({
    mutationFn: async (checkoutId: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
        })
        .eq('id', checkoutId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churn-alerts'] });
    },
  });

  // Complete checkout (remove tracking)
  const completeCheckout = useMutation({
    mutationFn: async (checkoutId: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'completed' })
        .eq('id', checkoutId);

      if (error) throw error;
    },
  });

  return {
    startCheckout,
    abandonCheckout,
    recoverCheckout,
    completeCheckout,
  };
}

/**
 * Hook for admin to view churn metrics
 */
export function useChurnMetrics(dateRange?: { start: Date; end: Date }) {
  return useQuery({
    queryKey: ['churn-metrics', dateRange?.start, dateRange?.end],
    queryFn: async (): Promise<ChurnMetrics> => {
      let query = supabase
        .from('transactions')
        .select('id, user_id, amount, status, type, created_at');

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const alerts = (data as any[]) || [];
      const abandoned = alerts.filter(a => a.status === 'failed');
      const recovered = alerts.filter(a => a.status === 'completed');

      const totalLostRevenue = abandoned.reduce((sum, a) => sum + (a.amount || 0), 0);
      const totalRecoveredRevenue = recovered.reduce((sum, a) => sum + (a.amount || 0), 0);

      return {
        totalAbandoned: abandoned.length,
        totalRecovered: recovered.length,
        recoveryRate: abandoned.length > 0 
          ? (recovered.length / abandoned.length) * 100 
          : 0,
        totalLostRevenue,
        totalRecoveredRevenue,
      };
    },
  });
}

/**
 * Hook to get pending churn alerts for recovery
 */
export function usePendingChurnAlerts() {
  return useQuery({
    queryKey: ['churn-alerts', 'pending'],
    queryFn: async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('transactions')
        .select('id, user_id, amount, type, created_at')
        .eq('status', 'failed')
        .lte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const rows = (data || []) as any[];
      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
      const { data: profiles } = userIds.length
        ? await supabase.from('profiles').select('id, name, avatar_url').in('id', userIds)
        : { data: [] as any[] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return rows.map((row) => ({
        ...row,
        product_type: row.type,
        abandoned_at: row.created_at,
        profiles: profileMap.get(row.user_id),
      }));
    },
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });
}
