import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Wallet, ArrowUpRight, Lock, AlertTriangle, Clock, CheckCircle2,
  TrendingUp, KeyRound, EyeOff, Info, Loader2, FileDown, FileText,
  ChevronDown, ChevronUp, Send, Search, CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
import {
  useReferralPendingList,
  useReferralPaidList,
  useReferralBalance,
  useMonthlyWithdrawalUsage,
  useRequestReferralWithdrawal,
} from "@/hooks/useReferralCommissions";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { startOfMonth, subMonths, subDays } from "date-fns";

type RangeKey = "all" | "7d" | "30d" | "this_month" | "last_month" | "custom";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "all", label: "Todos os períodos" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "custom", label: "Personalizado" },
];

function rangeBounds(r: RangeKey, customFrom?: string, customTo?: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (r) {
    case "7d": return { from: subDays(now, 7), to: now };
    case "30d": return { from: subDays(now, 30), to: now };
    case "this_month": return { from: startOfMonth(now), to: now };
    case "last_month": {
      const last = subMonths(now, 1);
      return { from: startOfMonth(last), to: startOfMonth(now) };
    }
    case "custom": {
      const f = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
      const t = customTo ? new Date(`${customTo}T23:59:59`) : null;
      return { from: f, to: t };
    }
    default: return { from: null, to: null };
  }
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(s: string) {
  if (s === "paid") return "PAGA";
  if (s === "pending") return "EM ANÁLISE";
  if (s === "processing") return "PROCESSANDO";
  return s.toUpperCase();
}

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskPix(value: string | null | undefined, type: string | null | undefined): string {
  if (!value) return "—";
  const v = value.trim();
  if (type === "cpf" || /^\d{11}$/.test(v.replace(/\D/g, ""))) {
    const d = v.replace(/\D/g, "");
    if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  }
  if (v.includes("@")) {
    const [u, dom] = v.split("@");
    return `${u.slice(0, 2)}***@${dom}`;
  }
  if (v.length > 6) return `${v.slice(0, 3)}***${v.slice(-3)}`;
  return v;
}

export function ProfileFinancialSection() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: pending = [], isLoading: loadingPending } = useReferralPendingList();
  const { data: paid = [], isLoading: loadingPaid } = useReferralPaidList();
  const { data: balance } = useReferralBalance();
  const { data: usage } = useMonthlyWithdrawalUsage();
  const requestWithdrawal = useRequestReferralWithdrawal();

  const [range, setRange] = useState<RangeKey>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const [amountInput, setAmountInput] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [channelRetryKey, setChannelRetryKey] = useState(0);
  const lastWithdrawArgs = useRef<{ amount: number } | null>(null);

  // Realtime: atualiza saldo/listas quando saques ou comissões mudarem
  // Também detecta transição pending → paid e emite toast de confirmação.
  const notifiedPaidIds = useRef<Set<string>>(new Set());
  const paidListReady = useRef(false);

  // Pré-popular ids já pagos ANTES de habilitar o toast,
  // garantindo que abrir a página não dispare toast retroativo.
  useEffect(() => {
    if (loadingPaid) return;
    paid.forEach((w) => {
      if (w.status === "paid") notifiedPaidIds.current.add(w.id);
    });
    paidListReady.current = true;
  }, [paid, loadingPaid]);

  useEffect(() => {
    if (!user?.id) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["referral-balance"] });
      qc.invalidateQueries({ queryKey: ["referral-paid-list"] });
      qc.invalidateQueries({ queryKey: ["referral-pending-list"] });
      qc.invalidateQueries({ queryKey: ["referral-withdrawal-usage"] });
    };
    const unsubW = subscribeTable('referral_withdrawals', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.user_id !== user.id) return;
      invalidate();
      const newRow = payload?.new;
      if (
        paidListReady.current &&
        newRow?.id &&
        newRow.status === "paid" &&
        !notifiedPaidIds.current.has(newRow.id)
      ) {
        notifiedPaidIds.current.add(newRow.id);
        toast.success(
          `Saque confirmado: ${fmtBRL(Number(newRow.amount || 0))} foi pago via PIX.`,
          { duration: 6000 }
        );
      }
    });
    const unsubL = subscribeTable('referral_ledger', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.affiliate_id !== user.id) return;
      invalidate();
    });
    return () => { unsubW(); unsubL(); };
  }, [user?.id, qc, channelRetryKey]);



  const pixKey = (profile as any)?.pix_key || null;
  const pixType = (profile as any)?.pix_key_type || null;

  const minAmount = usage.minAmount;
  const remaining = usage.remaining;
  const available = balance?.available ?? 0;
  const earnedTotal = balance?.earned_total ?? 0;
  const withdrawnTotal = balance?.withdrawn_total ?? 0;

  const { filteredPending, filteredPaid } = useMemo(() => {
    const { from, to } = rangeBounds(range, customFrom, customTo);
    const inRange = (iso: string | null | undefined) => {
      if (!from && !to) return true;
      if (!iso) return false;
      const d = new Date(iso);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };
    return {
      filteredPending: pending.filter((c) => inRange(c.started_at)),
      filteredPaid: paid.filter((c) => inRange(c.paid_at || c.requested_at)),
    };
  }, [pending, paid, range, customFrom, customTo]);

  const filteredPendingTotal = filteredPending.reduce(
    (s, c) => s + c.total_commission_earned, 0
  );
  const filteredPaidTotal = filteredPaid.reduce((s, c) => s + c.amount, 0);

  const amountNum = Number((amountInput || "").replace(",", "."));
  const amountValid =
    !Number.isNaN(amountNum) && amountNum >= minAmount && amountNum <= available;
  const canWithdraw = amountValid && remaining > 0 && !!pixKey;

  const doWithdraw = async (amount: number) => {
    try {
      const res = await requestWithdrawal.mutateAsync({ amount });
      if (!res.ok) {
        const map: Record<string, string> = {
          below_minimum: `Valor abaixo do mínimo de ${fmtBRL(minAmount)}.`,
          amount_exceeds_balance: `Valor maior que o saldo disponível (${fmtBRL(res.available || 0)}).`,
          monthly_limit_reached: "Você já usou os 4 saques deste mês.",
          pix_key_missing: "Cadastre sua chave PIX no perfil antes de sacar.",
          unauthenticated: "Sessão expirada. Entre novamente.",
          profile_not_found: "Perfil não encontrado.",
        };
        const retryable = !["below_minimum", "amount_exceeds_balance", "monthly_limit_reached", "pix_key_missing"].includes(res.reason || "");
        toast.error(map[res.reason || ""] || "Não foi possível solicitar o saque.", {
          duration: 7000,
          action: retryable ? { label: "Tentar novamente", onClick: () => doWithdraw(amount) } : undefined,
        });
        return;
      }
      toast.success(
        `Saque de ${fmtBRL(res.amount || 0)} solicitado. Saldo restante: ${fmtBRL(res.available_after || 0)}.`
      );
      setAmountInput("");
    } catch (e: any) {
      toast.error(e?.message || "Erro de conexão ao solicitar saque.", {
        description: "Verifique sua internet e tente novamente.",
        duration: 8000,
        action: { label: "Tentar novamente", onClick: () => doWithdraw(amount) },
      });
    }
  };

  const onWithdraw = async () => {
    if (!pixKey) {
      toast.error("Cadastre sua chave PIX em Configurações antes de sacar.");
      return;
    }
    if (!amountValid) return;
    lastWithdrawArgs.current = { amount: amountNum };
    await doWithdraw(amountNum);
  };

  const exportCSV = () => {
    if (filteredPaid.length === 0) {
      toast.error("Nenhum saque no período para exportar.");
      return;
    }
    const header = ["ID", "Valor (BRL)", "Solicitado em", "Pago em", "Status", "Chave PIX", "Tipo PIX"];
    const rows = filteredPaid.map((w) => [
      w.id,
      Number(w.amount).toFixed(2).replace(".", ","),
      fmtDateTime(w.requested_at),
      fmtDateTime(w.paid_at),
      statusLabel(w.status),
      w.pix_key || "",
      w.pix_key_type || "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saques-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredPaid.length} saque(s) exportado(s) em CSV.`);
  };

  const exportPDF = async () => {
    if (filteredPaid.length === 0) {
      toast.error("Nenhum saque no período para exportar.");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Histórico Financeiro — Saques", 14, 16);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 22);
    doc.text(`Total no período: ${fmtBRL(filteredPaidTotal)} (${filteredPaid.length} saque(s))`, 14, 28);

    let y = 38;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Data", 14, y);
    doc.text("Valor", 60, y);
    doc.text("Status", 95, y);
    doc.text("Pago em", 135, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    doc.line(14, y, 196, y);
    y += 5;

    filteredPaid.forEach((w) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(fmtDateTime(w.requested_at), 14, y);
      doc.text(fmtBRL(w.amount), 60, y);
      doc.text(statusLabel(w.status), 95, y);
      doc.text(w.paid_at ? fmtDateTime(w.paid_at) : "—", 135, y);
      y += 6;
    });
    doc.save(`saques-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success(`${filteredPaid.length} saque(s) exportado(s) em PDF.`);
  };


  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[hsl(142,76%,36%)]" />
          Financeiro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aviso de privacidade */}
        <div className="flex items-start gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <EyeOff className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Visível apenas para você.</span>{" "}
            As guias <b>Financeiro</b> e <b>Indicados</b> não aparecem para outros usuários no seu perfil público. Somente a administração master tem acesso.
          </p>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-gradient-to-r from-[hsl(142,76%,36%)]/10 to-[hsl(142,76%,36%)]/5 border border-[hsl(142,76%,36%)]/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Saldo disponível
            </p>
            <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">
              {fmtBRL(available)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {pending.length} indicado{pending.length === 1 ? "" : "s"} · Ganho total {fmtBRL(earnedTotal)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/30 border border-border/40">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Saques disponíveis este mês
            </p>
            <p className="text-2xl font-bold text-foreground">
              {remaining}<span className="text-sm text-muted-foreground">/{usage.limit}</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Mínimo {fmtBRL(minAmount)} por saque · Já sacado {fmtBRL(withdrawnTotal)}
            </p>
          </div>
        </div>

        {/* PIX cadastrada */}
        <div className="p-3 rounded-lg border border-border/40 bg-muted/20 flex items-center gap-3">
          <KeyRound className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Chave PIX para recebimento
            </p>
            {pixKey ? (
              <p className="text-xs font-medium text-foreground truncate">
                {maskPix(pixKey, pixType)}
                <span className="ml-2 text-[10px] text-muted-foreground uppercase">
                  {pixType || "—"}
                </span>
              </p>
            ) : (
              <Link to="/settings" className="text-xs text-primary underline">
                Cadastrar chave PIX
              </Link>
            )}
          </div>
        </div>

        {/* Campo de valor + Botão de saque */}
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Digite o valor para sacar (mín. {fmtBRL(minAmount)}). O restante fica em saldo.
          </label>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={minAmount}
              max={available}
              step="0.01"
              placeholder={`Ex: ${minAmount.toFixed(2)}`}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="text-sm"
            />
            <Button
              onClick={onWithdraw}
              disabled={!canWithdraw || requestWithdrawal.isPending}
              className={`gap-2 shrink-0 ${
                canWithdraw && !requestWithdrawal.isPending
                  ? "bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(142,76%,46%)] text-white hover:opacity-90"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {requestWithdrawal.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  {canWithdraw ? <ArrowUpRight className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  Sacar
                </>
              )}
            </Button>
          </div>

          {amountInput && !amountValid && (
            <p className="text-[10px] text-amber-500 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {amountNum < minAmount
                ? `Mínimo de ${fmtBRL(minAmount)} por saque.`
                : `Valor maior que o saldo disponível (${fmtBRL(available)}).`}
            </p>
          )}
          {available > 0 && available < minAmount && (
            <p className="text-[10px] text-center text-muted-foreground">
              Faltam {fmtBRL(minAmount - available)} para atingir o saque mínimo.
            </p>
          )}
        </div>

        {/* Filtros + Tabs */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Histórico
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 text-xs gap-1">
                <FileDown className="h-3 w-3" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportPDF} className="h-8 text-xs gap-1">
                <FileText className="h-3 w-3" /> PDF
              </Button>
            </div>
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground">De</label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 text-xs w-[150px]"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground">Até</label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 text-xs w-[150px]"
                />
              </div>
              {(customFrom || customTo) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                  className="h-8 text-xs"
                >
                  Limpar
                </Button>
              )}
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="pending" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              Pendentes ({filteredPending.length})
            </TabsTrigger>
            <TabsTrigger value="paid" className="text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Pagas ({filteredPaid.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Total no filtro
              </span>
              <span className="text-xs font-semibold text-[hsl(142,76%,36%)]">
                {fmtBRL(filteredPendingTotal)}
              </span>
            </div>
            <PendingList rows={filteredPending} isLoading={loadingPending} />
          </TabsContent>

          <TabsContent value="paid" className="mt-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Total no filtro
              </span>
              <span className="text-xs font-semibold text-foreground">
                {fmtBRL(filteredPaidTotal)}
              </span>
            </div>
            <PaidList
              rows={filteredPaid}
              isLoading={loadingPaid}
              expandedId={expandedId}
              onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
            />
          </TabsContent>

        </Tabs>
      </CardContent>
    </Card>
  );
}

function PendingList({
  rows, isLoading,
}: { rows: ReturnType<typeof useReferralPendingList>["data"]; isLoading: boolean }) {
  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>;
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Nenhum indicado pendente no período.</p>;
  }
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto">
      {rows.map((c) => {
        const target = c.afilhada_username || c.afilhada_id;
        return (
          <Link
            key={c.id}
            to={`/creator/${target}`}
            className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={c.afilhada_avatar || ""}
                alt=""
                className="h-7 w-7 rounded-full object-cover bg-muted shrink-0"
                loading="lazy"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{c.afilhada_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Entrou em {new Date(c.started_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500">
              {fmtBRL(c.total_commission_earned)}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}

function PaidList({
  rows, isLoading, expandedId, onToggle,
}: {
  rows: ReturnType<typeof useReferralPaidList>["data"];
  isLoading: boolean;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>;
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Nenhuma comissão paga no período.</p>;
  }
  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto">
      {rows.map((w) => {
        const isPaid = w.status === "paid";
        const isPending = w.status === "pending" || w.status === "processing";
        const badgeClass = isPaid
          ? "bg-[hsl(142,76%,36%)] text-white hover:bg-[hsl(142,76%,36%)] animate-in fade-in"
          : isPending
          ? "bg-amber-500/15 text-amber-600 border border-amber-500/40 hover:bg-amber-500/15"
          : "bg-muted text-muted-foreground hover:bg-muted";
        const label = statusLabel(w.status);
        const expanded = expandedId === w.id;
        return (
          <div key={w.id} className="rounded-lg bg-muted/30 transition-colors">
            <button
              onClick={() => onToggle(w.id)}
              className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg text-left"
            >
              <div className="min-w-0 flex items-center gap-2">
                {isPaid ? (
                  <CheckCircle2 className="h-4 w-4 text-[hsl(142,76%,36%)] shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-500 shrink-0 animate-pulse" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">Saque {fmtBRL(w.amount)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(w.paid_at || w.requested_at).toLocaleDateString("pt-BR")}
                    {" · "}{maskPix(w.pix_key, w.pix_key_type)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge className={`text-[10px] ${badgeClass}`}>{label}</Badge>
                {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </div>
            </button>
            {expanded && <WithdrawalTimeline w={w} />}
          </div>
        );
      })}
    </div>
  );
}

function WithdrawalTimeline({ w }: { w: any }) {
  const isPaid = w.status === "paid";
  const isProcessing = w.status === "processing";
  // Sequência: solicitado → em análise → pago
  const steps = [
    {
      key: "requested",
      icon: Send,
      label: "Solicitado",
      date: w.requested_at,
      done: true,
      color: "text-[hsl(142,76%,36%)]",
    },
    {
      key: "review",
      icon: Search,
      label: isProcessing ? "Processando" : "Em análise",
      date: w.requested_at,
      done: true,
      active: !isPaid,
      color: isPaid ? "text-[hsl(142,76%,36%)]" : "text-amber-500",
    },
    {
      key: "paid",
      icon: CheckCircle2,
      label: "Pago via PIX",
      date: w.paid_at,
      done: isPaid,
      active: false,
      color: isPaid ? "text-[hsl(142,76%,36%)]" : "text-muted-foreground",
    },
  ];
  return (
    <div className="px-3 pb-3 pt-1 border-t border-border/30 mt-1">
      <ol className="space-y-2 mt-2">
        {steps.map((s, idx) => {
          const Icon = s.done ? s.icon : CircleDot;
          return (
            <li key={s.key} className="flex items-start gap-2">
              <div className="flex flex-col items-center">
                <Icon className={`h-3.5 w-3.5 ${s.color} ${(s as any).active ? "animate-pulse" : ""}`} />
                {idx < steps.length - 1 && (
                  <div className={`w-px h-5 mt-1 ${s.done ? "bg-[hsl(142,76%,36%)]/40" : "bg-border"}`} />
                )}
              </div>
              <div className="flex-1 -mt-0.5">
                <p className={`text-[11px] font-medium ${s.done ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {s.done && s.date ? fmtDateTime(s.date) : "Aguardando"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

