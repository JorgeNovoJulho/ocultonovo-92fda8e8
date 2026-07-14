import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, ChevronRight } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

interface SplitRow {
  id?: string;
  created_at?: string;
  source_type?: string | null;
  total_amount: number;
  platform_fee: number;
  creator_amount: number;
  affiliate_amount: number | null;
  affiliate_applied: boolean | null;
  affiliate_handle?: string | null;
}

/**
 * Breakdown agregado + últimas transações individuais por payment_splits.
 * Bruto / Imposto / Plataforma / Afiliado / Líquido.
 * Atualiza em tempo real quando o gateway de pagamento da plataforma confirma um split.
 */
export default function CreatorSplitBreakdown() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["creator-split-breakdown", user?.id];

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user!.id)
        .single();
      if (!profile) return null;

      const { data: rows, error } = await (supabase as any)
        .from("payment_splits")
        .select(
          "id,created_at,source_type,total_amount,platform_fee,creator_amount,affiliate_amount,affiliate_applied,affiliate_handle",
        )
        .eq("creator_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const list = (rows || []) as SplitRow[];
      const gross = list.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const platform = list.reduce((s, r) => s + Number(r.platform_fee || 0), 0);
      const affiliate = list.reduce((s, r) => s + Number(r.affiliate_amount || 0), 0);
      const net = list.reduce((s, r) => s + Number(r.creator_amount || 0), 0);
      const tax = Math.max(gross - platform - affiliate - net, 0);
      const txCount = list.length;
      const withAffiliate = list.filter((r) => r.affiliate_applied).length;
      return { gross, tax, platform, affiliate, net, txCount, withAffiliate, profileId: profile.id, recent: list.slice(0, 8) };
    },
  });

  // Realtime: revalida quando webhook escreve split
  useEffect(() => {
    if (!data?.profileId) return;
    const unsub = subscribeTable('payment_splits', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.creator_id !== data.profileId) return;
      queryClient.invalidateQueries({ queryKey });
    });
    return () => { unsub(); };
  }, [data?.profileId, queryClient]);


  return (
    <Card className="gradient-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="h-5 w-5 text-primary" />
          Detalhamento financeiro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Sem vendas registradas ainda.</p>
        ) : (
          <>
            <Row label="Valor bruto recebido" value={fmt(data.gross)} />
            <Row label="Imposto (6%)" value={`− ${fmt(data.tax)}`} accent="text-destructive" />
            <Row label="Plataforma OCULTO (20%)" value={`− ${fmt(data.platform)}`} accent="text-muted-foreground" />
            <Row
              label={`Comissão afiliado${data.withAffiliate ? ` (${data.withAffiliate} vendas)` : ""}`}
              value={`− ${fmt(data.affiliate)}`}
              accent="text-amber-500"
            />
            <div className="border-t border-border/50 pt-2 mt-2">
              <Row label="Valor líquido para o criador" value={fmt(data.net)} accent="text-emerald-500 font-bold text-base" />
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Calculado a partir de {data.txCount} venda(s) registradas em <code>payment_splits</code>.
              Quando não há afiliado válido, a fatia retorna integral ao criador.
            </p>

            {/* Transações recentes — split por venda */}
            {data.recent.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-xs font-semibold mb-2 text-foreground/80">Últimas transações</p>
                <ul className="space-y-1.5">
                  {data.recent.map((r) => {
                    const txTax = Math.max(
                      Number(r.total_amount || 0) -
                        Number(r.platform_fee || 0) -
                        Number(r.affiliate_amount || 0) -
                        Number(r.creator_amount || 0),
                      0,
                    );
                    return (
                      <li
                        key={r.id || `${r.created_at}-${r.total_amount}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-2.5 py-2 text-[11px]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {labelSource(r.source_type)} ·{" "}
                            <span className="text-muted-foreground">
                              {r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "—"}
                            </span>
                          </p>
                          <p className="text-muted-foreground truncate">
                            Bruto {fmt(Number(r.total_amount))} · Imp {fmt(txTax)} · Plat {fmt(Number(r.platform_fee))}
                            {r.affiliate_applied && ` · Afil ${fmt(Number(r.affiliate_amount || 0))}${r.affiliate_handle ? ` (@${r.affiliate_handle})` : ""}`}
                          </p>
                        </div>
                        <div className="text-emerald-500 font-semibold whitespace-nowrap">
                          {fmt(Number(r.creator_amount))} <ChevronRight className="inline h-3 w-3" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function labelSource(s?: string | null) {
  switch (s) {
    case "subscription":
      return "Assinatura";
    case "paid_post":
    case "paid_content":
      return "Conteúdo pago";
    case "chat":
      return "Chat monetizado";
    case "ppv":
      return "PPV";
    default:
      return s || "Venda";
  }
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ?? "font-semibold"}>{value}</span>
    </div>
  );
}
