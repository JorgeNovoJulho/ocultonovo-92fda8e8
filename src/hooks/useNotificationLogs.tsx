/**
 * Hook para logs de notificações enviadas (Telegram, Email, Push, etc.)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface NotificationLog {
  id: string;
  channel: 'telegram' | 'email' | 'push' | 'webhook' | 'sms';
  recipient: string | null;
  message_preview: string | null;
  status: 'sent' | 'failed' | 'pending';
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface UseNotificationLogsOptions {
  channel?: string;
  status?: string;
  limit?: number;
}

export function useNotificationLogs(options: UseNotificationLogsOptions = {}) {
  const { channel, status, limit = 100 } = options;

  return useQuery({
    queryKey: ['notification-logs', channel, status, limit],
    queryFn: async (): Promise<NotificationLog[]> => {
      let query = (supabase as any)
        .from('notification_dispatch_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (channel) {
        query = query.eq('channel', channel);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
  });
}

// Estatísticas agregadas de notificações
export function useNotificationStats() {
  return useQuery({
    queryKey: ['notification-stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notification_dispatch_logs')
        .select('channel, status');

      if (error) throw error;

      const logs = data || [];
      
      // Agregar por canal
      const byChannel: Record<string, { sent: number; failed: number; total: number }> = {};
      
      logs.forEach((log: { channel: string; status: string }) => {
        if (!byChannel[log.channel]) {
          byChannel[log.channel] = { sent: 0, failed: 0, total: 0 };
        }
        byChannel[log.channel].total++;
        if (log.status === 'sent') {
          byChannel[log.channel].sent++;
        } else if (log.status === 'failed') {
          byChannel[log.channel].failed++;
        }
      });

      return {
        total: logs.length,
        byChannel,
        successRate: logs.length > 0 
          ? (logs.filter((l: { status: string }) => l.status === 'sent').length / logs.length * 100).toFixed(1)
          : 0,
      };
    },
  });
}
