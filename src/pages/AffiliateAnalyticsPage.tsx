import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Users,
  TrendingUp,
  DollarSign,
  ArrowLeft,
  Crown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { 
  useMyReferrals, 
  useReferralStats, 
  isCommissionPaid,
  calculateCommission,
} from "@/hooks/useReferrals";

// Chart config
const chartConfig = {
  commission: {
    label: "Comissão",
    color: "hsl(var(--primary))",
  },
  referrals: {
    label: "Indicados",
    color: "hsl(var(--chart-2))",
  },
  paid: {
    label: "Pagos",
    color: "hsl(var(--chart-1))",
  },
  pending: {
    label: "Pendentes",
    color: "hsl(var(--muted-foreground))",
  },
};

export default function AffiliateAnalyticsPage() {
  const { profile } = useProfile();
  const { data: referrals, isLoading } = useMyReferrals();
  const { stats } = useReferralStats();

  const isEligibleForCommission = profile?.plan_type === 'premium' || profile?.plan_type === 'vip';

  // Monthly data from referrals
  const monthlyData = useMemo(() => {
    if (!referrals || referrals.length === 0) {
      return [
        { month: "Ago", commission: 0, referrals: 0 },
        { month: "Set", commission: 14.95, referrals: 1 },
        { month: "Out", commission: 29.90, referrals: 2 },
        { month: "Nov", commission: 44.85, referrals: 3 },
        { month: "Dez", commission: 59.80, referrals: 4 },
        { month: "Jan", commission: 44.85, referrals: 3 },
      ];
    }

    const now = new Date();
    const months: { [key: string]: { commission: number; referrals: number } } = {};
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = date.toLocaleDateString('pt-BR', { month: 'short' });
      months[key] = { commission: 0, referrals: 0 };
    }

    referrals.forEach(ref => {
      const startDate = new Date(ref.started_at);
      const monthKey = startDate.toLocaleDateString('pt-BR', { month: 'short' });
      
      if (months[monthKey]) {
        months[monthKey].referrals++;
        if (isCommissionPaid(ref)) {
          const commission = calculateCommission(ref.subscription?.price || 29.90);
          months[monthKey].commission += commission;
        }
      }
    });

    return Object.entries(months).map(([month, data]) => ({
      month: month.charAt(0).toUpperCase() + month.slice(1),
      ...data,
    }));
  }, [referrals]);

  // Conversion data
  const conversionData = useMemo(() => {
    const paid = stats.commissionPaid;
    const total = stats.totalReferred;
    
    return [
      { 
        name: "Total Indicados", 
        value: total,
        fill: "hsl(var(--muted-foreground))",
      },
      { 
        name: "Comissão Paga", 
        value: paid,
        fill: "hsl(var(--primary))",
      },
    ];
  }, [stats]);

  // Individual referral performance
  const referralPerformance = useMemo(() => {
    if (!referrals) return [];
    
    return referrals.map(ref => {
      const paid = isCommissionPaid(ref);
      const subscriptionPrice = ref.subscription?.price || 29.90;
      const commission = calculateCommission(subscriptionPrice);
      const totalEarned = (isEligibleForCommission && paid) ? commission : 0;

      return {
        id: ref.id,
        name: ref.referred_profile?.name || 'Usuário',
        avatar: ref.referred_profile?.avatar_url,
        date: new Date(ref.started_at).toLocaleDateString('pt-BR'),
        isPaid: paid,
        isActive: ref.is_active,
        commission: isEligibleForCommission ? commission : 0,
        totalEarned,
      };
    });
  }, [referrals, isEligibleForCommission]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/earnings">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Ganhos
          </Button>
        </Link>
        
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics de Indicações</h1>
            <p className="text-muted-foreground">
              Acompanhe o desempenho do seu programa Indique e Ganhe
            </p>
          </div>
        </div>
      </div>

      {/* Eligibility Warning */}
      {!isEligibleForCommission && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-500">Comissões Inativas</p>
                <p className="text-sm text-muted-foreground">
                  Apenas usuários com plano Premium ou VIP recebem comissões. 
                  Suas indicações continuam sendo rastreadas, mas você só receberá pagamentos após ativar um plano.
                </p>
                <Link to="/checkout">
                  <Button size="sm" className="mt-3">
                    <Crown className="h-4 w-4 mr-2" />
                    Ativar Plano Premium
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Total Indicados</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.totalReferred}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span className="text-xs">Comissões Pagas</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{stats.commissionPaid}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs">Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-primary">
              {stats.pendingCommission}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4 text-amber-400" />
              <span className="text-xs">Total Ganho</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">
              {formatCurrency(isEligibleForCommission ? stats.totalEarnings : 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Commission Over Time */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Comissões ao Longo do Tempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `R$${value}`}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent />}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="commission" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
                    name="Comissão"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Conversion Chart */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conversionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    width={120}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar 
                    dataKey="value" 
                    radius={[0, 4, 4, 0]}
                    fill="hsl(var(--primary))"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            
            {/* Conversion Rate */}
            <div className="mt-4 p-3 rounded-lg bg-muted/30 text-center">
              <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
              <p className="text-2xl font-bold text-primary">
                {stats.totalReferred > 0 
                  ? Math.round((stats.commissionPaid / stats.totalReferred) * 100) 
                  : 0}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral Performance Table */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Performance Individual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {referralPerformance.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhuma indicação ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Compartilhe seu link de indicação para começar a ganhar comissões
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {referralPerformance.map((ref) => (
                <div 
                  key={ref.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border transition-colors",
                    ref.isPaid 
                      ? "bg-green-500/5 border-green-500/30" 
                      : "bg-muted/20 border-border/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={ref.avatar || undefined} />
                      <AvatarFallback>{ref.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{ref.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Indicado em {ref.date}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {ref.isPaid ? (
                      <>
                        <div className="text-right">
                          <p className="text-sm font-medium text-green-400">
                            +{formatCurrency(ref.commission)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Comissão paga
                          </p>
                        </div>
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          Pago
                        </Badge>
                      </>
                    ) : (
                      <>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            {ref.isActive ? 'Aguardando 1ª assinatura' : 'Inativo'}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {ref.isActive ? 'Pendente' : 'Inativo'}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="mt-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Como funciona o Indique e Ganhe</p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• Você ganha <strong>5% de comissão única</strong> sobre a primeira assinatura de cada indicado</li>
                <li>• Se o indicado assina mensal, 5% do valor mensal. Se assina anual, 5% do valor anual total</li>
                <li>• Apenas usuários com <strong>plano ativo</strong> (Premium ou VIP) recebem comissões</li>
                <li>• Os pagamentos são creditados automaticamente na sua carteira</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
