import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useMemo } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface CommissionRecord {
  id: string;
  referral_id: string;
  transaction_id: string;
  gross_amount: number;
  platform_fee_original: number;
  commission_amount: number;
  platform_fee_net: number;
  creator_amount: number;
  created_at: string;
  afilhada_name?: string;
  afilhada_avatar?: string;
  afilhada_id?: string;
}

export interface MonthlyCommission {
  month: string;
  monthLabel: string;
  total: number;
  count: number;
}

export interface AfilhadaCommission {
  afilhada_id: string;
  name: string;
  avatar?: string;
  total: number;
  count: number;
  percentage: number;
}

// Fetch all commission history with afilhada details
export function useCommissionHistory() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['commission-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // First get the profile ID
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      // Step 1: get my referrals (where I am madrinha)
      const { data: referrals } = await (supabase as any)
        .from('creator_referrals')
        .select('id, madrinha_id, afilhada_id')
        .eq('madrinha_id', profile.id);

      const refList = (referrals || []) as any[];
      if (refList.length === 0) return [] as CommissionRecord[];
      const referralIds = refList.map((r) => r.id);

      // Step 2: commissions for these referrals
      const { data: commissions, error } = await (supabase as any)
        .from('creator_referral_commissions')
        .select('*')
        .in('referral_id', referralIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching commission history:', error);
        return [];
      }

      // Step 3: batch fetch afilhada profiles
      const afilhadaIds = [...new Set(refList.map((r) => r.afilhada_id).filter(Boolean))];
      const { data: profiles } = afilhadaIds.length
        ? await (supabase as any).from('v_public_profiles').select('id, name, avatar_url').in('id', afilhadaIds)
        : { data: [] as any[] };
      const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));
      const referralMap = new Map<string, any>(refList.map((r) => [r.id, r]));

      return (commissions || []).map((c: any) => {
        const ref = referralMap.get(c.referral_id);
        const af = ref ? profileMap.get(ref.afilhada_id) : null;
        return {
          id: c.id,
          referral_id: c.referral_id,
          transaction_id: c.transaction_id,
          gross_amount: Number(c.gross_amount),
          platform_fee_original: Number(c.platform_fee_original),
          commission_amount: Number(c.commission_amount),
          platform_fee_net: Number(c.platform_fee_net),
          creator_amount: Number(c.creator_amount),
          created_at: c.created_at,
          afilhada_name: af?.display_name || 'Afilhada',
          afilhada_avatar: af?.avatar_url,
          afilhada_id: ref?.afilhada_id,
        };
      }) as CommissionRecord[];
    },
    enabled: !!user?.id,
  });
}

// Get commissions grouped by month for charts
export function useMonthlyCommissions(months: number = 12) {
  const { data: commissions, isLoading } = useCommissionHistory();

  const monthlyData = useMemo(() => {
    const result: MonthlyCommission[] = [];
    const now = new Date();

    // Create entries for the last N months
    for (let i = months - 1; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthKey = format(monthDate, 'yyyy-MM');
      const monthLabel = format(monthDate, 'MMM', { locale: ptBR });

      result.push({
        month: monthKey,
        monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        total: 0,
        count: 0,
      });
    }

    // Sum commissions by month
    if (commissions) {
      commissions.forEach((c) => {
        const monthKey = format(new Date(c.created_at), 'yyyy-MM');
        const entry = result.find((r) => r.month === monthKey);
        if (entry) {
          entry.total += c.commission_amount;
          entry.count += 1;
        }
      });
    }

    return result;
  }, [commissions, months]);

  return { data: monthlyData, isLoading };
}

// Get commissions grouped by afilhada
export function useCommissionsByAfilhada() {
  const { data: commissions, isLoading } = useCommissionHistory();

  const afilhadaData = useMemo(() => {
    if (!commissions || commissions.length === 0) return [];

    const byAfilhada = new Map<string, AfilhadaCommission>();
    let grandTotal = 0;

    commissions.forEach((c) => {
      const afilhadaId = c.afilhada_id || 'unknown';
      grandTotal += c.commission_amount;

      if (byAfilhada.has(afilhadaId)) {
        const entry = byAfilhada.get(afilhadaId)!;
        entry.total += c.commission_amount;
        entry.count += 1;
      } else {
        byAfilhada.set(afilhadaId, {
          afilhada_id: afilhadaId,
          name: c.afilhada_name || 'Afilhada',
          avatar: c.afilhada_avatar,
          total: c.commission_amount,
          count: 1,
          percentage: 0,
        });
      }
    });

    // Calculate percentages and sort by total
    const result = Array.from(byAfilhada.values())
      .map((a) => ({
        ...a,
        percentage: grandTotal > 0 ? (a.total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return result;
  }, [commissions]);

  return { data: afilhadaData, isLoading };
}

// Get top N afilhadas by commission
export function useTopAfilhadas(limit: number = 5) {
  const { data: afilhadaData, isLoading } = useCommissionsByAfilhada();

  const topAfilhadas = useMemo(() => {
    return afilhadaData.slice(0, limit);
  }, [afilhadaData, limit]);

  return { data: topAfilhadas, isLoading };
}

// Calculate summary statistics
export function useCommissionStats() {
  const { data: commissions, isLoading } = useCommissionHistory();
  const { data: monthlyData } = useMonthlyCommissions(2); // Last 2 months for comparison

  const stats = useMemo(() => {
    if (!commissions) {
      return {
        totalEarned: 0,
        thisMonth: 0,
        lastMonth: 0,
        monthlyGrowth: 0,
        transactionCount: 0,
        avgCommission: 0,
      };
    }

    const totalEarned = commissions.reduce((sum, c) => sum + c.commission_amount, 0);
    const transactionCount = commissions.length;
    const avgCommission = transactionCount > 0 ? totalEarned / transactionCount : 0;

    // Get this month and last month totals
    const thisMonth = monthlyData?.[1]?.total || 0;
    const lastMonth = monthlyData?.[0]?.total || 0;
    const monthlyGrowth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

    return {
      totalEarned,
      thisMonth,
      lastMonth,
      monthlyGrowth,
      transactionCount,
      avgCommission,
    };
  }, [commissions, monthlyData]);

  return { stats, isLoading };
}
