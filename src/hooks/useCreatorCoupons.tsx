import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";

export type CouponAppliesTo =
  | "long_video"
  | "short_video"
  | "photo"
  | "photo_pack"
  | "video_pack"
  | "monthly_subscription"
  | "annual_subscription"
  | "super_dm";

export const COUPON_TARGETS: { value: CouponAppliesTo; label: string }[] = [
  { value: "long_video", label: "Vídeos longos" },
  { value: "short_video", label: "Vídeos curtos" },
  { value: "photo", label: "Imagens / Fotos únicas" },
  { value: "photo_pack", label: "Pack de fotos" },
  { value: "video_pack", label: "Pack de vídeos" },
  { value: "monthly_subscription", label: "Assinatura mensal" },
  { value: "annual_subscription", label: "Assinatura anual" },
  { value: "super_dm", label: "Super DM" },
];

export interface CreatorCoupon {
  id: string;
  creator_id: string;
  code: string;
  discount_percent: number;
  applies_to: CouponAppliesTo[];
  valid_from: string;
  valid_until: string;
  max_uses: number;
  uses_count: number;
  is_active: boolean;
  posted_to_feed: boolean;
  created_at: string;
  updated_at: string;
}

export function useCreatorCoupons(creatorId?: string) {
  return useQuery({
    queryKey: ["creator-coupons", creatorId],
    enabled: !!creatorId,
    staleTime: 30_000,
    queryFn: async (): Promise<CreatorCoupon[]> => {
      const { data, error } = await (supabase as any)
        .from("oculto_creator_coupons")
        .select("*")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CreatorCoupon[];
    },
  });
}

export function useActiveCreatorCoupons(creatorId?: string) {
  return useQuery({
    queryKey: ["creator-coupons-active", creatorId],
    enabled: !!creatorId,
    staleTime: 60_000,
    queryFn: async (): Promise<CreatorCoupon[]> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("oculto_creator_coupons")
        .select("*")
        .eq("creator_id", creatorId)
        .eq("is_active", true)
        .lte("valid_from", nowIso)
        .gte("valid_until", nowIso)
        .order("discount_percent", { ascending: false });
      if (error) throw error;
      return ((data || []) as CreatorCoupon[]).filter((c) => c.uses_count < c.max_uses);
    },
  });
}

export function useUpsertCoupon(creatorId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CreatorCoupon> & { id?: string }) => {
      if (!creatorId) throw new Error("creator obrigatório");
      const payload = { ...input, creator_id: creatorId };
      const { data, error } = await (supabase as any)
        .from("oculto_creator_coupons")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as CreatorCoupon;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator-coupons", creatorId] });
      qc.invalidateQueries({ queryKey: ["creator-coupons-active", creatorId] });
      toast.success("Cupom salvo");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar cupom"),
  });
}

export function useToggleCoupon(creatorId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("oculto_creator_coupons")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator-coupons", creatorId] });
      qc.invalidateQueries({ queryKey: ["creator-coupons-active", creatorId] });
    },
  });
}

export function useCouponRedemptions(couponId?: string) {
  return useQuery({
    queryKey: ["coupon-redemptions", couponId],
    enabled: !!couponId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oculto_coupon_redemptions")
        .select("id, user_id, target_type, target_id, amount_discounted, redeemed_at")
        .eq("coupon_id", couponId)
        .order("redeemed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCouponAnalytics(creatorId?: string) {
  return useQuery({
    queryKey: ["coupon-analytics", creatorId],
    enabled: !!creatorId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("creator_coupon_analytics", { p_creator: creatorId });
      if (error) throw error;
      return data || { total_redemptions: 0, total_discounted: 0, by_day: [], by_type: {} };
    },
  });
}
