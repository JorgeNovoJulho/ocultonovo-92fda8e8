import { useState, useMemo } from "react";
import { buildCreatorInviteUrl } from '@/lib/inviteLinks';
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DollarSign,
  Wallet,
  Users,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Smartphone,
  Ticket,
  Gift,
  Share2,
  Link2,
  Plus,
  Info,
  Megaphone,
  Target,
  Edit3,
  Trash2,
  BarChart3,
  Lock,
  Crown,
  Sparkles,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { toast } from "@/hooks/use-toast";
import { useTransactions, useEarningsSummary, useCreateTransaction } from "@/hooks/useTransactions";
import { useMySubscribers } from "@/hooks/useSubscriptions";
import { useRealtimeBalance } from "@/hooks/useRealtimeBalance";
import { ContentSalesHistory } from "@/components/earnings/ContentSalesHistory";
import { useProfile } from "@/hooks/useProfile";
import { useCreatorCoupons, useCreateCoupon, useToggleCoupon } from "@/hooks/useCoupons";
import { useBetaGuard } from "@/hooks/useBetaGuard";
import { BetaLockedNotice } from "@/components/beta/BetaLockedNotice";
import { BetaWithdrawCTA } from "@/components/beta/BetaWithdrawCTA";
import { useReferralStats, useMyReferrals, isCommissionPaid, calculateCommission } from "@/hooks/useReferrals";
import { CreateCouponModal } from "@/components/CreateCouponModal";
import { CouponsTable } from "@/components/CouponsTable";
import { ReferralsList, type Referral } from "@/components/ReferralsList";
import { GoalProgressBar } from "@/components/GoalProgressBar";
import { useMyCreatorGoal, useUpsertCreatorGoal, useDeactivateGoal } from "@/hooks/useCreatorGoal";
import { useWithdrawalLimits } from "@/hooks/useWithdrawalLimits";
import { ConvertCreditsSection } from "@/components/ConvertCreditsSection";
import { CreditsConvertedCard } from "@/components/CreditsConvertedCard";
import { PremiumAccessGuard } from "@/components/PremiumAccessGuard";
import { CreateBroadcastModal, BroadcastAnalytics } from "@/components/broadcast";
import { SuperDmDashboard } from "@/components/chat/SuperDmDashboard";
import { MadrinhaDashboard } from "@/components/madrinha";
import { useCreatorReferralCode } from "@/hooks/useCreatorReferrals";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { PlanFeatureLock, PlanFeatureBanner } from "@/components/PlanFeatureLock";
import { DiscordWebhookTestModal } from "@/components/DiscordWebhookTestModal";


export default function EarningsPage() {
  return (
    <PremiumAccessGuard featureName="Rendimentos">
      <EarningsPageContent />
    </PremiumAccessGuard>
  );
}

function EarningsPageContent() {
  useRealtimeBalance();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showDiscordTest, setShowDiscordTest] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Goal form state
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");

  const { profile } = useProfile();
  const { code: creatorReferralCode } = useCreatorReferralCode();
  const permissions = usePlanPermissions();
  const { data: transactions, isLoading: isLoadingTransactions } = useTransactions();
  const { data: earnings, isLoading: isLoadingEarnings } = useEarningsSummary();
  const { data: subscribers } = useMySubscribers();
  const createTransaction = useCreateTransaction();
  
  // Real data from Supabase
  const { data: dbCoupons, isLoading: isLoadingCoupons } = useCreatorCoupons();
  const createCoupon = useCreateCoupon();
  const toggleCoupon = useToggleCoupon();
  const { stats: referralStats, isLoading: isLoadingReferrals } = useReferralStats();
  const { data: dbReferrals } = useMyReferrals();
  
  // Creator Goal
  const { data: creatorGoal, isLoading: isLoadingGoal } = useMyCreatorGoal();
  const upsertGoal = useUpsertCreatorGoal();
  const deactivateGoal = useDeactivateGoal();
  
  // Withdrawal limits
  const { data: withdrawalLimits } = useWithdrawalLimits();

  const referralLink = creatorReferralCode
    ? (buildCreatorInviteUrl(creatorReferralCode) || '').replace(/^https?:\/\//, '')
    : '';

  // Calculate real values from earnings summary (SQL view handles 20% fee)
  const availableBalance = earnings?.balance ?? 0;
  const pendingBalance = earnings?.pending ?? 0;
  const totalLiquido = earnings?.totalLiquido ?? 0;
  const totalBruto = earnings?.totalBruto ?? 0;
  const totalTaxa = earnings?.totalTaxa ?? 0;
  const activeSubscribers = subscribers?.length || 0;
  
  // Growth: only show if there are real active subscribers (no mock data)
  const hasGrowthData = activeSubscribers > 0;

  // Convert DB coupons to display format
  const displayCoupons = useMemo(() => {
    if (!dbCoupons || dbCoupons.length === 0) return [];
    
    return dbCoupons.map(c => ({
      id: c.id,
      campaignName: c.campaign_name,
      code: c.code,
      discount: c.discount,
      startDate: new Date(c.start_date),
      endDate: new Date(c.end_date),
      uses: c.current_uses,
      isActive: c.is_active,
      createdAt: new Date(c.created_at),
    }));
  }, [dbCoupons]);

  // Convert DB referrals to display format (real data only, no mock fallback)
  const displayReferrals = useMemo((): Referral[] => {
    if (!dbReferrals || dbReferrals.length === 0) return [];
    
    return dbReferrals.map(r => ({
      id: r.id,
      name: r.referred_profile?.name || 'Usuário',
      avatar: r.referred_profile?.avatar_url || undefined,
      subscribedAt: new Date(r.started_at),
      monthlyValue: r.subscription?.price || 29.90,
      isActive: r.is_active && r.subscription?.status === 'active',
      commissionPaid: !!r.commission_ended_at,
    }));
  }, [dbReferrals]);

  // Calculate daily earnings for the last 7 days from transactions
  const weeklyEarningsData = useMemo(() => {
    const days: { day: string; valor: number }[] = [];
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      const dayLabel = dayNames[date.getDay()];

      let total = 0;
      if (transactions && transactions.length > 0) {
        transactions
          .filter(t => (t.type === 'subscription' || t.type === 'tip') && t.status !== 'failed')
          .forEach(t => {
            const tKey = new Date(t.created_at).toISOString().split('T')[0];
            if (tKey === key) total += Number(t.amount);
          });
      }
      // No mock fallback - show 0 if no real data

      days.push({ day: dayLabel, valor: total });
    }

    return days;
  }, [transactions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleWithdraw = async () => {
    if (!pixKey || !withdrawAmount) return;

    setIsProcessing(true);
    try {
      await createTransaction.mutateAsync({
        amount: -parseFloat(withdrawAmount.replace(',', '.')),
        type: 'withdrawal',
        description: `Saque via PIX: ${pixKey}`,
      });

      toast({
        title: "Saque solicitado!",
        description: "Você receberá uma notificação quando o valor for transferido.",
      });

      setShowWithdrawModal(false);
      setPixKey("");
      setWithdrawAmount("");
    } catch (error) {
      toast({
        title: "Erro ao solicitar saque",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(`https://${referralLink}`);
    setCopied(true);
    toast({
      title: "Link copiado!",
      description: "Compartilhe com seus amigos para ganhar comissões",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateCoupon = (coupon: { campaignName: string; code: string; discount: number; startDate: Date; endDate: Date; isActive: boolean; platformSource?: string }) => {
    createCoupon.mutate({
      campaign_name: coupon.campaignName,
      code: coupon.code,
      discount: coupon.discount,
      start_date: coupon.startDate,
      end_date: coupon.endDate,
      platform_source: coupon.platformSource || 'other',
    });
  };

  const handleToggleCoupon = (couponId: string, isActive: boolean) => {
    toggleCoupon.mutate({ couponId, isActive });
  };

  const handleSaveGoal = async () => {
    const amount = parseFloat(goalAmount.replace(',', '.'));
    if (!goalTitle.trim() || isNaN(amount) || amount <= 0) {
      toast({
        title: 'Dados inválidos',
        description: 'Preencha o título e um valor válido para a meta.',
        variant: 'destructive',
      });
      return;
    }

    await upsertGoal.mutateAsync({
      title: goalTitle.trim(),
      target_amount: amount,
    });

    setShowGoalModal(false);
    setGoalTitle("");
    setGoalAmount("");
  };

  const handleDeleteGoal = async () => {
    if (creatorGoal?.id) {
      await deactivateGoal.mutateAsync(creatorGoal.id);
    }
  };

  const maxEarning = Math.max(...weeklyEarningsData.map(d => d.valor), 1);

  // Format transaction for display
  const formattedTransactions = useMemo(() => {
    if (!transactions) return [];
    
    return transactions.slice(0, 8).map(t => ({
      id: t.id,
      date: new Date(t.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
      description: t.description || (t.type === 'subscription' ? 'Assinatura Mensal' : t.type === 'tip' ? 'Gorjeta' : t.type),
      user: '@usuario',
      amount: Number(t.amount),
      status: t.status as 'approved' | 'pending',
    }));
  }, [transactions]);

  const isLoading = isLoadingTransactions || isLoadingEarnings;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-[hsl(142,76%,36%)]/10">
            <DollarSign className="h-6 w-6 text-[hsl(142,76%,36%)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rendimentos</h1>
            <p className="text-muted-foreground">
              Gerencie sua carteira de criador
            </p>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Available Balance */}
        <Card className="bg-gradient-to-br from-[hsl(142,76%,36%)]/10 to-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              Saldo Disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl md:text-2xl font-bold text-[hsl(142,76%,36%)]">
              {formatCurrency(availableBalance)}
            </p>
          </CardContent>
        </Card>

        {/* Pending */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Pendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl md:text-2xl font-bold text-muted-foreground">
              {formatCurrency(pendingBalance)}
            </p>
          </CardContent>
        </Card>

        {/* Active Subscribers */}
        <Card className="bg-primary/5 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              Assinantes Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl md:text-2xl font-bold text-primary">
              {activeSubscribers}
            </p>
          </CardContent>
        </Card>

        {/* Growth */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Crescimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasGrowthData ? (
              <p className="text-xl md:text-2xl font-bold text-emerald-500">
                {activeSubscribers} ativo{activeSubscribers !== 1 ? 's' : ''}
              </p>
            ) : (
              <p className="text-xl md:text-2xl font-bold text-muted-foreground">
                —
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Withdraw Section with Limits Info */}
      <Card className="bg-card/50 border-border/30">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="h-5 w-5 text-[hsl(142,76%,36%)]" />
                <span className="font-semibold text-foreground">Solicitar Saque</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                  Limite mensal: <strong>{withdrawalLimits?.maxMonthly || 3} saques/mês</strong>
                  <span className="text-xs">
                    ({withdrawalLimits?.remainingWithdrawals || 3} restantes)
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-[hsl(142,76%,36%)]" />
                  Valor mínimo: <strong>{formatCurrency(withdrawalLimits?.minAmount || 250)}</strong>
                </p>
              </div>
            </div>
            <BetaWithdrawCTA
              canWithdrawApi={Boolean(withdrawalLimits?.canWithdraw)}
              minAmount={withdrawalLimits?.minAmount || 250}
              maxMonthly={withdrawalLimits?.maxMonthly || 3}
              availableBalance={availableBalance}
              formatCurrency={formatCurrency}
              onProceed={() => {
                setWithdrawAmount(availableBalance.toFixed(2));
                setShowWithdrawModal(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Seção de Conversão de Créditos */}
      <ConvertCreditsSection />

      {/* Card de Créditos Convertidos */}
      <CreditsConvertedCard />

      {/* Broadcast PPV Section */}
      <Card className="bg-gradient-to-br from-[hsl(280,80%,50%)]/10 via-card/50 to-primary/5 border-[hsl(280,80%,50%)]/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-[hsl(280,80%,50%)]" />
              Mensagens em Massa (PPV)
              {permissions.isFree && (
                <Badge variant="secondary" className="ml-1 bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)]">
                  <Crown className="h-3 w-3 mr-1" />Premium+
                </Badge>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Envie mensagens com mídia bloqueada para todos os seus seguidores de uma vez. Eles pagam para desbloquear!</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            {permissions.canCreateBroadcasts ? (
              <Button
                size="sm"
                onClick={() => setShowBroadcastModal(true)}
                className="bg-gradient-to-r from-[hsl(280,80%,50%)] to-[hsl(280,80%,60%)] hover:opacity-90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Broadcast
              </Button>
            ) : (
              <Button size="sm" disabled className="opacity-50 cursor-not-allowed gap-2">
                <Lock className="h-4 w-4" />
                Bloqueado
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {permissions.isFree ? (
            <PlanFeatureLock
              featureName="Criar mensagens em massa (PPV)"
              requiredPlan="premium"
              description="Envie mensagens com mídia bloqueada para todos os seus seguidores de uma vez. Disponível a partir do plano Premium."
            />
          ) : (
            <BroadcastAnalytics />
          )}
        </CardContent>
      </Card>

      {/* Super DM Section */}
      <Card className="bg-gradient-to-br from-amber-500/10 via-card/50 to-yellow-500/5 border-amber-500/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Super DM
              {permissions.isFree && (
                <Badge variant="secondary" className="ml-1 bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)]">
                  <Crown className="h-3 w-3 mr-1" />Premium+
                </Badge>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Mensagens prioritárias pagas pelos seus fãs para furar a fila e ir direto ao topo da sua inbox!</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            {permissions.canUseSuperDm && (
              <Link to="/settings">
                <Button variant="outline" size="sm" className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                  <Sparkles className="h-4 w-4" />
                  Configurar
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {permissions.isFree ? (
            <PlanFeatureLock
              featureName="Usar Super DM"
              requiredPlan="premium"
              description="Mensagens prioritárias pagas pelos seus fãs para furar a fila. Disponível a partir do plano Premium."
            />
          ) : (
            <SuperDmDashboard />
          )}
        </CardContent>
      </Card>

      {/* Creator Goal Section */}
      <Card className="bg-gradient-to-br from-primary/5 via-card/50 to-[hsl(330,80%,50%)]/5 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Meta de Arrecadação
              {permissions.isFree && (
                <Badge variant="secondary" className="ml-1 bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)]">
                  <Crown className="h-3 w-3 mr-1" />Premium+
                </Badge>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Defina uma meta visível no seu perfil para seus seguidores contribuírem.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            {!permissions.isFree && creatorGoal && (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setGoalTitle(creatorGoal.title);
                    setGoalAmount(creatorGoal.target_amount.toString());
                    setShowGoalModal(true);
                  }}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={handleDeleteGoal}
                 aria-label="Excluir">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions.isFree ? (
            <PlanFeatureLock
              featureName="Criar meta de arrecadação"
              requiredPlan="premium"
              description="Defina uma meta visível no seu perfil para seus seguidores contribuírem. Disponível a partir do plano Premium."
            />
          ) : creatorGoal ? (
            <>
              <GoalProgressBar
                title={creatorGoal.title}
                currentAmount={Number(creatorGoal.current_amount)}
                targetAmount={Number(creatorGoal.target_amount)}
                showContributeButton={false}
              />
              <p className="text-xs text-muted-foreground">
                Esta meta está visível no seu perfil público. Seus seguidores podem contribuir diretamente.
              </p>
            </>
          ) : (
            <div className="text-center py-6">
              <Target className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Você ainda não definiu uma meta. Crie uma para seus seguidores verem e contribuírem!
              </p>
              <Button
                onClick={() => setShowGoalModal(true)}
                className="bg-gradient-to-r from-primary to-[hsl(330,80%,60%)] hover:opacity-90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Meta
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referral Section - "Convide e Ganhe" */}
      <Card className="bg-gradient-to-br from-primary/5 via-card/50 to-secondary/5 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Convide e Ganhe
              {permissions.isFree && (
                <Badge variant="secondary" className="ml-1 bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)]">
                  <Crown className="h-3 w-3 mr-1" />Premium+
                </Badge>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Ganhe 5% de comissão recorrente sobre cada assinatura dos seus indicados durante os primeiros 90 dias.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            {permissions.canUseReferralInvites && (
              <Link to="/affiliate-analytics">
                <Button variant="outline" size="sm" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Ver Analytics
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions.isFree ? (
            <PlanFeatureLock
              featureName="Enviar convites e ganhar comissões"
              requiredPlan="premium"
              description="Ganhe 5% de comissão recorrente indicando novos assinantes. Disponível a partir do plano Premium."
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Ganhe <span className="text-primary font-semibold">5% de comissão recorrente</span> indicando novos assinantes para a plataforma.
              </p>
              <div className="p-4 rounded-lg bg-muted/30 border border-dashed border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">Seu código de indicação:</span>
                  <Badge className="bg-primary/10 text-primary font-mono">
                    <Ticket className="h-3 w-3 mr-1" />{creatorReferralCode || '—'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input readOnly value={referralLink} className="bg-muted/30 border-border/50 pl-10 text-sm font-mono" />
                  </div>
                  <Button variant="outline" onClick={copyReferralLink} className={cn("shrink-0 transition-all", copied && "bg-green-500/10 border-green-500/30 text-green-500")}>
                    {copied ? <><CheckCircle2 className="h-4 w-4 mr-2" />Copiado!</> : <><Copy className="h-4 w-4 mr-2" />Copiar</>}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-xs text-muted-foreground">Indicados</p>
                  <p className="text-lg font-bold text-foreground">{referralStats.totalReferred || displayReferrals.length}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-xs text-muted-foreground">Comissões Pagas</p>
                  <p className="text-lg font-bold text-primary">{referralStats.commissionPaid}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <p className="text-xs text-muted-foreground">Ganhos Totais</p>
                  <p className="text-lg font-bold text-green-500">{formatCurrency(referralStats.totalEarnings)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/20">
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                  <p className="text-lg font-bold text-muted-foreground">{referralStats.pendingCommission}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">Seus Indicados</h4>
                  <Badge variant="secondary" className="text-xs">{displayReferrals.filter(r => r.isActive).length} ativos</Badge>
                </div>
                <ReferralsList referrals={displayReferrals} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1"><Share2 className="h-4 w-4 mr-2" />WhatsApp</Button>
                <Button variant="outline" size="sm" className="flex-1"><Share2 className="h-4 w-4 mr-2" />Twitter</Button>
                <Button variant="outline" size="sm" className="flex-1"><Share2 className="h-4 w-4 mr-2" />Instagram</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Madrinha Program */}
      {permissions.isFree ? (
        <PlanFeatureBanner
          featureName="Programa Madrinhas"
          requiredPlan="premium"
          description="Convide criadoras e ganhe 5% de comissão por 12 meses. Disponível a partir do plano Premium."
        />
      ) : (
        <MadrinhaDashboard />
      )}

      {/* Creator Promotional Coupons Section — managed via permissions hook */}

      {/* Earnings Graph - Recharts 7 days */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Desempenho (7 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 md:h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyEarningsData} barCategoryGap="20%">
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <YAxis hide />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Ganhos']}
                  cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill="hsl(142, 76%, 36%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Summary */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
            <div>
              <p className="text-sm text-muted-foreground">Total da semana</p>
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(weeklyEarningsData.reduce((a, b) => a + b.valor, 0))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Média diária</p>
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(weeklyEarningsData.reduce((a, b) => a + b.valor, 0) / 7)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extrato — navigation shortcut */}
      <Link to="/earnings/statement" className="block">
        <Card className="bg-card/50 border-border/30 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Meu Extrato Completo</p>
                  <p className="text-xs text-muted-foreground">Veja bruto, taxa e líquido de cada transação</p>
                </div>
              </div>
              <ArrowUpRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Histórico de Vendas de Conteúdo */}
      <ContentSalesHistory />

      {/* Discord Webhook Test — admin quick check */}
      <Card
        className="bg-card/50 border-border/30 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => setShowDiscordTest(true)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Testar Webhook Discord</p>
                <p className="text-xs text-muted-foreground">Verificar conexão de notificações de venda</p>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>

      <DiscordWebhookTestModal open={showDiscordTest} onOpenChange={setShowDiscordTest} />

      {/* Withdraw Modal */}
      <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[hsl(142,76%,36%)]" />
              Solicitar Saque
            </DialogTitle>
            <DialogDescription>
              Informe sua chave Pix para receber o valor
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Available */}
            <div className="p-4 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30">
              <p className="text-sm text-muted-foreground">Disponível para saque</p>
              <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">
                {formatCurrency(availableBalance)}
              </p>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Valor do Saque</Label>
              <Input
                id="amount"
                value={`R$ ${withdrawAmount}`}
                onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                className="bg-muted/30 border-border/50"
              />
            </div>

            {/* Pix Key */}
            <div className="space-y-2">
              <Label htmlFor="pix">Chave Pix</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pix"
                  placeholder="CPF, Email, Telefone ou Chave Aleatória"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="bg-muted/30 border-border/50 pl-10"
                />
              </div>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>O processamento leva até 3 dias úteis. Você receberá uma notificação quando o valor for transferido.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowWithdrawModal(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={!pixKey || isProcessing || !withdrawAmount}
              className="flex-1 bg-gradient-to-r from-[hsl(142,76%,36%)] to-[hsl(142,76%,46%)] text-white"
            >
              {isProcessing ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Processando...
                </>
              ) : (
                <>
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Confirmar Saque
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Coupon Modal */}
      <CreateCouponModal
        open={showCouponModal}
        onOpenChange={setShowCouponModal}
        onCreateCoupon={handleCreateCoupon}
        basePrice={29.90}
      />

      {/* Create Goal Modal */}
      <Dialog open={showGoalModal} onOpenChange={setShowGoalModal}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {creatorGoal ? 'Editar Meta' : 'Criar Nova Meta'}
            </DialogTitle>
            <DialogDescription>
              Defina um objetivo para seus seguidores verem e contribuírem
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="goal-title">Título da Meta</Label>
              <Input
                id="goal-title"
                placeholder="Ex: Viagem de Férias, Novo Equipamento..."
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                className="bg-muted/30 border-border/50"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-amount">Valor Alvo (R$)</Label>
              <Input
                id="goal-amount"
                type="text"
                inputMode="decimal"
                placeholder="1000,00"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="bg-muted/30 border-border/50"
              />
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Dica:</strong> Metas claras e específicas tendem a receber mais contribuições. 
                Escolha algo tangível que seus seguidores possam acompanhar!
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowGoalModal(false);
                setGoalTitle("");
                setGoalAmount("");
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveGoal}
              disabled={upsertGoal.isPending || !goalTitle.trim() || !goalAmount}
              className="flex-1 bg-gradient-to-r from-primary to-[hsl(330,80%,60%)] hover:opacity-90"
            >
              {upsertGoal.isPending ? 'Salvando...' : 'Salvar Meta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Broadcast Modal */}
      <CreateBroadcastModal
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
      />
    </div>
  );
}
