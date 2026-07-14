import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { createAdminNotification } from './useAdminNotifications';

const PLATFORM_FEE_RATE = 0.20;
const DAILY_LIMIT = 1000;
const MONTHLY_MAX_WITHDRAWALS = 4;

export interface WithdrawalRequest {
  id: string;
  amount: number;
  platform_fee: number;
  net_amount: number;
  pix_key_type: string;
  pix_key: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

export interface CreatorWalletBalance {
  creator_id: string;
  pending_balance: number;
  available_balance: number;
  blocked_balance: number;
  total_earned: number;
  total_withdrawn: number;
  updated_at: string;
}

export function useCreatorWalletBalance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto-creator-wallet', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<CreatorWalletBalance | null> => {
      const { data, error } = await (supabase as any).rpc('oculto_get_my_wallet');
      if (error) {
        console.warn('[useCreatorWalletBalance] rpc error:', error.message);
        return null;
      }
      return (data as CreatorWalletBalance) || null;
    },
  });
}

export function useWalletLedger(limit = 50) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto-wallet-ledger', user?.id, limit],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: prof } = await (supabase as any)
        .from('profiles').select('id').eq('user_id', user!.id).maybeSingle();
      if (!prof?.id) return [];
      const { data, error } = await (supabase as any)
        .from('oculto_wallet_ledger')
        .select('*')
        .eq('creator_id', prof.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      return data || [];
    },
  });
}

export function useCreatorWallet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profileId } = useQuery({
    queryKey: ['creator-wallet-profile-id', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.id || null;
    },
  });

  // Fetch withdrawal history
  const { data: withdrawals = [], isLoading: withdrawalsLoading } = useQuery({
    queryKey: ['withdrawal-requests', profileId],
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      if (!profileId) return [];
      const { data, error } = await (supabase as any)
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as WithdrawalRequest[];
    },
    enabled: !!profileId,
    staleTime: 2 * 60_000,
  });

  // Compute limits locally from fetched withdrawals
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const activeWithdrawals = withdrawals.filter(w => w.status !== 'rejected');

  const dailyTotal = activeWithdrawals
    .filter(w => new Date(w.created_at) >= twentyFourHoursAgo)
    .reduce((sum, w) => sum + w.amount, 0);

  const monthlyCount = activeWithdrawals
    .filter(w => {
      const d = new Date(w.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

  const dailyRemaining = Math.max(0, DAILY_LIMIT - dailyTotal);
  const monthlyRemaining = Math.max(0, MONTHLY_MAX_WITHDRAWALS - monthlyCount);

  const limits = {
    dailyTotal,
    dailyRemaining,
    dailyLimit: DAILY_LIMIT,
    monthlyCount,
    monthlyRemaining,
    monthlyMax: MONTHLY_MAX_WITHDRAWALS,
    canWithdraw: dailyRemaining > 0 && monthlyRemaining > 0,
  };

  // Save PIX key to profile
  const savePixKey = useMutation({
    mutationFn: async ({ pixKeyType, pixKey }: { pixKeyType: string; pixKey: string }) => {
      if (!profileId) throw new Error('Profile not found');
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ pix_key_type: pixKeyType, pix_key: pixKey })
        .eq('id', profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Chave PIX salva com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => {
      toast({ title: 'Erro ao salvar chave PIX', variant: 'destructive' });
    },
  });

  // Request withdrawal
  const requestWithdrawal = useMutation({
    mutationFn: async ({ amount, pixKeyType, pixKey, grossBalance }: {
      amount: number;
      pixKeyType: string;
      pixKey: string;
      grossBalance: number;
    }) => {
      if (!profileId) throw new Error('Profile not found');

      const netBalance = grossBalance * (1 - PLATFORM_FEE_RATE);
      if (amount > netBalance) throw new Error('Saldo insuficiente');
      if (amount < 250) throw new Error('Valor mínimo: R$ 250,00');
      if (amount > dailyRemaining) throw new Error(`Limite diário de R$ ${DAILY_LIMIT.toFixed(2)} atingido. Restante: R$ ${dailyRemaining.toFixed(2)}`);
      if (monthlyRemaining <= 0) throw new Error(`Você já atingiu o limite de ${MONTHLY_MAX_WITHDRAWALS} saques este mês`);

      const platformFee = amount * PLATFORM_FEE_RATE;
      const netAmount = amount - platformFee;

      const { error } = await (supabase as any)
        .from('withdrawal_requests')
        .insert({
          user_id: profileId,
          amount,
          platform_fee: platformFee,
          net_amount: netAmount,
          pix_key_type: pixKeyType,
          pix_key: pixKey,
          status: 'pending',
        });
      if (error) {
        // Parse DB trigger errors
        const msg = error.message || '';
        if (msg.includes('Limite diário')) throw new Error('Limite diário de R$ 1.000,00 atingido');
        if (msg.includes('limite de 4 saques')) throw new Error('Você já atingiu o limite de 4 saques este mês');
        throw error;
      }

      await createAdminNotification({
        type: 'withdrawal_request',
        title: '💰 Nova Solicitação de Saque',
        body: `Saque de R$ ${amount.toFixed(2)} solicitado via PIX (${pixKeyType}).`,
        data: { user_id: profileId, amount, net_amount: netAmount },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Saque solicitado!',
        description: 'Será processado em até 3 dias úteis após aprovação.',
      });
      queryClient.invalidateQueries({ queryKey: ['withdrawal-requests'] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || 'Erro ao solicitar saque', variant: 'destructive' });
    },
  });

  // Request special limit exception
  const requestException = useMutation({
    mutationFn: async ({ amount, justification }: { amount: number; justification: string }) => {
      if (!profileId) throw new Error('Profile not found');
      const { error } = await (supabase as any)
        .from('withdrawal_exceptions')
        .insert({
          user_id: profileId,
          requested_amount: amount,
          justification,
        });
      if (error) throw error;

      await createAdminNotification({
        type: 'special_withdrawal_request',
        title: '⚠️ Solicitação de Limite Especial',
        body: `Criador solicitou limite de R$ ${amount.toFixed(2)} para saque.`,
        data: { user_id: profileId, amount },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Solicitação enviada!',
        description: 'O administrador analisará seu pedido em breve.',
      });
      queryClient.invalidateQueries({ queryKey: ['withdrawal-exceptions'] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || 'Erro ao solicitar limite especial', variant: 'destructive' });
    },
  });

  // Fetch user's exceptions
  const { data: exceptions = [] } = useQuery({
    queryKey: ['withdrawal-exceptions', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await (supabase as any)
        .from('withdrawal_exceptions')
        .select('*')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profileId,
    staleTime: 2 * 60_000,
  });

  const hasApprovedUnusedException = exceptions.some(
    (e: any) => e.status === 'approved' && !e.is_used
  );
  const hasPendingException = exceptions.some((e: any) => e.status === 'pending');

  return {
    withdrawals,
    withdrawalsLoading,
    limits,
    exceptions,
    hasApprovedUnusedException,
    hasPendingException,
    savePixKey: savePixKey.mutate,
    isSavingPix: savePixKey.isPending,
    requestWithdrawal: requestWithdrawal.mutate,
    isRequesting: requestWithdrawal.isPending,
    requestException: requestException.mutate,
    isRequestingException: requestException.isPending,
  };
}
