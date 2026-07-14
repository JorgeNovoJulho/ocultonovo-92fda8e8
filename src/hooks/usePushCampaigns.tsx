import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from './use-toast';

// Types
interface PushCampaign {
  id: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  image_url?: string;
  target_type: string;
  target_segment?: string;
  target_user_ids?: string[];
  is_scheduled: boolean;
  scheduled_for?: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  clicked_count: number;
  failed_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface PushTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  category?: string;
  variables?: string[];
  is_active: boolean;
  usage_count: number;
  created_at: string;
}

interface PushAutomation {
  id: string;
  name: string;
  description?: string;
  trigger_event: string;
  trigger_conditions?: Record<string, unknown>;
  template_id?: string;
  custom_title?: string;
  custom_body?: string;
  url_pattern?: string;
  delay_minutes: number;
  is_active: boolean;
  triggered_count: number;
  sent_count: number;
  created_at: string;
}

interface UserNotificationPreferences {
  id: string;
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  marketing_enabled: boolean;
  transactional_enabled: boolean;
  social_enabled: boolean;
  reminders_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  digest_mode: boolean;
  digest_frequency: string;
}

interface PushStats {
  total_campaigns: number;
  total_sent: number;
  total_delivered: number;
  total_clicked: number;
  delivery_rate: number;
  click_rate: number;
  active_tokens: number;
}

// Hooks para Campanhas
export function usePushCampaigns() {
  return useQuery({
    queryKey: ['push-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('push_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PushCampaign[];
    },
  });
}

export function useCreatePushCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (campaign: { title: string; body: string; url?: string; target_type: string; target_segment?: string }) => {
      const { data, error } = await supabase
        .from('push_campaigns')
        .insert([{
          title: campaign.title,
          body: campaign.body,
          url: campaign.url,
          target_type: campaign.target_type,
          target_segment: campaign.target_segment,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-campaigns'] });
      toast({ title: 'Campanha criada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar campanha', description: error.message, variant: 'destructive' });
    },
  });
}

export function useSendPushCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (campaignId: string) => {
      // Atualizar status para sending
      const { error: updateError } = await supabase
        .from('push_campaigns')
        .update({ status: 'sending', started_at: new Date().toISOString() })
        .eq('id', campaignId);
      
      if (updateError) throw updateError;
      
      // Invocar edge function para envio
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: { campaign_id: campaignId },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-campaigns'] });
      toast({ title: 'Campanha enviada!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao enviar campanha', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeletePushCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from('push_campaigns')
        .delete()
        .eq('id', campaignId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-campaigns'] });
      toast({ title: 'Campanha excluída!' });
    },
  });
}

// Hooks para Templates
export function usePushTemplates() {
  return useQuery({
    queryKey: ['push-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('push_templates')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as PushTemplate[];
    },
  });
}

export function useCreatePushTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (template: { name: string; title: string; body: string; category?: string }) => {
      const { data, error } = await supabase
        .from('push_templates')
        .insert([{
          name: template.name,
          title: template.title,
          body: template.body,
          category: template.category,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-templates'] });
      toast({ title: 'Template criado!' });
    },
  });
}

export function useUpdatePushTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PushTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('push_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-templates'] });
      toast({ title: 'Template atualizado!' });
    },
  });
}

export function useDeletePushTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('push_templates')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-templates'] });
      toast({ title: 'Template excluído!' });
    },
  });
}

// Hooks para Automations
export function usePushAutomations() {
  return useQuery({
    queryKey: ['push-automations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('push_automations')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as PushAutomation[];
    },
  });
}

export function useUpdatePushAutomation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('push_automations')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-automations'] });
      toast({ title: 'Automação atualizada!' });
    },
  });
}

export function useCreatePushAutomation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (automation: { name: string; trigger_event: string; custom_title?: string; custom_body?: string }) => {
      const { data, error } = await supabase
        .from('push_automations')
        .insert([{
          name: automation.name,
          trigger_event: automation.trigger_event,
          custom_title: automation.custom_title,
          custom_body: automation.custom_body,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-automations'] });
      toast({ title: 'Automação criada!' });
    },
  });
}

// Hook para Estatísticas
export function usePushStats(daysBack = 30) {
  return useQuery({
    queryKey: ['push-stats', daysBack],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_push_stats', { days_back: daysBack });
      
      if (error) throw error;
      return (data?.[0] || {
        total_campaigns: 0,
        total_sent: 0,
        total_delivered: 0,
        total_clicked: 0,
        delivery_rate: 0,
        click_rate: 0,
        active_tokens: 0,
      }) as PushStats;
    },
  });
}

// Hook para Preferências do Usuário
export function useUserNotificationPreferences(userId?: string) {
  return useQuery({
    queryKey: ['notification-preferences', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) throw error;
      return data as UserNotificationPreferences | null;
    },
    enabled: !!userId,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (prefs: Partial<UserNotificationPreferences> & { user_id: string }) => {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .upsert(prefs)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences', variables.user_id] });
      toast({ title: 'Preferências atualizadas!' });
    },
  });
}

// Hook para Push Tokens ativos
export function usePushTokensCount() {
  return useQuery({
    queryKey: ['push-tokens-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('push_tokens')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || 0;
    },
  });
}
