import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useEarlyBirdCounters } from './useEarlyBirdPromotion';
import { useEffect, useMemo } from 'react';
import { subDays, differenceInDays, addDays, format } from 'date-fns';

export interface ClaimHistoryItem {
  id: string;
  counter_id: string;
  counter_type: string;
  user_id: string;
  claimed_at: string;
  position: number;
  bonus_months: number;
}

// Histórico de claims para métricas
export function useEarlyBirdClaimHistory(days: number = 30) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub = subscribeTable('early_bird_claim_history', () =>
      queryClient.invalidateQueries({ queryKey: ['early-bird-claim-history'] }),
    );

    return () => {
      unsub();
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['early-bird-claim-history', days],
    queryFn: async (): Promise<ClaimHistoryItem[]> => {
      const startDate = subDays(new Date(), days).toISOString();
      
      const { data, error } = await supabase
        .from('early_bird_claim_history')
        .select('*')
        .gte('claimed_at', startDate)
        .order('claimed_at', { ascending: true });

      if (error) throw error;
      return (data || []) as ClaimHistoryItem[];
    },
  });
}

// Métricas calculadas
export function useEarlyBirdMetrics(days: number = 30) {
  const { data: counters } = useEarlyBirdCounters();
  const { data: history } = useEarlyBirdClaimHistory(days);

  return useMemo(() => {
    if (!counters || !history) {
      return {
        totalClaimed: 0,
        totalMax: 0,
        occupancyRate: 0,
        claimsPerDay: 0,
        conversionRate: 0,
        exhaustionDate: null as Date | null,
        daysUntilExhaustion: null as number | null,
        chartData: [] as { date: string; claims: number; cumulative: number }[],
        distributionByType: [] as { name: string; value: number; color: string }[],
      };
    }

    // Totais
    const totalClaimed = counters.reduce((sum, c) => sum + c.current_count, 0);
    const totalMax = counters.reduce((sum, c) => sum + c.max_count, 0);
    const occupancyRate = totalMax > 0 ? (totalClaimed / totalMax) * 100 : 0;

    // Claims por dia
    const uniqueDays = new Set(
      history.map((h) => format(new Date(h.claimed_at), 'yyyy-MM-dd'))
    ).size || 1;
    const claimsPerDay = history.length / uniqueDays;

    // Taxa de conversão (estimativa baseada em claims/dias ativos)
    const conversionRate = claimsPerDay > 0 ? Math.min(claimsPerDay * 10, 100) : 0;

    // Projeção de esgotamento
    const remainingSlots = totalMax - totalClaimed;
    let exhaustionDate: Date | null = null;
    let daysUntilExhaustion: number | null = null;

    if (claimsPerDay > 0 && remainingSlots > 0) {
      const daysToExhaust = Math.ceil(remainingSlots / claimsPerDay);
      exhaustionDate = addDays(new Date(), daysToExhaust);
      daysUntilExhaustion = daysToExhaust;
    }

    // Dados para gráfico de área (claims por dia)
    const claimsByDate: Record<string, number> = {};
    history.forEach((h) => {
      const date = format(new Date(h.claimed_at), 'dd/MM');
      claimsByDate[date] = (claimsByDate[date] || 0) + 1;
    });

    let cumulative = totalClaimed - history.length;
    const chartData = Object.entries(claimsByDate).map(([date, claims]) => {
      cumulative += claims;
      return { date, claims, cumulative };
    });

    // Distribuição por tipo de plano
    const typeColors: Record<string, string> = {
      monthly: 'hsl(var(--primary))',
      annual: 'hsl(45, 93%, 47%)',
      weekly: 'hsl(280, 70%, 50%)',
      quarterly: 'hsl(160, 70%, 45%)',
    };

    const distributionByType = counters.map((c) => ({
      name: c.counter_type === 'monthly' ? 'Mensal' : 
            c.counter_type === 'annual' ? 'Anual' :
            c.counter_type === 'weekly' ? 'Semanal' :
            c.counter_type === 'quarterly' ? 'Trimestral' : c.counter_type,
      value: c.current_count,
      color: typeColors[c.counter_type] || 'hsl(var(--muted))',
    }));

    return {
      totalClaimed,
      totalMax,
      occupancyRate,
      claimsPerDay,
      conversionRate,
      exhaustionDate,
      daysUntilExhaustion,
      chartData,
      distributionByType,
    };
  }, [counters, history]);
}
