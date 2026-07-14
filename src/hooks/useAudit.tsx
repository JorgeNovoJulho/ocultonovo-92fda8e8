import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface AuditLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_resource: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  admin_profile?: {
    name: string;
    avatar_url: string | null;
  };
}

export type AuditActionType = 
  | 'user_banned'
  | 'user_unbanned'
  | 'user_verified'
  | 'user_unverified'
  | 'user_impersonated'
  | 'impersonation_ended'
  | 'role_assigned'
  | 'role_removed'
  | 'setting_changed'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'coupon_deactivated'
  | 'withdrawal_approved'
  | 'withdrawal_rejected'
  | 'feedback_updated'
  | 'staff_created'
  | 'staff_updated'
  | 'staff_activated'
  | 'staff_deactivated'
  | 'staff_removed'
  // Ações sensíveis durante impersonificação
  | 'sensitive_route_accessed'
  | 'messages_viewed'
  | 'financial_data_viewed'
  | 'private_media_viewed'
  // Ações de sistema (FASE 1)
  | 'system_broadcast'
  | 'flash_sale_activated'
  | 'flash_sale_deactivated'
  | 'ab_test_created'
  | 'ab_test_updated'
  | 'waitlist_exported';

// Create audit log entry
export function useCreateAuditLog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionType,
      targetResource,
      targetId,
      details,
    }: {
      actionType: AuditActionType;
      targetResource?: string;
      targetId?: string;
      details?: Record<string, unknown>;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await (supabase as any)
        .from('audit_logs')
        .insert({
          admin_id: user.id,
          action: actionType,
          action_type: actionType,
          target_resource: targetResource || null,
          target_id: targetId || null,
          details: details || null,
          user_agent: navigator.userAgent,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// Fetch audit logs (admin only)
export function useAuditLogs(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['audit-logs', limit],
    queryFn: async (): Promise<AuditLog[]> => {
      if (!user) return [];

      const { data: logs, error } = await (supabase as any)
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      const list = (logs || []) as any[];
      if (list.length === 0) return [] as AuditLog[];

      const adminIds = [...new Set(list.map((l) => l.admin_id).filter(Boolean))];
      const { data: admins } = adminIds.length
        ? await (supabase as any).from('v_public_profiles').select('id, name, avatar_url').in('id', adminIds)
        : { data: [] as any[] };
      const adminMap = new Map<string, any>((admins || []).map((a: any) => [a.id, a]));
      return list.map((l) => ({ ...l, admin_profile: adminMap.get(l.admin_id) || null })) as AuditLog[];
    },
    enabled: !!user,
  });
}

// Convenience hook for logging actions
export function useAudit() {
  const createLog = useCreateAuditLog();

  const logAction = async (
    actionType: AuditActionType,
    options?: {
      targetResource?: string;
      targetId?: string;
      details?: Record<string, unknown>;
    }
  ) => {
    try {
      await createLog.mutateAsync({
        actionType,
        targetResource: options?.targetResource,
        targetId: options?.targetId,
        details: options?.details,
      });
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  };

  return {
    logAction,
    isLogging: createLog.isPending,
  };
}
