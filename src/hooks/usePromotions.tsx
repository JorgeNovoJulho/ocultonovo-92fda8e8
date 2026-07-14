import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useEffect } from "react";
import { toast } from "sonner";

export interface Promotion {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  rules: string | null;
  type: "referral" | "cashback" | "bonus_plan" | "creator_commission" | "custom";
  reward_value: number;
  is_active: boolean;
  banner_text: string | null;
  start_date: string | null;
  end_date: string | null;
  notify_whatsapp: boolean;
  whatsapp_audience: "all" | "free_only";
  whatsapp_status: "idle" | "sending" | "completed" | "error";
  whatsapp_sent_count: number;
  whatsapp_error_count: number;
  whatsapp_sent_at: string | null;
}

export function usePromotions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["promotions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("promotions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Promotion[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const unsub = subscribeTable("promotions", () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
    });
    return () => { unsub(); };
  }, [queryClient]);

  return query;
}

/** Only active promotions — optimized for sidebar modal */
export function useActivePromotions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["promotions", "active"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("promotions")
        .select("id,title,description,rules,type,reward_value,banner_text,start_date,end_date")
        .eq("is_active", true)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Promotion[];
    },
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    const unsub = subscribeTable("promotions", () => {
      queryClient.invalidateQueries({ queryKey: ["promotions", "active"] });
    });
    return () => { unsub(); };
  }, [queryClient]);

  return query;
}

/** Active banners only (non-empty banner_text) */
export function usePromotionBanners() {
  const { data: promotions } = useActivePromotions();
  return (promotions || []).filter(p => p.banner_text && p.banner_text.trim().length > 0);
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (promo: Omit<Promotion, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await (supabase as any)
        .from("promotions")
        .insert(promo)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promoção criada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Promotion> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("promotions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promoção atualizada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("promotions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promoção removida!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
