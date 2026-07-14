import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useEffect } from "react";
import { toast } from "sonner";

export interface LandingTexts {
  headline: string;
  subheadline: string;
  cta_button: string;
  blur_message: string;
  video_message: string;
  footer_text: string;
}

export interface LandingStyle {
  primary_color: string;
  secondary_color: string;
  font_heading: string;
  font_body: string;
  logo_url: string | null;
}

export interface LandingTimers {
  image_preview_seconds: number;
  video_preview_seconds: number;
}

const defaultTexts: LandingTexts = {
  headline: "Conteúdo Exclusivo",
  subheadline: "Acesse conteúdos exclusivos dos seus criadores favoritos",
  cta_button: "Cadastre-se Grátis",
  blur_message: "Cadastre-se para ver o conteúdo completo",
  video_message: "Cadastre-se para assistir o vídeo completo",
  footer_text: "© 2026 Oculto Swing. Todos os direitos reservados.",
};

const defaultStyle: LandingStyle = {
  primary_color: "#e91e63",
  secondary_color: "#1a1a2e",
  font_heading: "Inter",
  font_body: "Inter",
  logo_url: null,
};

const defaultTimers: LandingTimers = {
  image_preview_seconds: 5,
  video_preview_seconds: 10,
};

export function useLandingSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["landing-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_settings")
        .select("*");

      if (error) {
        console.warn("[useLandingSettings] query error:", error.message);
        return { texts: defaultTexts, style: defaultStyle, timers: defaultTimers };
      }

      const map: Record<string, any> = {};
      for (const row of data || []) {
        map[row.setting_key] = row.setting_value;
      }

      return {
        texts: { ...defaultTexts, ...(map.texts || {}) } as LandingTexts,
        style: { ...defaultStyle, ...(map.style || {}) } as LandingStyle,
        timers: { ...defaultTimers, ...(map.timers || {}) } as LandingTimers,
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    const unsub = subscribeTable("landing_settings", () => {
      qc.invalidateQueries({ queryKey: ["landing-settings"] });
    });
    return () => unsub();
  }, [qc]);

  return query;
}

export function useUpdateLandingSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await (supabase as any)
        .from("landing_settings")
        .upsert(
          { setting_key: key, setting_value: value, updated_at: new Date().toISOString() },
          { onConflict: "setting_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing-settings"] });
      toast.success("Configuração salva!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
