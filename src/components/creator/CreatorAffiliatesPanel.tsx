import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Coins } from "lucide-react";
import { Virtuoso } from "react-virtuoso";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

interface LedgerRow {
  id: string;
  affiliate_id: string;
  creator_id: string | null;
  gross_amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

/**
 * Top afiliados do criador, agregados a partir de referral_ledger (canônico).
 * Substitui a leitura direta de payment_splits.
 */
export default function CreatorAffiliatesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["creator-affiliates-ledger", user?.id];

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
        .from("referral_ledger")
        .select("id,affiliate_id,creator_id,gross_amount,commission_amount,status,created_at")
        .eq("creator_id", prof.id)
        .in("status", ["confirmed", "paid"])
        .order("created_at", { ascending: false })
        .limit(500);

      const list = (rows || []) as LedgerRow[];
      const map = new Map<string, { id: string; sales: number; commission: number; gross: number; last: string }>();
      for (const r of list) {
        const key = r.affiliate_id || "unknown";
        const cur = map.get(key) || { id: r.affiliate_id, sales: 0, commission: 0, gross: 0, last: r.created_at };
        cur.sales += 1;
        cur.commission += Number(r.commission_amount || 0);
        cur.gross += Number(r.gross_amount || 0);
        if (new Date(r.created_at) > new Date(cur.last)) cur.last = r.created_at;
        map.set(key, cur);
      }
      const ranking = [...map.values()].sort((a, b) => b.commission - a.commission);

      const ids = ranking.map((r) => r.id).filter(Boolean);
      const profilesMap = new Map<string, any>();
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,username,display_name,name,avatar_url")
          .in("id", ids);
        (ps || []).forEach((p: any) => profilesMap.set(p.id, p));
      }

      return { profileId: prof.id, ranking, profilesMap, totalCommission: ranking.reduce((s, r) => s + r.commission, 0) };
    },
  });

  useEffect(() => {
    if (!data?.profileId) return;
    const unsub = subscribeTable('referral_ledger', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.creator_id !== data.profileId) return;
      qc.invalidateQueries({ queryKey });
    });
    return () => { unsub(); };
  }, [data?.profileId, qc]);


  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  return (
    <Card className="gradient-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex items-center gap-2"><Trophy className="h-5 w-5 text-[hsl(45,93%,47%)]" /> Ranking de afiliados</span>
          <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
            <Coins className="h-3.5 w-3.5" /> Total comissão {fmt(data.totalCommission)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Nenhuma venda via afiliado registrada ainda.</p>
        ) : (
          <Virtuoso
            style={{ height: 384 }}
            data={data.ranking}
            overscan={200}
            itemContent={(idx, r: any) => {
              const p = r.id ? data.profilesMap.get(r.id) : null;
              const name = p?.username ? `@${p.username}` : `@${(r.id || "").slice(0, 6)}`;
              return (
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
                  <span className="w-5 text-center text-xs font-bold text-muted-foreground">{idx + 1}</span>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p?.avatar_url || ""} loading="lazy" />
                    <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.sales} venda(s) · bruto {fmt(r.gross)} · última {new Date(r.last).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500">{fmt(r.commission)}</Badge>
                </div>
              );
            }}
          />
        )}
        <p className="text-[11px] text-muted-foreground p-3">
          Para suspender ou remover um afiliado, use a Central de Afiliados (admin master) — protegido por backend.
        </p>
      </CardContent>
    </Card>
  );
}
