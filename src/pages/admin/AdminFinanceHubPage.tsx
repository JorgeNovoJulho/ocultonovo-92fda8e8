import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Wallet,
  TrendingUp,
  Shield,
  Banknote,
  ShoppingCart,
  MessageSquare,
  Heart,
  ArrowRight,
  AlertCircle,
  Settings2,
  Percent,
  CreditCard,
  Layers,
  Save,
  Loader2,
  CheckCircle2,
  BarChart3,
  Users,
  DollarSign,
  Download,
  Search,
  RefreshCw,
  Gift,
} from "lucide-react";
import {
  useFinancialSummary,
  useRecentTransactions,
  usePendingWithdrawalsCount,
} from "@/hooks/useAdminFinanceHub";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { PlanDistributionChart } from "@/components/admin/PlanDistributionChart";
import { ConversionFunnelChart } from "@/components/admin/ConversionFunnelChart";
import { RevenueProjectionCard } from "@/components/admin/RevenueProjectionCard";
import { AdminPayoutCard } from "@/components/admin/AdminPayoutCard";
import { AdminWithdrawalsPanel } from "@/components/admin/AdminWithdrawalsPanel";
import { useRevenueMetrics, useAllUsersWithEmail, useConversionMetrics } from "@/hooks/useRevenueMetrics";
import { exportToCSV, exportToExcel, userBillingExportColumns } from "@/lib/exportUtils";
import { toast as sonnerToast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  subscription: { label: "Assinatura", icon: <Heart className="h-3.5 w-3.5" />, color: "text-[hsl(45,93%,47%)]" },
  content_purchase: { label: "Conteúdo", icon: <ShoppingCart className="h-3.5 w-3.5" />, color: "text-primary" },
  message_paid: { label: "Mensagem", icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-blue-400" },
  tip: { label: "Gorjeta", icon: <Heart className="h-3.5 w-3.5" />, color: "text-pink-400" },
  recharge: { label: "Recarga", icon: <Wallet className="h-3.5 w-3.5" />, color: "text-[hsl(142,76%,36%)]" },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Painel de configuração de split e cartão */
function SplitConfigPanel() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-split-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "platform_fee_percentage",
          "credit_card_enabled",
          "max_installments",
          "installment_interest_percent",
        ]);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((s) => {
        map[s.key] = s.value;
      });
      return {
        platformFee: parseFloat(String(map["platform_fee_percentage"] ?? "20")),
        creditCardEnabled:
          map["credit_card_enabled"] === true || map["credit_card_enabled"] === "true",
        maxInstallments: parseInt(String(map["max_installments"] ?? "12")),
        installmentInterest: parseFloat(String(map["installment_interest_percent"] ?? "2.99")),
      };
    },
  });

  const [local, setLocal] = useState<{
    platformFee: number;
    creditCardEnabled: boolean;
    maxInstallments: number;
    installmentInterest: number;
  } | null>(null);

  const config = local ?? settings ?? {
    platformFee: 20,
    creditCardEnabled: true,
    maxInstallments: 12,
    installmentInterest: 2.99,
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const upserts = [
        { key: "platform_fee_percentage", value: config.platformFee },
        { key: "credit_card_enabled", value: config.creditCardEnabled },
        { key: "max_installments", value: config.maxInstallments },
        { key: "installment_interest_percent", value: config.installmentInterest },
      ];
      for (const u of upserts) {
        await supabase.from("system_settings").upsert(u, { onConflict: "key" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-split-config"] });
      toast({ title: "✅ Configurações salvas", description: "Split e cartão atualizados." });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    },
  });

  const set = (key: keyof typeof config, value: any) => {
    setLocal((prev) => ({ ...(prev ?? config), [key]: value }));
  };

  const creatorPercent = Math.max(0, 100 - config.platformFee);

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl border border-border/50 bg-muted/10 space-y-3">
        <p className="text-xs font-semibold text-foreground/80 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" /> Divisão Automática por Transação
        </p>
        <div className="flex gap-2 items-center text-sm">
          <div
            className="h-4 rounded-l-full bg-primary transition-all"
            style={{ width: `${config.platformFee}%` }}
          />
          <div
            className="h-4 rounded-r-full bg-[hsl(142,76%,36%)] transition-all"
            style={{ width: `${creatorPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            Plataforma: <strong className="text-foreground ml-1">{config.platformFee}%</strong>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[hsl(142,76%,36%)]" />
            Criador VIP: <strong className="text-[hsl(142,76%,36%)] ml-1">{creatorPercent}%</strong>
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <Percent className="h-3.5 w-3.5 text-primary" />
          Comissão Plataforma (%)
        </Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={config.platformFee}
            onChange={(e) => set("platformFee", parseFloat(e.target.value) || 0)}
            className="h-9 text-sm max-w-[120px]"
          />
          <div className="flex items-center px-3 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground flex-1">
            O criador VIP recebe automaticamente{" "}
            <strong className="text-[hsl(142,76%,36%)] mx-1">{creatorPercent}%</strong> líquido
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/10">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Aceitar Cartão de Crédito</p>
            <p className="text-xs text-muted-foreground">
              Habilitar/desabilitar globalmente para todos os checkouts
            </p>
          </div>
        </div>
        <Switch
          checked={config.creditCardEnabled}
          onCheckedChange={(v) => set("creditCardEnabled", v)}
        />
      </div>

      <div
        className={`space-y-3 transition-opacity ${
          config.creditCardEnabled ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        <p className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-primary" /> Configuração de Parcelamento
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Máximo de Parcelas</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={config.maxInstallments}
              onChange={(e) => set("maxInstallments", parseInt(e.target.value) || 1)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Juros por Parcela (%)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={config.installmentInterest}
              onChange={(e) => set("installmentInterest", parseFloat(e.target.value) || 0)}
              className="h-9 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Ex: parcela 3x sem juros → defina juros como 0. Parcelamento até {config.maxInstallments}x
          com {config.installmentInterest}% a.m.
        </p>
      </div>

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || isLoading}
        className="w-full h-9 text-sm bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2"
      >
        {saveMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
          </>
        ) : saveMutation.isSuccess ? (
          <>
            <CheckCircle2 className="h-4 w-4" /> Salvo!
          </>
        ) : (
          <>
            <Save className="h-4 w-4" /> Salvar Configurações
          </>
        )}
      </Button>
    </div>
  );
}

/** Modal de concessão manual de plano */
function GrantPlanModal() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("premium");
  const [daysExtension, setDaysExtension] = useState(30);

  const { data: users, isLoading: loadingSearch } = useQuery({
    queryKey: ["admin-user-search", search],
    queryFn: async () => {
      if (search.length < 2) return [];
      const { data } = await (supabase as any).rpc("search_users_with_email", {
        search_term: search,
        page_limit: 8,
        page_offset: 0,
      });
      return (data || []) as any[];
    },
    enabled: search.length >= 2,
  });

  const grantMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error("Selecione um usuário");
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + daysExtension);

      const { error } = await supabase
        .from("profiles")
        .update({
          plan_type: selectedPlan,
          payment_status: "active",
          payment_due_date: dueDate.toISOString(),
        })
        .eq("id", selectedUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-financial-summary"] });
      toast({
        title: "✅ Plano concedido",
        description: `Plano ${selectedPlan} ativado por ${daysExtension} dias.`,
      });
      setSearch("");
      setSelectedUserId(null);
    },
    onError: (e: any) =>
      toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const selectedUser = users?.find((u: any) => u.id === selectedUserId);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-[hsl(142,76%,36%)]/30 text-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,36%)]/10"
        >
          <Gift className="h-4 w-4" />
          Conceder Plano
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-[hsl(142,76%,36%)]" />
            Conceder Plano Manualmente
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* User search */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Buscar usuário (nome, email ou @)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedUserId(null);
                }}
                placeholder="Digite para buscar..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            {loadingSearch && (
              <div className="space-y-1">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
            {users && users.length > 0 && !selectedUserId && (
              <div className="border border-border/50 rounded-lg overflow-hidden">
                {users.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className="w-full text-left p-3 text-sm hover:bg-muted/50 flex items-center gap-2 border-b border-border/30 last:border-0"
                  >
                    <div>
                      <p className="font-medium text-foreground">{u.name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.email} {u.username ? `· @${u.username}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {u.plan_type || "free"}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {selectedUser && (
              <div className="p-3 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(142,76%,36%)]" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">{selectedUser.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                </div>
                <button
                  onClick={() => { setSelectedUserId(null); setSearch(""); }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Trocar
                </button>
              </div>
            )}
          </div>

          {/* Plan & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Plano</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Gratuito</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Duração (dias)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={daysExtension}
                onChange={(e) => setDaysExtension(parseInt(e.target.value) || 30)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <Button
            onClick={() => grantMutation.mutate()}
            disabled={!selectedUserId || grantMutation.isPending}
            className="w-full gap-2 bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(152,60%,30%)] hover:opacity-90"
          >
            {grantMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Concedendo…
              </>
            ) : (
              <>
                <Gift className="h-4 w-4" /> Conceder Plano {selectedPlan}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Métricas de receita real por período, excluindo bots */
function ReportsTab() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<"7" | "30" | "all">("30");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: metrics, isLoading: loadingMetrics } = useRevenueMetrics();
  const { data: allUsers, isLoading: loadingUsers } = useAllUsersWithEmail();
  const { data: conversion } = useConversionMetrics();

  // Filtragem de período por subscription_revenue não disponível diretamente,
  // então buscamos transações filtradas por período excluindo is_seed
  const { data: periodMetrics, isLoading: loadingPeriod } = useQuery({
    queryKey: ["admin-period-revenue", period],
    queryFn: async () => {
      let query = (supabase as any)
        .from("transactions")
        .select("amount, type, created_at, user_id")
        .eq("status", "completed")
        .gt("amount", 0);

      if (period !== "all") {
        const since = new Date();
        since.setDate(since.getDate() - parseInt(period));
        query = query.gte("created_at", since.toISOString());
      }

      const { data: txns, error } = await query;
      if (error) return null;

      // Obter IDs de bots para exclusão
      const { data: bots } = await supabase
        .from("profiles")
        .select("id")
        .eq("is_seed", true as any);

      const botIds = new Set((bots || []).map((b: any) => b.id));

      const real = (txns || []).filter((t: any) => !botIds.has(t.user_id));

      const totals = real.reduce(
        (acc: any, t: any) => {
          acc.total += Number(t.amount) || 0;
          const type = t.type as string;
          if (type === "subscription") acc.subscription += Number(t.amount) || 0;
          else if (type === "content_purchase") acc.content += Number(t.amount) || 0;
          else if (type === "message_paid") acc.messages += Number(t.amount) || 0;
          else if (type === "tip") acc.tips += Number(t.amount) || 0;
          acc.count++;
          return acc;
        },
        { total: 0, subscription: 0, content: 0, messages: 0, tips: 0, count: 0 }
      );

      return totals;
    },
    staleTime: 2 * 60_000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-period-revenue"] });
    queryClient.invalidateQueries({ queryKey: ["admin-revenue-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["admin-plan-distribution"] });
    queryClient.invalidateQueries({ queryKey: ["admin-all-users-with-email"] });
    sonnerToast.success("Dados atualizados!");
  };

  const handleExportCSV = () => {
    if (!allUsers?.length) { sonnerToast.error("Nenhum dado para exportar"); return; }
    exportToCSV(allUsers, "usuarios_billing", userBillingExportColumns);
    sonnerToast.success("CSV exportado!");
  };
  const handleExportExcel = () => {
    if (!allUsers?.length) { sonnerToast.error("Nenhum dado para exportar"); return; }
    exportToExcel(allUsers, "usuarios_billing", userBillingExportColumns);
    sonnerToast.success("Excel exportado!");
  };

  const filteredUsers = useMemo(
    () =>
      (allUsers || [])
        .filter((u) => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            u.name?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.username?.toLowerCase().includes(q)
          );
        })
        .slice(0, 25),
    [allUsers, searchQuery]
  );

  const getPlanBadge = (plan: string | null) => {
    switch (plan) {
      case "vip":
        return <Badge className="bg-[hsl(45,93%,47%)] text-black text-[10px]">VIP</Badge>;
      case "premium":
      case "monthly":
        return <Badge className="text-[10px] bg-primary">Premium</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">Gratuito</Badge>;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "overdue":
        return <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>;
      case "suspended":
        return <Badge variant="outline" className="text-destructive text-[10px]">Suspenso</Badge>;
      default:
        return <Badge variant="outline" className="text-[hsl(142,76%,36%)] text-[10px]">Ativo</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground font-medium">Período:</p>
          {(["7", "30", "all"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              className="h-8 text-xs px-3"
              onClick={() => setPeriod(p)}
            >
              {p === "7" ? "7 dias" : p === "30" ? "30 dias" : "Total"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleExportExcel}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <GrantPlanModal />
        </div>
      </div>

      {/* KPI Period Cards — mobile: 2 cols, desktop: 4 cols */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loadingPeriod ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-[hsl(142,76%,36%)]" />
                  <span className="text-xs text-muted-foreground">Receita Real</span>
                </div>
                <p className="text-xl font-bold text-[hsl(142,76%,36%)]">
                  {fmt(periodMetrics?.total ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {periodMetrics?.count ?? 0} transações
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                  <span className="text-xs text-muted-foreground">Assinaturas</span>
                </div>
                <p className="text-xl font-bold text-[hsl(45,93%,47%)]">
                  {fmt(periodMetrics?.subscription ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Conteúdo</span>
                </div>
                <p className="text-xl font-bold text-primary">
                  {fmt(periodMetrics?.content ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-blue-400" />
                  <span className="text-xs text-muted-foreground">Msgs + Tips</span>
                </div>
                <p className="text-xl font-bold text-blue-400">
                  {fmt((periodMetrics?.messages ?? 0) + (periodMetrics?.tips ?? 0))}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Global KPIs from RPC */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Receita Total", value: metrics?.total_revenue, color: "text-foreground", icon: <DollarSign className="h-4 w-4" /> },
          { label: "MRR Estimado", value: metrics?.mrr_estimate, color: "text-primary", icon: <TrendingUp className="h-4 w-4 text-primary" /> },
          { label: "Usuários Pagantes", value: null, raw: metrics?.paid_users, color: "text-[hsl(45,93%,47%)]", icon: <Users className="h-4 w-4 text-[hsl(45,93%,47%)]" /> },
          { label: "Conversão", value: null, raw: conversion?.conversionRate, suffix: "%", color: "text-[hsl(142,76%,36%)]", icon: <BarChart3 className="h-4 w-4 text-[hsl(142,76%,36%)]" /> },
        ].map(({ label, value, raw, color, icon, suffix }) => (
          <Card key={label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              {loadingMetrics ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className={`text-xl font-bold ${color}`}>
                  {value !== undefined && value !== null
                    ? fmt(value)
                    : `${raw?.toFixed(raw && raw < 10 ? 1 : 0) ?? 0}${suffix ?? ""}`}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PlanDistributionChart />
        <ConversionFunnelChart />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RevenueProjectionCard />
      </div>

      {/* Users list — Cards on mobile, no horizontal scroll */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usuários (excl. bots)
            <Badge variant="outline" className="ml-auto text-xs">
              {allUsers?.length ?? 0}
            </Badge>
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou @username"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              {searchQuery ? "Nenhum usuário encontrado" : "Sem dados"}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.name || "Sem nome"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email} {user.username ? `· @${user.username}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getPlanBadge(user.plan_type)}
                    {getStatusBadge(user.payment_status)}
                    <span className="text-xs font-mono text-muted-foreground">
                      {fmt(user.balance ?? 0)}
                    </span>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 25 && (
                <p className="text-xs text-center text-muted-foreground pt-1">
                  Mostrando 25 primeiros resultados. Use a busca para filtrar.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminFinanceHubPage() {
  const { data: summary, isLoading: loadingSummary } = useFinancialSummary();
  const [showTransactions, setShowTransactions] = useState(false);
  const { data: transactions = [], isLoading: loadingTxns } = useRecentTransactions(30, showTransactions);
  const { data: pendingCount = 0 } = usePendingWithdrawalsCount();

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/20">
            <Wallet className="h-6 w-6 text-[hsl(45,93%,47%)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Hub Financeiro</h1>
            <p className="text-muted-foreground text-sm">Visão consolidada · métricas reais · sem bots</p>
          </div>
        </div>
        <GrantPlanModal />
      </div>

      {/* Asaas Balance & Payout */}
      <AdminPayoutCard />

      {/* Creator Withdrawal Requests */}
      <AdminWithdrawalsPanel />

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="relative overflow-hidden border-0">
          <div className="absolute inset-0 rounded-lg p-[1.5px] bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(152,60%,30%)] -z-10" />
          <div className="bg-card rounded-[calc(0.5rem-1.5px)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-[hsl(142,76%,36%)]" />
                <span className="text-sm font-medium text-[hsl(142,76%,36%)] tracking-wide">
                  Lucro Líquido (20%)
                </span>
              </div>
              {loadingSummary ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <p className="text-3xl font-bold text-[hsl(142,76%,36%)] tracking-tight">
                  {fmt(summary?.platform_profit ?? 0)}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Sobre receita total de {fmt(summary?.total_revenue ?? 0)}
              </p>
            </CardContent>
          </div>
        </Card>

        <Card className="relative overflow-hidden border-0">
          <div className="absolute inset-0 rounded-lg p-[1.5px] bg-gradient-to-r from-yellow-500 to-orange-500 -z-10" />
          <div className="bg-card rounded-[calc(0.5rem-1.5px)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-yellow-500" />
                <span className="text-sm font-medium text-yellow-500 tracking-wide">
                  Reserva de Imposto (15%)
                </span>
              </div>
              {loadingSummary ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <p className="text-3xl font-bold text-yellow-500 tracking-tight">
                  {fmt(summary?.tax_reserve ?? 0)}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Provisão sobre o lucro líquido</p>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Revenue mini breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Receita Mensal", value: summary?.monthly_revenue, color: "text-foreground" },
          { label: "Assinaturas", value: summary?.subscription_revenue, color: "text-[hsl(45,93%,47%)]" },
          { label: "Conteúdos", value: summary?.content_revenue, color: "text-primary" },
          { label: "Mensagens", value: summary?.message_revenue, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground tracking-wide">{label}</p>
              {loadingSummary ? (
                <Skeleton className="h-7 w-20 mt-1" />
              ) : (
                <p className={`text-xl font-bold tracking-tight mt-1 ${color}`}>
                  {fmt(value ?? 0)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="relatorios" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="relatorios" className="gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" />
            Relatórios
          </TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs sm:text-sm">Transações</TabsTrigger>
          <TabsTrigger value="withdrawals" className="text-xs sm:text-sm">
            Saques
            {pendingCount > 0 && (
              <Badge className="ml-1.5 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs sm:text-sm">Aprovações</TabsTrigger>
          <TabsTrigger value="split" className="flex items-center gap-1 text-xs sm:text-sm">
            <Settings2 className="h-3.5 w-3.5" />
            Split
          </TabsTrigger>
        </TabsList>

        {/* Relatórios (consolidado) */}
        <TabsContent value="relatorios">
          <ReportsTab />
        </TabsContent>

        {/* Transactions */}
        <TabsContent value="transactions">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Banknote className="h-5 w-5 text-primary" />
                Transações Recentes
                <Badge variant="outline" className="ml-auto text-xs">
                  {summary?.monthly_transactions ?? 0} este mês
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showTransactions ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <p className="text-sm text-muted-foreground">Clique para carregar as transações</p>
                  <Button variant="outline" size="sm" onClick={() => setShowTransactions(true)}>
                    Carregar Transações
                  </Button>
                </div>
              ) : loadingTxns ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <p className="text-sm">Nenhuma transação encontrada</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {transactions.map((t) => {
                    const cfg = TYPE_LABELS[t.type] || {
                      label: t.type,
                      icon: <Banknote className="h-3.5 w-3.5" />,
                      color: "text-foreground",
                    };
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30 gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1.5 rounded-md bg-muted/50 ${cfg.color}`}>{cfg.icon}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{t.user_name}</p>
                            <p className="text-xs text-muted-foreground tracking-wide">
                              {cfg.label} · {new Date(t.created_at).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-[hsl(142,76%,36%)] shrink-0 tracking-tight">
                          {fmt(t.amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Withdrawals */}
        <TabsContent value="withdrawals">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6 flex flex-col items-center gap-4">
              <Banknote className="h-10 w-10 text-[hsl(45,93%,47%)]" />
              <p className="text-muted-foreground text-sm text-center">
                Gerencie solicitações de saque dos criadores VIP
              </p>
              {pendingCount > 0 && (
                <Badge className="bg-destructive text-destructive-foreground">
                  {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
                </Badge>
              )}
              <Link to="/admin/withdrawals">
                <Button className="gap-2 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-semibold">
                  Gestão de Saques <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals */}
        <TabsContent value="approvals">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6 flex flex-col items-center gap-4">
              <Shield className="h-10 w-10 text-yellow-500" />
              <p className="text-muted-foreground text-sm text-center">
                Analise solicitações de limite especial com avaliação de risco
              </p>
              <Link to="/admin/special-requests">
                <Button
                  variant="outline"
                  className="gap-2 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
                >
                  Solicitações Especiais <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Split */}
        <TabsContent value="split">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Configuração de Split & Cartão
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Defina a comissão da plataforma — o restante vai automaticamente para o criador VIP via
                split.
              </p>
            </CardHeader>
            <CardContent>
              <SplitConfigPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
