import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, TrendingDown, Repeat } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

interface Sub {
  id: string;
  subscriber_id: string;
  status: "active" | "expired" | "cancelled" | "past_due" | "pending";
  price: number;
  created_at: string;
  expires_at: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

export default function SubscribersPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["creator-subscribers", user?.id];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user!.id)
        .single();
      if (!prof?.id) return null;

      const { data: rows } = await (supabase as any)
        .from("subscriptions")
        .select("id,subscriber_id,status,price,created_at,expires_at")
        .eq("creator_id", prof.id)
        .order("created_at", { ascending: false });

      const list = ((rows as Sub[]) || []);
      const ids = [...new Set(list.map((r) => r.subscriber_id))];
      const profilesMap = new Map<string, any>();
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,username,display_name,name,avatar_url,is_verified")
          .in("id", ids);
        (ps || []).forEach((p: any) => profilesMap.set(p.id, p));
      }

      const now = Date.now();
      const active = list.filter((r) => r.status === "active");
      const cancelled = list.filter((r) => r.status === "cancelled");
      const expired = list.filter((r) => r.status === "expired" || r.status === "past_due");
      const renewingSoon = active.filter(
        (r) => r.expires_at && new Date(r.expires_at).getTime() - now < 7 * 86400 * 1000,
      );
      const total = list.length;
      const retention = total > 0 ? Math.round((active.length / total) * 100) : 0;
      const mrr = active.reduce((s, r) => s + Number(r.price || 0), 0);

      return {
        profileId: prof.id,
        list,
        profilesMap,
        active,
        cancelled,
        expired,
        renewingSoon,
        retention,
        mrr,
      };
    },
  });

  // Realtime
  useEffect(() => {
    if (!data?.profileId) return;
    const unsub = subscribeTable('subscriptions', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.creator_id !== data.profileId) return;
      qc.invalidateQueries({ queryKey });
    });
    return () => { unsub(); };
  }, [data?.profileId, qc]);


  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Ativos" value={String(data.active.length)} icon={Users} accent="text-emerald-500" />
        <StatBox label="Renovam em 7d" value={String(data.renewingSoon.length)} icon={Repeat} accent="text-[hsl(45,93%,47%)]" />
        <StatBox label="Cancelamentos" value={String(data.cancelled.length)} icon={TrendingDown} accent="text-destructive" />
        <StatBox label="Retenção" value={`${data.retention}%`} icon={TrendingUp} accent="text-primary" />
      </div>

      <Card className="gradient-border">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Assinantes</span>
            <span className="text-xs text-muted-foreground font-normal">MRR atual {fmt(data.mrr)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.list.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Nenhum assinante ainda.</p>
          ) : (
            <Virtuoso
              style={{ height: 384 }}
              data={data.list}
              overscan={200}
              itemContent={(_, s: any) => {
                const p = data.profilesMap.get(s.subscriber_id);
                const name = p?.username ? `@${p.username}` : "Usuário";
                return (
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={p?.avatar_url || ""} loading="lazy" />
                      <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Desde {new Date(s.created_at).toLocaleDateString("pt-BR")}
                        {s.expires_at && ` · expira ${new Date(s.expires_at).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusClass(s.status)}>{statusLabel(s.status)}</Badge>
                    <span className="text-xs font-semibold w-16 text-right">{fmt(Number(s.price || 0))}</span>
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, accent }: any) {
  return (
    <Card className="gradient-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <p className={`text-xl font-bold mt-1 ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function statusClass(s: string) {
  if (s === "active") return "border-emerald-500/40 text-emerald-500";
  if (s === "pending") return "border-amber-500/40 text-amber-500";
  if (s === "cancelled") return "border-destructive/40 text-destructive";
  return "text-muted-foreground";
}
function statusLabel(s: string) {
  return ({ active: "Ativa", pending: "Pendente", cancelled: "Cancelada", expired: "Expirada", past_due: "Atrasada" } as any)[s] || s;
}
