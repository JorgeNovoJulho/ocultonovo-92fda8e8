/**
 * Card de Métricas Rápidas
 * Resumo das principais métricas do dia
 */
import { TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart, Percent } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

interface QuickMetric {
  label: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  trend: 'up' | 'down' | 'neutral';
}

export function QuickMetricsCard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['quick-metrics'],
    queryFn: async (): Promise<QuickMetric[]> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // IDs de seeds para excluir de transações
      const { data: seedProfiles } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('is_seed', true)
        .not('user_id', 'is', null);
      const seedIds = new Set((seedProfiles || []).map((p: any) => p.user_id));

      // Transações de hoje (filtrar seeds no cliente)
      const { data: todayTx } = await supabase
        .from('transactions')
        .select('amount, type, user_id')
        .gte('created_at', today.toISOString())
        .eq('status', 'completed');

      // Transações de ontem (filtrar seeds no cliente)
      const { data: yesterdayTx } = await supabase
        .from('transactions')
        .select('amount, type, user_id')
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString())
        .eq('status', 'completed');

      // Usuários de hoje (apenas reais)
      const { count: todayUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today.toISOString())
        .or('is_seed.eq.false,is_seed.is.null');

      // Usuários de ontem (apenas reais)
      const { count: yesterdayUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString())
        .lt('created_at', today.toISOString())
        .or('is_seed.eq.false,is_seed.is.null');

      // Calcular receita (excluindo seeds)
      const todayRevenue = (todayTx || [])
        .filter((t: any) => !seedIds.has(t.user_id) && ['subscription', 'tip', 'ppv', 'deposit'].includes(t.type))
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      const yesterdayRevenue = (yesterdayTx || [])
        .filter((t: any) => !seedIds.has(t.user_id) && ['subscription', 'tip', 'ppv', 'deposit'].includes(t.type))
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      const checkoutsStarted = todayTx?.filter((t: any) => ['subscription', 'tip', 'ppv', 'deposit'].includes(t.type)).length || 0;
      const checkoutsCompleted = checkoutsStarted;

      const conversionRate = checkoutsStarted && checkoutsStarted > 0
        ? Math.round((checkoutsCompleted || 0) / checkoutsStarted * 100)
        : 0;

      // Calcular variações
      const revenueChange = yesterdayRevenue > 0 
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
        : 0;

      const usersChange = yesterdayUsers && yesterdayUsers > 0
        ? Math.round((((todayUsers || 0) - yesterdayUsers) / yesterdayUsers) * 100)
        : 0;

      return [
        {
          label: 'Receita Hoje',
          value: `R$ ${todayRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          change: revenueChange,
          icon: <DollarSign className="h-4 w-4" />,
          trend: revenueChange >= 0 ? 'up' : 'down'
        },
        {
          label: 'Novos Usuários',
          value: (todayUsers || 0).toString(),
          change: usersChange,
          icon: <Users className="h-4 w-4" />,
          trend: usersChange >= 0 ? 'up' : 'down'
        },
        {
          label: 'Conversão',
          value: `${conversionRate}%`,
          change: 0,
          icon: <ShoppingCart className="h-4 w-4" />,
          trend: 'neutral'
        },
        {
          label: 'Checkouts',
          value: (checkoutsStarted || 0).toString(),
          change: 0,
          icon: <Percent className="h-4 w-4" />,
          trend: 'neutral'
        }
      ];
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Métricas Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Métricas Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {metrics?.map((metric, index) => (
            <div
              key={metric.label}
              className="p-3 rounded-lg bg-muted/30 border border-border/30"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{metric.label}</span>
                <div className={`p-1 rounded ${
                  metric.trend === 'up' ? 'bg-green-500/10' : 
                  metric.trend === 'down' ? 'bg-red-500/10' : 'bg-muted'
                }`}>
                  {metric.icon}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold">{metric.value}</span>
                {metric.change !== 0 && (
                  <span className={`text-xs flex items-center gap-0.5 ${
                    metric.change >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {metric.change >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(metric.change)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
