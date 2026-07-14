import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useEffect } from "react";

export interface DailyMetric {
  id: string;
  metric_date: string;
  metric_type: string;
  metric_value: number;
  metadata?: any;
}

export interface EngagementHeatmapData {
  hour_of_day: number;
  day_of_week: number;
  event_type: string;
  event_count: number;
}

export interface GrowthPrediction {
  id: string;
  prediction_type: string;
  prediction_date: string;
  predicted_value: number;
  confidence_level?: number;
  actual_value?: number;
}

// Buscar métricas diárias
export function useDailyMetrics(filters?: {
  metricType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['daily-metrics', filters],
    queryFn: async (): Promise<DailyMetric[]> => {
      let query = supabase
        .from('daily_metrics')
        .select('*')
        .order('metric_date', { ascending: false });

      if (filters?.metricType) {
        query = query.eq('metric_type', filters.metricType);
      }
      if (filters?.startDate) {
        query = query.gte('metric_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('metric_date', filters.endDate);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DailyMetric[];
    },
  });
}

// Buscar métricas dos últimos N dias agrupadas por tipo
export function useMetricsSummary(days: number = 30) {
  return useQuery({
    queryKey: ['metrics-summary', days],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('daily_metrics')
        .select('*')
        .gte('metric_date', startDate.toISOString().split('T')[0])
        .order('metric_date', { ascending: true });

      if (error) throw error;

      // Agrupar por tipo
      const byType: Record<string, DailyMetric[]> = {};
      (data || []).forEach((m: DailyMetric) => {
        if (!byType[m.metric_type]) byType[m.metric_type] = [];
        byType[m.metric_type].push(m);
      });

      // Calcular totais e tendências
      const summary: Record<string, { total: number; trend: number; data: DailyMetric[] }> = {};
      Object.entries(byType).forEach(([type, metrics]) => {
        const total = metrics.reduce((sum, m) => sum + m.metric_value, 0);
        
        // Calcular tendência (comparar primeira e segunda metade)
        const midpoint = Math.floor(metrics.length / 2);
        const firstHalf = metrics.slice(0, midpoint).reduce((s, m) => s + m.metric_value, 0);
        const secondHalf = metrics.slice(midpoint).reduce((s, m) => s + m.metric_value, 0);
        const trend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

        summary[type] = { total, trend, data: metrics };
      });

      return summary;
    },
  });
}

// Buscar heatmap de engajamento
export function useEngagementHeatmap(eventType?: string) {
  return useQuery({
    queryKey: ['engagement-heatmap', eventType],
    queryFn: async (): Promise<EngagementHeatmapData[]> => {
      let query = supabase.from('engagement_heatmap').select('*');

      if (eventType) {
        query = query.eq('event_type', eventType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as EngagementHeatmapData[];
    },
  });
}

// Buscar previsões de crescimento
export function useGrowthPredictions(predictionType?: string) {
  return useQuery({
    queryKey: ['growth-predictions', predictionType],
    queryFn: async (): Promise<GrowthPrediction[]> => {
      let query = supabase
        .from('growth_predictions')
        .select('*')
        .order('prediction_date', { ascending: true });

      if (predictionType) {
        query = query.eq('prediction_type', predictionType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as GrowthPrediction[];
    },
  });
}

// Registrar evento de engajamento
export function useLogEngagement() {
  return useMutation({
    mutationFn: async ({ eventType, eventSource, metadata }: {
      eventType: string;
      eventSource?: string;
      metadata?: Record<string, any>;
    }) => {
      const { error } = await supabase.rpc('log_engagement_event', {
        p_event_type: eventType,
        p_event_source: eventSource || null,
        p_metadata: metadata || {},
      });

      if (error) throw error;
    },
  });
}

// Hook para tracking automático de page views
export function usePageViewTracking(pageName: string) {
  const logEngagement = useLogEngagement();

  useEffect(() => {
    logEngagement.mutate({
      eventType: 'page_view',
      eventSource: pageName,
      metadata: {
        url: window.location.pathname,
        referrer: document.referrer,
      },
    });
  }, [pageName]);
}

// Métricas em tempo real (últimas 24h)
export function useRealtimeMetrics() {
  return useQuery({
    queryKey: ['realtime-metrics'],
    queryFn: async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Usuários ativos (últimas 24h)
      const { count: activeUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('last_active', yesterday.toISOString());

      // Transações (últimas 24h)
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, type')
        .gte('created_at', yesterday.toISOString())
        .eq('status', 'completed');

      const revenue = transactions?.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0) || 0;

      // Novos usuários
      const { count: newUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      // Posts criados
      const { count: newPosts } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      // Mensagens enviadas
      const { count: messagesSent } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      return {
        activeUsers: activeUsers || 0,
        revenue,
        newUsers: newUsers || 0,
        newPosts: newPosts || 0,
        messagesSent: messagesSent || 0,
        updatedAt: now.toISOString(),
      };
    },
    refetchInterval: 60000, // Atualiza a cada minuto
  });
}

// Comparação com período anterior
export function usePeriodComparison(days: number = 7) {
  return useQuery({
    queryKey: ['period-comparison', days],
    queryFn: async () => {
      const now = new Date();
      const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

      // Período atual
      const { data: currentMetrics } = await supabase
        .from('daily_metrics')
        .select('*')
        .gte('metric_date', currentStart.toISOString().split('T')[0]);

      // Período anterior
      const { data: previousMetrics } = await supabase
        .from('daily_metrics')
        .select('*')
        .gte('metric_date', previousStart.toISOString().split('T')[0])
        .lt('metric_date', currentStart.toISOString().split('T')[0]);

      // Agregar por tipo
      const aggregate = (metrics: DailyMetric[]): Record<string, number> => {
        return metrics.reduce((acc, m) => {
          acc[m.metric_type] = (acc[m.metric_type] || 0) + m.metric_value;
          return acc;
        }, {} as Record<string, number>);
      };

      const current = aggregate((currentMetrics || []) as DailyMetric[]);
      const previous = aggregate((previousMetrics || []) as DailyMetric[]);

      // Calcular variação
      const comparison: Record<string, { current: number; previous: number; change: number }> = {};
      const allTypes = new Set([...Object.keys(current), ...Object.keys(previous)]);
      
      allTypes.forEach(type => {
        const curr = current[type] || 0;
        const prev = previous[type] || 0;
        const change = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
        comparison[type] = { current: curr, previous: prev, change };
      });

      return comparison;
    },
  });
}

// Top creators por receita
export function useTopCreators(limit: number = 10) {
  return useQuery({
    queryKey: ['top-creators', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, balance')
        .eq('is_creator', true)
        .order('balance', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

// Agregação manual de métricas diárias
export function useAggregateDailyMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('aggregate_daily_metrics');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['metrics-summary'] });
    },
  });
}

// =============================================
// NOVOS HOOKS PARA ANALYTICS AVANÇADO
// =============================================

interface RealtimeDashboardMetrics {
  total_users: number;
  active_users_today: number;
  active_users_week: number;
  new_users_today: number;
  new_users_week: number;
  total_creators: number;
  verified_creators: number;
  total_revenue_today: number;
  total_revenue_week: number;
  total_revenue_month: number;
  total_transactions_today: number;
  avg_transaction_value: number;
  active_subscriptions: number;
  churn_rate: number;
  mrr: number;
  arr: number;
}

interface GrowthMetric {
  metric_date: string;
  new_users: number;
  new_creators: number;
  revenue: number;
  transactions: number;
  new_subscriptions: number;
}

interface TopPerformer {
  creator_id: string;
  creator_name: string;
  creator_username: string;
  avatar_url: string;
  total_revenue: number;
  subscribers_count: number;
  posts_count: number;
  engagement_rate: number;
}

interface AnalyticsGoal {
  id: string;
  name: string;
  description?: string;
  metric_type: string;
  target_value: number;
  current_value: number;
  period_type: string;
  start_date: string;
  end_date: string;
  status: string;
  achieved_at?: string;
  created_at: string;
}

interface AnalyticsAlert {
  id: string;
  name: string;
  description?: string;
  metric_type: string;
  condition_type: string;
  threshold_value: number;
  comparison_period: string;
  is_active: boolean;
  last_triggered_at?: string;
  notification_channels: string[];
  created_at: string;
}

// Hook para métricas do dashboard em tempo real (via RPC)
export function useRealtimeDashboardMetrics() {
  return useQuery({
    queryKey: ['realtime-dashboard-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_realtime_dashboard_metrics');
      
      if (error) throw error;
      return (data?.[0] || {
        total_users: 0,
        active_users_today: 0,
        active_users_week: 0,
        new_users_today: 0,
        new_users_week: 0,
        total_creators: 0,
        verified_creators: 0,
        total_revenue_today: 0,
        total_revenue_week: 0,
        total_revenue_month: 0,
        total_transactions_today: 0,
        avg_transaction_value: 0,
        active_subscriptions: 0,
        churn_rate: 0,
        mrr: 0,
        arr: 0,
      }) as RealtimeDashboardMetrics;
    },
    refetchInterval: 30000,
  });
}

// Hook para métricas de crescimento
export function useGrowthMetrics(daysBack: number = 30) {
  return useQuery({
    queryKey: ['growth-metrics', daysBack],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_growth_metrics', { days_back: daysBack });
      
      if (error) throw error;
      return (data || []) as GrowthMetric[];
    },
  });
}

// Hook para top performers
export function useTopPerformers(limit: number = 10) {
  return useQuery({
    queryKey: ['top-performers', limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_top_performers', { limit_count: limit });
      
      if (error) throw error;
      return (data || []) as TopPerformer[];
    },
  });
}

// Hook para metas
export function useAnalyticsGoals() {
  return useQuery({
    queryKey: ['analytics-goals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_goals')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as AnalyticsGoal[];
    },
  });
}

// Hook para alertas
export function useAnalyticsAlerts() {
  return useQuery({
    queryKey: ['analytics-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_alerts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as AnalyticsAlert[];
    },
  });
}

// Hook para toggle alerta
export function useToggleAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('analytics_alerts')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-alerts'] });
    },
  });
}

// Hook para deletar alerta
export function useDeleteAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('analytics_alerts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-alerts'] });
    },
  });
}
