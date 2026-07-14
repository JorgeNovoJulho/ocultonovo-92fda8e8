import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface UserCredits {
  id: string;
  user_id: string;
  credits_balance: number;
  credits_frozen: boolean;
  frozen_reason: string | null;
  frozen_at: string | null;
  frozen_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCredits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-credits', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // First get profile id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, balance, balance_frozen, balance_frozen_reason')
        .eq('user_id', user.id)
        .single();

      if (!profile) return null;

      // Get credits
      const { data: credits, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching credits:', error);
      }

      return {
        credits: credits as UserCredits | null,
        balance: profile.balance || 0,
        balanceFrozen: profile.balance_frozen || false,
        balanceFrozenReason: profile.balance_frozen_reason,
        maxConvertible: (profile.balance || 0) * 0.5,
      };
    },
    enabled: !!user?.id,
  });
}

export function useConvertToCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amount: number) => {
      if (amount < 0.50) {
        throw new Error('Valor mínimo de R$ 0,50');
      }

      const { data, error } = await supabase.rpc('convert_balance_to_credits', {
        p_amount: amount,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; new_balance?: number; credits_balance?: number };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao converter saldo');
      }

      return result;
    },
    onSuccess: (data) => {
      toast.success(`Convertido com sucesso! Você tem ${data.credits_balance} créditos`);
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useAdminFreezeBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      freezeBalance,
      freezeCredits,
      reason,
    }: {
      profileId: string;
      freezeBalance: boolean;
      freezeCredits: boolean;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc('admin_freeze_user_balance', {
        p_profile_id: profileId,
        p_freeze_balance: freezeBalance,
        p_freeze_credits: freezeCredits,
        p_reason: reason || null,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao congelar saldo');
      }

      return result;
    },
    onSuccess: (_, variables) => {
      const action = variables.freezeBalance || variables.freezeCredits ? 'congelado' : 'liberado';
      toast.success(`Saldo ${action} com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
