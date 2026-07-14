import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface EmailLog {
  id: string;
  template_key: string;
  recipient_email: string;
  recipient_user_id: string | null;
  subject: string | null;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  resend_message_id: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface EmailStats {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_failed: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export interface TemplatePerformance {
  template_key: string;
  total_sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  open_rate: number;
  click_rate: number;
}

export interface DailyEmailStats {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export function useEmailStats(days: number = 30) {
  return useQuery({
    queryKey: ['email-stats', days],
    queryFn: async (): Promise<EmailStats> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('email_logs')
        .select('status')
        .gte('created_at', startDate.toISOString());

      if (error) throw error;

      const logs = data || [];
      const total_sent = logs.length;
      const total_delivered = logs.filter(l => l.status === 'delivered').length;
      const total_opened = logs.filter(l => l.status === 'opened').length;
      const total_clicked = logs.filter(l => l.status === 'clicked').length;
      const total_bounced = logs.filter(l => l.status === 'bounced').length;
      const total_failed = logs.filter(l => l.status === 'failed').length;

      return {
        total_sent,
        total_delivered,
        total_opened,
        total_clicked,
        total_bounced,
        total_failed,
        open_rate: total_sent > 0 ? (total_opened / total_sent) * 100 : 0,
        click_rate: total_sent > 0 ? (total_clicked / total_sent) * 100 : 0,
        bounce_rate: total_sent > 0 ? (total_bounced / total_sent) * 100 : 0,
      };
    },
  });
}

export function useEmailLogs(limit: number = 50, templateFilter?: string) {
  return useQuery({
    queryKey: ['email-logs', limit, templateFilter],
    queryFn: async (): Promise<EmailLog[]> => {
      let query = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (templateFilter) {
        query = query.eq('template_key', templateFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as EmailLog[];
    },
  });
}

export function useTemplatePerformance(days: number = 30) {
  return useQuery({
    queryKey: ['template-performance', days],
    queryFn: async (): Promise<TemplatePerformance[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('email_logs')
        .select('template_key, status')
        .gte('created_at', startDate.toISOString());

      if (error) throw error;

      const logs = data || [];
      const byTemplate: Record<string, { sent: number; opened: number; clicked: number; bounced: number }> = {};

      logs.forEach(log => {
        if (!byTemplate[log.template_key]) {
          byTemplate[log.template_key] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
        }
        byTemplate[log.template_key].sent++;
        if (log.status === 'opened') byTemplate[log.template_key].opened++;
        if (log.status === 'clicked') byTemplate[log.template_key].clicked++;
        if (log.status === 'bounced') byTemplate[log.template_key].bounced++;
      });

      return Object.entries(byTemplate).map(([template_key, stats]) => ({
        template_key,
        total_sent: stats.sent,
        opened: stats.opened,
        clicked: stats.clicked,
        bounced: stats.bounced,
        open_rate: stats.sent > 0 ? (stats.opened / stats.sent) * 100 : 0,
        click_rate: stats.sent > 0 ? (stats.clicked / stats.sent) * 100 : 0,
      }));
    },
  });
}

export function useDailyEmailStats(days: number = 30) {
  return useQuery({
    queryKey: ['daily-email-stats', days],
    queryFn: async (): Promise<DailyEmailStats[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('email_logs')
        .select('created_at, status')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      const logs = data || [];
      const byDay: Record<string, DailyEmailStats> = {};

      // Initialize all days
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        byDay[dateStr] = { date: dateStr, sent: 0, opened: 0, clicked: 0, bounced: 0 };
      }

      logs.forEach(log => {
        const dateStr = log.created_at.split('T')[0];
        if (!byDay[dateStr]) {
          byDay[dateStr] = { date: dateStr, sent: 0, opened: 0, clicked: 0, bounced: 0 };
        }
        byDay[dateStr].sent++;
        if (log.status === 'opened') byDay[dateStr].opened++;
        if (log.status === 'clicked') byDay[dateStr].clicked++;
        if (log.status === 'bounced') byDay[dateStr].bounced++;
      });

      return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

export function useBouncedEmails(limit: number = 20) {
  return useQuery({
    queryKey: ['bounced-emails', limit],
    queryFn: async (): Promise<EmailLog[]> => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .eq('status', 'bounced')
        .order('bounced_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as EmailLog[];
    },
  });
}
