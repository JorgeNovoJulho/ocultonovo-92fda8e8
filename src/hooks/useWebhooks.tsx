import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from './use-toast';

// Types
interface WebhookEndpoint {
  id: string;
  name: string;
  description?: string;
  url: string;
  secret_key: string;
  events: string[];
  headers?: Record<string, string>;
  is_active: boolean;
  retry_count: number;
  timeout_ms: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface WebhookLog {
  id: string;
  endpoint_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  response_status?: number;
  response_body?: string;
  response_time_ms?: number;
  attempt_number: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

interface WebhookEventType {
  id: string;
  code: string;
  name: string;
  description?: string;
  payload_schema?: Record<string, unknown>;
  category: string;
  is_active: boolean;
  created_at: string;
}

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  key_hash: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  expires_at?: string;
  last_used_at?: string;
  usage_count: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
}

interface WebhookStats {
  total_endpoints: number;
  active_endpoints: number;
  total_logs_today: number;
  successful_today: number;
  failed_today: number;
  avg_response_time: number;
}

// Hook para endpoints
export function useWebhookEndpoints() {
  return useQuery({
    queryKey: ['webhook-endpoints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as WebhookEndpoint[];
    },
  });
}

// Hook para criar endpoint
export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (endpoint: {
      name: string;
      description?: string;
      url: string;
      events: string[];
      headers?: Record<string, string>;
      retry_count?: number;
      timeout_ms?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .insert([{
          ...endpoint,
          created_by: user?.id,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast({ title: 'Webhook criado!' });
    },
  });
}

// Hook para atualizar endpoint
export function useUpdateWebhookEndpoint() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WebhookEndpoint> & { id: string }) => {
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast({ title: 'Webhook atualizado!' });
    },
  });
}

// Hook para deletar endpoint
export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhook_endpoints')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-endpoints'] });
      toast({ title: 'Webhook removido!' });
    },
  });
}

// Hook para logs
export function useWebhookLogs(endpointId?: string) {
  return useQuery({
    queryKey: ['webhook-logs', endpointId],
    queryFn: async () => {
      let query = supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (endpointId) {
        query = query.eq('endpoint_id', endpointId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return (data || []) as WebhookLog[];
    },
  });
}

// Hook para tipos de eventos
export function useWebhookEventTypes() {
  return useQuery({
    queryKey: ['webhook-event-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_event_types')
        .select('*')
        .eq('is_active', true)
        .order('category');
      
      if (error) throw error;
      return (data || []) as WebhookEventType[];
    },
  });
}

// Hook para estatísticas
export function useWebhookStats() {
  return useQuery({
    queryKey: ['webhook-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_webhook_stats');
      
      if (error) throw error;
      return (data?.[0] || {
        total_endpoints: 0,
        active_endpoints: 0,
        total_logs_today: 0,
        successful_today: 0,
        failed_today: 0,
        avg_response_time: 0,
      }) as WebhookStats;
    },
  });
}

// Hook para API keys
export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as ApiKey[];
    },
  });
}

// Hook para criar API key
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (apiKey: {
      name: string;
      description?: string;
      permissions?: string[];
      rate_limit?: number;
      expires_at?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Gerar key aleatória
      const rawKey = crypto.randomUUID() + crypto.randomUUID();
      const prefix = rawKey.slice(0, 8);
      
      // Hash simples (em produção usar bcrypt via edge function)
      const encoder = new TextEncoder();
      const data = encoder.encode(rawKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const { data: created, error } = await supabase
        .from('api_keys')
        .insert([{
          ...apiKey,
          key_hash: keyHash,
          key_prefix: prefix,
          created_by: user?.id,
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      // Retornar a key completa apenas uma vez
      return { ...created, raw_key: rawKey };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API Key criada!' });
    },
  });
}

// Hook para revogar API key
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API Key revogada!' });
    },
  });
}

// Hook para logs de uso da API
export function useApiUsageLogs(apiKeyId?: string) {
  return useQuery({
    queryKey: ['api-usage-logs', apiKeyId],
    queryFn: async () => {
      let query = supabase
        .from('api_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (apiKeyId) {
        query = query.eq('api_key_id', apiKeyId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    },
  });
}
