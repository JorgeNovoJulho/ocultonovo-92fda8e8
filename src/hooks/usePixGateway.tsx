import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";
import {
  persistIntegrationHealth,
  persistIntegrationReference,
} from "@/lib/integrationHealth";

export interface PixGatewayConfig {
  id: string;
  gateway_provider: string;
  api_key_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  is_active: boolean;
  sandbox_mode: boolean;
  pix_key: string | null;
  pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
  min_deposit: number;
  max_deposit: number;
  discord_webhook_url: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export function usePixGatewayConfig() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["pix-gateway-config"],
    queryFn: async (): Promise<PixGatewayConfig | null> => {
      if (!user) return null;

      const { data, error } = await (supabase as any)
        .from("pix_gateway_config")
        .select("*")
        .maybeSingle();

      if (error) {
        console.error("Error fetching PIX config:", error);
        return null;
      }

      return data as PixGatewayConfig | null;
    },
    enabled: !!user,
  });
}

export function useUpdatePixGatewayConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: Partial<PixGatewayConfig>) => {
      if (!user) throw new Error("User not authenticated");

      // Get existing config
      const { data: existing } = await (supabase as any)
        .from("pix_gateway_config")
        .select("id")
        .maybeSingle();

      if (existing?.id) {
        // Update existing record
        const { error } = await (supabase as any)
          .from("pix_gateway_config")
          .update({
            ...config,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Insert new record if none exists
        const { error } = await (supabase as any)
          .from("pix_gateway_config")
          .insert({
            gateway_provider: "asaas",
            sandbox_mode: true,
            is_active: false,
            min_deposit: 5,
            max_deposit: 10000,
            ...config,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      await persistIntegrationReference(
        "pix",
        "Gateway PIX referenciado — aguardando teste de conexão",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pix-gateway-config"] });
      toast({
        title: "Referência salva — ainda não validada",
        description:
          "Clique em testar conexão para atualizar o status para Operacional.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar configuração",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useTestPixConnection() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pix-gateway", {
        body: { action: "test-connection" },
      });

      if (error) throw error;
      await persistIntegrationHealth(
        "pix",
        data?.success ? "OK" : "FAIL",
        data?.message ||
          (data?.success
            ? "Gateway PIX operacional ✅"
            : "Falha ao validar Gateway PIX"),
      );
      return data as { success: boolean; message: string };
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Conexão bem sucedida!",
          description: data.message,
        });
      } else {
        toast({
          title: "Falha na conexão",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: async (error: Error) => {
      await persistIntegrationHealth(
        "pix",
        "FAIL",
        error.message || "Erro ao testar conexão",
      ).catch(() => null);
      toast({
        title: "Erro ao testar conexão",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export interface PixPaymentResult {
  success: boolean;
  qr_code?: string;
  qr_code_base64?: string;
  transaction_id?: string;
  expires_at?: string;
  error?: string;
  provider?: string;
}

export function useGeneratePixPayment() {
  return useMutation({
    mutationFn: async (params: {
      amount: number;
      description?: string;
      payer_email?: string;
      creator_id?: string;
      referrer_handle?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("pix-gateway", {
        body: {
          action: "generate",
          ...params,
        },
      });

      if (error) throw error;

      // Surface creator wallet error as a typed error for UI modals
      if (data?.error_code === "CREATOR_WALLET_NOT_CONFIGURED") {
        throw Object.assign(new Error(data.error), {
          code: "CREATOR_WALLET_NOT_CONFIGURED",
        });
      }

      return data as PixPaymentResult;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "PIX gerado!",
          description: "QR Code disponível para pagamento.",
        });
      } else {
        toast({
          title: "Erro ao gerar PIX",
          description: data.error,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error & { code?: string }) => {
      // Don't show generic toast for wallet errors — caller handles modal
      if (error.code === "CREATOR_WALLET_NOT_CONFIGURED") return;
      toast({
        title: "Erro ao gerar PIX",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
