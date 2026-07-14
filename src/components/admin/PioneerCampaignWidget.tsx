import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Flame, Trophy, Users, DollarSign, TrendingUp, History, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PioneerSale {
  id: string;
  user_name: string;
  amount: number;
  created_at: string;
}

const PLATFORM_FEE = 0.20;
const TAX_RESERVE = 0.06;
const STRIPE_FEE_PERCENT = 0.0399;
const STRIPE_FEE_FIXED = 0.39;

function calcNetProfit(gross: number) {
  const stripeFee = gross * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED;
  const afterStripe = gross - stripeFee;
  const tax = gross * TAX_RESERVE;
  const platformProfit = afterStripe * PLATFORM_FEE;
  return { stripeFee, tax, platformProfit, net: platformProfit - tax };
}

export function PioneerCampaignWidget() {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const realtimeSetup = useRef(false);

  // Pioneer slots status
  const { data: slots } = useQuery({
    queryKey: ["admin-pioneer-slots"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_pioneer_slots_status");
      if (error) return { total: 1000, filled: 0, remaining: 1000, is_full: false };
      return data as { total: number; filled: number; remaining: number; is_full: boolean };
    },
    staleTime: 30_000,
  });

  // Recent pioneer transactions
  const { data: recentSales = [] } = useQuery({
    queryKey: ["admin-pioneer-sales"],
    queryFn: async (): Promise<PioneerSale[]> => {
      const { data: txns, error } = await (supabase as any)
        .from("transactions")
        .select("id, user_id, amount, created_at, description")
        .eq("status", "completed")
        .ilike("description", "%pioneiro%")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error || !txns?.length) return [];

      const userIds = [...new Set((txns as any[]).map((t) => t.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);

      const nameMap = new Map((profiles || []).map((p) => [p.id, p.name]));

      return (txns as any[]).map((t) => ({
        id: t.id,
        user_name: nameMap.get(t.user_id) || "Pioneiro",
        amount: t.amount,
        created_at: t.created_at,
      }));
    },
    staleTime: 60_000,
  });

  // Realtime subscription for new pioneer payments
  useEffect(() => {
    if (realtimeSetup.current) return;
    realtimeSetup.current = true;

    const unsub = subscribeTable('profiles', (payload: any) => {
      const profile = payload?.new as { id: string; name: string; payment_status: string; is_pioneiro?: boolean } | undefined;
      if (!profile?.is_pioneiro) return;
      if (profile.payment_status === "active") {
        toast({
          title: "🔥 Nova Assinatura Pioneira",
          description: `${profile.name || "Pioneiro"} - Valor: R$ 19,42`,
        });
        queryClient.invalidateQueries({ queryKey: ["admin-pioneer-slots"] });
        queryClient.invalidateQueries({ queryKey: ["admin-pioneer-sales"] });
      }
    }, { events: ['UPDATE'] });

    return () => {
      unsub();
      realtimeSetup.current = false;
    };
  }, [queryClient]);

  const filled = slots?.filled ?? 0;
  const total = slots?.total ?? 1000;
  const remaining = slots?.remaining ?? 1000;
  const pct = Math.min((filled / total) * 100, 100);

  // Financial summary from recent sales
  const totalGross = recentSales.reduce((s, t) => s + t.amount, 0);
  const financial = calcNetProfit(totalGross);

  const visibleSales = showHistory ? recentSales : recentSales.slice(0, 5);

  return (
    <Card className="border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/5 to-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#D4AF37]" />
          Status Campanha 1000 Originais
          <Badge
            variant="outline"
            className={cn(
              "ml-auto border-[#D4AF37]/50 text-[#D4AF37]",
              remaining === 0 && "border-destructive text-destructive"
            )}
          >
            {remaining === 0 ? "ESGOTADO" : `${remaining} restantes`}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-muted-foreground flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Vagas Preenchidas
            </span>
            <span className="font-bold text-foreground">{filled} / {total}</span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #D4AF37, #FFD700)",
              }}
            />
          </div>
        </div>

        {/* Financial breakdown */}
        {totalGross > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Receita Bruta
              </p>
              <p className="text-lg font-bold text-foreground">
                R$ {totalGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Lucro Líquido
              </p>
              <p className="text-lg font-bold text-emerald-500">
                R$ {financial.net.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Stripe: -R$ {financial.stripeFee.toFixed(2)} | Impostos: -R$ {financial.tax.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Recent pioneer sales feed */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-500" /> Últimas Assinaturas Pioneiras
          </p>

          {recentSales.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhuma assinatura pioneira registrada ainda.
            </p>
          ) : (
            <>
              <ScrollArea className={cn(showHistory ? "max-h-[240px]" : "max-h-[180px]")}>
                <div className="space-y-2">
                  {visibleSales.map((sale) => {
                    const profits = calcNetProfit(sale.amount);
                    return (
                      <div
                        key={sale.id}
                        className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">🔥</span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{sale.user_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(sale.created_at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-[#D4AF37]">
                            R$ {sale.amount.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-emerald-500">
                            Lucro: R$ {profits.net.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {recentSales.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs text-muted-foreground"
                  onClick={() => setShowHistory((v) => !v)}
                >
                  <History className="w-3 h-3 mr-1" />
                  {showHistory ? "Mostrar menos" : `Ver Histórico (${recentSales.length})`}
                  <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", showHistory && "rotate-180")} />
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
