import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  admin_response: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  user_profile?: {
    name: string;
    avatar_url: string | null;
    username: string | null;
  };
}

// Fetch user's own tickets
export function useMyTickets() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-tickets', user?.id],
    queryFn: async (): Promise<SupportTicket[]> => {
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SupportTicket[];
    },
    enabled: !!user,
  });
}

// Fetch all tickets (admin only) with decoupled profile resolution
export function useAllTickets(status?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all-tickets', status],
    queryFn: async (): Promise<SupportTicket[]> => {
      if (!user) return [];

      let query = (supabase as any)
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data: tickets, error } = await query;
      if (error) throw error;
      if (!tickets || tickets.length === 0) return [];

      // Batch-fetch profiles for unique user_ids
      const userIds = [...new Set(tickets.map((t: any) => t.user_id).filter(Boolean))] as string[];

      let profileMap: Record<string, { name: string; avatar_url: string | null; username: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('id, name, avatar_url, username')
          .in('id', userIds);

        if (profiles) {
          for (const p of profiles) {
            profileMap[p.id] = { name: p.name, avatar_url: p.avatar_url, username: p.username };
          }
        }
      }

      return tickets.map((t: any) => ({
        ...t,
        user_profile: profileMap[t.user_id] || null,
      })) as SupportTicket[];
    },
    enabled: !!user,
  });
}

// Create a new ticket
export function useCreateTicket() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ticket: {
      subject: string;
      description?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (supabase as any)
        .from('support_tickets')
        .insert({
          user_id: user.id,
          subject: ticket.subject,
          description: ticket.description || null,
          priority: ticket.priority || 'medium',
        })
        .select()
        .single();

      if (error) throw error;
      return data as SupportTicket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      toast({
        title: 'Chamado aberto!',
        description: 'Nossa equipe responderá em breve.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao abrir chamado',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update ticket status (admin)
export function useUpdateTicketStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      status,
      adminResponse,
    }: {
      ticketId: string;
      status: 'open' | 'in_progress' | 'resolved' | 'closed';
      adminResponse?: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (adminResponse) {
        updates.admin_response = adminResponse;
      }

      if (status === 'resolved' || status === 'closed') {
        updates.resolved_by = user.id;
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await (supabase as any)
        .from('support_tickets')
        .update(updates)
        .eq('id', ticketId);

      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['all-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-counts'] });
      queryClient.invalidateQueries({ queryKey: ['open-support-count'] });

      const messages: Record<string, string> = {
        in_progress: 'Chamado marcado como em andamento',
        resolved: 'Chamado resolvido com sucesso',
        closed: 'Chamado fechado',
      };

      toast({
        title: messages[status] || 'Status atualizado',
      });
    },
  });
}

// Get ticket counts by status
export function useTicketCounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['ticket-counts'],
    queryFn: async () => {
      if (!user) return { open: 0, in_progress: 0, resolved: 0, closed: 0 };

      const { data, error } = await (supabase as any)
        .from('support_tickets')
        .select('status');

      if (error) throw error;

      const counts = {
        open: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
      };

      (data || []).forEach((ticket: { status: string }) => {
        if (ticket.status in counts) {
          counts[ticket.status as keyof typeof counts]++;
        }
      });

      return counts;
    },
    enabled: !!user,
  });
}
