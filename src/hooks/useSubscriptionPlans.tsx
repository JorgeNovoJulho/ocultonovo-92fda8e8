import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { toast } from '@/hooks/use-toast';
import { useEffect } from 'react';
import { fetchCreatorPlans } from '@/lib/creatorPlanPersistence';

// ─── System-level plans (admin, platform tiers) ────────────────────────────
// Tabela isolada: oculto_platform_plans (Free, Premium, VIP)
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  plan_type: string;
  price_monthly: number;
  price_annual_per_month: number;
  price_annual_total: number;
  features: string[];
  restrictions: string[];
  limits: Record<string, number>;
  is_active: boolean;
  is_popular: boolean;
  is_default: boolean;
  display_order: number;
  cta_text: string | null;
  created_at: string;
  updated_at: string;
}

const PLATFORM_PLANS_TABLE = 'oculto_platform_plans' as const;

const mapRow = (row: any): SubscriptionPlan => ({
  id: row.id,
  name: row.name,
  description: row.description,
  slug: row.slug,
  plan_type: row.plan_type,
  price_monthly: Number(row.price_monthly ?? 0),
  price_annual_per_month: Number(row.price_annual_per_month ?? 0),
  price_annual_total: Number(row.price_annual_total ?? 0),
  features: parseJsonArray(row.features),
  restrictions: parseJsonArray(row.restrictions),
  limits: (row.limits && typeof row.limits === 'object' && !Array.isArray(row.limits)) ? row.limits as Record<string, number> : {},
  is_active: row.is_active ?? true,
  is_popular: row.is_popular ?? false,
  is_default: row.is_default ?? false,
  display_order: row.display_order ?? 0,
  cta_text: row.cta_text ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// ─── Creator-level plans (per-creator VIP subscription plans) ───────────────
export interface CreatorPlan {
  id: string;
  profile_id: string;
  title: string;
  bio: string | null;
  banner_url: string | null;
  monthly_price: number;
  annual_price: number | null;
  lifetime_price: number | null;
  is_enabled: boolean;
  sort_order: number;
  plan_type?: string | null;
  accepts_pix?: boolean | null;
  accepts_card?: boolean | null;
  affiliate_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

// Helper para converter array JSON para string[]
const parseJsonArray = (arr: unknown): string[] => {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => (typeof item === 'string' ? item : String(item)));
};

// ─── System plans hooks ─────────────────────────────────────────────────────

export function useSubscriptionPlans() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub = subscribeTable(PLATFORM_PLANS_TABLE, () =>
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] }),
    );
    return () => unsub();
  }, [queryClient]);

  return useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await (supabase as any)
        .from(PLATFORM_PLANS_TABLE)
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(mapRow);
    },
    // Dados quase estáticos — realtime na tabela invalida quando muda.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useActivePlans() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub = subscribeTable(PLATFORM_PLANS_TABLE, () =>
      queryClient.invalidateQueries({ queryKey: ['subscription-plans', 'active'] }),
    );
    return () => unsub();
  }, [queryClient]);

  return useQuery({
    queryKey: ['subscription-plans', 'active'],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await (supabase as any)
        .from(PLATFORM_PLANS_TABLE)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(mapRow);
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: Partial<Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>>) => {
      const payload: any = {
        name: plan.name,
        slug: plan.slug,
        plan_type: plan.plan_type,
        description: plan.description ?? null,
        price_monthly: plan.price_monthly ?? 0,
        price_annual_per_month: plan.price_annual_per_month ?? 0,
        price_annual_total: plan.price_annual_total ?? 0,
        features: plan.features ?? [],
        restrictions: plan.restrictions ?? [],
        limits: plan.limits ?? {},
        is_active: plan.is_active ?? true,
        is_popular: plan.is_popular ?? false,
        is_default: plan.is_default ?? false,
        display_order: plan.display_order ?? 0,
        cta_text: plan.cta_text ?? null,
      };
      const { data, error } = await (supabase as any)
        .from(PLATFORM_PLANS_TABLE)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast({ title: 'Plano criado', description: 'O novo plano foi adicionado com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(PLATFORM_PLANS_TABLE).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast({ title: 'Plano removido', description: 'O plano foi deletado com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>> }) => {
      const payload: any = { ...updates, updated_at: new Date().toISOString() };
      const { error } = await (supabase as any)
        .from(PLATFORM_PLANS_TABLE)
        .update(payload)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast({ title: 'Plano atualizado', description: 'As alterações foram salvas com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useTogglePlanStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await (supabase as any)
        .from(PLATFORM_PLANS_TABLE)
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, is_active')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Sem permissão para atualizar este plano (RLS).');
      return data;
    },
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ['subscription-plans'] });
      const prev = queryClient.getQueryData<any[]>(['subscription-plans']);
      if (prev) {
        queryClient.setQueryData<any[]>(['subscription-plans'],
          prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p))
        );
      }
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['subscription-plans'], ctx.prev);
      toast({ title: 'Erro ao atualizar plano', description: error.message, variant: 'destructive' });
    },
    onSuccess: (_, { isActive }) => {
      toast({ title: isActive ? 'Plano ativado' : 'Plano desativado' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
    },
  });
}

export function useReorderPlans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; display_order: number }[]) => {
      for (const update of updates) {
        const { error } = await (supabase as any)
          .from(PLATFORM_PLANS_TABLE)
          .update({ display_order: update.display_order, updated_at: new Date().toISOString() })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast({ title: 'Ordem atualizada!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao reordenar', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Ghost mode ─────────────────────────────────────────────────────────────

export function useGhostModeConfig() {
  return useQuery({
    queryKey: ['ghost-mode-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['ghost_mode_price', 'ghost_mode_enabled']);
      if (error) throw error;
      const config = { price: 9.99, enabled: true };
      (data || []).forEach((setting) => {
        if (setting.key === 'ghost_mode_price') {
          const rawValue = setting.value;
          let parsed: number;
          if (typeof rawValue === 'number') parsed = rawValue;
          else if (typeof rawValue === 'string') parsed = parseFloat(rawValue.replace(/"/g, ''));
          else parsed = 9.99;
          config.price = isNaN(parsed) ? 9.99 : parsed;
        }
        if (setting.key === 'ghost_mode_enabled') {
          config.enabled = setting.value === true || setting.value === 'true';
        }
      });
      return config;
    },
  });
}

export function useUpdateGhostModeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ price, enabled }: { price?: number; enabled?: boolean }) => {
      if (price !== undefined) {
        const { error } = await supabase.from('system_settings').update({ value: price.toString() }).eq('key', 'ghost_mode_price');
        if (error) throw error;
      }
      if (enabled !== undefined) {
        const { error } = await supabase.from('system_settings').update({ value: enabled }).eq('key', 'ghost_mode_enabled');
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ghost-mode-config'] });
      toast({ title: 'Configuração salva', description: 'As configurações do Modo Fantasma foram atualizadas.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Creator plans hooks ────────────────────────────────────────────────────

export function useCreatorPlans(profileId: string | null) {
  return useQuery({
    queryKey: ['creator-plans', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<CreatorPlan[]> => fetchCreatorPlans(profileId!),
  });
}
