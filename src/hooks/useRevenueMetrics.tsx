import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

// Types
interface RevenueMetrics {
  total_revenue: number;
  monthly_revenue: number;
  mrr_estimate: number;
  avg_ticket: number;
  total_transactions: number;
  monthly_transactions: number;
  paid_users: number;
  churn_rate: number;
}

interface PlanDistribution {
  plan_type: string;
  user_count: number;
  percentage: number;
}

interface UserWithEmail {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  plan_type: string | null;
  payment_status: string | null;
  payment_due_date: string | null;
  balance: number | null;
  is_creator: boolean | null;
  is_verified: boolean | null;
  created_at: string | null;
}

interface RevenueTimeline {
  month: string;
  revenue: number;
}

/**
 * Hook para métricas gerais de receita
 */
export function useRevenueMetrics() {
  return useQuery({
    queryKey: ['admin-revenue-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_revenue_metrics');
      
      if (error) throw error;
      
      // A RPC retorna um array com um único registro
      const metrics = Array.isArray(data) ? data[0] : data;
      
      return metrics as RevenueMetrics;
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

/**
 * Hook para distribuição de usuários por plano
 */
export function usePlanDistribution() {
  return useQuery({
    queryKey: ['admin-plan-distribution'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_plan_distribution');
      
      if (error) throw error;
      
      return (data || []) as PlanDistribution[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook para buscar todos usuários com email (para exportação)
 */
export function useAllUsersWithEmail() {
  return useQuery({
    queryKey: ['admin-all-users-with-email'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_paid_users_with_email');
      
      if (error) throw error;
      
      return (data || []) as UserWithEmail[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook para timeline de receita (últimos N meses)
 */
export function useRevenueTimeline(months: number = 6) {
  return useQuery({
    queryKey: ['admin-revenue-timeline', months],
    queryFn: async () => {
      // Buscar transações agrupadas por mês
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, created_at')
        .eq('status', 'completed')
        .gt('amount', 0)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      // Agrupar por mês
      const monthlyData: Record<string, number> = {};
      
      // Inicializar todos os meses com 0
      for (let i = 0; i < months; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - (months - 1 - i));
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = 0;
      }
      
      // Somar transações por mês
      (data || []).forEach(tx => {
        const date = new Date(tx.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key] !== undefined) {
          monthlyData[key] += Number(tx.amount) || 0;
        }
      });
      
      // Converter para array
      return Object.entries(monthlyData).map(([month, revenue]) => ({
        month,
        revenue,
        monthLabel: formatMonthLabel(month),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook para projeção de receita (próximos 3 meses)
 */
export function useRevenueProjection() {
  const { data: metrics } = useRevenueMetrics();
  const { data: timeline } = useRevenueTimeline(6);
  
  return useQuery({
    queryKey: ['admin-revenue-projection', metrics?.mrr_estimate, timeline],
    queryFn: async () => {
      if (!metrics || !timeline) return [];
      
      // Calcular taxa de crescimento médio
      const recentRevenues = timeline.slice(-3).map(t => t.revenue);
      const avgGrowth = recentRevenues.length >= 2 
        ? recentRevenues.reduce((sum, _, i, arr) => {
            if (i === 0) return 0;
            const growth = arr[i-1] > 0 ? (arr[i] - arr[i-1]) / arr[i-1] : 0;
            return sum + growth;
          }, 0) / (recentRevenues.length - 1)
        : 0.05; // 5% default growth
      
      // Gerar projeção para próximos 3 meses
      const lastRevenue = timeline[timeline.length - 1]?.revenue || metrics.mrr_estimate;
      const projection = [];
      
      for (let i = 1; i <= 3; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() + i);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        projection.push({
          month,
          monthLabel: formatMonthLabel(month),
          projected: lastRevenue * Math.pow(1 + avgGrowth, i),
          isProjection: true,
        });
      }
      
      return projection;
    },
    enabled: !!metrics && !!timeline,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook para taxa de conversão
 */
export function useConversionMetrics() {
  const { data: distribution } = usePlanDistribution();
  
  return useQuery({
    queryKey: ['admin-conversion-metrics', distribution],
    queryFn: async () => {
      if (!distribution) return null;
      
      const total = distribution.reduce((sum, d) => sum + Number(d.user_count), 0);
      const free = distribution.find(d => d.plan_type === 'free')?.user_count || 0;
      const premium = distribution.find(d => d.plan_type === 'premium')?.user_count || 0;
      const vip = distribution.find(d => d.plan_type === 'vip')?.user_count || 0;
      
      const paid = premium + vip;
      const conversionRate = total > 0 ? (paid / total) * 100 : 0;
      const premiumRate = total > 0 ? (premium / total) * 100 : 0;
      const vipRate = total > 0 ? (vip / total) * 100 : 0;
      
      return {
        total,
        free,
        premium,
        vip,
        paid,
        conversionRate,
        premiumRate,
        vipRate,
      };
    },
    enabled: !!distribution,
    staleTime: 1000 * 60 * 5,
  });
}

// Helpers
function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(m) - 1]}/${year.slice(2)}`;
}
