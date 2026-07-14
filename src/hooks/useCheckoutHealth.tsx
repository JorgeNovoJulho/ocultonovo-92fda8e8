import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';

export interface HealthCheckLog {
  id: string;
  check_name: string;
  status: 'healthy' | 'degraded' | 'critical';
  response_time_ms: number | null;
  error_message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface CheckoutIncident {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  description: string | null;
  affected_checks: string[];
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
}

// Fetch recent health check logs
export function useHealthCheckLogs(limit: number = 100) {
  return useQuery({
    queryKey: ['checkout-health-logs', limit],
    queryFn: async (): Promise<HealthCheckLog[]> => {
      const { data, error } = await (supabase as any)
        .from('checkout_health_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

// Fetch latest status for each check
export function useLatestHealthStatus() {
  return useQuery({
    queryKey: ['checkout-health-latest'],
    queryFn: async (): Promise<Record<string, HealthCheckLog>> => {
      const { data, error } = await (supabase as any)
        .from('checkout_health_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get the latest entry for each check
      const latestByCheck: Record<string, HealthCheckLog> = {};
      for (const log of data || []) {
        if (!latestByCheck[log.check_name]) {
          latestByCheck[log.check_name] = log;
        }
      }

      return latestByCheck;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

// Fetch active incidents
export function useActiveIncidents() {
  return useQuery({
    queryKey: ['checkout-incidents-active'],
    queryFn: async (): Promise<CheckoutIncident[]> => {
      const { data, error } = await (supabase as any)
        .from('checkout_incidents')
        .select('*')
        .is('resolved_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

// Fetch all incidents (for history)
export function useIncidentHistory(limit: number = 50) {
  return useQuery({
    queryKey: ['checkout-incidents-history', limit],
    queryFn: async (): Promise<CheckoutIncident[]> => {
      const { data, error } = await (supabase as any)
        .from('checkout_incidents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

// Resolve an incident
export function useResolveIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      incidentId, 
      notes 
    }: { 
      incidentId: string; 
      notes: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await (supabase as any)
        .from('checkout_incidents')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: notes,
        })
        .eq('id', incidentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-incidents-active'] });
      queryClient.invalidateQueries({ queryKey: ['checkout-incidents-history'] });
      toast({
        title: 'Incidente resolvido',
        description: 'O incidente foi marcado como resolvido.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao resolver incidente',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Manually trigger health check
export function useTriggerHealthCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('checkout-sentinel');
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['checkout-health-logs'] });
      queryClient.invalidateQueries({ queryKey: ['checkout-health-latest'] });
      queryClient.invalidateQueries({ queryKey: ['checkout-incidents-active'] });
      
      const status = data?.status || 'unknown';
      const failedCount = data?.failed_count || 0;
      
      if (status === 'healthy') {
        toast({
          title: '✅ Checkout Saudável',
          description: 'Todas as verificações passaram com sucesso.',
        });
      } else if (status === 'degraded') {
        toast({
          title: '⚠️ Checkout Degradado',
          description: `${failedCount} verificação(ões) com problemas.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: '🚨 Checkout Crítico',
          description: `${failedCount} verificação(ões) falharam.`,
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao executar verificação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Calculate uptime percentage from logs
export function calculateUptime(logs: HealthCheckLog[]): number {
  if (logs.length === 0) return 100;
  
  const healthyCount = logs.filter(l => l.status === 'healthy').length;
  return Math.round((healthyCount / logs.length) * 100);
}

// Group logs by time interval for charts
export function groupLogsByHour(logs: HealthCheckLog[]): Array<{
  hour: string;
  healthy: number;
  degraded: number;
  critical: number;
}> {
  const groups: Record<string, { healthy: number; degraded: number; critical: number }> = {};
  
  for (const log of logs) {
    const date = new Date(log.created_at);
    const hourKey = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
    
    if (!groups[hourKey]) {
      groups[hourKey] = { healthy: 0, degraded: 0, critical: 0 };
    }
    
    groups[hourKey][log.status]++;
  }
  
  return Object.entries(groups)
    .map(([hour, counts]) => ({ hour, ...counts }))
    .slice(-24);
}
