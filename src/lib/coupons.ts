import { supabase } from "@/lib/supabaseExternal";

export type CouponTarget =
  | "long_video"
  | "short_video"
  | "photo"
  | "photo_pack"
  | "video_pack"
  | "monthly_subscription"
  | "annual_subscription"
  | "super_dm";

export interface RedeemResult {
  ok: boolean;
  reason?: string;
  discount_percent?: number;
  amount_discounted?: number;
  coupon_id?: string;
}

/**
 * Validates and atomically redeems a creator coupon for the current user.
 * Each user can use each coupon only once (DB-enforced).
 */
export async function redeemCoupon(params: {
  code: string;
  creatorId: string;
  targetType: CouponTarget;
  targetId?: string | null;
  basePrice: number;
}): Promise<RedeemResult> {
  const { code, creatorId, targetType, targetId, basePrice } = params;
  const { data, error } = await (supabase as any).rpc("redeem_coupon", {
    p_code: code,
    p_creator: creatorId,
    p_target_type: targetType,
    p_target_id: targetId ?? null,
    p_amount: basePrice,
  });
  if (error) return { ok: false, reason: error.message };
  return data as RedeemResult;
}

export const COUPON_REASON_LABEL: Record<string, string> = {
  unauthenticated: "Faça login para usar cupons",
  not_found: "Cupom não encontrado",
  inactive: "Cupom inativo",
  expired: "Cupom expirado",
  sold_out: "Cupom esgotado",
  not_applicable: "Cupom não se aplica a este conteúdo",
  already_used: "Você já usou este cupom",
  forbidden: "Sem permissão",
};
