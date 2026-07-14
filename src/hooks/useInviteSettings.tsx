import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useEffect } from "react";
import { toast } from "sonner";

export interface InviteSettings {
  // Visibility flags
  show_logo: boolean;
  show_crown_header: boolean;
  show_avatar: boolean;
  show_badge: boolean;
  show_main_text: boolean;
  show_subtext: boolean;
  show_vip_discount: boolean;
  show_qr_share: boolean;
  show_platform_features: boolean;
  show_signup_buttons: boolean;
  show_footer: boolean;

  // Texts
  badge_emoji: string;
  badge_text: string;
  main_text_template: string; // supports {name} and {platform}
  platform_name: string;
  subtext: string;
  vip_discount_text: string;
  share_section_title: string;
  signup_button_text: string;
  login_button_text: string;
  vip_subscribe_button_text: string;
  footer_text_template: string; // supports {terms} and {privacy}
  copy_button_text: string;
  share_button_text: string;

  // Style
  bg_gradient_from: string; // tailwind color or hsl
  bg_gradient_to: string;
  accent_color: string; // primary highlight (hex)
  crown_color: string; // hex
  badge_bg_color: string; // hex with alpha
  vip_discount_bg_color: string;

  // Media overrides
  logo_override_url: string | null;
  background_image_url: string | null;
}

export const DEFAULT_INVITE_SETTINGS: InviteSettings = {
  show_logo: true,
  show_crown_header: true,
  show_avatar: true,
  show_badge: true,
  show_main_text: true,
  show_subtext: true,
  show_vip_discount: true,
  show_qr_share: true,
  show_platform_features: true,
  show_signup_buttons: true,
  show_footer: true,

  badge_emoji: "🎉",
  badge_text: "PARABÉNS!",
  main_text_template:
    "Você foi selecionado(a) por {name} para se tornar membro exclusivo da nova Plataforma de conteúdo Adulto +18 exclusiva, com a possibilidade de ganhar dinheiro indicando novos amigos(as) para a plataforma e também sobre seu próprio conteúdo postado. Não perca essa oportunidade, pois quem chega primeiro ganha mais espaço e vantagens... ENTRE JÁ!",
  platform_name: "OCULTO",
  subtext: "Aproveite essa oportunidade! 🚀",
  vip_discount_text: "Desconto exclusivo de 30% no plano VIP por indicação",
  share_section_title: "Compartilhe este convite",
  signup_button_text: "CRIE JÁ SUA CONTA",
  login_button_text: "Já tenho conta",
  vip_subscribe_button_text: "Assinar VIP com 30% OFF",
  footer_text_template: "Ao criar sua conta, você concorda com nossos {terms} e {privacy}",
  copy_button_text: "Copiar",
  share_button_text: "Compartilhar",

  bg_gradient_from: "#0b0610",
  bg_gradient_to: "#2a0a20",
  accent_color: "#ec4899",
  crown_color: "#facc15",
  badge_bg_color: "#ec48991a",
  vip_discount_bg_color: "#facc151a",

  logo_override_url: null,
  background_image_url: null,
};

const SETTING_KEY = "invite_modal";

export function useInviteSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["invite-settings"],
    queryFn: async (): Promise<InviteSettings> => {
      const { data, error } = await (supabase as any)
        .from("landing_settings")
        .select("setting_value")
        .eq("setting_key", SETTING_KEY)
        .maybeSingle();
      if (error) {
        console.warn("[useInviteSettings]", error.message);
        return DEFAULT_INVITE_SETTINGS;
      }
      return { ...DEFAULT_INVITE_SETTINGS, ...((data?.setting_value as any) || {}) };
    },
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    const unsub = subscribeTable("landing_settings", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.setting_key !== SETTING_KEY) return;
      qc.invalidateQueries({ queryKey: ["invite-settings"] });
    });
    return () => unsub();
  }, [qc]);

  return query;
}

export function useUpdateInviteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: InviteSettings) => {
      const { error } = await (supabase as any)
        .from("landing_settings")
        .upsert(
          { setting_key: SETTING_KEY, setting_value: value, updated_at: new Date().toISOString() },
          { onConflict: "setting_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invite-settings"] });
      toast.success("Configurações do convite salvas!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
