import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export function useAdminNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Use ref to track subscription state — avoids re-render loops
  const channelRef = useRef<(() => void) | null>(null);

  // Fetch admin notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async (): Promise<AdminNotification[]> => {
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as AdminNotification[];
    },
    enabled: !!user,
    staleTime: 30_000, // 30s — notifications don't change that fast
  });

  // Subscribe to realtime admin notifications — runs once per user session
  useEffect(() => {
    if (!user) return;
    if (channelRef.current) return;

    const unsub = subscribeTable('admin_notifications', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const newNotification = payload.new as AdminNotification;
      toast({
        title: newNotification.title,
        description: newNotification.body || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    }, { events: ['INSERT'] });

    channelRef.current = unsub;

    return () => {
      if (channelRef.current) {
        channelRef.current();
        channelRef.current = null;
      }
    };
  }, [user?.id]);

  // Subscribe to new support tickets — stable ref pattern
  const ticketChannelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!user) return;
    if (ticketChannelRef.current) return;

    const unsub = subscribeTable('support_tickets', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const newTicket = payload.new as { subject: string; priority: string };
      toast({
        title: '🎫 Novo Chamado de Suporte',
        description: newTicket.subject,
      });
      queryClient.invalidateQueries({ queryKey: ['all-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-counts'] });
    }, { events: ['INSERT'] });

    ticketChannelRef.current = unsub;

    return () => {
      if (ticketChannelRef.current) {
        ticketChannelRef.current();
        ticketChannelRef.current = null;
      }
    };
  }, [user?.id]);


  // Mark notification as read
  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });

  // Mark ALL notifications as read (bulk)
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });

  // Clear all notifications
  const clearAll = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('admin_notifications')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return {
    notifications,
    isLoading,
    unreadCount,
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
    clearAll: clearAll.mutate,
  };
}

// Create admin notification (for internal use)
export async function createAdminNotification(notification: {
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}) {
  const { error } = await (supabase as any)
    .from('admin_notifications')
    .insert({
      type: notification.type,
      title: notification.title,
      body: notification.body || null,
      data: notification.data || null,
    });

  if (error) {
    console.error('Error creating admin notification:', error);
  }
}
