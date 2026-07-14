import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useProfile } from "@/hooks/useProfile";

/**
 * Retorna `true` somente se o perfil logado possuir pelo menos um plano de
 * canal VIP ativo (subscription_plans.is_active = true vinculado ao seu profiles.id).
 *
 * É a única condição que autoriza recursos de destaque VIP (badge dourado,
 * banner "Seu canal está em destaque", botão "Destacar canal", etc.).
 */
export function useHasVipChannel() {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ["has-vip-channel", profile?.id],
    enabled: !!profile?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any)
        .from("subscription_plans")
        .select("id")
        .eq("profile_id", profile!.id)
        .eq("is_enabled", true)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[useHasVipChannel] erro:", error.message);
        return false;
      }
      return !!data?.id;
    },
  });
}
