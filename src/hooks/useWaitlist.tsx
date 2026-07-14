import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  source: string;
  referral_code: string | null;
  priority_score: number;
  status: 'waiting' | 'invited' | 'converted' | 'expired';
  invited_at: string | null;
  converted_at: string | null;
  created_at: string;
}

// Fetch all waitlist entries (admin only)
export function useWaitlistEntries(status?: string) {
  return useQuery({
    queryKey: ['waitlist', status],
    queryFn: async (): Promise<WaitlistEntry[]> => {
      let query = supabase
        .from('waitlist')
        .select('*')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as WaitlistEntry[];
    },
  });
}

// Get waitlist count
export function useWaitlistCount() {
  return useQuery({
    queryKey: ['waitlist-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting');

      if (error) throw error;
      return count || 0;
    },
  });
}

// Add to waitlist (public)
export function useAddToWaitlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      email,
      name,
      source = 'signup',
    }: {
      email: string;
      name?: string;
      source?: string;
    }) => {
      const { data, error } = await supabase.rpc('add_to_waitlist', {
        p_email: email,
        p_name: name || null,
        p_source: source,
      });

      if (error) throw error;
      return data as {
        success: boolean;
        already_registered: boolean;
        position: number;
        id: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-count'] });
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });

      if (data.already_registered) {
        toast({
          title: 'Você já está na fila!',
          description: `Sua posição atual é #${data.position}`,
        });
      } else {
        toast({
          title: '🎉 Você está na fila!',
          description: `Sua posição é #${data.position}. Avisaremos quando houver vaga!`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao entrar na fila',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Invite users from waitlist (admin)
export function useInviteFromWaitlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('waitlist')
        .update({
          status: 'invited',
          invited_at: new Date().toISOString(),
        })
        .in('id', ids);

      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-count'] });
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });

      toast({
        title: 'Convites enviados',
        description: `${count} pessoa(s) foram convidadas.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao convidar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update priority score (admin)
export function useUpdateWaitlistPriority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      priority_score,
    }: {
      id: string;
      priority_score: number;
    }) => {
      const { error } = await supabase
        .from('waitlist')
        .update({ priority_score })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });
}

// Delete from waitlist (admin)
export function useDeleteFromWaitlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('waitlist').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-count'] });
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });

      toast({
        title: 'Removido da fila',
        description: 'Entrada removida com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Invite next N from waitlist (admin)
export function useInviteNextFromWaitlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (count: number) => {
      // Get next N waiting entries ordered by priority and date
      const { data: entries, error: fetchError } = await supabase
        .from('waitlist')
        .select('id')
        .eq('status', 'waiting')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(count);

      if (fetchError) throw fetchError;
      if (!entries || entries.length === 0) {
        throw new Error('Nenhum usuário na fila de espera');
      }

      const ids = entries.map((e) => e.id);

      const { error: updateError } = await supabase
        .from('waitlist')
        .update({
          status: 'invited',
          invited_at: new Date().toISOString(),
        })
        .in('id', ids);

      if (updateError) throw updateError;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-count'] });
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });

      toast({
        title: 'Convites enviados',
        description: `${count} próximo(s) da fila foram convidados.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao convidar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Batch invite with email via Resend (admin)
export function useBatchInviteWithEmail() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { ids?: string[]; count?: number }) => {
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase.functions.invoke('send-waitlist-invites', {
        body: params,
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.details || data.error);
      }
      
      return data as {
        success: boolean;
        message: string;
        sent_count: number;
        failed_count: number;
        failed_emails?: { email: string; error: string }[];
        sandbox_mode?: boolean;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist-count'] });
      queryClient.invalidateQueries({ queryKey: ['capacity-metrics'] });

      if (data.sandbox_mode) {
        toast({
          title: '📧 Modo Sandbox',
          description: `${data.sent_count} emails simulados (sandbox ativo).`,
        });
      } else {
        toast({
          title: '📧 Convites enviados!',
          description: data.message,
        });
      }

      if (data.failed_count > 0) {
        toast({
          title: '⚠️ Alguns emails falharam',
          description: `${data.failed_count} email(s) não puderam ser enviados.`,
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar convites',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
