import { useState, useEffect, lazy, Suspense } from "react";
import { AdminCardSkeleton } from "@/components/admin/AdminCardSkeleton";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { 
  DollarSign, 
  Users, 
  UserPlus, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Crown,
  CreditCard,
  MapPin,
  Rocket,
  Sparkles,
  Loader2,
  Wifi,
  ExternalLink,
  RefreshCw,
  MessageSquareHeart,
  Trash2,
  Clock,
  Info,
  Calculator,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { MilestoneCelebration } from "@/components/MilestoneCelebration";
import { useNotifications } from "@/hooks/useNotifications";
import { useGrowthStats } from "@/hooks/useGrowthStats";
const CriticalReportsPanel = lazy(() => import("@/components/admin/CriticalReportsPanel").then(m => ({ default: m.CriticalReportsPanel })));
const OverdueMetricsCard = lazy(() => import("@/components/admin/OverdueMetricsCard").then(m => ({ default: m.OverdueMetricsCard })));
const InactiveUsersCard = lazy(() => import("@/components/admin/InactiveUsersCard").then(m => ({ default: m.InactiveUsersCard })));
const CartRecoveryMetricsCard = lazy(() => import("@/components/admin/CartRecoveryMetricsCard").then(m => ({ default: m.CartRecoveryMetricsCard })));
const GeoHeatmapCard = lazy(() => import("@/components/admin/GeoHeatmapCard").then(m => ({ default: m.GeoHeatmapCard })));
const ABTestManagerCard = lazy(() => import("@/components/admin/ABTestManagerCard").then(m => ({ default: m.ABTestManagerCard })));
const SystemHealthCard = lazy(() => import("@/components/admin/SystemHealthCard").then(m => ({ default: m.SystemHealthCard })));
const QuickMetricsCard = lazy(() => import("@/components/admin/QuickMetricsCard").then(m => ({ default: m.QuickMetricsCard })));
const AdminReportsPanel = lazy(() => import("@/components/admin/AdminReportsPanel").then(m => ({ default: m.AdminReportsPanel })));
const ChurnAlertsDashboard = lazy(() => import("@/components/admin/ChurnAlertsDashboard").then(m => ({ default: m.ChurnAlertsDashboard })));
import { useAdminMetrics, useActiveLocations } from "@/hooks/useAdminMetrics";
import { useAllReports } from "@/hooks/useContentReports";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { useOnlineCount } from "@/hooks/useOnlineCount";
import { useAdminPostStats } from "@/hooks/useAdminPosts";
const EngagementComparisonChart = lazy(() => import("@/components/admin/EngagementComparisonChart").then(m => ({ default: m.EngagementComparisonChart })));
const NewUsersChart = lazy(() => import("@/components/admin/NewUsersChart").then(m => ({ default: m.NewUsersChart })));
const RevenueChart = lazy(() => import("@/components/admin/RevenueChart").then(m => ({ default: m.RevenueChart })));
const DevicePerformanceChart = lazy(() => import("@/components/admin/DevicePerformanceChart").then(m => ({ default: m.DevicePerformanceChart })));
import { Skeleton } from "@/components/ui/skeleton";
import { MASTER_OPEN_ONLINE_GIFT_EVENT } from "@/components/admin/MasterOnlineAlertProvider";
import { MasterAlertSettingsPopover } from "@/components/admin/MasterAlertSettingsPopover";
import { MasterAlertTestButton } from "@/components/admin/MasterAlertTestButton";
const PioneerCampaignWidget = lazy(() => import("@/components/admin/PioneerCampaignWidget").then(m => ({ default: m.PioneerCampaignWidget })));
const AdminPushCard = lazy(() => import("@/components/admin/AdminPushCard").then(m => ({ default: m.AdminPushCard })));
const SecurityAuditPanel = lazy(() => import("@/components/admin/SecurityAuditPanel").then(m => ({ default: m.SecurityAuditPanel })));
import { AdminUsersListModal, type AdminUsersListMode } from "@/components/admin/AdminUsersListModal";
import { useLandingPublicMetricsSummary } from "@/hooks/useLandingPublicMetrics";
import { useDeferredMount } from "@/hooks/useDeferredMount";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchingCount = useIsFetching();
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Defer non-essential queries to keep TTFP rápido: primeira pintura usa apenas
  // métricas principais (cache + 1 RPC). Tudo o resto entra após 500ms / 1.5s.
  const secondaryWidgetsReady = useDeferredMount(500);
  const heavyWidgetsReady = useDeferredMount(1500);

  const { data: metrics, isLoading: metricsLoading } = useAdminMetrics();
  const { data: unrewardedOnline = 0 } = useOnlineUsers();
  const { data: onlineUsers = 0, isLoading: onlineLoading } = useOnlineCount();
  // ↓ Gated por secondaryWidgetsReady — não competem por HTTP/2 no primeiro paint
  const { data: activeLocations = [], isLoading: locationsLoading } = useActiveLocations(secondaryWidgetsReady);
  const { data: allReports = [] } = useAllReports({ status: 'pending' }, secondaryWidgetsReady);
  const { data: landingPublicMetrics } = useLandingPublicMetricsSummary(heavyWidgetsReady);
  const { data: postStats, isLoading: statsLoading } = useAdminPostStats(heavyWidgetsReady);
  const { notifications, markAsRead } = useNotifications();
  const { data: growthStats, isLoading: growthLoading } = useGrowthStats(secondaryWidgetsReady);
  
  const engagementStats = postStats ? {
    real: postStats.real,
    seed: postStats.seed,
  } : null;
  
  // Check for milestone celebration notification
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    realUsers: number;
    seedUsersPurged: number;
  } | null>(null);
  const [usersModal, setUsersModal] = useState<AdminUsersListMode | null>(null);
  const openOnlineDialog = () => window.dispatchEvent(new CustomEvent(MASTER_OPEN_ONLINE_GIFT_EVENT));

  const refreshDashboard = () => {
    const dashboardKeys = [
      ['admin-metrics'],
      ['active-locations'],
      ['content-reports'],
      ['online-users'],
      ['admin-post-stats'],
      ['growth-stats'],
      ['landing-public-metrics-summary'],
      ['admin-verification-stats'],
      ['open-support-count'],
    ] as const;

    dashboardKeys.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  };

  useEffect(() => {
    if (!autoRefresh) return;
    // Executa imediatamente ao ativar (inclusive logo após login) e depois a cada 60s
    refreshDashboard();
    const interval = window.setInterval(refreshDashboard, 60000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  useEffect(() => {
    // Find unread milestone notification
    const milestoneNotification = notifications.find(
      (n) => !n.is_read && n.data && typeof n.data === 'object' && 'milestone' in n.data && (n.data as any).milestone === 'growth_3x' && (n.data as any).celebration
    );

    if (milestoneNotification && milestoneNotification.data) {
      const data = milestoneNotification.data as { real_users: number; seed_users_purged: number };
      setCelebrationData({
        realUsers: data.real_users || 0,
        seedUsersPurged: data.seed_users_purged || 0,
      });
      setShowCelebration(true);
    }
  }, [notifications]);

  const handleDismissCelebration = async () => {
    setShowCelebration(false);
    // Mark the milestone notification as read
    const milestoneNotification = notifications.find(
      (n) => !n.is_read && n.data && typeof n.data === 'object' && 'milestone' in n.data && (n.data as any).milestone === 'growth_3x'
    );
    if (milestoneNotification) {
      await markAsRead(milestoneNotification.id);
    }
  };

  // KPI Cards com dados reais
  const kpiCards = [
    {
      title: "Receita Total",
      value: metricsLoading 
        ? '...' 
        : `R$ ${(metrics?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      // Só mostra variação quando há receita real — evita "+5980% sobre R$ 0,00"
      change: (metrics?.totalRevenue || 0) > 0 && metrics?.monthlyGrowth ? `+${metrics.monthlyGrowth}%` : undefined,
      changeType: 'positive' as const,
      tooltip: 'Soma TOTAL bruta de todas as transações pagas (gateway PIX + cartão). Sem corte por período.',
    },
    {
      title: "Usuários Ativos",
      value: metricsLoading ? '...' : (metrics?.activeUsers || 0).toLocaleString('pt-BR'),
      icon: Users,
      modal: 'active' as AdminUsersListMode,
      change: metrics?.monthlyGrowth ? `+${metrics.monthlyGrowth}%` : undefined,
      changeType: 'positive' as const,
      tooltip: 'TOTAL de perfis reais (exclui bots/seed e contas banidas). Critério canônico usado em todo o painel.',
    },
    {
      title: "Novos Hoje",
      value: metricsLoading ? '...' : (metrics?.newSignupsToday || 0).toString(),
      icon: UserPlus,
      modal: 'new_today' as AdminUsersListMode,
      changeType: 'positive' as const,
      tooltip: 'Cadastros criados desde 00:00 (horário do servidor), excluindo seed.',
    },
    {
      title: "Denúncias Pendentes",
      value: metricsLoading ? '...' : (metrics?.pendingReports || 0).toString(),
      icon: AlertCircle,
      changeType: 'neutral' as const,
      tooltip: 'TOTAL de denúncias com status=pending e prioridade não-crítica (críticas vão para o painel próprio).',
    },
    {
      title: "Contas Excluídas",
      value: metricsLoading ? '...' : (metrics?.deletedAccounts || 0).toLocaleString('pt-BR'),
      icon: Trash2,
      modal: 'deleted' as AdminUsersListMode,
      changeType: 'neutral' as const,
      tooltip: 'TOTAL de perfis marcados como excluídos (account_status=deleted ou deleted_at preenchido).',
    },
    {
      title: "Contas Inativas",
      value: metricsLoading ? '...' : (metrics?.inactive15 || 0).toLocaleString('pt-BR'),
      icon: Clock,
      modal: 'inactive' as AdminUsersListMode,
      changeType: 'neutral' as const,
      subtitle: metricsLoading
        ? undefined
        : `15d: ${metrics?.inactive15 || 0} · 30d: ${metrics?.inactive30 || 0} · 90d: ${metrics?.inactive90 || 0}`,
      tooltip: 'TOTAL de usuários reais sem login há 15+ dias. Subtítulo mostra cortes de 15/30/90 dias.',
    },
    {
      title: "Ganho Potencial Ativos",
      value: metricsLoading
        ? '...'
        : `R$ ${((metrics?.activeUsers || 0) * 11.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: Calculator,
      changeType: 'positive' as const,
      subtitle: metricsLoading
        ? undefined
        : `R$ 11,90 × ${metrics?.activeUsers || 0} usuários`,
      tooltip: 'Projeção de receita mensal se todos os usuários ativos assinassem o plano de R$ 11,90.',
    },
    {
      title: "Ganho Potencial Inativos",
      value: metricsLoading
        ? '...'
        : `R$ ${((metrics?.inactive15 || 0) * 11.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: TrendingDown,
      changeType: 'neutral' as const,
      subtitle: metricsLoading
        ? undefined
        : `Saldo: R$ ${(((metrics?.activeUsers || 0) - (metrics?.inactive15 || 0)) * 11.9).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      tooltip: 'Projeção de receita mensal se todos os usuários inativos assinassem o plano de R$ 11,90. O saldo mostra a diferença entre ativos e inativos.',
    },
  ];

  // Filtrar reports pendentes (não críticos - os críticos vão no CriticalReportsPanel)
  const pendingReports = allReports.filter(r => 
    r.status === 'pending' && 
    r.priority_level !== 'critical'
  );

  return (
    <>
      {/* Milestone Celebration Modal */}
      {showCelebration && celebrationData && (
        <MilestoneCelebration
          show={showCelebration}
          realUsers={celebrationData.realUsers}
          seedUsersPurged={celebrationData.seedUsersPurged}
          onDismiss={handleDismissCelebration}
        />
      )}

      <AdminUsersListModal
        open={usersModal !== null}
        onClose={() => setUsersModal(null)}
        mode={usersModal ?? 'active'}
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Header with Feed shortcut */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Visão geral da plataforma</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Atualização automática" />
              <span className="text-sm text-muted-foreground">Auto-refresh</span>
            </div>
            <Button
              size="sm"
              onClick={refreshDashboard}
              className="gap-2 bg-green-600 text-white hover:bg-green-700 border border-green-700"
              disabled={fetchingCount > 0}
            >
              <RefreshCw className={`h-4 w-4 ${fetchingCount > 0 ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/feed')}
              className="gap-2 bg-yellow-400 text-black hover:bg-yellow-300 border border-yellow-500"
            >
              <ExternalLink className="h-4 w-4" />
              Acessar Feed
            </Button>
          </div>
        </div>

        <Card className="border-border/50 bg-card">
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Comunicação de boas-vindas
              </div>
              <p className="text-sm text-muted-foreground">
                Acesso direto para editar a mensagem automática, testar envio e acompanhar os cliques de divulgação.
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                <Badge variant="outline">Views landing: {landingPublicMetrics?.viewTotal ?? 0}</Badge>
                <Badge variant="outline">Entrar: {landingPublicMetrics?.loginTotal ?? 0}</Badge>
                <Badge variant="outline">Começar grátis: {landingPublicMetrics?.signupTotal ?? 0}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate('/admin/welcome-message')} className="gap-2">
                <MessageSquareHeart className="h-4 w-4" /> Abrir configurações
              </Button>
              <Button variant="secondary" onClick={() => navigate('/admin/welcome-log')} className="gap-2">
                <MessageSquareHeart className="h-4 w-4" /> Ver entregas
              </Button>
            </div>
          </CardContent>
        </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((kpi: any) => (
          <Card
            key={kpi.title}
            className={`bg-card border-border/50 ${kpi.route || kpi.modal ? 'cursor-pointer hover:border-primary/60 transition' : ''}`}
            onClick={() => {
              if (kpi.modal) setUsersModal(kpi.modal);
              else if (kpi.route) navigate(kpi.route);
            }}
            role={kpi.route || kpi.modal ? 'button' : undefined}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm text-muted-foreground">{kpi.title}</p>
                    {kpi.tooltip && (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground/60 hover:text-foreground transition-colors"
                              aria-label={`Sobre ${kpi.title}`}
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                            {kpi.tooltip}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    {metricsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      kpi.value
                    )}
                  </p>
                  {kpi.change && (
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                      <span className="text-xs text-emerald-500">{kpi.change}</span>
                      <span className="text-xs text-muted-foreground">vs mês anterior</span>
                    </div>
                  )}
                  {kpi.subtitle && (
                    <p className="text-[10px] text-muted-foreground mt-2 truncate">
                      {kpi.subtitle}
                    </p>
                  )}
                </div>
                <div className={`p-2 rounded-lg ${
                  kpi.title === 'Denúncias Pendentes' && (metrics?.pendingReports || 0) > 0
                    ? 'bg-destructive/20'
                    : 'bg-muted'
                }`}>
                  <kpi.icon className={`h-5 w-5 ${
                    kpi.title === 'Denúncias Pendentes' && (metrics?.pendingReports || 0) > 0
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {/* Online Users Card */}
        <Card
          className="bg-card border-border/50 cursor-pointer transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          role="button"
          tabIndex={0}
          onClick={openOnlineDialog}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openOnlineDialog();
            }
          }}
          aria-label="Ver usuários online e enviar presente"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Online Agora</p>
                <p className="text-2xl font-bold mt-1">
                  {onlineLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    onlineUsers.toLocaleString('pt-BR')
                  )}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs text-emerald-500">Tempo real · clique para ver</span>
                </div>
              </div>
              <div
                className="flex items-start gap-1"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <MasterAlertTestButton />
                <MasterAlertSettingsPopover />
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <Wifi className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth Progress Card */}
      {growthStats && growthStats.seedUsers > 0 && !growthStats.milestoneReached && (
        <Card className="bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-card border-[hsl(45,93%,47%)]/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-[hsl(45,93%,47%)]">
              <Rocket className="h-5 w-5" />
              Progresso Pioneiros
              <Badge 
                variant="outline" 
                className={`ml-2 ${
                  growthStats.progress >= 80 
                    ? 'border-emerald-500 text-emerald-500 animate-pulse' 
                    : 'border-[hsl(45,93%,47%)] text-[hsl(45,93%,47%)]'
                }`}
              >
                {growthStats.progress.toFixed(1)}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{growthStats.realUsers}</p>
                <p className="text-xs text-muted-foreground">Usuários Reais</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">{growthStats.seedUsers}</p>
                <p className="text-xs text-muted-foreground">Pioneiros</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(45,93%,47%)]">{growthStats.target}</p>
                <p className="text-xs text-muted-foreground">Meta 3:1</p>
              </div>
            </div>

            <div className="space-y-2">
              <Progress 
                value={growthStats.progress} 
                className="h-3 bg-muted"
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {growthStats.progress >= 80 ? (
                    <span className="flex items-center gap-1 text-emerald-500">
                      <Sparkles className="h-3 w-3" />
                      Quase lá!
                    </span>
                  ) : (
                    `Faltam ${growthStats.remaining} usuários`
                  )}
                </span>
                <span className="text-muted-foreground">
                  Meta: {growthStats.target} novos usuários
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg">
              💡 Quando atingir a meta 3:1, os {growthStats.seedUsers} perfis pioneiros serão removidos automaticamente e um backup será salvo.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Milestone Reached Message */}
      {growthStats && growthStats.milestoneReached && (
        <Card className="bg-gradient-to-br from-emerald-500/10 to-card border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Sparkles className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="font-medium text-emerald-500">🎉 Plataforma 100% Orgânica!</p>
                <p className="text-sm text-muted-foreground">
                  Todos os perfis pioneiros foram removidos. Você tem {growthStats.realUsers} usuários reais.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pioneer Campaign Widget */}
      {secondaryWidgetsReady ? (
        <Suspense fallback={<AdminCardSkeleton className="h-32" />}>
          <PioneerCampaignWidget />
        </Suspense>
      ) : <AdminCardSkeleton className="h-32" />}

      {/* Admin Push Notifications */}
      {secondaryWidgetsReady ? (
        <Suspense fallback={<AdminCardSkeleton className="h-32" />}>
          <AdminPushCard />
        </Suspense>
      ) : <AdminCardSkeleton className="h-32" />}

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Crown className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Criadores Ativos</p>
                <p className="text-xl font-bold">
                  {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (metrics?.totalCreators || 0).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/20">
                <CreditCard className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assinaturas Ativas</p>
                <p className="text-xl font-bold">
                  {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (metrics?.totalSubscriptions || 0).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Crescimento Mensal</p>
                <p className="text-xl font-bold">
                  {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `+${metrics?.monthlyGrowth || 0}%`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {secondaryWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[320px]" />}><NewUsersChart days={7} /></Suspense> : <AdminCardSkeleton className="h-[320px]" />}
        {secondaryWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[320px]" />}><RevenueChart days={30} /></Suspense> : <AdminCardSkeleton className="h-[320px]" />}
      </div>

      {/* Quick Metrics & System Health & Device Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {secondaryWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[220px]" />}><QuickMetricsCard /></Suspense> : <AdminCardSkeleton className="h-[220px]" />}
        {secondaryWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[220px]" />}><SystemHealthCard /></Suspense> : <AdminCardSkeleton className="h-[220px]" />}
        {secondaryWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[220px]" />}><DevicePerformanceChart /></Suspense> : <AdminCardSkeleton className="h-[220px]" />}
      </div>

      {/* Overdue Metrics Card */}
      {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[220px]" />}><OverdueMetricsCard /></Suspense> : <AdminCardSkeleton className="h-[220px]" />}

      {/* Inactive Users */}
      {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[220px]" />}><InactiveUsersCard /></Suspense> : <AdminCardSkeleton className="h-[220px]" />}

      {/* Cart Recovery Metrics Card */}
      {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[220px]" />}><CartRecoveryMetricsCard /></Suspense> : <AdminCardSkeleton className="h-[220px]" />}

      {/* Engagement Comparison Chart */}
      {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[300px]" />}><EngagementComparisonChart stats={engagementStats} isLoading={statsLoading} /></Suspense> : <AdminCardSkeleton className="h-[300px]" />}

      {/* Geo Heatmap & A/B Tests Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {heavyWidgetsReady ? (
          <Suspense fallback={<AdminCardSkeleton className="h-[400px]" />}>
            <GeoHeatmapCard />
          </Suspense>
        ) : (
          <AdminCardSkeleton className="h-[400px]" />
        )}
        {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[400px]" />}><ABTestManagerCard /></Suspense> : <AdminCardSkeleton className="h-[400px]" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Map with Real Data */}
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Usuários Ativos por Região
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative bg-muted/30 rounded-lg h-[300px] overflow-hidden">
              {locationsLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : activeLocations.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <MapPin className="h-12 w-12 mb-2 opacity-30" />
                  <p>Nenhum usuário com localização</p>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-56 bg-muted/50 rounded-3xl transform -rotate-12 relative">
                    {/* Location dots */}
                    {activeLocations.map((loc) => {
                      // Simplified positioning based on lat/lng
                      const x = ((loc.lng + 75) / 50) * 100;
                      const y = ((loc.lat + 35) / 35) * 100;
                      return (
                        <div
                          key={loc.id}
                          className="absolute group"
                          style={{ left: `${x}%`, top: `${y}%` }}
                        >
                          <div className="relative">
                            <div 
                              className="w-3 h-3 bg-primary rounded-full animate-pulse"
                              style={{ 
                                boxShadow: '0 0 10px hsl(var(--primary))',
                                transform: `scale(${Math.min(2, loc.activeUsers / 100 + 0.5)})`
                              }}
                            />
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-card border border-border px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <p className="font-medium">{loc.city}</p>
                              <p className="text-muted-foreground">{loc.activeUsers} ativos</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Location List */}
            <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
              {activeLocations.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Nenhuma localização registrada
                </p>
              ) : (
                activeLocations.map((loc, index) => (
                  <div key={loc.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground w-5 text-sm">#{index + 1}</span>
                      <span className="font-medium">{loc.city}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${(loc.activeUsers / (activeLocations[0]?.activeUsers || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-16 text-right">
                        {loc.activeUsers.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Painel de Denúncias Críticas - Fast Track Jurídico */}
        {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[320px]" />}><CriticalReportsPanel /></Suspense> : <AdminCardSkeleton className="h-[320px]" />}

        {/* Painel de Denúncias Anônimas - Fase 2 */}
        {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[320px]" />}><AdminReportsPanel /></Suspense> : <AdminCardSkeleton className="h-[320px]" />}

        {/* Pending Reports (Non-Critical) - Real Data */}
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Outras Denúncias
              {pendingReports.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingReports.length} pendente{pendingReports.length > 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-3 opacity-30" />
                <p>Nenhuma denúncia pendente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingReports.slice(0, 5).map((report) => (
                  <div key={report.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/30">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{report.category.replace(/_/g, ' ')}</span>
                        <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">
                          {report.priority_level}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {report.description || 'Sem descrição'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(report.created_at || '').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Churn Alerts Dashboard */}
      {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[260px]" />}><ChurnAlertsDashboard /></Suspense> : <AdminCardSkeleton className="h-[260px]" />}

      {/* Security Audit Logs */}
      {heavyWidgetsReady ? <Suspense fallback={<AdminCardSkeleton className="h-[260px]" />}><SecurityAuditPanel /></Suspense> : <AdminCardSkeleton className="h-[260px]" />}
    </div>
    </>
  );
}
