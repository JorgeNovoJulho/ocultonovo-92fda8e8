import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Flame, Snowflake, RefreshCw } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const SEV: Record<string, string> = {
  low: "bg-muted text-foreground",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  critical: "bg-destructive/15 text-destructive",
};

interface FraudEvent {
  id: string;
  user_id: string;
  event_type: string;
  severity: string;
  score_delta: number;
  metadata: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

interface RiskyProfile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  fraud_score: number;
  fraud_frozen_until: string | null;
}

export default function AdminFraudEventsPage() {
  const qc = useQueryClient();

  const events = useQuery({
    queryKey: ["fraud-events"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fraud_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as FraudEvent[]) || [];
    },
  });

  const risky = useQuery({
    queryKey: ["fraud-risky-profiles"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id,user_id,username,display_name,fraud_score,fraud_frozen_until")
        .gt("fraud_score", 0)
        .order("fraud_score", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as RiskyProfile[]) || [];
    },
  });

  useEffect(() => {
    const unsub = subscribeTable("fraud_events", () => {
      qc.invalidateQueries({ queryKey: ["fraud-events"] });
      qc.invalidateQueries({ queryKey: ["fraud-risky-profiles"] });
    });
    return () => {
      try { unsub(); } catch {}
    };
  }, [qc]);

  const resolveEvent = async (id: string) => {
    const { error } = await (supabase as any)
      .from("fraud_events")
      .update({ resolved: true })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Evento resolvido");
      events.refetch();
    }
  };

  const unfreeze = async (profileId: string) => {
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ fraud_frozen_until: null, fraud_score: 0 })
      .eq("id", profileId);
    if (error) toast.error(error.message);
    else {
      toast.success("Usuário descongelado e score zerado");
      risky.refetch();
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          <div>
            <h1 className="text-xl font-bold">Eventos de Fraude</h1>
            <p className="text-xs text-muted-foreground">
              Detecção em tempo real (refund_burst, multi_account_ip, velocity)
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            events.refetch();
            risky.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Eventos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Eventos recentes
              <Badge variant="secondary">{events.data?.length || 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {events.isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : events.data?.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum evento de fraude registrado.
              </p>
            ) : (
              <Virtuoso
                style={{ height: 480 }}
                data={events.data || []}
                overscan={200}
                itemContent={(_, e: FraudEvent) => (
                  <div className="p-3 border-b border-border/50 flex gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{e.event_type}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${SEV[e.severity] || SEV.low}`}>
                          {e.severity}
                        </span>
                        {e.resolved && (
                          <Badge variant="outline" className="text-[10px]">resolvido</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        user: {e.user_id.slice(0, 8)}… · +{e.score_delta} pts ·{" "}
                        {formatDistanceToNow(new Date(e.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                      {Object.keys(e.metadata || {}).length > 0 && (
                        <pre className="text-[10px] text-muted-foreground mt-1 truncate">
                          {JSON.stringify(e.metadata)}
                        </pre>
                      )}
                    </div>
                    {!e.resolved && (
                      <Button size="sm" variant="ghost" onClick={() => resolveEvent(e.id)}>
                        Resolver
                      </Button>
                    )}
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Perfis em risco */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Snowflake className="h-4 w-4 text-blue-500" />
              Perfis em risco
              <Badge variant="secondary">{risky.data?.length || 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {risky.isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : risky.data?.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum perfil pontuado.
              </p>
            ) : (
              <Virtuoso
                style={{ height: 480 }}
                data={risky.data || []}
                overscan={200}
                itemContent={(_, p: RiskyProfile) => {
                  const frozen =
                    p.fraud_frozen_until && new Date(p.fraud_frozen_until) > new Date();
                  return (
                    <div className="p-3 border-b border-border/50 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.display_name || p.username || p.user_id.slice(0, 8)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          score:{" "}
                          <span
                            className={
                              p.fraud_score >= 80
                                ? "text-destructive font-bold"
                                : p.fraud_score >= 40
                                ? "text-orange-500 font-bold"
                                : ""
                            }
                          >
                            {Number(p.fraud_score).toFixed(1)}
                          </span>
                          {frozen && (
                            <span className="ml-2 text-blue-500">
                              · congelado até {new Date(p.fraud_frozen_until!).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </p>
                      </div>
                      {frozen && (
                        <Button size="sm" variant="outline" onClick={() => unfreeze(p.id)}>
                          Descongelar
                        </Button>
                      )}
                    </div>
                  );
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
