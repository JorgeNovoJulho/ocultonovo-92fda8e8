import { useState, useCallback, useRef, memo } from "react";
import { ArrowLeft, Wallet, TrendingUp, Receipt, ChevronRight, CheckCircle2, Clock, AlertCircle, X, Users, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEarningsSummary, useFilteredTransactions, type Transaction } from "@/hooks/useTransactions";
import { PremiumAccessGuard } from "@/components/PremiumAccessGuard";

// ─── Split calculation engine ──────────────────────────────────────────────────
// Fórmula rigorosa:
// 1. Imposto = bruto × 0.06
// 2. Base = bruto - imposto = bruto × 0.94
// 3. Taxa OCULTO = base × 0.20
// 4. Taxa Afiliado = base × 0.05 (se houver affiliate_id)
// 5. Líquido = base - taxa_oculto - taxa_afiliado
const TAX_RATE = 0.06;
const BASE_MULTIPLIER = 1 - TAX_RATE; // 0.94
const PLATFORM_FEE_RATE = 0.20;
const AFFILIATE_FEE_RATE = 0.05;

function calcSplit(bruto: number, hasAffiliate: boolean) {
  const imposto = bruto * TAX_RATE;
  const base = bruto * BASE_MULTIPLIER;
  const taxaPlataforma = base * PLATFORM_FEE_RATE;
  const taxaAfiliado = hasAffiliate ? base * AFFILIATE_FEE_RATE : 0;
  const liquido = base - taxaPlataforma - taxaAfiliado;
  return { bruto, imposto, base, taxaPlataforma, taxaAfiliado, liquido };
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// ─── Summary skeleton ─────────────────────────────────────────────────────────
function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-3 w-24 perf-no-animations" />
            <Skeleton className="h-7 w-32 perf-no-animations" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Transaction skeleton ──────────────────────────────────────────────────────
function TransactionSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-3 rounded-lg bg-muted/30 flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full shrink-0 perf-no-animations" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40 perf-no-animations" />
            <Skeleton className="h-3 w-24 perf-no-animations" />
          </div>
          <Skeleton className="h-5 w-20 shrink-0 perf-no-animations" />
        </div>
      ))}
    </div>
  );
}

// ─── Type label & icon helpers ─────────────────────────────────────────────────
function typeLabel(t: Transaction) {
  switch (t.type) {
    case "subscription": return "Assinatura VIP";
    case "tip":          return "Gorjeta / Presente";
    case "deposit":      return "Venda VIP";
    case "withdrawal":
    case "payout":       return "Saque";
    default:             return t.description || t.type;
  }
}

function isIncome(t: Transaction) {
  return t.type === "subscription" || t.type === "tip" || t.type === "deposit";
}

// ─── Split detail modal ────────────────────────────────────────────────────────
interface SplitModalProps {
  tx: Transaction | null;
  onClose: () => void;
}

function SplitModal({ tx, onClose }: SplitModalProps) {
  if (!tx) return null;

  const bruto = Math.abs(tx.amount);
  const hasAffiliate = !!tx.affiliate_id;
  const split = calcSplit(bruto, hasAffiliate);
  const income = isIncome(tx);

  const date = new Date(tx.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <Dialog open={!!tx} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm bg-card border-border will-change-transform contain-layout-style-paint">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Detalhe da Transação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Description */}
          <div className="p-3 rounded-lg bg-muted/30 space-y-1">
            <p className="font-semibold text-foreground text-sm">{typeLabel(tx)}</p>
            {tx.description && tx.description !== typeLabel(tx) && (
              <p className="text-xs text-muted-foreground">{tx.description}</p>
            )}
            <p className="text-xs text-muted-foreground">{date}</p>
          </div>

          {income ? (
            <div className="space-y-2">
              {/* Valor Bruto */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div>
                  <p className="text-sm font-medium text-foreground">Valor Bruto</p>
                  <p className="text-xs text-muted-foreground">Pago pelo comprador</p>
                </div>
                <span className="font-bold text-foreground">{fmt(split.bruto)}</span>
              </div>

              {/* Imposto 6% */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(45,93%,47%)]/5">
                <div>
                  <p className="text-sm font-medium text-[hsl(45,93%,47%)]">Impostos</p>
                  <p className="text-xs text-muted-foreground">6% retido</p>
                </div>
                <span className="font-semibold text-[hsl(45,93%,47%)]">–{fmt(split.imposto)}</span>
              </div>

              {/* Base de cálculo */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/10 border border-border/30">
                <p className="text-xs font-medium text-muted-foreground">Base de Cálculo</p>
                <span className="text-xs font-semibold text-foreground">{fmt(split.base)}</span>
              </div>

              {/* Taxa Plataforma 20% */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
                <div>
                  <p className="text-sm font-medium text-destructive">Taxa OCULTO</p>
                  <p className="text-xs text-muted-foreground">20% da base</p>
                </div>
                <span className="font-semibold text-destructive">–{fmt(split.taxaPlataforma)}</span>
              </div>

              {/* Afiliado 5% (condicional) */}
              {hasAffiliate && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5">
                  <div>
                    <p className="text-sm font-medium text-primary">Comissão Afiliado</p>
                    <p className="text-xs text-muted-foreground">5% da base</p>
                  </div>
                  <span className="font-semibold text-primary">–{fmt(split.taxaAfiliado)}</span>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-border/50" />

              {/* Líquido Criador */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30">
                <div>
                  <p className="text-sm font-bold text-[hsl(142,76%,36%)]">Seus Ganhos</p>
                  <p className="text-xs text-muted-foreground">
                    {hasAffiliate ? '70,5%' : '75,2%'} do bruto
                  </p>
                </div>
                <span className="font-bold text-lg text-[hsl(142,76%,36%)]">{fmt(split.liquido)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
              <p className="text-sm font-medium text-destructive">Valor debitado</p>
              <span className="font-bold text-destructive">–{fmt(bruto)}</span>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 pt-1">
            {tx.status === "completed" ? (
              <Badge className="bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] gap-1">
                <CheckCircle2 className="h-3 w-3" /> Concluído
              </Badge>
            ) : tx.status === "pending" ? (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" /> Pendente
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3 w-3" /> Falhou
              </Badge>
            )}
            {hasAffiliate && (
              <Badge variant="outline" className="text-primary border-primary/30 gap-1 text-[10px]">
                <Users className="h-2.5 w-2.5" /> Com Afiliado
              </Badge>
            )}
          </div>
        </div>

        <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
          <X className="h-4 w-4 mr-2" /> Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction row (memoized for perf on low-end devices) ────────────────────
interface TxRowProps {
  tx: Transaction;
  onOpen: (tx: Transaction) => void;
}

const TxRow = memo(function TxRow({ tx, onOpen }: TxRowProps) {
  const income = isIncome(tx);
  const bruto = Math.abs(tx.amount);
  const hasAffiliate = !!tx.affiliate_id;
  const liquid = income ? calcSplit(bruto, hasAffiliate).liquido : bruto;
  const dateStr = new Date(tx.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short",
  });

  return (
    <button
      onClick={() => onOpen(tx)}
      className="w-full text-left p-3 rounded-lg bg-muted/20 hover:bg-muted/40 active:bg-muted/60 transition-colors border border-border/30 flex items-center gap-3 touch-action-manipulation"
    >
      {/* Icon */}
      <div
        className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
          income ? "bg-[hsl(142,76%,36%)]/15" : "bg-destructive/10"
        }`}
      >
        {income ? (
          <TrendingUp className="h-4 w-4 text-[hsl(142,76%,36%)]" />
        ) : (
          <Wallet className="h-4 w-4 text-destructive" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{typeLabel(tx)}</p>
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-muted-foreground">{dateStr}</p>
          {hasAffiliate && (
            <span className="text-[9px] text-primary bg-primary/10 px-1 rounded">afil.</span>
          )}
        </div>
      </div>

      {/* Amounts */}
      <div className="text-right shrink-0">
        {income ? (
          <>
            <p className="text-sm font-bold text-[hsl(142,76%,36%)]">+{fmt(liquid)}</p>
            <p className="text-[10px] text-muted-foreground">{fmt(bruto)} bruto</p>
          </>
        ) : (
          <p className="text-sm font-bold text-destructive">–{fmt(bruto)}</p>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </button>
  );
});

// ─── Main page content ─────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

function EarningsStatementContent() {
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: summary, isLoading: loadingSummary } = useEarningsSummary();
  const { data: transactions, isLoading: loadingTx } = useFilteredTransactions({});

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const attachSentinel = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    sentinelRef.current = node;
    if (!node) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" }
    );
    observerRef.current.observe(node);
  }, []);

  const visibleTx = (transactions ?? []).slice(0, visibleCount);
  const hasMore = (transactions?.length ?? 0) > visibleCount;

  // Derived summary values
  const balance = summary?.balance ?? 0;
  const totalBruto = summary?.totalBruto ?? 0;
  const totalImposto = summary?.totalImposto ?? 0;
  const totalTaxa = summary?.totalTaxa ?? 0;
  const totalAfiliado = summary?.totalAfiliado ?? 0;
  const totalLiquido = summary?.totalLiquido ?? 0;
  const pending = summary?.pending ?? 0;

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-10 space-y-5 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/earnings">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Meu Extrato</h1>
          <p className="text-xs text-muted-foreground">Transparência total dos seus ganhos</p>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {loadingSummary ? (
        <SummarySkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Saldo Disponível */}
          <Card className="bg-gradient-to-br from-[hsl(142,76%,36%)]/10 to-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="h-3.5 w-3.5 text-[hsl(142,76%,36%)]" />
                <p className="text-xs text-muted-foreground font-medium">Saldo Disponível</p>
              </div>
              <p className="text-xl font-bold text-[hsl(142,76%,36%)] tabular-nums">
                {fmt(balance)}
              </p>
            </CardContent>
          </Card>

          {/* Ganhos Totais (Líquido) */}
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Ganhos Totais</p>
              </div>
              <p className="text-xl font-bold text-primary tabular-nums">
                {fmt(totalLiquido)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(totalBruto)} bruto</p>
            </CardContent>
          </Card>

          {/* Aguardando Liberação */}
          <Card className="bg-[hsl(45,93%,47%)]/5 border-[hsl(45,93%,47%)]/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3.5 w-3.5 text-[hsl(45,93%,47%)]" />
                <p className="text-xs text-muted-foreground font-medium">Aguardando</p>
              </div>
              <p className="text-xl font-bold text-[hsl(45,93%,47%)] tabular-nums">
                {fmt(pending)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">7 dias de retenção</p>
            </CardContent>
          </Card>

          {/* Taxas Retidas */}
          <Card className="bg-destructive/5 border-destructive/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Receipt className="h-3.5 w-3.5 text-destructive" />
                <p className="text-xs text-muted-foreground font-medium">Taxas Retidas</p>
              </div>
              <p className="text-xl font-bold text-destructive tabular-nums">
                {fmt(totalImposto + totalTaxa + totalAfiliado)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                6% imp. + 20% plat.{totalAfiliado > 0 ? ' + 5% afil.' : ''}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Withdraw CTA ───────────────────────────────────────────────── */}
      <Link to="/earnings">
        <Button
          className="w-full bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(142,76%,46%)] text-white font-semibold h-12 hover:opacity-90"
          disabled={balance <= 0}
        >
          <Wallet className="h-5 w-5 mr-2" />
          Solicitar Transferência
        </Button>
      </Link>

      {/* ── Transaction list ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Transações Recentes</h2>
          {transactions && (
            <span className="text-xs text-muted-foreground">
              {transactions.length} registros
            </span>
          )}
        </div>

        {loadingTx ? (
          <TransactionSkeleton />
        ) : visibleTx.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma transação encontrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleTx.map((tx) => (
              <TxRow key={tx.id} tx={tx} onOpen={setSelectedTx} />
            ))}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={attachSentinel} className="py-3 flex justify-center">
                <div className="h-4 w-4 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
              </div>
            )}

            {!hasMore && visibleTx.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">
                Todas as transações foram carregadas
              </p>
            )}
          </div>
        )}
      </div>

      {/* Split detail modal */}
      <SplitModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}

export default function EarningsStatementPage() {
  return (
    <PremiumAccessGuard featureName="Extrato de Ganhos">
      <EarningsStatementContent />
    </PremiumAccessGuard>
  );
}
