import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  TrendingUp,
  DollarSign,
  ArrowLeft,
  Calendar,
  Clock,
  Sparkles,
  Gift,
  BookOpen,
} from 'lucide-react';
import { PremiumAccessGuard } from '@/components/PremiumAccessGuard';
import { CommissionChart } from '@/components/madrinha/CommissionChart';
import { AfilhadasRanking } from '@/components/madrinha/AfilhadasRanking';
import { useMadrinhaStats, useMyAfilhadas, isReferralActive, getRemainingCommissionDays } from '@/hooks/useCreatorReferrals';
import { useCommissionStats } from '@/hooks/useCommissionHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function MadrinhaAnalyticsPage() {
  return (
    <PremiumAccessGuard featureName="Analytics de Madrinhas">
      <MadrinhaAnalyticsContent />
    </PremiumAccessGuard>
  );
}

function MadrinhaAnalyticsContent() {
  const { stats: madrinhaStats, isLoading: isLoadingMadrinha } = useMadrinhaStats();
  const { stats: commissionStats, isLoading: isLoadingCommissions } = useCommissionStats();
  const { data: afilhadas, isLoading: isLoadingAfilhadas } = useMyAfilhadas();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const isLoading = isLoadingMadrinha || isLoadingCommissions || isLoadingAfilhadas;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-48 mb-1" />
            <Skeleton className="h-4 w-64" />
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
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div>
        <Link to="/earnings">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar para Rendimentos
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Analytics de Madrinhas</h1>
              <p className="text-muted-foreground">
                Acompanhe suas comissões e o desempenho das suas afilhadas
              </p>
            </div>
          </div>
          <Link to="/programa-indicacoes#madrinhas">
            <Button variant="outline" size="sm" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Saiba mais
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Afilhadas */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              Total Afilhadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {madrinhaStats?.totalAfilhadas || 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {madrinhaStats?.activeAfilhadas || 0} ativas
            </p>
          </CardContent>
        </Card>

        {/* Comissão do Mês */}
        <Card className="bg-gradient-to-br from-[hsl(142,76%,36%)]/10 to-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Comissão do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">
              {formatCurrency(commissionStats.thisMonth)}
            </p>
            {commissionStats.monthlyGrowth !== 0 && (
              <p className={cn(
                "text-xs flex items-center gap-1",
                commissionStats.monthlyGrowth > 0 ? "text-[hsl(142,76%,36%)]" : "text-destructive"
              )}>
                <TrendingUp className={cn(
                  "h-3 w-3",
                  commissionStats.monthlyGrowth < 0 && "rotate-180"
                )} />
                {commissionStats.monthlyGrowth > 0 ? '+' : ''}{commissionStats.monthlyGrowth.toFixed(1)}% vs mês anterior
              </p>
            )}
          </CardContent>
        </Card>

        {/* Total Histórico */}
        <Card className="bg-primary/5 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Total Ganho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(commissionStats.totalEarned)}
            </p>
            <p className="text-xs text-muted-foreground">
              {commissionStats.transactionCount} transações
            </p>
          </CardContent>
        </Card>

        {/* Média por Transação */}
        <Card className="bg-card/50 border-border/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Gift className="h-3 w-3" />
              Média por Venda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(commissionStats.avgCommission)}
            </p>
            <p className="text-xs text-muted-foreground">
              por transação
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commission Over Time */}
        <CommissionChart months={12} variant="area" />

        {/* Top Afilhadas Ranking */}
        <AfilhadasRanking limit={5} showChart={true} />
      </div>

      {/* Afilhadas with Expiration Countdown */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-[hsl(45,93%,47%)]" />
            Status das Afilhadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!afilhadas || afilhadas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Você ainda não tem afilhadas.</p>
              <p className="text-sm mt-1">Compartilhe seu link de madrinha para começar!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {afilhadas.map((afilhada) => {
                const expiresAt = afilhada.expires_at;
                const isActiveRef = isReferralActive(expiresAt, afilhada.is_active);
                const remainingDays = getRemainingCommissionDays(expiresAt);
                const totalDays = 365; // 12 months
                const progressPercentage = isActiveRef ? Math.max(0, (remainingDays / totalDays) * 100) : 0;
                const startDate = afilhada.started_at
                  ? format(new Date(afilhada.started_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })
                  : 'N/A';

                return (
                  <div
                    key={afilhada.id}
                    className={cn(
                      "p-4 rounded-lg border transition-colors",
                      isActiveRef
                        ? "bg-card/50 border-border/50"
                        : "bg-muted/30 border-border/30 opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">
                            {(afilhada.afilhada_profile?.name || 'A').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {afilhada.afilhada_profile?.name || 'Afilhada'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Desde {startDate}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={isActiveRef ? 'default' : 'secondary'}
                        className={cn(
                          isActiveRef
                            ? 'bg-[hsl(142,76%,36%)] text-white'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isActiveRef ? 'Ativa' : 'Expirada'}
                      </Badge>
                    </div>

                    {isActiveRef && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Tempo restante de comissão</span>
                          <span className={cn(
                            "font-medium",
                            remainingDays <= 30 ? "text-[hsl(45,93%,47%)]" : "text-foreground"
                          )}>
                            {remainingDays} dias
                          </span>
                        </div>
                        <Progress
                          value={progressPercentage}
                          className="h-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          Expira em {format(new Date(expiresAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-[hsl(280,80%,50%)]/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">
                Programa Madrinhas
              </h3>
              <p className="text-sm text-muted-foreground">
                Você recebe <strong className="text-primary">5% de comissão</strong> sobre todas as vendas das suas afilhadas
                durante <strong>12 meses</strong> após o cadastro. A comissão sai da taxa da plataforma, não do bolso da criadora.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
