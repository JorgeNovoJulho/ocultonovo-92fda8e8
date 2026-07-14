import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DollarSign,
  Wallet,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Crown,
  Gift,
  Unlock,
  Receipt,
  Ticket,
  Filter,
  RefreshCcw,
  CreditCard,
  QrCode,
  AlertCircle,
  Plus,
  Copy,
  Pause,
  Play,
  Trash2,
  Lock,
  Search,
  Instagram,
  Twitter,
  Smartphone,
  Globe,
  Calendar,
  KeyRound,
  CheckCircle2,
  Save,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTransactions, useFilteredTransactions, useEarningsSummary, useCreateTransaction } from "@/hooks/useTransactions";
import { useMySubscribers } from "@/hooks/useSubscriptions";
import { useWithdrawalLimits } from "@/hooks/useWithdrawalLimits";
import { useCreatorCoupons, useToggleCoupon, useDeleteCoupon } from "@/hooks/useCoupons";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { useCreateCoupon } from "@/hooks/useCoupons";
import { CreateCouponModal } from "@/components/CreateCouponModal";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

// ── RENDIMENTOS ──────────────────────────────────────────────────────────
function AbaRendimentos() {
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: earnings, isLoading: loadingEarnings } = useEarningsSummary();
  const { data: subscribers } = useMySubscribers();
  const { data: withdrawalLimits } = useWithdrawalLimits();
  const { data: transactions } = useTransactions();
  const createTransaction = useCreateTransaction();

  const availableBalance = earnings?.balance ?? 0;
  const pendingBalance = earnings?.pending ?? 0;
  const totalLiquido = earnings?.totalLiquido ?? 0;
  const totalTaxa = earnings?.totalTaxa ?? 0;
  const activeSubscribers = subscribers?.length || 0;

  // Weekly chart data — real only
  const weeklyEarningsData = useMemo(() => {
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const key = date.toISOString().split("T")[0];
      let total = 0;
      if (transactions) {
        transactions
          .filter((t) => ["subscription", "tip"].includes(t.type) && t.status !== "failed")
          .forEach((t) => {
            if (new Date(t.created_at).toISOString().split("T")[0] === key) total += Number(t.amount);
          });
      }
      return { day: dayNames[date.getDay()], valor: total };
    });
  }, [transactions]);

  const maxEarning = Math.max(...weeklyEarningsData.map((d) => d.valor), 1);

  const handleWithdraw = async () => {
    if (!pixKey || !withdrawAmount) return;
    setIsProcessing(true);
    try {
      await createTransaction.mutateAsync({
        amount: -parseFloat(withdrawAmount.replace(",", ".")),
        type: "withdrawal",
        description: `Saque via PIX: ${pixKey}`,
      });
      toast({ title: "Saque solicitado!", description: "Você receberá uma notificação quando o valor for transferido." });
      setShowWithdrawModal(false);
      setPixKey("");
      setWithdrawAmount("");
    } catch {
      toast({ title: "Erro ao solicitar saque", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loadingEarnings) return <div className="space-y-3 p-1">{[1,2,3].map(i=><Skeleton key={i} className="h-20"/>)}</div>;

  return (
    <div className="space-y-4 p-1">
      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-emerald-500/10 border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-emerald-400 mb-1 text-xs"><Wallet className="h-3 w-3"/>Saldo Disponível</div>
            <p className="text-xl font-bold text-emerald-400">{formatCurrency(availableBalance)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-muted-foreground mb-1 text-xs"><Clock className="h-3 w-3"/>Pendente</div>
            <p className="text-xl font-bold">{formatCurrency(pendingBalance)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-primary mb-1 text-xs"><Users className="h-3 w-3"/>Assinantes</div>
            <p className="text-xl font-bold text-primary">{activeSubscribers}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-1 text-muted-foreground mb-1 text-xs"><TrendingUp className="h-3 w-3"/>Total Líquido</div>
            <p className="text-xl font-bold">{formatCurrency(totalLiquido)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico semanal */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Ganhos — últimos 7 dias</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-1.5 h-24">
            {weeklyEarningsData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-primary/20 rounded-t-sm relative" style={{ height: `${(d.valor / maxEarning) * 80}px`, minHeight: 4 }}>
                  <div className="absolute inset-0 bg-primary rounded-t-sm opacity-80" />
                </div>
                <span className="text-[9px] text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Saque */}
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="h-4 w-4 text-emerald-400"/>
                <span className="font-semibold text-sm">Solicitar Saque</span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-amber-400"/>
                Mín. {formatCurrency(withdrawalLimits?.minAmount || 250)} · {withdrawalLimits?.remainingWithdrawals ?? 3} saque(s) restantes
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (!withdrawalLimits?.canWithdraw) return toast({ title: "Limite atingido", variant: "destructive" });
                if (availableBalance < (withdrawalLimits?.minAmount || 250)) return toast({ title: "Saldo insuficiente", variant: "destructive" });
                setWithdrawAmount(availableBalance.toFixed(2));
                setShowWithdrawModal(true);
              }}
              disabled={availableBalance <= 0 || !withdrawalLimits?.canWithdraw}
              className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
            >
              Sacar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal saque */}
      <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Solicitar Saque</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Chave PIX</label>
              <Input placeholder="CPF, e-mail, telefone ou chave aleatória" value={pixKey} onChange={e=>setPixKey(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Valor (R$)</label>
              <Input placeholder="0,00" value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
              ⏱️ Saques podem levar até <strong>3 dias úteis</strong> para serem processados.
            </p>
            <Button className="w-full" onClick={handleWithdraw} disabled={isProcessing}>
              {isProcessing ? "Processando..." : "Confirmar Saque"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── TRANSAÇÕES ───────────────────────────────────────────────────────────
function AbaTransacoes() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: transactions, isLoading, refetch } = useFilteredTransactions({
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate + "T23:59:59") : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const stats = useMemo(() => {
    if (!transactions) return { total: 0, entradas: 0, saidas: 0, assinaturas: 0 };
    return transactions.reduce((acc, tx) => {
      if (tx.status === "completed") {
        acc.total += Math.abs(tx.amount);
        if (["deposit","subscription","tip"].includes(tx.type)) acc.entradas += tx.amount;
        if (["withdrawal","payout"].includes(tx.type)) acc.saidas += Math.abs(tx.amount);
        if (tx.type === "subscription") acc.assinaturas += tx.amount;
      }
      return acc;
    }, { total: 0, entradas: 0, saidas: 0, assinaturas: 0 });
  }, [transactions]);

  const setQuick = (p: "today"|"week"|"month") => {
    const t = new Date();
    if (p === "today") { setStartDate(format(t,"yyyy-MM-dd")); setEndDate(format(t,"yyyy-MM-dd")); }
    if (p === "week")  { setStartDate(format(subDays(t,7),"yyyy-MM-dd")); setEndDate(format(t,"yyyy-MM-dd")); }
    if (p === "month") { setStartDate(format(startOfMonth(t),"yyyy-MM-dd")); setEndDate(format(endOfMonth(t),"yyyy-MM-dd")); }
  };

  const typeLabels: Record<string,string> = { deposit:"Depósito", withdrawal:"Saque", subscription:"Assinatura", tip:"Presente", payout:"Pagamento" };
  const statusCfg: Record<string,{label:string;cls:string}> = {
    pending:   { label:"Pendente",  cls:"bg-amber-500/10 text-amber-400 border-amber-500/30" },
    completed: { label:"Concluído", cls:"bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    failed:    { label:"Falhou",    cls:"bg-red-500/10 text-red-400 border-red-500/30" },
  };

  return (
    <div className="space-y-4 p-1">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label:"Total Movimentado", val: stats.total, cls:"text-foreground" },
          { label:"Entradas", val: stats.entradas, cls:"text-emerald-400" },
          { label:"Saídas", val: stats.saidas, cls:"text-red-400" },
          { label:"Assinaturas", val: stats.assinaturas, cls:"text-primary" },
        ].map(({ label, val, cls }) => (
          <Card key={label} className="bg-card/50 border-border/30">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={cn("text-lg font-bold", cls)}>{formatCurrency(val)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        {(["today","week","month"] as const).map(p => (
          <Button key={p} variant="outline" size="sm" onClick={() => setQuick(p)} className="text-xs h-7">
            {p==="today"?"Hoje":p==="week"?"7 dias":"Este mês"}
          </Button>
        ))}
        <div className="flex gap-2 flex-1">
          <Input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="text-xs h-7 flex-1" />
          <Input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="text-xs h-7 flex-1" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Tipo"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(typeLabels).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-7 w-7 p-0">
          <RefreshCcw className="h-3 w-3" />
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">Data</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Descrição</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({length:4}).map((_,i)=>(
                <TableRow key={i}>
                  {Array.from({length:5}).map((_,j)=><TableCell key={j}><Skeleton className="h-4 w-full"/></TableCell>)}
                </TableRow>
              ))
            ) : transactions && transactions.length > 0 ? (
              transactions.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(tx.created_at), "dd/MM/yy HH:mm", {locale:ptBR})}
                  </TableCell>
                  <TableCell className="text-xs">{typeLabels[tx.type] || tx.type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{tx.description || "—"}</TableCell>
                  <TableCell className={cn("text-xs font-semibold text-right", ["withdrawal","payout"].includes(tx.type)?"text-red-400":"text-emerald-400")}>
                    {["withdrawal","payout"].includes(tx.type)?"-":"+"}R$ {Math.abs(tx.amount).toFixed(2).replace(".",",")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5", statusCfg[tx.status]?.cls)}>
                      {statusCfg[tx.status]?.label || tx.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                  Nenhuma transação encontrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── DETALHAMENTO ──────────────────────────────────────────────────────────
function AbaDetalhamento() {
  const { data: transactions, isLoading: loadingTx } = useTransactions();
  const { data: summary, isLoading: loadingSummary } = useEarningsSummary();

  const breakdown = useMemo(() => {
    if (!transactions) return { subscriptions:{total:0,count:0,thisMonth:0}, tips:{total:0,count:0,thisMonth:0}, mediaUnlocks:{total:0,count:0,thisMonth:0}, withdrawals:{total:0,count:0} };
    const som = new Date(); som.setDate(1); som.setHours(0,0,0,0);
    return transactions.reduce((acc, t) => {
      const isThisMonth = new Date(t.created_at) >= som;
      if (t.type === "subscription") { acc.subscriptions.total+=t.amount; acc.subscriptions.count++; if(isThisMonth) acc.subscriptions.thisMonth+=t.amount; }
      else if (t.type === "tip") { acc.tips.total+=t.amount; acc.tips.count++; if(isThisMonth) acc.tips.thisMonth+=t.amount; }
      if (t.description?.toLowerCase().includes("mídia") || t.description?.toLowerCase().includes("unlock")) { acc.mediaUnlocks.total+=t.amount; acc.mediaUnlocks.count++; if(isThisMonth) acc.mediaUnlocks.thisMonth+=t.amount; }
      if (["withdrawal","payout"].includes(t.type)) { acc.withdrawals.total+=Math.abs(t.amount); acc.withdrawals.count++; }
      return acc;
    }, { subscriptions:{total:0,count:0,thisMonth:0}, tips:{total:0,count:0,thisMonth:0}, mediaUnlocks:{total:0,count:0,thisMonth:0}, withdrawals:{total:0,count:0} });
  }, [transactions]);

  const totalEarnings = breakdown.subscriptions.total + breakdown.tips.total + breakdown.mediaUnlocks.total;
  const thisMonthTotal = breakdown.subscriptions.thisMonth + breakdown.tips.thisMonth + breakdown.mediaUnlocks.thisMonth;

  const categories = [
    { title:"Assinaturas", icon:Crown, color:"from-amber-500 to-orange-500", textColor:"text-amber-400", bgColor:"bg-amber-500/10", borderColor:"border-amber-500/30", ...breakdown.subscriptions, percentage: totalEarnings>0?(breakdown.subscriptions.total/totalEarnings)*100:0 },
    { title:"Presentes", icon:Gift, color:"from-pink-500 to-primary", textColor:"text-pink-400", bgColor:"bg-pink-500/10", borderColor:"border-pink-500/30", ...breakdown.tips, percentage: totalEarnings>0?(breakdown.tips.total/totalEarnings)*100:0 },
    { title:"Desbloqueio de Mídia", icon:Unlock, color:"from-emerald-500 to-teal-500", textColor:"text-emerald-400", bgColor:"bg-emerald-500/10", borderColor:"border-emerald-500/30", ...breakdown.mediaUnlocks, percentage: totalEarnings>0?(breakdown.mediaUnlocks.total/totalEarnings)*100:0 },
  ];

  if (loadingTx || loadingSummary) return <div className="space-y-3 p-1">{[1,2,3].map(i=><Skeleton key={i} className="h-24"/>)}</div>;

  return (
    <div className="space-y-4 p-1">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label:"Total Ganho", val:totalEarnings, cls:"text-foreground" },
          { label:"Este Mês", val:thisMonthTotal, cls:"text-emerald-400" },
          { label:"Saldo Atual", val:summary?.balance||0, cls:"text-amber-400" },
          { label:"Total Sacado", val:breakdown.withdrawals.total, cls:"text-red-400" },
        ].map(({ label, val, cls }) => (
          <Card key={label} className="bg-card/50 border-border/30">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={cn("text-lg font-bold", cls)}>{formatCurrency(val)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Por categoria */}
      {categories.map(cat => {
        const Icon = cat.icon;
        return (
          <Card key={cat.title} className={cn("border", cat.bgColor, cat.borderColor)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg bg-gradient-to-br", cat.color)}><Icon className="h-4 w-4 text-white"/></div>
                  <span className="font-semibold text-sm">{cat.title}</span>
                </div>
                <Badge variant="outline" className={cn("text-xs", cat.textColor)}>{cat.percentage.toFixed(1)}%</Badge>
              </div>
              <p className={cn("text-2xl font-bold mb-1", cat.textColor)}>{formatCurrency(cat.total)}</p>
              <p className="text-xs text-muted-foreground mb-3">{cat.count} transações · este mês: {formatCurrency(cat.thisMonth)}</p>
              <div className="h-1.5 bg-background/50 rounded-full overflow-hidden">
                <div className={cn("h-full bg-gradient-to-r rounded-full transition-all", cat.color)} style={{ width:`${Math.min(cat.percentage, 100)}%` }}/>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Taxa plataforma */}
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Divisão de Receita</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Receita Bruta</span><span className="font-medium">{formatCurrency(totalEarnings)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Impostos (6%)</span><span className="text-amber-400">-{formatCurrency(totalEarnings*0.06)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Base Líquida</span><span className="font-medium">{formatCurrency(totalEarnings*0.94)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Taxa OCULTO (20%)</span><span className="text-red-400">-{formatCurrency(totalEarnings*0.94*0.20)}</span></div>
            <div className="flex justify-between border-t border-border/30 pt-2 font-semibold"><span>Seu Líquido (75,2%)</span><span className="text-emerald-400">{formatCurrency(totalEarnings*0.94*0.80)}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── CUPONS ────────────────────────────────────────────────────────────────
const platformIcons: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-3 w-3"/>,
  tiktok: <Smartphone className="h-3 w-3"/>,
  twitter: <Twitter className="h-3 w-3"/>,
  other: <Globe className="h-3 w-3"/>,
};
const platformColors: Record<string,string> = {
  instagram:"bg-gradient-to-r from-purple-500 to-pink-500 text-white",
  tiktok:"bg-gradient-to-r from-gray-800 to-gray-600 text-white",
  twitter:"bg-gradient-to-r from-blue-400 to-blue-500 text-white",
  other:"bg-muted text-muted-foreground",
};

function AbaCupons() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { profile } = useProfile();
  const { data: coupons, isLoading } = useCreatorCoupons();
  const toggleCoupon = useToggleCoupon();
  const deleteCoupon = useDeleteCoupon();
  const createCoupon = useCreateCoupon();

  const isVip = profile?.plan_type === "vip";
  const canCreate = isVip;

  const stats = useMemo(() => {
    if (!coupons || coupons.length === 0) return { activeCoupons:0, totalUses:0, totalRevenue:0 };
    return {
      activeCoupons: coupons.filter(c=>c.is_active).length,
      totalUses: coupons.reduce((a,c)=>a+(c.current_uses||0),0),
      totalRevenue: coupons.reduce((a,c)=>{
        const price = 29.90*(1-c.discount/100);
        return a+(c.current_uses||0)*price;
      },0),
    };
  }, [coupons]);

  const filtered = useMemo(() => {
    if (!coupons) return [];
    if (!searchQuery.trim()) return coupons;
    return coupons.filter(c=>
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.campaign_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [coupons, searchQuery]);

  const isExpired = (d: string) => new Date(d) < new Date();

  if (isLoading) return <div className="space-y-3 p-1">{[1,2,3].map(i=><Skeleton key={i} className="h-20"/>)}</div>;

  return (
    <div className="space-y-4 p-1">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-primary/5 border-primary/30"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Ativos</p><p className="text-xl font-bold text-primary">{stats.activeCoupons}</p></CardContent></Card>
        <Card className="bg-card/50 border-border/30"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Usos</p><p className="text-xl font-bold">{stats.totalUses}</p></CardContent></Card>
        <Card className="bg-emerald-500/10 border-emerald-500/30"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Receita</p><p className="text-xl font-bold text-emerald-400">{formatCurrency(stats.totalRevenue)}</p></CardContent></Card>
      </div>

      {/* Busca + criar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"/>
          <Input placeholder="Buscar cupom..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="pl-9 h-8 text-sm"/>
        </div>
        <Button size="sm" onClick={() => setShowCreateModal(true)} disabled={!canCreate} className="h-8 gap-1.5 text-xs">
          {canCreate ? <Plus className="h-3.5 w-3.5"/> : <Lock className="h-3.5 w-3.5"/>}
          {canCreate ? "Criar" : "VIP"}
        </Button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Ticket className="h-10 w-10 mx-auto mb-2 opacity-40"/>
          <p className="text-sm">{searchQuery ? "Nenhum cupom encontrado" : "Nenhum cupom criado ainda"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(coupon => {
            const expired = isExpired(coupon.end_date);
            const platform = (coupon as any).platform_source || "other";
            const conversions = coupon.current_uses || 0;
            const revenue = conversions * 29.90 * (1 - coupon.discount / 100);
            return (
              <Card key={coupon.id} className={cn("bg-card/50 border-border/40 transition-all", (expired || !coupon.is_active) && "opacity-60")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        <Badge variant="outline" className="font-mono text-xs cursor-pointer hover:bg-muted" onClick={()=>{ navigator.clipboard.writeText(coupon.code); toast({title:"Código copiado!"}); }}>
                          <Copy className="h-2.5 w-2.5 mr-1"/>{coupon.code}
                        </Badge>
                        <Badge className="bg-primary/10 text-primary border-primary/30 text-xs">-{coupon.discount}%</Badge>
                        {platform !== "other" && <Badge className={cn("gap-1 text-xs", platformColors[platform])}>{platformIcons[platform]}<span className="capitalize">{platform}</span></Badge>}
                        {expired && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">Expirado</Badge>}
                        {!coupon.is_active && !expired && <Badge variant="outline" className="text-muted-foreground text-xs">Pausado</Badge>}
                      </div>
                      <p className="font-semibold text-sm truncate">{coupon.campaign_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{conversions} conversões · {formatCurrency(revenue)}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={expired || !isVip}
                        onClick={() => toggleCoupon.mutate({ couponId: coupon.id, isActive: !coupon.is_active })}>
                        {coupon.is_active ? <Pause className="h-3 w-3"/> : <Play className="h-3 w-3"/>}
                      </Button>
                      {isVip && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" aria-label="Excluir">
                              <Trash2 className="h-3 w-3"/>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
                              <AlertDialogDescription>O cupom "{coupon.code}" será excluído permanentemente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={()=>deleteCoupon.mutate(coupon.id)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateCouponModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreateCoupon={(coupon) => {
          createCoupon.mutate({
            campaign_name: coupon.campaignName,
            code: coupon.code,
            discount: coupon.discount,
            start_date: coupon.startDate,
            end_date: coupon.endDate,
            platform_source: coupon.platformSource || "other",
          });
          setShowCreateModal(false);
        }}
      />
    </div>
  );
}

// ── CHAVE PIX ─────────────────────────────────────────────────────────────
const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF", placeholder: "000.000.000-00" },
  { value: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00" },
  { value: "email", label: "E-mail", placeholder: "seu@email.com" },
  { value: "phone", label: "Telefone", placeholder: "(00) 00000-0000" },
  { value: "random", label: "Aleatória", placeholder: "Chave aleatória" },
];

function AbaChavePix() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pixKeyType, setPixKeyType] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      const p = profile as any;
      if (p.pix_key_type) setPixKeyType(p.pix_key_type);
      if (p.pix_key) setPixKey(p.pix_key);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!pixKeyType || !pixKey.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (!profile?.id) return;
    setIsSaving(true);
    try {
      const payload = { pix_key_type: pixKeyType, pix_key: pixKey.trim() };

      const { error } = await (supabase as any)
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (error && /pix_key_type|pix_key|schema cache|column/i.test(error.message || '')) {
        const profileUserId = (profile as any)?.user_id || user?.id;
        if (!profileUserId) throw error;

        const fallback = await (supabase as any)
          .from("profiles")
          .update(payload)
          .eq("user_id", profileUserId);

        if (fallback.error) throw fallback.error;
      } else if (error) {
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: "Chave PIX salva!", description: "Sua chave PIX foi atualizada com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedType = PIX_KEY_TYPES.find(t => t.value === pixKeyType);

  return (
    <div className="space-y-4 p-1">
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            Chave PIX para Recebimentos
          </CardTitle>
          <CardDescription className="text-xs">
            Configure sua chave PIX para receber pagamentos e saques.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Tipo de Chave</Label>
            <Select value={pixKeyType} onValueChange={setPixKeyType}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {PIX_KEY_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Chave PIX</Label>
            <Input
              placeholder={selectedType?.placeholder || "Informe sua chave PIX"}
              value={pixKey}
              onChange={e => setPixKey(e.target.value)}
              className="h-9"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving || !pixKeyType || !pixKey.trim()}
            className="w-full gap-2"
          >
            {saved ? (
              <><CheckCircle2 className="h-4 w-4" /> Salvo!</>
            ) : isSaving ? (
              "Salvando..."
            ) : (
              <><Save className="h-4 w-4" /> Salvar Chave PIX</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Sobre os Recebimentos</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>Repasse para você</span><span className="font-semibold text-emerald-400">74%</span></div>
            <div className="flex justify-between"><span>Comissão plataforma</span><span>20%</span></div>
            <div className="flex justify-between"><span>Reserva de impostos</span><span>6%</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── CARTÃO DE CRÉDITO ────────────────────────────────────────────────────
interface SavedCard {
  id: string;
  card_holder_name: string;
  card_last_four: string;
  card_brand: string | null;
  card_expiry_month: number;
  card_expiry_year: number;
  is_default: boolean;
  created_at: string;
}

function AbaCartao() {
  const { profile } = useProfile();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cardBrand, setCardBrand] = useState("");

  const fetchCards = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("user_payment_cards")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCards(data || []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.id) fetchCards();
  }, [profile?.id]);

  const detectBrand = (num: string) => {
    const n = num.replace(/\s/g, "");
    if (/^4/.test(n)) return "Visa";
    if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "Mastercard";
    if (/^3[47]/.test(n)) return "Amex";
    if (/^6(?:011|5)/.test(n)) return "Discover";
    if (/^(636368|438935|504175|451416|636297)/.test(n) || /^50[0-9]{1}/.test(n)) return "Elo";
    return "";
  };

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const handleCardNumberChange = (val: string) => {
    const formatted = formatCardNumber(val);
    setCardNumber(formatted);
    setCardBrand(detectBrand(formatted));
  };

  const handleAddCard = async () => {
    if (!profile?.id || !holderName || cardNumber.replace(/\s/g, "").length < 13 || !expiryMonth || !expiryYear) {
      toast({ title: "Preencha todos os campos corretamente", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const lastFour = cardNumber.replace(/\s/g, "").slice(-4);
      const { error } = await (supabase as any)
        .from("user_payment_cards")
        .insert({
          user_id: profile.id,
          card_holder_name: holderName.trim(),
          card_last_four: lastFour,
          card_brand: cardBrand || null,
          card_expiry_month: parseInt(expiryMonth),
          card_expiry_year: parseInt(expiryYear),
          is_default: cards.length === 0,
        });
      if (error) throw error;
      toast({ title: "Cartão adicionado!", description: `****${lastFour} salvo com sucesso.` });
      setHolderName(""); setCardNumber(""); setExpiryMonth(""); setExpiryYear(""); setCardBrand("");
      setShowAddForm(false);
      fetchCards();
    } catch (err: any) {
      toast({ title: "Erro ao salvar cartão", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("user_payment_cards")
        .delete()
        .eq("id", cardId);
      if (error) throw error;
      toast({ title: "Cartão removido" });
      fetchCards();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
  };

  const handleSetDefault = async (cardId: string) => {
    if (!profile?.id) return;
    try {
      await (supabase as any)
        .from("user_payment_cards")
        .update({ is_default: false })
        .eq("user_id", profile.id);
      await (supabase as any)
        .from("user_payment_cards")
        .update({ is_default: true })
        .eq("id", cardId);
      toast({ title: "Cartão padrão atualizado" });
      fetchCards();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="space-y-3 p-1">{[1,2].map(i => <Skeleton key={i} className="h-20" />)}</div>;

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-4 p-1">
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Cartões Salvos
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus className="h-3 w-3" />
              Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddForm && (
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Nome no Cartão</Label>
                  <Input placeholder="NOME COMO NO CARTÃO" value={holderName} onChange={e => setHolderName(e.target.value.toUpperCase())} className="h-9 uppercase" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Número do Cartão</Label>
                  <div className="relative">
                    <Input
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={e => handleCardNumberChange(e.target.value)}
                      className="h-9 pr-20"
                      maxLength={19}
                    />
                    {cardBrand && (
                      <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]">
                        {cardBrand}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Mês</Label>
                    <Select value={expiryMonth} onValueChange={setExpiryMonth}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, "0")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Ano</Label>
                    <Select value={expiryYear} onValueChange={setExpiryYear}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Ano" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={currentYear + i} value={String(currentYear + i)}>{currentYear + i}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)} className="flex-1 h-8 text-xs">Cancelar</Button>
                  <Button size="sm" onClick={handleAddCard} disabled={isSaving} className="flex-1 h-8 text-xs gap-1">
                    {isSaving ? "Salvando..." : <><Save className="h-3 w-3" /> Salvar</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {cards.length === 0 && !showAddForm ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum cartão salvo</p>
              <p className="text-xs mt-1">Adicione um cartão para pagamentos rápidos</p>
            </div>
          ) : (
            cards.map(card => (
              <Card key={card.id} className={cn("bg-card/80 border-border/40", card.is_default && "border-primary/40")}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {card.card_brand || "Cartão"} ****{card.card_last_four}
                      </span>
                      {card.is_default && (
                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                          <Star className="h-2.5 w-2.5 mr-0.5" /> Padrão
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {card.card_holder_name} · Exp: {String(card.card_expiry_month).padStart(2, "0")}/{card.card_expiry_year}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!card.is_default && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSetDefault(card.id)} title="Definir como padrão">
                        <Star className="h-3 w-3" />
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" aria-label="Excluir">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover cartão?</AlertDialogTitle>
                          <AlertDialogDescription>O cartão ****{card.card_last_four} será removido permanentemente.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteCard(card.id)} className="bg-destructive text-destructive-foreground">Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── MODAL PRINCIPAL ────────────────────────────────────────────────────────
interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export function FinanceiroModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-4 sm:px-5 pt-5 pb-2 border-b border-border/30">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-emerald-400"/>
            Financeiro
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="rendimentos" className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
          <div className="shrink-0 sticky top-0 z-20 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 pt-3 pb-2 px-4 sm:px-5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border-b border-border/40 shadow-sm">
            <TabsList className="inline-flex w-max h-9 gap-1">
              <TabsTrigger value="rendimentos" className="text-xs px-3 whitespace-nowrap">Rendimentos</TabsTrigger>
              <TabsTrigger value="transacoes" className="text-xs px-3 whitespace-nowrap">Transações</TabsTrigger>
              <TabsTrigger value="detalhamento" className="text-xs px-3 whitespace-nowrap">Detalhamento</TabsTrigger>
              <TabsTrigger value="pix" className="text-xs px-3 whitespace-nowrap">Chave PIX</TabsTrigger>
              <TabsTrigger value="cartao" className="text-xs px-3 whitespace-nowrap">Cartão</TabsTrigger>
              <TabsTrigger value="cupons" className="text-xs px-3 whitespace-nowrap">Cupons</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4 [&_*]:min-w-0" style={{ scrollbarWidth:"none", WebkitOverflowScrolling: "touch" }}>
            <TabsContent value="rendimentos" className="mt-0"><AbaRendimentos/></TabsContent>
            <TabsContent value="transacoes" className="mt-0"><AbaTransacoes/></TabsContent>
            <TabsContent value="detalhamento" className="mt-0"><AbaDetalhamento/></TabsContent>
            <TabsContent value="pix" className="mt-0"><AbaChavePix/></TabsContent>
            <TabsContent value="cartao" className="mt-0"><AbaCartao/></TabsContent>
            <TabsContent value="cupons" className="mt-0"><AbaCupons/></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
