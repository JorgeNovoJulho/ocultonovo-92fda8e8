import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Crown,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { useAdminBypass } from "@/hooks/useAdminBypass";
import { Navigate } from "react-router-dom";

const fmtMoney = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
const fmtNum = (v: number | null | undefined) => Number(v || 0).toLocaleString("pt-BR");

const STALE = 60_000; // 1 min — leve, sem polling pesado

// ─────────── Hooks: cada bloco busca seu pedaço, em paralelo, com cache ───────────

function useWebhookStats() {
  return useQuery({
    queryKey: ["fin-central-webhooks"],
    staleTime: STALE,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("oculto_asaas_webhook_logs")
        .select("status, processing_ms, error_message, received_at, event_type")
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = data || [];
      const total = rows.length;
      const processed = rows.filter((r: any) => r.status === "processed").length;
      const duplicated = rows.filter((r: any) => r.status === "duplicated").length;
      const failed = rows.filter((r: any) => r.status === "failed").length;
      const lat = rows
        .map((r: any) => r.processing_ms)
        .filter((n: any) => typeof n === "number") as number[];
      const avgLatency = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
      const errors = rows.filter((r: any) => r.error_message).slice(0, 5);
      return { total, processed, duplicated, failed, avgLatency, errors };
    },
  });
}

function useSubscriptionsKpi() {
  return useQuery({
    queryKey: ["fin-central-subs-kpi"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_admin_asaas_subscriptions_kpi")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data || {};
    },
  });
}

function useWalletsStats() {
  return useQuery({
    queryKey: ["fin-central-wallets"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("balance, pending_balance, frozen_balance")
        .or("balance.gt.0,pending_balance.gt.0,frozen_balance.gt.0,balance.lt.0");
      if (error) throw error;
      const rows = data || [];
      let pending = 0,
        available = 0,
        blocked = 0,
        negativeCount = 0;
      for (const r of rows) {
        pending += Number(r.pending_balance || 0);
        available += Number(r.balance || 0);
        blocked += Number(r.frozen_balance || 0);
        if (Number(r.balance || 0) < 0) negativeCount++;
      }
      return { pending, available, blocked, negativeCount };
    },
  });
}

function useWithdrawalsStats() {
  return useQuery({
    queryKey: ["fin-central-withdrawals"],
    staleTime: STALE,
    queryFn: async (): Promise<{ pending: number; approved: number; failed: number; blocked: number; totalApproved: number }> => {
      const { data, error } = await (supabase as any)
        .from("withdrawal_requests")
        .select("status, amount")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;
      const rows = data || [];
      let pending = 0, approved = 0, failed = 0, blocked = 0, totalApproved = 0;
      for (const r of rows) {
        const s = (r.status || "").toLowerCase();
        if (s === "pending") pending++;
        else if (s === "approved" || s === "paid" || s === "completed") { approved++; totalApproved += Number(r.amount || 0); }
        else if (s === "failed" || s === "error") failed++;
        else if (s === "blocked" || s === "rejected") blocked++;
      }
      return { pending, approved, failed, blocked, totalApproved };
    },
  });
}

function useChargebackStats() {
  return useQuery({
    queryKey: ["fin-central-chargebacks"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_admin_refund_chargeback_overview")
        .select("*")
        .maybeSingle();
      if (error) return { open_disputes: 0, resolved_disputes: 0, amount_in_dispute: 0, total_debt_open: 0 };
      return data || {};
    },
  });
}

function useSplitStats() {
  return useQuery({
    queryKey: ["fin-central-split"],
    staleTime: STALE,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("split_telemetry")
        .select("event_type, amount_total, platform_amount, tax_amount, affiliate_amount, creator_amount, used_fallback, status")
        .gte("created_at", since);
      if (error) {
        return { platform: 0, taxes: 0, affiliates: 0, creators: 0, fallback: 0, failures: 0, total: 0 };
      }
      const rows = data || [];
      let platform = 0,
        taxes = 0,
        affiliates = 0,
        creators = 0,
        fallback = 0,
        failures = 0;
      for (const r of rows) {
        platform += Number(r.platform_amount || 0);
        taxes += Number(r.tax_amount || 0);
        affiliates += Number(r.affiliate_amount || 0);
        creators += Number(r.creator_amount || 0);
        if (r.used_fallback) fallback++;
        if (r.status === "failed" || r.status === "error") failures++;
      }
      return { platform, taxes, affiliates, creators, fallback, failures, total: rows.length };
    },
  });
}

// ─────────── Componente ───────────

export default function AdminAsaasFinanceCentralPage() {
  const { shouldBypass, isLoading: checkingAdmin } = useAdminBypass();

  const wh = useWebhookStats();
  const subs = useSubscriptionsKpi();
  const wallets = useWalletsStats();
  const wd = useWithdrawalsStats();
  const cb = useChargebackStats();
  const split = useSplitStats();

  const refreshAll = () => {
    wh.refetch();
    subs.refetch();
    wallets.refetch();
    wd.refetch();
    cb.refetch();
    split.refetch();
  };

  if (checkingAdmin) {
    return <div className="p-8 text-center text-muted-foreground">Verificando acesso...</div>;
  }
  if (!shouldBypass) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Alertas dinâmicos
  const alerts: { level: "high" | "med" | "low"; label: string; detail?: string }[] = [];
  if ((wh.data?.failed ?? 0) > 0) alerts.push({ level: "high", label: "Webhook ASAAS falhando", detail: `${wh.data?.failed} falhas em 24h` });
  if ((split.data?.fallback ?? 0) > 0) alerts.push({ level: "med", label: "Split usou fallback", detail: `${split.data?.fallback} ocorrências (30d)` });
  if ((split.data?.failures ?? 0) > 0) alerts.push({ level: "high", label: "Falhas de split", detail: `${split.data?.failures} eventos` });
  if ((wallets.data?.negativeCount ?? 0) > 0) alerts.push({ level: "high", label: "Saldos negativos", detail: `${wallets.data?.negativeCount} criadores` });
  if ((cb.data as any)?.open_disputes > 0) alerts.push({ level: "med", label: "Chargebacks abertos", detail: `${(cb.data as any)?.open_disputes} disputas` });
  if ((subs.data as any)?.overdue_count > 0) alerts.push({ level: "med", label: "Assinaturas vencidas", detail: `${(subs.data as any)?.overdue_count} overdue` });
  if ((wd.data?.failed ?? 0) > 0) alerts.push({ level: "low", label: "Saques falhos", detail: `${wd.data?.failed} no mês` });

  const KpiCard = ({
    label,
    value,
    icon: Icon,
    tone = "text-muted-foreground",
  }: {
    label: string;
    value: React.ReactNode;
    icon: any;
    tone?: string;
  }) => (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${tone}`} />
        </div>
        <div className="text-lg sm:text-xl font-bold mt-1 truncate">{value}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Central Financeira ASAAS</h1>
          <p className="text-sm text-muted-foreground">
            Visão profissional do ecossistema financeiro: webhooks, split, wallets, assinaturas, saques e chargebacks.
          </p>
        </div>
        <Button onClick={refreshAll} size="sm" variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar tudo
        </Button>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Alertas ativos ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {alerts.map((a, i) => (
              <Badge
                key={i}
                variant={a.level === "high" ? "destructive" : a.level === "med" ? "default" : "secondary"}
                className="text-xs"
              >
                {a.label}
                {a.detail && <span className="ml-1 opacity-80">· {a.detail}</span>}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="webhooks" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="split">Split</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="subs">Assinaturas</TabsTrigger>
          <TabsTrigger value="withdrawals">Saques</TabsTrigger>
          <TabsTrigger value="chargebacks">Chargebacks</TabsTrigger>
        </TabsList>

        {/* Webhooks */}
        <TabsContent value="webhooks" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="Recebidos (24h)" value={fmtNum(wh.data?.total)} icon={Activity} />
            <KpiCard label="Processados" value={fmtNum(wh.data?.processed)} icon={CheckCircle2} tone="text-emerald-500" />
            <KpiCard label="Duplicados (idempotência)" value={fmtNum(wh.data?.duplicated)} icon={ShieldAlert} tone="text-blue-500" />
            <KpiCard label="Falhos" value={fmtNum(wh.data?.failed)} icon={XCircle} tone="text-red-500" />
            <KpiCard label="Latência média" value={`${wh.data?.avgLatency ?? 0}ms`} icon={Zap} />
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Últimos erros</CardTitle>
            </CardHeader>
            <CardContent>
              {(wh.data?.errors?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">Sem erros nas últimas 24h.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {wh.data!.errors.map((e: any, i: number) => (
                    <li key={i} className="border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">{new Date(e.received_at).toLocaleString("pt-BR")}</span>
                      <span className="mx-2">·</span>
                      <span className="font-medium">{e.event_type}</span>
                      <div className="text-red-500 break-all">{e.error_message}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Split */}
        <TabsContent value="split" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Plataforma (30d)" value={fmtMoney(split.data?.platform)} icon={Crown} tone="text-amber-500" />
            <KpiCard label="Impostos" value={fmtMoney(split.data?.taxes)} icon={Wallet} />
            <KpiCard label="Afiliados" value={fmtMoney(split.data?.affiliates)} icon={TrendingDown} tone="text-blue-500" />
            <KpiCard label="Criadores" value={fmtMoney(split.data?.creators)} icon={Banknote} tone="text-emerald-500" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard label="Fallback usado" value={fmtNum(split.data?.fallback)} icon={ShieldAlert} tone="text-amber-500" />
            <KpiCard label="Falhas de split" value={fmtNum(split.data?.failures)} icon={XCircle} tone="text-red-500" />
            <KpiCard label="Eventos totais" value={fmtNum(split.data?.total)} icon={Activity} />
          </div>
        </TabsContent>

        {/* Wallets */}
        <TabsContent value="wallets" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Pendente (D+7)" value={fmtMoney(wallets.data?.pending)} icon={Wallet} />
            <KpiCard label="Disponível" value={fmtMoney(wallets.data?.available)} icon={Banknote} tone="text-emerald-500" />
            <KpiCard label="Bloqueado/Frozen" value={fmtMoney(wallets.data?.blocked)} icon={ShieldAlert} tone="text-amber-500" />
            <KpiCard label="Criadores negativos" value={fmtNum(wallets.data?.negativeCount)} icon={AlertTriangle} tone="text-red-500" />
          </div>
        </TabsContent>

        {/* Subscriptions */}
        <TabsContent value="subs" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Ativas" value={fmtNum((subs.data as any)?.active_count)} icon={CheckCircle2} tone="text-emerald-500" />
            <KpiCard label="Overdue" value={fmtNum((subs.data as any)?.overdue_count)} icon={AlertTriangle} tone="text-amber-500" />
            <KpiCard label="Canceladas" value={fmtNum((subs.data as any)?.cancelled_count)} icon={XCircle} tone="text-red-500" />
            <KpiCard label="Reativadas" value={fmtNum((subs.data as any)?.reactivated_count)} icon={RefreshCw} tone="text-blue-500" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard label="MRR Ativo" value={fmtMoney((subs.data as any)?.mrr_active)} icon={Crown} tone="text-amber-500" />
            <KpiCard label="Premium ativos" value={fmtNum((subs.data as any)?.premium_active)} icon={Crown} />
            <KpiCard label="VIP ativos" value={fmtNum((subs.data as any)?.vip_active)} icon={Crown} tone="text-amber-500" />
          </div>
        </TabsContent>

        {/* Withdrawals */}
        <TabsContent value="withdrawals" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Pendentes" value={fmtNum(wd.data?.pending)} icon={Activity} tone="text-amber-500" />
            <KpiCard label="Aprovados (30d)" value={fmtNum(wd.data?.approved)} icon={CheckCircle2} tone="text-emerald-500" />
            <KpiCard label="Falhos" value={fmtNum(wd.data?.failed)} icon={XCircle} tone="text-red-500" />
            <KpiCard label="Bloqueados" value={fmtNum(wd.data?.blocked)} icon={ShieldAlert} tone="text-red-500" />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <KpiCard label="Total aprovado (30d)" value={fmtMoney(wd.data?.totalApproved)} icon={Banknote} tone="text-emerald-500" />
          </div>
        </TabsContent>

        {/* Chargebacks */}
        <TabsContent value="chargebacks" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Abertos" value={fmtNum((cb.data as any)?.open_disputes)} icon={AlertTriangle} tone="text-amber-500" />
            <KpiCard label="Resolvidos" value={fmtNum((cb.data as any)?.resolved_disputes)} icon={CheckCircle2} tone="text-emerald-500" />
            <KpiCard label="Em disputa" value={fmtMoney((cb.data as any)?.amount_in_dispute)} icon={CreditCard} tone="text-red-500" />
            <KpiCard label="Dívida aberta" value={fmtMoney((cb.data as any)?.total_debt_open)} icon={Wallet} tone="text-red-500" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
