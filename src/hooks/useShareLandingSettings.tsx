import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useEffect } from "react";
import { toast } from "sonner";

export interface ShareLandingSettings {
  // Visibility
  show_logo: boolean;
  show_creator: boolean;
  show_qr: boolean;
  show_price: boolean;
  show_footer: boolean;
  show_buy_button: boolean;

  // Texts
  headline: string;
  subheadline: string;
  cta_primary_text: string;
  cta_signup_text: string;
  cta_buy_text: string;
  footer_text: string;

  // Style
  bg_gradient_from: string;
  bg_gradient_to: string;
  accent_color: string;
  accent_color_dark: string;
  card_border_color: string;

  // Media
  logo_override_url: string | null;
  background_image_url: string | null;

  // Behavior
  default_blur: "light" | "medium" | "strong" | "none";
}

export const DEFAULT_SHARE_LANDING_SETTINGS: ShareLandingSettings = {
  show_logo: true,
  show_creator: true,
  show_qr: false,
  show_price: true,
  show_footer: true,
  show_buy_button: true,

  headline: "Conteúdo Exclusivo OCULTO",
  subheadline: "Acesse mídias exclusivas dos seus criadores favoritos.",
  cta_primary_text: "Acessar conteúdo",
  cta_signup_text: "Criar conta para acessar",
  cta_buy_text: "Comprar agora",
  footer_text: "Plataforma OCULTO · Conteúdo +18 destinado a maiores de idade",

  bg_gradient_from: "#0b0610",
  bg_gradient_to: "#1a0a14",
  accent_color: "#facc15",
  accent_color_dark: "#a16207",
  card_border_color: "#facc1555",

  logo_override_url: null,
  background_image_url: null,

  default_blur: "medium",
};

const SETTING_KEY = "share_landing";

export function useShareLandingSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["share-landing-settings"],
    queryFn: async (): Promise<ShareLandingSettings> => {
      const { data, error } = await (supabase as any)
        .from("landing_settings")
        .select("setting_value")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();
      if (error) {
        console.warn("[useShareLandingSettings]", error.message);
        return DEFAULT_SHARE_LANDING_SETTINGS;
      }
      return { ...DEFAULT_SHARE_LANDING_SETTINGS, ...((data?.setting_value as any) || {}) };
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const unsub = subscribeTable("landing_settings", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.setting_key !== SETTING_KEY) return;
      qc.invalidateQueries({ queryKey: ["share-landing-settings"] });
    });
    return () => unsub();
  }, [qc]);

  return query;
}

export function useUpdateShareLandingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: ShareLandingSettings) => {
      const { error } = await (supabase as any)
        .from("landing_settings")
        .upsert(
          { setting_key: SETTING_KEY, setting_value: value, updated_at: new Date().toISOString() },
          { onConflict: "setting_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-landing-settings"] });
      toast.success("Página de compartilhamento atualizada em tempo real!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
