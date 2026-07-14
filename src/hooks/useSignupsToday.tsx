/**
 * Hook para contador de cadastros do dia
 * Usado na Hero Section como trust indicator
 * Usa Supabase Externo (rvybbrkzmboqbhcemqar)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export function useSignupsToday() {
  return useQuery({
    queryKey: ['signups-today'],
    queryFn: async (): Promise<number> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count, error } = await (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      if (error) {
        console.warn('[Oculto] Cadastros do dia indisponível:', error.message);
        return 0;
      }
      return count || 0;
    },
    retry: false,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

// Hook para métricas de crescimento (admin)
export function useGrowthMetrics() {
  return useQuery({
    queryKey: ['growth-metrics'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { count: todayCount } = await (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      const { count: yesterdayCount } = await (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString());

      const { count: weekCount } = await (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString());

      const { count: totalCount } = await (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      return {
        today: todayCount || 0,
        yesterday: yesterdayCount || 0,
        lastWeek: weekCount || 0,
        total: totalCount || 0,
        growthRate: yesterdayCount && yesterdayCount > 0
          ? (((todayCount || 0) - yesterdayCount) / yesterdayCount * 100).toFixed(1)
          : 0,
      };
    },
    retry: false,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}
