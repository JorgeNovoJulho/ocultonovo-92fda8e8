import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export interface EarlyBirdCounter {
  id: string;
  counter_type: string;
  max_count: number;
  current_count: number;
  bonus_months: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCoupon {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  valid_for_plans: string[];
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  is_first_subscription_only: boolean;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CouponValidationResult {
  valid: boolean;
  error?: string;
  coupon_id?: string;
  coupon_name?: string;
  discount_type?: string;
  discount_value?: number;
  discount_applied?: number;
  original_price?: number;
  final_price?: number;
}

// =====================================================
// EARLY BIRD HOOKS
// =====================================================

// Buscar todos os contadores com realtime
export function useEarlyBirdCounters() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub = subscribeTable('early_bird_counters', () => {
      queryClient.invalidateQueries({ queryKey: ['early-bird-counters'] });
    });

    return () => {
      unsub();
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['early-bird-counters'],
    queryFn: async (): Promise<EarlyBirdCounter[]> => {
      const { data, error } = await supabase
        .from('early_bird_counters')
        .select('*')
        .order('counter_type');

      if (error) throw error;
      return (data || []) as EarlyBirdCounter[];
    },
  });
}

// Buscar contador específico
export function useEarlyBirdCounter(type: string) {
  return useQuery({
    queryKey: ['early-bird-counters', type],
    queryFn: async (): Promise<EarlyBirdCounter | null> => {
      const { data, error } = await supabase
        .from('early_bird_counters')
        .select('*')
        .eq('counter_type', type)
        .maybeSingle();

      if (error) throw error;
      return data as EarlyBirdCounter | null;
    },
  });
}

// Hook de disponibilidade calculada (para UI)
export function useEarlyBirdAvailability() {
  const { data: counters } = useEarlyBirdCounters();

  const monthly = counters?.find((c) => c.counter_type === 'monthly');
  const annual = counters?.find((c) => c.counter_type === 'annual');

  return {
    monthly: {
      isActive: monthly?.is_active ?? false,
      available: Math.max(0, (monthly?.max_count ?? 0) - (monthly?.current_count ?? 0)),
      total: monthly?.max_count ?? 1000,
      bonusMonths: monthly?.bonus_months ?? 0,
    },
    annual: {
      isActive: annual?.is_active ?? false,
      available: Math.max(0, (annual?.max_count ?? 0) - (annual?.current_count ?? 0)),
      total: annual?.max_count ?? 1000,
      bonusMonths: annual?.bonus_months ?? 0,
    },
  };
}

// Atualizar contador Early Bird (admin)
export function useUpdateEarlyBirdCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<EarlyBirdCounter, 'max_count' | 'bonus_months' | 'is_active' | 'current_count'>>;
    }) => {
      const { error } = await supabase
        .from('early_bird_counters')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-bird-counters'] });
      toast({
        title: 'Configuração salva',
        description: 'As alterações foram aplicadas imediatamente.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Reiniciar contador Early Bird (admin) - usando RPC
export function useResetEarlyBirdCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (counterId: string) => {
      const { error } = await supabase.rpc('reset_early_bird_counter', {
        p_counter_id: counterId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-bird-counters'] });
      toast({
        title: 'Contador reiniciado!',
        description: 'A contagem foi zerada e a promoção está pronta para recomeçar.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao reiniciar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Claim slot Early Bird (usuário) - usando RPC
export function useClaimEarlyBirdSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (counterType: 'monthly' | 'annual') => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error } = await supabase.rpc('claim_early_bird_slot', {
        p_counter_type: counterType,
        p_user_id: user.id,
      });

      if (error) throw error;
      return data as {
        success: boolean;
        error?: string;
        bonus_months?: number;
        slots_remaining?: number;
        position?: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['early-bird-counters'] });
      if (data.success) {
        toast({
          title: '🎉 Vaga garantida!',
          description: `Você é o #${data.position}! Ganhou +${data.bonus_months} meses grátis!`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Criar novo contador Early Bird (admin)
export function useCreateEarlyBirdCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      counter_type: string;
      max_count: number;
      bonus_months: number;
      is_active: boolean;
    }) => {
      const { data, error } = await supabase.rpc('create_early_bird_counter', {
        p_counter_type: params.counter_type,
        p_max_count: params.max_count,
        p_bonus_months: params.bonus_months,
        p_is_active: params.is_active,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-bird-counters'] });
      toast({
        title: 'Promoção criada!',
        description: 'O novo contador Early Bird foi adicionado.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar promoção',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Deletar contador customizado (admin)
export function useDeleteEarlyBirdCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (counterId: string) => {
      const { error } = await supabase.rpc('delete_early_bird_counter', {
        p_counter_id: counterId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-bird-counters'] });
      toast({
        title: 'Promoção removida!',
        description: 'O contador Early Bird foi deletado.',
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

// =====================================================
// SUBSCRIPTION COUPON HOOKS
// =====================================================

// Buscar todos os cupons de assinatura
export function useSubscriptionCoupons() {
  return useQuery({
    queryKey: ['subscription-coupons'],
    queryFn: async (): Promise<SubscriptionCoupon[]> => {
      const { data, error } = await supabase
        .from('subscription_coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(coupon => ({
        ...coupon,
        valid_for_plans: coupon.valid_for_plans || ['monthly', 'annual', 'vip'],
      })) as SubscriptionCoupon[];
    },
  });
}

// Criar novo cupom de assinatura
export function useCreateSubscriptionCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (coupon: {
      code: string;
      name: string;
      description?: string | null;
      discount_type: 'fixed' | 'percentage';
      discount_value: number;
      max_uses?: number | null;
      is_first_subscription_only?: boolean;
      valid_for_plans?: string[];
      starts_at?: string;
      expires_at?: string | null;
      is_active?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('subscription_coupons')
        .insert({
          code: coupon.code,
          name: coupon.name,
          description: coupon.description || null,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          max_uses: coupon.max_uses ?? null,
          is_first_subscription_only: coupon.is_first_subscription_only ?? true,
          valid_for_plans: coupon.valid_for_plans ?? ['monthly', 'annual', 'vip'],
          starts_at: coupon.starts_at || new Date().toISOString(),
          expires_at: coupon.expires_at || null,
          is_active: coupon.is_active ?? true,
          created_by: user?.id,
          current_uses: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-coupons'] });
      toast({
        title: 'Cupom criado!',
        description: 'O novo cupom de assinatura foi adicionado.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar cupom',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Atualizar cupom de assinatura
export function useUpdateSubscriptionCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<SubscriptionCoupon, 'id' | 'created_at' | 'created_by'>>;
    }) => {
      const { error } = await supabase
        .from('subscription_coupons')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-coupons'] });
      toast({
        title: 'Cupom atualizado!',
        description: 'As alterações foram salvas.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Deletar cupom de assinatura
export function useDeleteSubscriptionCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('subscription_coupons')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-coupons'] });
      toast({
        title: 'Cupom removido!',
        description: 'O cupom foi deletado.',
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

// Validar cupom de assinatura (para checkout)
export function useValidateSubscriptionCoupon() {
  return useMutation({
    mutationFn: async ({
      code,
      planType,
      originalPrice,
    }: {
      code: string;
      planType: string;
      originalPrice: number;
    }): Promise<CouponValidationResult> => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { valid: false, error: 'Usuário não autenticado' };
      }

      const { data, error } = await supabase.rpc('validate_subscription_coupon', {
        p_code: code,
        p_user_id: user.id,
        p_plan_type: planType,
        p_original_price: originalPrice,
      });

      if (error) throw error;
      return data as unknown as CouponValidationResult;
    },
  });
}
