import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, Percent, Wallet, ArrowUpRight, Clock, Loader2, Lock, Crown, Trophy, CreditCard, Landmark, Receipt, TimerReset, MessageSquare, Package, Sparkles, UserCog, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { lazy, Suspense, memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreatorFinancialDashboard } from "@/hooks/useCreatorFinancialDashboard";
import { useAuth } from "@/hooks/useAuth";

const TopFansList = lazy(() => import("@/components/creator/TopFansList"));
const CreatorSplitBreakdown = lazy(() => import("@/components/creator/CreatorSplitBreakdown"));
const VipProfileManager = lazy(() => import("@/components/creator/VipProfileManager"));
const SubscribersPanel = lazy(() => import("@/components/creator/SubscribersPanel"));
const CreatorAffiliatesPanel = lazy(() => import("@/components/creator/CreatorAffiliatesPanel"));
const ChannelAnalyticsCard = lazy(() => import("@/components/creator/ChannelAnalyticsCard"));


const FansSkeleton = memo(() => (
  <div className="space-y-1">
    {[1, 2, 3].map(i => (
      <div key={i} className="flex items-center gap-3 px-4 py-3">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    ))}
  </div>
));
FansSkeleton.displayName = "FansSkeleton";

export default function CreatorDashboard() {
  const { data: stats, isLoading } = useCreatorFinancialDashboard();
  const { isFree } = usePlanPermissions();
  const { user } = useAuth();


  if (isFree) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full gradient-border">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground mb-2">Recurso Exclusivo</h2>
              <p className="text-sm text-muted-foreground">
                O Painel do Criador está disponível apenas para assinantes
                <span className="text-primary font-semibold"> Premium</span> ou
                <span className="text-[hsl(45,93%,47%)] font-semibold"> VIP</span>.
                Faça upgrade para acessar seus ganhos e monetização.
              </p>
            </div>
            <Button asChild className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 h-12 font-semibold text-primary-foreground">
              <Link to="/checkout">
                <Crown className="h-5 w-5 mr-2" />
                Fazer Upgrade
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const statCards = [
    { title: "Saldo disponível", value: formatCurrency(stats?.available_balance || 0), icon: Wallet, description: "Pronto para saque", color: "text-[hsl(142,76%,36%)]", bgColor: "bg-[hsl(142,76%,36%)]/10", highlight: true },
    { title: "Saldo pendente", value: formatCurrency(stats?.pending_balance || 0), icon: TimerReset, description: "Ainda em liberação", color: "text-[hsl(45,93%,47%)]", bgColor: "bg-[hsl(45,93%,47%)]/10" },
    { title: "Receita bruta", value: formatCurrency(stats?.gross_total || 0), icon: DollarSign, description: "Conteúdo + assinatura + chat", color: "text-primary", bgColor: "bg-primary/10" },
    { title: "Total sacado", value: formatCurrency(stats?.withdrawn_total || 0), icon: Landmark, description: "Já retirado pelo criador", color: "text-muted-foreground", bgColor: "bg-muted/30" },
  ];

  const channels = [
    { label: "Conteúdo pago", value: formatCurrency(stats?.content_total || 0), icon: Package },
    { label: "Assinaturas", value: formatCurrency(stats?.subscriptions_total || 0), icon: Users },
    { label: "Chat monetizado", value: formatCurrency(stats?.chat_total || 0), icon: MessageSquare },
    { label: "Ticket médio", value: formatCurrency(stats?.average_ticket || 0), icon: Receipt },
  ];

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/10">
            <DollarSign className="h-6 w-6 text-[hsl(45,93%,47%)]" />
          </div>
          Painel do Criador
        </h1>
        <p className="text-muted-foreground mt-2">Acompanhe seus ganhos e gerencie sua monetização</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full mb-4 bg-muted/50 flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="overview" className="flex-1 min-w-[88px] text-xs gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Resumo
          </TabsTrigger>
          <TabsTrigger value="vip" className="flex-1 min-w-[88px] text-xs gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Perfil VIP
          </TabsTrigger>
          <TabsTrigger value="channel" className="flex-1 min-w-[88px] text-xs gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Canal VIP
          </TabsTrigger>
          <TabsTrigger value="subscribers" className="flex-1 min-w-[88px] text-xs gap-1.5">
            <UserCog className="h-3.5 w-3.5" /> Assinantes
          </TabsTrigger>
          <TabsTrigger value="affiliates" className="flex-1 min-w-[88px] text-xs gap-1.5">
            <Percent className="h-3.5 w-3.5" /> Afiliados
          </TabsTrigger>
          <TabsTrigger value="fans" className="flex-1 min-w-[88px] text-xs gap-1.5">
            <Trophy className="h-3.5 w-3.5" /> Fãs
          </TabsTrigger>
        </TabsList>



        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {statCards.map((stat) => (
              <Card key={stat.title} className={cn("gradient-border overflow-hidden", stat.highlight && "ring-1 ring-[hsl(45,93%,47%)]/30")}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                    {stat.title}
                    <div className={cn("p-2 rounded-lg", stat.bgColor)}>
                      <stat.icon className={cn("h-4 w-4", stat.color)} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <div className={cn("text-2xl font-bold", stat.color)}>{stat.value}</div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {channels.map((item) => (
              <Card key={item.label} className="gradient-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <item.icon className="h-4 w-4 text-primary" />
                    <span>{item.label}</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6 mb-6">
            <Card className="gradient-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Receipt className="h-5 w-5 text-primary" /> Visão financeira real
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <MetricRow label="Valor líquido do criador" value={formatCurrency(stats?.net_total || 0)} accent="text-[hsl(142,76%,36%)]" />
                <MetricRow label="Impostos retidos" value={formatCurrency(stats?.tax_total || 0)} />
                <MetricRow label="Taxa da plataforma" value={formatCurrency(stats?.platform_fee_total || 0)} />
                <MetricRow label="Comissão de afiliado" value={formatCurrency(stats?.affiliate_total || 0)} />
                <MetricRow label="Vendas registradas" value={String(stats?.total_sales || 0)} />
                <MetricRow label="Próxima liberação" value={stats?.next_release_at ? new Date(stats.next_release_at).toLocaleDateString('pt-BR') : 'Sem saldo agendado'} />
                <MetricRow label="Saques pendentes" value={String(stats?.pending_withdrawals || 0)} />
              </CardContent>
            </Card>

            <Card className="gradient-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-5 w-5 text-[hsl(45,93%,47%)]" /> Recebimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Plano</span>
                  <Badge variant="outline">{String(stats?.plan_type || 'free').toUpperCase()}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">KYC / verificação</span>
                  <Badge variant="outline" className={stats?.is_verified ? 'border-green-500/40 text-green-500' : 'border-yellow-500/40 text-yellow-500'}>
                    {stats?.is_verified ? 'Aprovado' : 'Pendente'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Chave PIX</span>
                  <span className="text-right font-medium break-all">{stats?.pix_key || 'Não configurada'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium uppercase">{stats?.pix_key_type || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Status da conta</span>
                  <span className="font-medium">{stats?.account_status || 'Não informado'}</span>
                </div>
                <Button asChild className="w-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-semibold h-11 hover:opacity-90">
                  <Link to="/creator-wallet">
                    <ArrowUpRight className="h-4 w-4 mr-2" /> Abrir carteira e saques
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="gradient-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-[hsl(45,93%,47%)]" /> Solicitar Saque
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Disponível para saque</span>
                  <span className="text-lg font-bold text-[hsl(45,93%,47%)]">
                    {isLoading ? '...' : formatCurrency(stats?.available_balance || 0)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Processamento em até 3 dias úteis
                </div>
              </div>
              <Button asChild className="w-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-semibold h-12 hover:opacity-90">
                <Link to="/creator-wallet">
                  <ArrowUpRight className="h-5 w-5 mr-2" /> Ir para Carteira do Criador
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="mt-6">
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <CreatorSplitBreakdown />
            </Suspense>
          </div>

          <Card className="mt-6 gradient-border">
            <CardHeader>
              <CardTitle className="text-lg">💡 Dicas para aumentar seus ganhos</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><span className="text-primary">•</span>Poste conteúdo VIP regularmente para manter assinantes engajados</li>
                <li className="flex items-start gap-2"><span className="text-primary">•</span>Use posts públicos como "teaser" para atrair novos assinantes</li>
                <li className="flex items-start gap-2"><span className="text-primary">•</span>Interaja com seus seguidores nos comentários</li>
                <li className="flex items-start gap-2"><span className="text-primary">•</span>Divulgue seu perfil em outras redes sociais</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fans">
          <Card className="gradient-border overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="h-5 w-5 text-[hsl(45,93%,47%)]" /> Ranking de Fãs
              </CardTitle>
              <p className="text-xs text-muted-foreground">Seus fãs mais engajados este mês</p>
            </CardHeader>
            <CardContent className="p-0">
              <Suspense fallback={<FansSkeleton />}>
                <TopFansList creatorId={stats?.profile_id} />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vip">
          <Card className="gradient-border">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-[hsl(45,93%,47%)]/10 flex items-center justify-center mx-auto">
                <Trophy className="h-7 w-7 text-[hsl(45,93%,47%)]" />
              </div>
              <h3 className="text-lg font-bold">Gestão do Canal VIP movida</h3>
              <p className="text-sm text-muted-foreground">
                Toda a configuração do seu canal VIP (preços, capa, trailer, planos)
                agora fica em um único lugar: <strong>Meu Canal VIP</strong>, no menu lateral.
              </p>
              <a
                href="/canal-vip"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold text-sm"
              >
                Abrir Meu Canal VIP
              </a>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channel">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <ChannelAnalyticsCard creatorId={stats?.profile_id || user?.id || null} />
          </Suspense>
        </TabsContent>

        <TabsContent value="subscribers">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <SubscribersPanel />
          </Suspense>
        </TabsContent>


        <TabsContent value="affiliates">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <CreatorAffiliatesPanel />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold text-right", accent)}>{value}</span>
    </div>
  );
}
