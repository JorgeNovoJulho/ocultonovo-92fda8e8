import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface UserFeedback {
  id: string;
  user_id: string;
  type: 'suggestion' | 'complaint' | 'bug';
  title: string;
  description: string | null;
  status: 'pending' | 'analyzing' | 'implemented' | 'rejected';
  admin_response: string | null;
  reward_coupon_code: string | null;
  reward_discount: number | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  user_profile?: {
    name: string;
    avatar_url: string | null;
    username: string | null;
  };
}

// Fetch user's own feedback
export function useMyFeedback() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-feedback', user?.id],
    queryFn: async (): Promise<UserFeedback[]> => {
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from('user_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as UserFeedback[];
    },
    enabled: !!user,
  });
}

// Fetch all feedback (admin only)
export function useAllFeedback(status?: string, type?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all-feedback', status, type],
    queryFn: async (): Promise<UserFeedback[]> => {
      if (!user) return [];

      let query = (supabase as any)
        .from('user_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      if (type && type !== 'all') {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw error;

      const list = (data || []) as any[];
      if (list.length === 0) return [] as UserFeedback[];

      const userIds = [...new Set(list.map((f) => f.user_id).filter(Boolean))];
      // user_feedback.user_id likely maps to auth.users.id; resolve via profiles.user_id
      const { data: profiles } = userIds.length
        ? await (supabase as any).from('profiles').select('user_id, name, avatar_url, username').in('user_id', userIds)
        : { data: [] as any[] };
      const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]));
      return list.map((f) => ({ ...f, user_profile: profileMap.get(f.user_id) || null })) as UserFeedback[];
    },
    enabled: !!user,
  });
}

// Create feedback
export function useCreateFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedback: {
      type: 'suggestion' | 'complaint' | 'bug';
      title: string;
      description?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (supabase as any)
        .from('user_feedback')
        .insert({
          user_id: user.id,
          type: feedback.type,
          title: feedback.title,
          description: feedback.description || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create admin notification
      await (supabase as any)
        .from('admin_notifications')
        .insert({
          type: 'new_feedback',
          title: `Novo ${feedback.type === 'suggestion' ? 'Sugestão' : feedback.type === 'complaint' ? 'Reclamação' : 'Bug'}`,
          body: feedback.title,
          data: { feedback_id: data.id, type: feedback.type },
        });

      return data as UserFeedback;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-feedback'] });
      const typeLabels = { suggestion: 'Sugestão', complaint: 'Reclamação', bug: 'Bug' };
      toast({
        title: `${typeLabels[variables.type]} enviada!`,
        description: 'Nossa equipe irá analisar em breve.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar feedback',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update feedback status (admin)
export function useUpdateFeedbackStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      feedbackId,
      status,
      adminResponse,
      rewardCouponCode,
      rewardDiscount,
    }: {
      feedbackId: string;
      status: 'pending' | 'analyzing' | 'implemented' | 'rejected';
      adminResponse?: string;
      rewardCouponCode?: string;
      rewardDiscount?: number;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (adminResponse) {
        updates.admin_response = adminResponse;
      }

      if (status === 'implemented' || status === 'rejected') {
        updates.responded_by = user.id;
        updates.responded_at = new Date().toISOString();
      }

      if (rewardCouponCode && status === 'implemented') {
        updates.reward_coupon_code = rewardCouponCode;
        updates.reward_discount = rewardDiscount;
      }

      const { error } = await (supabase as any)
        .from('user_feedback')
        .update(updates)
        .eq('id', feedbackId);

      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['all-feedback'] });
      queryClient.invalidateQueries({ queryKey: ['my-feedback'] });

      const messages: Record<string, string> = {
        analyzing: 'Feedback marcado como em análise',
        implemented: 'Feedback marcado como implementado',
        rejected: 'Feedback rejeitado',
      };

      toast({
        title: messages[status] || 'Status atualizado',
      });
    },
  });
}

// Get feedback counts
export function useFeedbackCounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['feedback-counts'],
    queryFn: async () => {
      if (!user) return { pending: 0, analyzing: 0, implemented: 0, rejected: 0, suggestion: 0, complaint: 0, bug: 0 };

      const { data, error } = await (supabase as any)
        .from('user_feedback')
        .select('status, type');

      if (error) throw error;

      const counts = {
        pending: 0,
        analyzing: 0,
        implemented: 0,
        rejected: 0,
        suggestion: 0,
        complaint: 0,
        bug: 0,
      };

      (data || []).forEach((item: { status: string; type: string }) => {
        if (item.status in counts) {
          counts[item.status as keyof typeof counts]++;
        }
        if (item.type in counts) {
          counts[item.type as keyof typeof counts]++;
        }
      });

      return counts;
    },
    enabled: !!user,
  });
}
