import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { startOfMonth, endOfMonth } from 'date-fns';

interface WithdrawalLimits {
  minAmount: number;
  maxMonthly: number;
  currentMonthCount: number;
  canWithdraw: boolean;
  remainingWithdrawals: number;
}

export function useWithdrawalLimits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['withdrawal-limits', user?.id],
    queryFn: async (): Promise<WithdrawalLimits> => {
      // Fetch system settings
      const { data: settings } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['min_withdrawal_amount', 'max_monthly_withdrawals']);

      const minAmountRaw = settings?.find(s => s.key === 'min_withdrawal_amount')?.value;
      const maxMonthlyRaw = settings?.find(s => s.key === 'max_monthly_withdrawals')?.value;
      
      const minAmount = typeof minAmountRaw === 'string' ? minAmountRaw : String(minAmountRaw || '250');
      const maxMonthly = typeof maxMonthlyRaw === 'string' ? maxMonthlyRaw : String(maxMonthlyRaw || '4');

      // Count withdrawals this month
      if (!user?.id) {
        return {
          minAmount: parseFloat(minAmount),
          maxMonthly: parseInt(maxMonthly),
          currentMonthCount: 0,
          canWithdraw: false,
          remainingWithdrawals: parseInt(maxMonthly),
        };
      }

      // Get profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        return {
          minAmount: parseFloat(minAmount),
          maxMonthly: parseInt(maxMonthly),
          currentMonthCount: 0,
          canWithdraw: false,
          remainingWithdrawals: parseInt(maxMonthly),
        };
      }

      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('type', 'withdrawal')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);

      const currentMonthCount = count || 0;
      const maxMonthlyInt = parseInt(maxMonthly);
      const remainingWithdrawals = Math.max(0, maxMonthlyInt - currentMonthCount);
      const canWithdraw = currentMonthCount < maxMonthlyInt;

      return {
        minAmount: parseFloat(minAmount),
        maxMonthly: maxMonthlyInt,
        currentMonthCount,
        canWithdraw,
        remainingWithdrawals,
      };
    },
    enabled: !!user?.id,
  });
}
