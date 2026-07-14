import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

// Tipos de eventos de conversão
export type ConversionEventType = 
  | 'signup_start' 
  | 'plan_view' 
  | 'checkout_start' 
  | 'payment_attempt' 
  | 'payment_success' 
  | 'payment_failed';

export type PlanType = 'free' | 'premium' | 'vip';

interface ConversionEvent {
  id: string;
  event_type: ConversionEventType;
  plan_type: PlanType | null;
  user_id: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface FunnelStep {
  event_type: ConversionEventType;
  label: string;
  count: number;
  percentage: number;
  dropoff: number;
}

interface FunnelData {
  steps: FunnelStep[];
  totalSignups: number;
  totalPayments: number;
  conversionRate: number;
  byPlan: {
    premium: { views: number; checkouts: number; payments: number; rate: number };
    vip: { views: number; checkouts: number; payments: number; rate: number };
  };
}

// Gerar ou recuperar session_id do navegador
function getSessionId(): string {
  const storageKey = 'conversion_session_id';
  let sessionId = sessionStorage.getItem(storageKey);
  
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(storageKey, sessionId);
  }
  
  return sessionId;
}

/**
 * Hook para rastrear eventos de conversão
 */
export function useTrackConversionEvent() {
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({
      eventType,
      planType,
      metadata = {},
    }: {
      eventType: ConversionEventType;
      planType?: PlanType;
      metadata?: Record<string, unknown>;
    }) => {
      const sessionId = getSessionId();
      
      // Usar edge function para inserção pública
      const { data, error } = await supabase.functions.invoke('track-conversion-event', {
        body: {
          event_type: eventType,
          plan_type: planType,
          user_id: user?.id,
          session_id: sessionId,
          metadata,
        },
      });

      if (error) throw error;
      return data;
    },
    onError: (error) => {
      console.error('Erro ao rastrear evento de conversão:', error);
    },
  });
}

/**
 * Hook para buscar dados do funil de conversão (últimas N horas)
 */
export function useConversionFunnel(hoursAgo: number = 24) {
  return useQuery({
    queryKey: ['conversion-funnel', hoursAgo],
    queryFn: async (): Promise<FunnelData> => {
      // Usar RPC para buscar dados agregados
      const { data, error } = await (supabase as any).rpc('get_conversion_funnel', {
        hours_ago: hoursAgo,
      });

      if (error) throw error;

      // Processar dados para formato de funil
      const eventCounts: Record<string, number> = {};
      const planCounts: Record<string, Record<string, number>> = {
        premium: {},
        vip: {},
      };

      (data || []).forEach((row: { event_type: string; plan_type: string | null; event_count: number }) => {
        const { event_type, plan_type, event_count } = row;
        eventCounts[event_type] = (eventCounts[event_type] || 0) + event_count;
        
        if (plan_type && planCounts[plan_type]) {
          planCounts[plan_type][event_type] = (planCounts[plan_type][event_type] || 0) + event_count;
        }
      });

      // Definir ordem das etapas do funil
      const stepOrder: { type: ConversionEventType; label: string }[] = [
        { type: 'signup_start', label: 'Iniciou Cadastro' },
        { type: 'plan_view', label: 'Visualizou Planos' },
        { type: 'checkout_start', label: 'Iniciou Checkout' },
        { type: 'payment_attempt', label: 'Tentou Pagar' },
        { type: 'payment_success', label: 'Pagamento OK' },
      ];

      // Calcular steps com dropoff
      const steps: FunnelStep[] = [];
      let previousCount = 0;

      stepOrder.forEach((step, index) => {
        const count = eventCounts[step.type] || 0;
        const percentage = index === 0 
          ? 100 
          : (previousCount > 0 ? (count / previousCount) * 100 : 0);
        const dropoff = index === 0 
          ? 0 
          : (previousCount > 0 ? ((previousCount - count) / previousCount) * 100 : 0);

        steps.push({
          event_type: step.type,
          label: step.label,
          count,
          percentage: index === 0 ? 100 : percentage,
          dropoff,
        });

        if (index === 0) previousCount = count || 1; // Evitar divisão por zero
        else previousCount = count || previousCount;
      });

      // Calcular métricas por plano
      const calcPlanMetrics = (planType: 'premium' | 'vip') => {
        const views = planCounts[planType]['plan_view'] || 0;
        const checkouts = planCounts[planType]['checkout_start'] || 0;
        const payments = planCounts[planType]['payment_success'] || 0;
        return {
          views,
          checkouts,
          payments,
          rate: views > 0 ? (payments / views) * 100 : 0,
        };
      };

      const totalSignups = eventCounts['signup_start'] || 0;
      const totalPayments = eventCounts['payment_success'] || 0;
      const conversionRate = totalSignups > 0 ? (totalPayments / totalSignups) * 100 : 0;

      return {
        steps,
        totalSignups,
        totalPayments,
        conversionRate,
        byPlan: {
          premium: calcPlanMetrics('premium'),
          vip: calcPlanMetrics('vip'),
        },
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutos
    refetchInterval: 1000 * 60 * 5, // Atualizar a cada 5 minutos
  });
}

/**
 * Hook para enviar alerta de teste para Telegram
 */
export function useTestCapacityAlert() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('capacity-alert-dispatcher', {
        body: {
          threshold: 90,
          current_users: 900,
          max_limit: 1000,
          percentage: 90,
          test: true,
        },
      });

      if (error) throw error;
      return data;
    },
  });
}
