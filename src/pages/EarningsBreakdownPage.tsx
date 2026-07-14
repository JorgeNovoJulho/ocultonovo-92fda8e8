import { useMemo } from "react";
import { 
  DollarSign, 
  TrendingUp, 
  Crown, 
  Gift, 
  Unlock,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransactions, useEarningsSummary } from "@/hooks/useTransactions";
import { PremiumAccessGuard } from "@/components/PremiumAccessGuard";

export default function EarningsBreakdownPage() {
  return (
    <PremiumAccessGuard featureName="Detalhamento de Rendimentos">
      <EarningsBreakdownContent />
    </PremiumAccessGuard>
  );
}

function EarningsBreakdownContent() {
  const { data: transactions, isLoading: loadingTransactions } = useTransactions();
  const { data: summary, isLoading: loadingSummary } = useEarningsSummary();

  const breakdown = useMemo(() => {
    if (!transactions) return {
      subscriptions: { total: 0, count: 0, thisMonth: 0 },
      tips: { total: 0, count: 0, thisMonth: 0 },
      mediaUnlocks: { total: 0, count: 0, thisMonth: 0 },
      deposits: { total: 0, count: 0 },
      withdrawals: { total: 0, count: 0 },
    };

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return transactions.reduce((acc, t) => {
      const isThisMonth = new Date(t.created_at) >= startOfMonth;
      
      if (t.type === 'subscription') {
        acc.subscriptions.total += t.amount;
        acc.subscriptions.count++;
        if (isThisMonth) acc.subscriptions.thisMonth += t.amount;
      } else if (t.type === 'tip') {
        acc.tips.total += t.amount;
        acc.tips.count++;
        if (isThisMonth) acc.tips.thisMonth += t.amount;
      } else if (t.type === 'deposit') {
        acc.deposits.total += t.amount;
        acc.deposits.count++;
      } else if (t.type === 'withdrawal' || t.type === 'payout') {
        acc.withdrawals.total += t.amount;
        acc.withdrawals.count++;
      }
      
      // Check description for media unlock
      if (t.description?.toLowerCase().includes('mídia') || t.description?.toLowerCase().includes('unlock')) {
        acc.mediaUnlocks.total += t.amount;
        acc.mediaUnlocks.count++;
        if (isThisMonth) acc.mediaUnlocks.thisMonth += t.amount;
      }
      
      return acc;
    }, {
      subscriptions: { total: 0, count: 0, thisMonth: 0 },
      tips: { total: 0, count: 0, thisMonth: 0 },
      mediaUnlocks: { total: 0, count: 0, thisMonth: 0 },
      deposits: { total: 0, count: 0 },
      withdrawals: { total: 0, count: 0 },
    });
  }, [transactions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const totalEarnings = breakdown.subscriptions.total + breakdown.tips.total + breakdown.mediaUnlocks.total;
  const thisMonthTotal = breakdown.subscriptions.thisMonth + breakdown.tips.thisMonth + breakdown.mediaUnlocks.thisMonth;

  const isLoading = loadingTransactions || loadingSummary;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const categories = [
    {
      title: 'Assinaturas',
      icon: Crown,
      color: 'from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)]',
      bgColor: 'bg-[hsl(45,93%,47%)]/10',
      textColor: 'text-[hsl(45,93%,47%)]',
      borderColor: 'border-[hsl(45,93%,47%)]/30',
      total: breakdown.subscriptions.total,
      count: breakdown.subscriptions.count,
      thisMonth: breakdown.subscriptions.thisMonth,
      percentage: totalEarnings > 0 ? (breakdown.subscriptions.total / totalEarnings) * 100 : 0,
    },
    {
      title: 'Presentes',
      icon: Gift,
      color: 'from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)]',
      bgColor: 'bg-[hsl(330,80%,60%)]/10',
      textColor: 'text-[hsl(330,80%,60%)]',
      borderColor: 'border-[hsl(330,80%,60%)]/30',
      total: breakdown.tips.total,
      count: breakdown.tips.count,
      thisMonth: breakdown.tips.thisMonth,
      percentage: totalEarnings > 0 ? (breakdown.tips.total / totalEarnings) * 100 : 0,
    },
    {
      title: 'Desbloqueio de Mídia',
      icon: Unlock,
      color: 'from-[hsl(142,76%,36%)] to-[hsl(152,76%,36%)]',
      bgColor: 'bg-[hsl(142,76%,36%)]/10',
      textColor: 'text-[hsl(142,76%,36%)]',
      borderColor: 'border-[hsl(142,76%,36%)]/30',
      total: breakdown.mediaUnlocks.total,
      count: breakdown.mediaUnlocks.count,
      thisMonth: breakdown.mediaUnlocks.thisMonth,
      percentage: totalEarnings > 0 ? (breakdown.mediaUnlocks.total / totalEarnings) * 100 : 0,
    },
  ];

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20">
          <TrendingUp className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Detalhamento de Rendimentos</h1>
          <p className="text-muted-foreground">
            Veja de onde vem cada centavo dos seus ganhos
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Total Ganho</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalEarnings)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[hsl(142,76%,36%)] mb-1">
              <Calendar className="h-4 w-4" />
              <span className="text-xs font-medium">Este Mês</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(thisMonthTotal)}</p>
          </CardContent>
        </Card>

        <Card className="bg-[hsl(45,93%,47%)]/5 border-[hsl(45,93%,47%)]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[hsl(45,93%,47%)] mb-1">
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-xs font-medium">Saldo</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(summary?.balance || 0)}</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ArrowDownRight className="h-4 w-4" />
              <span className="text-xs font-medium">Sacado</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(breakdown.withdrawals.total)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card key={cat.title} className={`${cat.bgColor} ${cat.borderColor} border`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${cat.color}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <Badge variant="secondary" className={`${cat.textColor} bg-background/50`}>
                    {cat.percentage.toFixed(1)}%
                  </Badge>
                </div>
                <CardTitle className="text-lg">{cat.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className={`text-3xl font-bold ${cat.textColor}`}>
                    {formatCurrency(cat.total)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {cat.count} transações
                  </p>
                </div>

                <div className="h-2 bg-background/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${cat.color} rounded-full transition-all duration-500`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Este mês</span>
                  <span className={`font-semibold ${cat.textColor}`}>
                    {formatCurrency(cat.thisMonth)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Transactions by Type */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle>Histórico Recente</CardTitle>
          <CardDescription>Suas últimas transações de rendimento</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions
                .filter(t => ['subscription', 'tip'].includes(t.type) || t.description?.toLowerCase().includes('mídia'))
                .slice(0, 10)
                .map((t) => {
                  const isSubscription = t.type === 'subscription';
                  const isTip = t.type === 'tip';
                  const isUnlock = t.description?.toLowerCase().includes('mídia');
                  
                  const Icon = isSubscription ? Crown : isTip ? Gift : Unlock;
                  const color = isSubscription 
                    ? 'text-[hsl(45,93%,47%)]' 
                    : isTip 
                    ? 'text-primary' 
                    : 'text-[hsl(142,76%,36%)]';
                  
                  return (
                    <div 
                      key={t.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-background ${color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {isSubscription ? 'Assinatura' : isTip ? 'Presente' : 'Desbloqueio'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t.description || 'Transação'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${color}`}>
                          +{formatCurrency(t.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma transação de rendimento ainda</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
