import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface SuperDmSettings {
  accept_super_dm: boolean;
  min_super_dm_price: number;
  super_dm_earnings: number;
}

export interface SuperDmStats {
  total_received: number;
  total_count: number;
  average_amount: number;
}

export interface PriorityTransaction {
  id: string;
  message_id: string;
  sender_profile_id: string;
  receiver_profile_id: string;
  amount: number;
  platform_fee: number;
  net_amount: number;
  status: string;
  created_at: string;
  sender?: {
    username: string | null;
    name?: string | null;
    avatar_url: string | null;
  };

}

// Hook to get Super DM settings for current user
export function useSuperDmSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['super-dm-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('accept_super_dm, min_super_dm_price, super_dm_earnings')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data as SuperDmSettings;
    },
    enabled: !!user?.id,
  });
}

// Hook to update Super DM settings
export function useUpdateSuperDmSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: Partial<SuperDmSettings>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update(settings)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-dm-settings'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: 'Configurações salvas',
        description: 'Suas configurações de Super DM foram atualizadas.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook to get Super DM stats for a profile
export function useSuperDmStats(profileId?: string) {
  const { user } = useAuth();
  const targetProfileId = profileId;

  return useQuery({
    queryKey: ['super-dm-stats', targetProfileId || user?.id],
    queryFn: async () => {
      let resolvedProfileId = targetProfileId;
      
      // If no profileId passed, get current user's profile
      if (!resolvedProfileId && user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        resolvedProfileId = profile?.id;
      }

      if (!resolvedProfileId) return null;

      const { data, error } = await supabase.rpc('get_super_dm_stats', {
        p_profile_id: resolvedProfileId,
      });

      if (error) throw error;
      return data as unknown as SuperDmStats;
    },
    enabled: !!(targetProfileId || user?.id),
  });
}

// Hook to get creator's Super DM settings (for checking before sending)
export function useCreatorSuperDmSettings(creatorUserId: string | undefined) {
  return useQuery({
    queryKey: ['creator-super-dm-settings', creatorUserId],
    queryFn: async () => {
      if (!creatorUserId) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('accept_super_dm, min_super_dm_price, name, is_creator')
        .eq('user_id', creatorUserId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!creatorUserId,
  });
}

// Hook to send a Super DM
export function useSendSuperDm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      amount,
      mediaUrl,
      mediaType,
    }: {
      conversationId: string;
      content: string;
      amount: number;
      mediaUrl?: string;
      mediaType?: string;
    }) => {
      const { data, error } = await supabase.rpc('send_super_dm', {
        p_conversation_id: conversationId,
        p_content: content,
        p_amount: amount,
        p_media_url: mediaUrl || null,
        p_media_type: mediaType || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message_id?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Falha ao enviar Super DM');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: '💎 Super DM enviado!',
        description: 'Sua mensagem foi destacada e está no topo da inbox!',
      });
      // Missão diária "Envie um Super DM"
      import('@/lib/auraQuests').then(({ progressAuraQuest }) => {
        void progressAuraQuest('send_super_dm', 1);
      }).catch(() => {});
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook to get priority transactions history
export function usePriorityTransactions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['priority-transactions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from('priority_message_transactions' as any)
        .select('*')
        .eq('receiver_profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Fetch sender profiles separately
      const transactions = data || [];
      const senderIds = [...new Set(transactions.map((t: any) => t.sender_profile_id))];
      
      const { data: senders } = await supabase
        .from('profiles')
        .select('id, username, name, avatar_url')
        .in('id', senderIds);
      
      const senderMap = new Map(senders?.map(s => [s.id, s]) || []);
      
      return transactions.map((t: any) => ({
        ...t,
        sender: senderMap.get(t.sender_profile_id) || null,
      })) as PriorityTransaction[];
    },
    enabled: !!user?.id,
  });
}

// Hook to get user's credits balance
export function useUserCredits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-credits-balance', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return 0;

      const { data, error } = await supabase
        .from('user_credits')
        .select('credits_balance')
        .eq('user_id', profile.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return (data?.credits_balance as number) || 0;
    },
    enabled: !!user?.id,
  });
}

// Auto-reply settings interface
export interface AutoReplySettings {
  super_dm_auto_reply_enabled: boolean;
  super_dm_auto_reply_message: string;
  super_dm_estimated_response_hours: number;
}

// Hook to get and update auto-reply settings
export function useAutoReplySettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['auto-reply-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('super_dm_auto_reply_enabled, super_dm_auto_reply_message, super_dm_estimated_response_hours')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data as AutoReplySettings;
    },
    enabled: !!user?.id,
  });
}

export function useUpdateAutoReplySettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: Partial<AutoReplySettings>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update(settings)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-reply-settings'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: 'Configurações salvas',
        description: 'Suas configurações de resposta automática foram atualizadas.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Interface for revenue timeline data
export interface SuperDmRevenuePoint {
  date: string;
  revenue: number;
  count: number;
}

// Hook for Super DM revenue timeline chart
export function useSuperDmRevenueTrend(profileId?: string, days = 30) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['super-dm-revenue-trend', profileId || user?.id, days],
    queryFn: async () => {
      let resolvedProfileId = profileId;
      
      // If no profileId passed, get current user's profile
      if (!resolvedProfileId && user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        resolvedProfileId = profile?.id;
      }

      if (!resolvedProfileId) return [];

      const { data, error } = await supabase.rpc('get_super_dm_revenue_timeline', {
        p_profile_id: resolvedProfileId,
        p_days: days,
      });

      if (error) throw error;
      return (data || []) as SuperDmRevenuePoint[];
    },
    enabled: !!(profileId || user?.id),
  });
}
