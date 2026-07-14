import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "active" | "pending" | "inactive";

interface Props {
  creatorId: string | undefined;
  className?: string;
}

/**
 * Mostra o status da minha assinatura no perfil VIP do criador alvo.
 * - Lê tabela `subscriptions` (status: active | pending | expired | cancelled)
 * - Atualiza em tempo real via Postgres Changes (webhook do gateway grava no DB → realtime).
 */
export function VipSubscriptionStatus({ creatorId, className }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ["vip-sub-status", user?.id, creatorId];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user?.id && !!creatorId,
    queryFn: async (): Promise<{ status: Status; expires_at: string | null } | null> => {
      if (!user?.id || !creatorId) return null;
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!prof?.id) return null;
      const { data: rows } = await (supabase as any)
        .from("subscriptions")
        .select("status,expires_at")
        .eq("subscriber_id", prof.id)
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false })
        .limit(1);
      const r = (rows as any[])?.[0];
      if (!r) return { status: "inactive", expires_at: null };
      const s: Status =
        r.status === "active" ? "active" : r.status === "pending" ? "pending" : "inactive";
      return { status: s, expires_at: r.expires_at ?? null };
    },
  });

  // Realtime: revalida quando webhook escreve em `subscriptions`
  useEffect(() => {
    if (!user?.id || !creatorId) return;
    const unsub = subscribeTable('subscriptions', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.creator_id !== creatorId) return;
      queryClient.invalidateQueries({ queryKey });
    });
    return () => { unsub(); };
  }, [user?.id, creatorId, queryClient]);


  if (!user || !creatorId) return null;
  if (isLoading) {
    return (
      <Badge variant="outline" className={cn("gap-1.5", className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando assinatura…
      </Badge>
    );
  }

  const status: Status = data?.status ?? "inactive";

  if (status === "active") {
    return (
      <Badge className={cn("gap-1.5 bg-green-500/15 text-green-500 border border-green-500/30", className)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Assinatura ativa
        {data?.expires_at && (
          <span className="ml-1 opacity-80">
            · até {new Date(data.expires_at).toLocaleDateString("pt-BR")}
          </span>
        )}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge className={cn("gap-1.5 bg-amber-500/15 text-amber-500 border border-amber-500/30", className)}>
        <Clock className="h-3.5 w-3.5" /> Pagamento pendente
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-muted-foreground", className)}>
      <XCircle className="h-3.5 w-3.5" /> Sem assinatura ativa
    </Badge>
  );
}
