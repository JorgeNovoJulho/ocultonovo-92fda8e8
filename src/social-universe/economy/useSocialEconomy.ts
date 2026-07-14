/**
 * useSocialEconomy — Prioridade 5
 * Catálogo de produtos sociais premium. Backend valida cooldown / daily_limit / min_plan.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface SocialEconomyProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  kind: string;
  price_cents: number;
  duration_minutes: number;
  cooldown_minutes: number;
  daily_limit: number;
  min_plan: 'free' | 'premium' | 'vip';
  multiplier: number;
  tier: string | null;
  payload: Record<string, unknown>;
  sort_order: number;
}

export function useSocialEconomyCatalog() {
  return useQuery({
    queryKey: ['social-economy-catalog'],
    queryFn: async (): Promise<SocialEconomyProduct[]> => {
      const { data } = await (supabase as any).rpc('social_economy_list');
      return (data ?? []) as SocialEconomyProduct[];
    },
    staleTime: 5 * 60_000,
  });
}

export async function checkCanPurchase(slug: string) {
  const { data } = await (supabase as any).rpc('social_economy_can_purchase', { p_slug: slug });
  return data as { ok: boolean; reason?: string; price_cents?: number; product_id?: string; min_plan?: string; next_at?: string; limit?: number };
}

export async function createSocialEconomyPurchase(
  slug: string,
  asaas_payment_id?: string,
  meta?: Record<string, unknown>,
) {
  const { data, error } = await (supabase as any).rpc('social_economy_purchase_create', {
    p_slug: slug,
    p_asaas_payment_id: asaas_payment_id ?? null,
    p_meta: meta ?? {},
  });
  if (error) throw error;
  return data as { ok: boolean; purchase_id?: string; product_slug?: string; amount_cents?: number; reason?: string };
}

export function useMySocialEconomyMetrics() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['social-economy-admin-metrics'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('social_economy_admin_metrics');
      return data as Record<string, unknown> | null;
    },
    staleTime: 60_000,
  });
}
