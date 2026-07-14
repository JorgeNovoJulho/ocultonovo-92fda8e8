import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAudit } from '@/hooks/useAudit';
import { toast } from 'sonner';
import { addMonths, addYears } from 'date-fns';

export interface UserBillingData {
  id: string;
  user_id?: string;
  name: string;
  username: string | null;
  email?: string | null;
  avatar_url: string | null;
  plan_type: 'free' | 'premium' | 'vip';
  payment_status: 'active' | 'overdue' | 'suspended';
  payment_due_date: string | null;
  is_creator: boolean;
  is_verified: boolean;
  balance: number;
  balance_frozen: boolean;
  account_status?: string;
  created_at?: string;
}

// Search users by name, username, or email (using RPC)
export function useSearchUsersForBilling(query: string) {
  return useQuery({
    queryKey: ['admin-user-billing-search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];

      // Try to use RPC first for email search
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('search_users_with_email', { p_query: query });

      if (!rpcError && rpcData) {
        return (rpcData || []).map((user: any) => ({
          id: user.id,
          user_id: user.user_id,
          name: user.name,
          username: user.username,
          email: user.email,
          avatar_url: user.avatar_url,
          plan_type: (user.plan_type || 'free') as 'free' | 'premium' | 'vip',
          payment_status: (user.payment_status || 'active') as 'active' | 'overdue' | 'suspended',
          payment_due_date: user.payment_due_date,
          is_creator: user.is_creator || false,
          is_verified: user.is_verified || false,
          balance: user.balance || 0,
          balance_frozen: user.balance_frozen || false,
          created_at: user.created_at,
        })) as UserBillingData[];
      }

      // Fallback to direct query if RPC fails
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, plan_type, payment_status, payment_due_date, is_creator, is_verified, balance, balance_frozen, account_status')
        .or(`name.ilike.%${query}%,username.ilike.%${query}%`)
        .order('name')
        .limit(20);

      if (error) throw error;

      return (data || []).map(user => ({
        id: user.id,
        name: user.name,
        username: user.username,
        avatar_url: user.avatar_url,
        plan_type: (user.plan_type || 'free') as 'free' | 'premium' | 'vip',
        payment_status: (user.payment_status || 'active') as 'active' | 'overdue' | 'suspended',
        payment_due_date: user.payment_due_date,
        is_creator: user.is_creator || false,
        is_verified: user.is_verified || false,
        balance: user.balance || 0,
        balance_frozen: user.balance_frozen || false,
        account_status: user.account_status || 'active',
      })) as UserBillingData[];
    },
    enabled: query.length >= 2,
  });
}

// Get single user billing data
export function useUserBillingById(userId: string | null) {
  return useQuery({
    queryKey: ['admin-user-billing', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, plan_type, payment_status, payment_due_date, is_creator, is_verified, balance, balance_frozen, account_status')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        username: data.username,
        avatar_url: data.avatar_url,
        plan_type: (data.plan_type || 'free') as 'free' | 'premium' | 'vip',
        payment_status: (data.payment_status || 'active') as 'active' | 'overdue' | 'suspended',
        payment_due_date: data.payment_due_date,
        is_creator: data.is_creator || false,
        is_verified: data.is_verified || false,
        balance: data.balance || 0,
        balance_frozen: data.balance_frozen || false,
        account_status: data.account_status || 'active',
      } as UserBillingData;
    },
    enabled: !!userId,
  });
}

interface UpdateBillingParams {
  userId: string;
  updates: Partial<{
    plan_type: 'free' | 'premium' | 'vip';
    payment_status: 'active' | 'overdue' | 'suspended';
    payment_due_date: string | null;
    is_creator: boolean;
    is_verified: boolean;
    balance: number;
    balance_frozen: boolean;
  }>;
}

// Update user billing data
export function useUpdateUserBilling() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ userId, updates }: UpdateBillingParams) => {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;

      return { userId, updates };
    },
    onSuccess: async ({ userId, updates }) => {
      // Log each change
      const changeDetails = Object.entries(updates)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      await logAction('setting_changed', {
        targetResource: 'profile',
        targetId: userId,
        details: { changes: changeDetails },
      });

      // Also log to discipline_history with a valid action type
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('discipline_history').insert({
          profile_id: userId,
          action_type: 'warning', // Using valid action type
          reason: `Billing atualizado: ${changeDetails}`,
          admin_id: user.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['admin-user-billing'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-billing-search'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Dados de billing atualizados com sucesso');
    },
    onError: (error) => {
      console.error('Error updating billing:', error);
      toast.error('Erro ao atualizar dados de billing');
    },
  });
}

// Grant VIP access
export function useGrantVipAccess() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ userId, months }: { userId: string; months: number }) => {
      const dueDate = months === 12 
        ? addYears(new Date(), 1) 
        : addMonths(new Date(), months);

      const { error } = await supabase
        .from('profiles')
        .update({
          plan_type: 'vip',
          payment_status: 'active',
          payment_due_date: dueDate.toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      return { userId, months, dueDate };
    },
    onSuccess: async ({ userId, months, dueDate }) => {
      await logAction('setting_changed', {
        targetResource: 'profile',
        targetId: userId,
        details: { action: 'grant_vip', months, due_date: dueDate.toISOString() },
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('discipline_history').insert({
          profile_id: userId,
          action_type: 'grant_plan',
          reason: `VIP concedido por ${months} meses`,
          admin_id: user.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['admin-user-billing'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-billing-search'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`✨ VIP concedido por ${months} meses!`);
    },
    onError: (error) => {
      console.error('Error granting VIP:', error);
      toast.error('Erro ao conceder VIP');
    },
  });
}

// Reset to free plan
export function useResetToFreePlan() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          plan_type: 'free',
          payment_status: 'active',
          payment_due_date: null,
        })
        .eq('id', userId);

      if (error) throw error;

      return userId;
    },
    onSuccess: async (userId) => {
      await logAction('setting_changed', {
        targetResource: 'profile',
        targetId: userId,
        details: { action: 'reset_to_free' },
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('discipline_history').insert({
          profile_id: userId,
          action_type: 'restore', // Using valid action type for reset
          reason: 'Plano resetado para Free',
          admin_id: user.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['admin-user-billing'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-billing-search'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Plano resetado para Free');
    },
    onError: (error) => {
      console.error('Error resetting plan:', error);
      toast.error('Erro ao resetar plano');
    },
  });
}

// Mark as paid
export function useMarkAsPaid() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          payment_status: 'active',
        })
        .eq('id', userId);

      if (error) throw error;

      return userId;
    },
    onSuccess: async (userId) => {
      await logAction('setting_changed', {
        targetResource: 'profile',
        targetId: userId,
        details: { action: 'mark_as_paid' },
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('discipline_history').insert({
          profile_id: userId,
          action_type: 'restore', // Using valid action type
          reason: 'Marcado como pago manualmente',
          admin_id: user.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['admin-user-billing'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-billing-search'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('✅ Marcado como pago!');
    },
    onError: (error) => {
      console.error('Error marking as paid:', error);
      toast.error('Erro ao marcar como pago');
    },
  });
}

// Extend payment due date
export function useExtendPaymentDueDate() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ userId, months }: { userId: string; months: number }) => {
      // Get current due date
      const { data: profile } = await supabase
        .from('profiles')
        .select('payment_due_date')
        .eq('id', userId)
        .single();

      const currentDate = profile?.payment_due_date 
        ? new Date(profile.payment_due_date) 
        : new Date();
      
      const newDueDate = addMonths(currentDate, months);

      const { error } = await supabase
        .from('profiles')
        .update({
          payment_due_date: newDueDate.toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      return { userId, months, newDueDate };
    },
    onSuccess: async ({ userId, months, newDueDate }) => {
      await logAction('setting_changed', {
        targetResource: 'profile',
        targetId: userId,
        details: { action: 'extend_due_date', months, new_due_date: newDueDate.toISOString() },
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('discipline_history').insert({
          profile_id: userId,
          action_type: 'grant_plan', // Using valid action type
          reason: `Vencimento estendido em ${months} meses`,
          admin_id: user.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['admin-user-billing'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-billing-search'] });
      toast.success(`Vencimento estendido em ${months} meses`);
    },
    onError: (error) => {
      console.error('Error extending due date:', error);
      toast.error('Erro ao estender vencimento');
    },
  });
}

// Get billing history for a user
export function useUserBillingHistory(userId: string | null) {
  return useQuery({
    queryKey: ['admin-user-billing-history', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('discipline_history')
        .select(`
          id,
          action_type,
          reason,
          admin_id,
          created_at
        `)
        .eq('profile_id', userId)
        .in('action_type', ['grant_plan', 'restore', 'warning'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Fetch admin names separately
      const adminIds = [...new Set((data || []).map(d => d.admin_id))];
      const { data: admins } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', adminIds);

      const adminMap = new Map((admins || []).map(a => [a.id, a]));

      return (data || []).map(entry => ({
        ...entry,
        performer: adminMap.get(entry.admin_id) || null,
      }));
    },
    enabled: !!userId,
  });
}
