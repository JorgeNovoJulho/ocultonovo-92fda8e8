import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface SponsoredAd {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  target_url: string | null;
  cta_text: string;
  placement: string;
  priority: number;
  media_type: "image" | "video";
  audience: Record<string, any>;
  impressions_count: number;
  clicks_count: number;
  advertiser_id: string | null;
  created_by_admin: boolean;
  starts_at: string;
  ends_at: string | null;
  status?: string;
  rejection_reason?: string | null;
  daily_budget_cents?: number;
  ai_assisted?: boolean;
  created_at: string;
}

/** Anúncios ativos para o feed (públicos + aprovados de usuários). */
export function useActiveSponsoredAds(placement = "feed") {
  return useQuery({
    queryKey: ["sponsored-ads-active", placement],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_active_sponsored_ads")
        .select("*")
        .eq("placement", placement)
        .order("priority", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as SponsoredAd[];
    },
  });
}

/** Campanhas do usuário atual (todos os status). */
export function useMySponsoredAds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sponsored-ads-mine", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ad_campaigns")
        .select("*")
        .eq("advertiser_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SponsoredAd[];
    },
  });
}

/** Criar nova campanha (status = pending_review). */
export function useCreateSponsoredAd() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SponsoredAd>) => {
      if (!user) throw new Error("Faça login para anunciar");
      const { data, error } = await (supabase as any)
        .from("ad_campaigns")
        .insert({
          advertiser_id: user.id,
          created_by_admin: false,
          status: "pending_review",
          is_active: false,
          placement: input.placement ?? "feed",
          title: input.title ?? "",
          description: input.description ?? "",
          image_url: input.image_url ?? "",
          target_url: input.target_url ?? "",
          cta_text: input.cta_text ?? "Saiba Mais",
          media_type: input.media_type ?? "image",
          audience: input.audience ?? {},
          daily_budget_cents: input.daily_budget_cents ?? 0,
          starts_at: input.starts_at ?? new Date().toISOString(),
          ends_at: input.ends_at ?? null,
          ai_assisted: input.ai_assisted ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as SponsoredAd;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsored-ads-mine"] });
      toast.success("Campanha enviada para moderação!");
    },
    onError: (e: any) =>
      toast.error("Erro ao criar campanha", { description: e.message }),
  });
}

/** Fila de moderação (admin). */
export function useAdsModerationQueue() {
  return useQuery({
    queryKey: ["sponsored-ads-moderation"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ad_campaigns")
        .select("*")
        .eq("status", "pending_review")
        .eq("created_by_admin", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as SponsoredAd[];
    },
  });
}

/** Aprovar/Rejeitar (admin). */
export function useModerateSponsoredAd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "approve" | "reject";
      reason?: string;
    }) => {
      const patch =
        action === "approve"
          ? { status: "approved", is_active: true, rejection_reason: null }
          : { status: "rejected", is_active: false, rejection_reason: reason ?? null };
      const { error } = await (supabase as any)
        .from("ad_campaigns")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsored-ads-moderation"] });
      qc.invalidateQueries({ queryKey: ["sponsored-ads-active"] });
      qc.invalidateQueries({ queryKey: ["ads", "all"] });
      toast.success("Decisão registrada.");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });
}

/** Registrar evento (impressão/clique). */
export async function recordAdEvent(adId: string, type: "impression" | "click") {
  try {
    await (supabase as any).rpc("record_ad_event", {
      p_ad_id: adId,
      p_event_type: type,
    });
  } catch {
    /* silencioso */
  }
}
