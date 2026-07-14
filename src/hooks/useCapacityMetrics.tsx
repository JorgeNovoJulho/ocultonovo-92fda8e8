import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export interface CapacityMetrics {
  current_users: number;
  max_limit: number;
  percentage: number;
  waitlist_enabled: boolean;
  waitlist_count: number;
  signups_last_hour: number;
  signups_last_24h: number;
  hours_to_full: number | null;
  plan_distribution: {
    free: number;
    premium: number;
    vip: number;
  };
  estimated_mrr: number;
}

// Fetch capacity metrics from RPC
export function useCapacityMetrics() {
  return useQuery({
    queryKey: ['capacity-metrics'],
    queryFn: async (): Promise<CapacityMetrics> => {
      const { data, error } = await supabase.rpc('get_capacity_metrics');

      if (error) {
        console.warn('Capacity metrics fetch failed, using fallback:', error.message);
        return {
          current_users: 0,
          max_limit: 10000,
          percentage: 0,
          waitlist_enabled: false,
          waitlist_count: 0,
          signups_last_hour: 0,
          signups_last_24h: 0,
          hours_to_full: null,
          plan_distribution: { free: 0, premium: 0, vip: 0 },
          estimated_mrr: 0,
        } as CapacityMetrics;
      }
      return data as unknown as CapacityMetrics;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });
}

// Realtime capacity metrics with subscription
export function useRealtimeCapacityMetrics() {
  const queryClient = useQueryClient();
  const query = useCapacityMetrics();

  useEffect(() => {
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });
    const unsubProfiles = subscribeTable('profiles', invalidate);
    const unsubWaitlist = subscribeTable('waitlist', invalidate);
    return () => {
      unsubProfiles();
      unsubWaitlist();
    };
  }, [queryClient]);


  return query;
}

// Update max users limit
export function useUpdateMaxLimit() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (newLimit: number) => {
      if (!user) throw new Error('Não autenticado');
      
      const { error } = await supabase
        .from('system_settings')
        .update({
          value: JSON.stringify(newLimit.toString()),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'max_users_limit');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Limite atualizado',
        description: 'O novo limite de usuários foi salvo.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Toggle waitlist enabled
export function useToggleWaitlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!user) throw new Error('Não autenticado');

      const { error } = await supabase
        .from('system_settings')
        .update({
          value: JSON.stringify(enabled.toString()),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'waitlist_enabled');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Fila de espera atualizada',
        description: 'Configuração salva com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update capacity alert settings
export function useUpdateCapacityAlerts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settings: {
      alert_90?: boolean;
      alert_95?: boolean;
      alert_100?: boolean;
      webhook_url?: string;
      alert_email?: string;
      telegram_bot_token?: string;
      telegram_chat_id?: string;
    }) => {
      if (!user) throw new Error('Não autenticado');

      const updates: Promise<void>[] = [];

      const updateSetting = async (key: string, value: string | boolean | undefined) => {
        if (value === undefined) return;
        
        let jsonValue: string;
        if (typeof value === 'boolean') {
          jsonValue = JSON.stringify(value.toString());
        } else if (value === '') {
          jsonValue = '""';
        } else {
          jsonValue = JSON.stringify(value);
        }

        const { error } = await supabase
          .from('system_settings')
          .update({
            value: jsonValue,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('key', key);
        if (error) throw error;
      };

      if (settings.alert_90 !== undefined) {
        updates.push(updateSetting('capacity_alert_90', settings.alert_90));
      }

      if (settings.alert_95 !== undefined) {
        updates.push(updateSetting('capacity_alert_95', settings.alert_95));
      }

      if (settings.alert_100 !== undefined) {
        updates.push(updateSetting('capacity_alert_100', settings.alert_100));
      }

      if (settings.webhook_url !== undefined) {
        updates.push(updateSetting('capacity_webhook_url', settings.webhook_url));
      }

      if (settings.alert_email !== undefined) {
        updates.push(updateSetting('capacity_alert_email', settings.alert_email));
      }

      if (settings.telegram_bot_token !== undefined) {
        updates.push(updateSetting('telegram_bot_token', settings.telegram_bot_token));
      }

      if (settings.telegram_chat_id !== undefined) {
        updates.push(updateSetting('telegram_chat_id', settings.telegram_chat_id));
      }

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Alertas configurados',
        description: 'Configurações de alerta atualizadas.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Check if signup is allowed (for public use)
export function useCanSignup() {
  return useQuery({
    queryKey: ['can-signup'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_capacity_metrics');

      if (error) {
        console.error('Error checking capacity:', error);
        return { canSignup: true, waitlistEnabled: false, percentage: 0 };
      }

      const metrics = data as unknown as CapacityMetrics;
      return {
        canSignup: metrics.percentage < 100,
        waitlistEnabled: metrics.waitlist_enabled,
        percentage: metrics.percentage,
        waitlistCount: metrics.waitlist_count,
      };
    },
    staleTime: 60000, // 1 minute
  });
}
