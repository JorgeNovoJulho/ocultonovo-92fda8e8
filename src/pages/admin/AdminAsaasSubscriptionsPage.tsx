import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Crown, AlertTriangle, Pause, XCircle, CheckCircle2, TrendingUp, Snowflake } from "lucide-react";
import { toast } from "sonner";

interface KPI {
  active_count: number;
  overdue_count: number;
  suspended_count: number;
  cancelled_count: number;
  failed_count: number;
  reactivated_count: number;
  premium_active: number;
  vip_active: number;
  mrr_active: number;
  total_frozen: number;
}

interface Sub {
  id: string;
  asaas_subscription_id: string | null;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  full_name: string | null;
  plan_type: string;
  status: string;
  cycle: string;
  value: number;
  next_due_date: string | null;
  overdue_since: string | null;
  retry_count: number;
  last_payment_at: string | null;
  frozen_balance: number;
  last_event: string | null;
  created_at: string;
}

const fmt = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  overdue: "destructive",
  suspended: "destructive",
  cancelled: "secondary",
  refunded: "secondary",
  chargeback: "destructive",
  pending: "outline",
};

export default function AdminAsaasSubscriptionsPage() {
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: k, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
      (supabase as any).from("v_admin_asaas_subscriptions_kpi").select("*").maybeSingle(),
      (supabase as any).from("v_admin_asaas_subscriptions").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (e1) toast.error("Erro KPI: " + e1.message);
    if (e2) toast.error("Erro lista: " + e2.message);
    setKpi(k || null);
    setSubs(rows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = subs.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (s.username || "").toLowerCase().includes(q) ||
        (s.display_name || "").toLowerCase().includes(q) ||
        (s.asaas_subscription_id || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const cards = [
    { label: "Ativas", value: kpi?.active_count ?? 0, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Inadimplentes", value: kpi?.overdue_count ?? 0, icon: AlertTriangle, tone: "text-amber-500" },
    { label: "Suspensas", value: kpi?.suspended_count ?? 0, icon: Pause, tone: "text-orange-500" },
    { label: "Canceladas", value: kpi?.cancelled_count ?? 0, icon: XCircle, tone: "text-red-500" },
    { label: "Reativadas", value: kpi?.reactivated_count ?? 0, icon: TrendingUp, tone: "text-blue-500" },
    { label: "Falhas (refund/cb)", value: kpi?.failed_count ?? 0, icon: XCircle, tone: "text-rose-500" },
  ];

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Assinaturas ASAAS (Premium / VIP)</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada de assinaturas recorrentes, inadimplência e MRR.</p>
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Premium ativas</span>
              <Crown className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold mt-2">{kpi?.premium_active ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">VIP ativas</span>
              <Crown className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold mt-2">{kpi?.vip_active ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">MRR Ativo</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold mt-2">{fmt(kpi?.mrr_active)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Saldo congelado (VIP)</span>
              <Snowflake className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="text-xl font-bold mt-2">{fmt(kpi?.total_frozen)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Assinaturas</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Buscar por @usuário ou ID Asaas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <select
              className="text-sm border rounded-md px-2 bg-background"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="active">Ativas</option>
              <option value="overdue">Inadimplentes</option>
              <option value="suspended">Suspensas</option>
              <option value="cancelled">Canceladas</option>
              <option value="refunded">Refunded</option>
              <option value="chargeback">Chargeback</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Usuário</th>
                  <th className="px-3 py-2 text-left">Plano</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Ciclo</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Próximo venc.</th>
                  <th className="px-3 py-2 text-right">Retries</th>
                  <th className="px-3 py-2 text-right">Congelado</th>
                  <th className="px-3 py-2 text-left">Último evento</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">
                    {loading ? "Carregando..." : "Nenhuma assinatura encontrada."}
                  </td></tr>
                )}
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.display_name || s.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">@{s.username || (s.user_id?.slice(0, 8) ?? "?")}</div>
                      {s.asaas_subscription_id && (
                        <div className="text-[10px] text-muted-foreground/70">{s.asaas_subscription_id}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={s.plan_type === "vip" ? "default" : "secondary"}>
                        {s.plan_type.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant[s.status] || "outline"}>{s.status}</Badge>
                      {s.overdue_since && (
                        <div className="text-[10px] text-amber-600 mt-1">
                          desde {new Date(s.overdue_since).toLocaleDateString("pt-BR")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.cycle}</td>
                    <td className="px-3 py-2 text-right">{fmt(s.value)}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.next_due_date ? new Date(s.next_due_date).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{s.retry_count}</td>
                    <td className="px-3 py-2 text-right text-cyan-600">
                      {s.frozen_balance > 0 ? fmt(s.frozen_balance) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.last_event || "—"}</td>
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
