import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export type CampaignType = 'email' | 'push' | 'both';
export type TriggerType = 'manual' | 'scheduled' | 'event_based';
export type TargetAudience = 'all' | 'active' | 'inactive' | 'new' | 'churned' | 'custom';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export interface MarketingCampaign {
  id: string;
  name: string;
  description: string | null;
  type: CampaignType;
  trigger_type: TriggerType;
  trigger_event: string | null;
  trigger_config: Record<string, any>;
  target_audience: TargetAudience;
  target_filter: Record<string, any>;
  email_template_id: string | null;
  push_title: string | null;
  push_body: string | null;
  push_url: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
  };
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReengagementRule {
  id: string;
  name: string;
  description: string | null;
  trigger_condition: string;
  action_type: 'email' | 'push' | 'both' | 'coupon';
  email_template_id: string | null;
  push_title: string | null;
  push_body: string | null;
  coupon_discount: number | null;
  coupon_valid_days: number | null;
  delay_minutes: number;
  is_active: boolean;
  priority: number;
  max_per_user: number;
  cooldown_days: number;
  stats: {
    triggered: number;
    sent: number;
    converted: number;
  };
  created_at: string;
  updated_at: string;
}

export interface CampaignExecution {
  id: string;
  campaign_id: string;
  user_id: string;
  channel: 'email' | 'push';
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  converted_at: string | null;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// Fetch all marketing campaigns
export function useMarketingCampaigns() {
  return useQuery({
    queryKey: ['marketing-campaigns'],
    queryFn: async (): Promise<MarketingCampaign[]> => {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as MarketingCampaign[];
    },
  });
}

// Fetch single campaign
export function useCampaign(campaignId: string | null) {
  return useQuery({
    queryKey: ['marketing-campaign', campaignId],
    queryFn: async (): Promise<MarketingCampaign | null> => {
      if (!campaignId) return null;
      
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      return data as unknown as MarketingCampaign;
    },
    enabled: !!campaignId,
  });
}

// Create campaign
export function useCreateCampaign() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: Record<string, any>) => {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .insert({
          name: campaign.name,
          description: campaign.description || null,
          type: campaign.type || 'push',
          trigger_type: campaign.trigger_type || 'manual',
          target_audience: campaign.target_audience || 'all',
          email_template_id: campaign.email_template_id || null,
          push_title: campaign.push_title || null,
          push_body: campaign.push_body || null,
          push_url: campaign.push_url || null,
          scheduled_at: campaign.scheduled_at || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      toast({
        title: 'Campanha criada',
        description: 'A campanha foi criada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar campanha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update campaign
export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MarketingCampaign> & { id: string }) => {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      toast({
        title: 'Campanha atualizada',
        description: 'As alterações foram salvas.',
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

// Delete campaign
export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from('marketing_campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      toast({
        title: 'Campanha excluída',
        description: 'A campanha foi removida.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Execute campaign (send to all targets)
export function useExecuteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('execute-marketing-campaign', {
        body: { campaign_id: campaignId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      toast({
        title: '🚀 Campanha iniciada',
        description: `Enviando para ${data?.target_count || 0} usuários...`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao executar campanha',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Fetch campaign executions
export function useCampaignExecutions(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-executions', campaignId],
    queryFn: async (): Promise<CampaignExecution[]> => {
      if (!campaignId) return [];
      
      const { data, error } = await supabase
        .from('campaign_executions')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as CampaignExecution[];
    },
    enabled: !!campaignId,
  });
}

// Fetch all reengagement rules
export function useReengagementRules() {
  return useQuery({
    queryKey: ['reengagement-rules'],
    queryFn: async (): Promise<ReengagementRule[]> => {
      const { data, error } = await supabase
        .from('reengagement_rules')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as ReengagementRule[];
    },
  });
}

// Create reengagement rule
export function useCreateReengagementRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Record<string, any>) => {
      const { data, error } = await supabase
        .from('reengagement_rules')
        .insert({
          name: rule.name,
          description: rule.description || null,
          trigger_condition: rule.trigger_condition,
          action_type: rule.action_type,
          email_template_id: rule.email_template_id || null,
          push_title: rule.push_title || null,
          push_body: rule.push_body || null,
          coupon_discount: rule.coupon_discount || null,
          coupon_valid_days: rule.coupon_valid_days || null,
          cooldown_days: rule.cooldown_days || 7,
          priority: rule.priority || 5,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reengagement-rules'] });
      toast({
        title: 'Regra criada',
        description: 'A regra de re-engajamento foi criada.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar regra',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update reengagement rule
export function useUpdateReengagementRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ReengagementRule> & { id: string }) => {
      const { data, error } = await supabase
        .from('reengagement_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reengagement-rules'] });
      toast({
        title: 'Regra atualizada',
        description: 'As alterações foram salvas.',
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

// Delete reengagement rule
export function useDeleteReengagementRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from('reengagement_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reengagement-rules'] });
      toast({
        title: 'Regra excluída',
        description: 'A regra foi removida.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Toggle rule active status
export function useToggleReengagementRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('reengagement_rules')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reengagement-rules'] });
    },
  });
}

// Campaign stats summary
export function useCampaignStats() {
  return useQuery({
    queryKey: ['campaign-stats'],
    queryFn: async () => {
      const { data: campaigns, error } = await supabase
        .from('marketing_campaigns')
        .select('status, stats');

      if (error) throw error;

      const summary = {
        total: campaigns?.length || 0,
        active: campaigns?.filter(c => c.status === 'active').length || 0,
        draft: campaigns?.filter(c => c.status === 'draft').length || 0,
        completed: campaigns?.filter(c => c.status === 'completed').length || 0,
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalConverted: 0,
      };

      campaigns?.forEach(c => {
        const stats = c.stats as any;
        summary.totalSent += stats?.sent || 0;
        summary.totalOpened += stats?.opened || 0;
        summary.totalClicked += stats?.clicked || 0;
        summary.totalConverted += stats?.converted || 0;
      });

      return summary;
    },
  });
}

// Manual trigger check for reengagement
export function useTriggerReengagementCheck() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('process-reengagement');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Verificação concluída',
        description: `${data?.processed || 0} usuários processados.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro na verificação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
