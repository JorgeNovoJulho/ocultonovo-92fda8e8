import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

/**
 * Estado ON/OFF do canal VIP do criador logado.
 * Lê e atualiza `subscription_plans.is_enabled` para todos os planos do perfil.
 * Default = false (canal nasce desativado).
 */
export function useVipChannelEnabled() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["vip-channel-enabled", profile?.id],
    enabled: !!profile?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<{ enabled: boolean; hasPlan: boolean }> => {
      const { data, error } = await (supabase as any)
        .from("subscription_plans")
        .select("id, is_enabled")
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return { enabled: false, hasPlan: false };
      return { enabled: !!data.is_enabled, hasPlan: true };
    },
  });

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      // 1) Via RPC SECURITY DEFINER (resolve identidade + bypass RLS)
      const rpc = await (supabase as any).rpc("vip_channel_set_enabled", {
        p_enabled: next,
      });
      if (rpc.error) {
        // Fallback: update direto pelo profile_id resolvido
        if (!profile?.id) throw new Error("Perfil não encontrado");
        const { error } = await (supabase as any)
          .from("subscription_plans")
          .update({ is_enabled: next })
          .eq("profile_id", profile.id);
        if (error) throw error;
      }
      return next;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ["vip-channel-enabled"] });
      queryClient.invalidateQueries({ queryKey: ["has-vip-channel"] });
      queryClient.invalidateQueries({ queryKey: ["vip-creators-carousel-v8"] });
      queryClient.invalidateQueries({ queryKey: ["plans-vitrine"] });
      toast.success(enabled ? "Canal VIP ativado" : "Canal VIP desativado");
    },
    onError: (e: any) => {
      toast.error(e?.message || "Não foi possível alterar o status do canal");
    },
  });

  return {
    enabled: query.data?.enabled ?? false,
    hasPlan: query.data?.hasPlan ?? false,
    isLoading: query.isLoading,
    toggle: toggle.mutate,
    isToggling: toggle.isPending,
  };
}
