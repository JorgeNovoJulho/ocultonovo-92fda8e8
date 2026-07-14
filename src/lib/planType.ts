/**
 * Normaliza qualquer variante de plan_type para os 3 valores canônicos
 * usados pelo banco: 'free' | 'premium' | 'vip'.
 *
 * Suporta variações de UI/legado: 'Gratuito', 'gratuito', 'FREE',
 * 'Premium', 'monthly', 'mensal', 'annual', 'anual', 'VIP', etc.
 */
export type PlanType = 'free' | 'premium' | 'vip';

export function normalizePlanType(raw: string | null | undefined): PlanType {
  if (!raw) return 'free';
  const v = String(raw).trim().toLowerCase();

  if (v === 'vip') return 'vip';
  if (
    v === 'premium' ||
    v === 'monthly' ||
    v === 'mensal' ||
    v === 'annual' ||
    v === 'anual' ||
    v === 'yearly'
  ) {
    return 'premium';
  }
  // 'free', 'gratuito', '', desconhecido → free
  return 'free';
}

export function isFreePlan(raw: string | null | undefined): boolean {
  return normalizePlanType(raw) === 'free';
}

export function isPremiumPlan(raw: string | null | undefined): boolean {
  return normalizePlanType(raw) === 'premium';
}

export function isVipPlan(raw: string | null | undefined): boolean {
  return normalizePlanType(raw) === 'vip';
}
