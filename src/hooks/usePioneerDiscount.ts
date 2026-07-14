import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuthStore } from "@/store/useAuthStore";

const PIONEER_DISCOUNT = 0.25; // 25%

export interface PioneerStatus {
  isPioneer: boolean;
  discountPercent: number;
  slotsRemaining: number;
  slotsFilled: number;
  slotsTotal: number;
  isFull: boolean;
}

export function usePioneerStatus(): PioneerStatus {
  const user = useAuthStore((s) => s.user);

  const { data: profile } = useQuery({
    queryKey: ["pioneer-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("is_pioneiro")
        .eq("user_id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: slots } = useQuery({
    queryKey: ["pioneer-slots"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_pioneer_slots_status");
      if (error) throw error;
      return data as { total: number; filled: number; remaining: number; is_full: boolean };
    },
    staleTime: 5 * 60_000, // Cache 5 min to reduce DB load on C55
  });

  const isPioneer = profile?.is_pioneiro === true;

  return {
    isPioneer,
    discountPercent: isPioneer ? PIONEER_DISCOUNT * 100 : 0,
    slotsRemaining: slots?.remaining ?? 1000,
    slotsFilled: slots?.filled ?? 0,
    slotsTotal: slots?.total ?? 1000,
    isFull: slots?.is_full ?? false,
  };
}

/** Calculate discounted price */
export function applyPioneerDiscount(price: number, isPioneer: boolean): number {
  if (!isPioneer) return price;
  return Math.round(price * (1 - PIONEER_DISCOUNT) * 100) / 100;
}
