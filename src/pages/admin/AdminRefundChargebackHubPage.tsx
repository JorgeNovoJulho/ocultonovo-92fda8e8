import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, TrendingDown, Users, Wallet, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface Overview {
  open_disputes: number;
  total_refunds: number;
  resolved_disputes: number;
  creators_with_debt: number;
  total_debt_open: number;
  affiliate_reversals: number;
  amount_in_dispute: number;
  pending_cancelled_amount: number;
}

interface Debt {
  id: string;
  creator_id: string;
  creator_name: string | null;
  username: string | null;
  amount: number;
  amount_settled: number;
  open_amount: number;
  status: string;
  reason: string;
  created_at: string;
}

const fmt = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

export default function AdminRefundChargebackHubPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: ov, error: e1 }, { data: dt, error: e2 }] = await Promise.all([
      (supabase as any).from("v_admin_refund_chargeback_overview").select("*").maybeSingle(),
      (supabase as any).from("v_admin_creator_debts").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (e1) toast.error("Erro ao carregar overview: " + e1.message);
    if (e2) toast.error("Erro ao carregar dívidas: " + e2.message);
    setOverview(ov || null);
    setDebts(dt || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const cards = [
    { label: "Disputas Abertas", value: overview?.open_disputes ?? 0, icon: AlertTriangle, tone: "text-amber-500" },
    { label: "Refunds Totais", value: overview?.total_refunds ?? 0, icon: RefreshCw, tone: "text-blue-500" },
    { label: "Criadores com Dívida", value: overview?.creators_with_debt ?? 0, icon: Users, tone: "text-red-500" },
    { label: "Reversões Afiliado", value: overview?.affiliate_reversals ?? 0, icon: TrendingDown, tone: "text-orange-500" },
  ];
  const money = [
    { label: "Em Disputa", value: overview?.amount_in_dispute ?? 0, icon: ShieldAlert },
    { label: "Dívida Aberta", value: overview?.total_debt_open ?? 0, icon: Wallet },
    { label: "D+7 Cancelado", value: overview?.pending_cancelled_amount ?? 0, icon: RefreshCw },
  ];

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Refund · Chargeback · Dívida</h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de estornos, dívidas de criadores e reversões de afiliado.
          </p>
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <c.icon className={`w-4 h-4 ${c.tone}`} />
              </div>
              <div className="text-2xl font-bold mt-2">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {money.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <m.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-xl font-bold mt-2">{fmt(m.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criadores com saldo negativo / dívida</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Criador</th>
                  <th className="px-3 py-2 text-right">Dívida</th>
                  <th className="px-3 py-2 text-right">Quitado</th>
                  <th className="px-3 py-2 text-right">Aberto</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Criado</th>
                </tr>
              </thead>
              <tbody>
                {debts.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {loading ? "Carregando..." : "Nenhuma dívida registrada."}
                  </td></tr>
                )}
                {debts.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{d.creator_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">@{d.username || d.creator_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(d.amount)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{fmt(d.amount_settled)}</td>
                    <td className="px-3 py-2 text-right font-bold text-red-600">{fmt(d.open_amount)}</td>
                    <td className="px-3 py-2 text-xs">{d.reason}</td>
                    <td className="px-3 py-2">
                      <Badge variant={d.status === "settled" ? "default" : d.status === "open" ? "destructive" : "secondary"}>
                        {d.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
