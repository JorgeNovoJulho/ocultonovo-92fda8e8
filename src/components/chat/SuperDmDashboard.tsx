import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  MessageSquare,
  Crown,
  Star,
  Gem,
  Minus,
} from "lucide-react";
import { useSuperDmStats, usePriorityTransactions, useSuperDmRevenueTrend } from "@/hooks/useSuperDm";
import { useProfile } from "@/hooks/useProfile";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function SuperDmDashboard() {
  const { profile } = useProfile();
  const { data: stats, isLoading: isLoadingStats } = useSuperDmStats(profile?.id);
  const { data: transactions, isLoading: isLoadingTransactions } = usePriorityTransactions();
  const { data: revenueTrend, isLoading: isLoadingTrend } = useSuperDmRevenueTrend(profile?.id, 30);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Calculate top supporters from transactions
  const topSupporters = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    const supporterMap = new Map<string, {
      id: string;
      name: string;
      avatar?: string;
      totalAmount: number;
      count: number;
    }>();

    transactions.forEach(t => {
      const senderId = t.sender_profile_id;
      const existing = supporterMap.get(senderId);
      
      if (existing) {
        existing.totalAmount += Number(t.net_amount);
        existing.count += 1;
      } else {
        supporterMap.set(senderId, {
          id: senderId,
          name: t.sender?.username ? `@${t.sender.username}` : 'Usuário',
          avatar: t.sender?.avatar_url || undefined,
          totalAmount: Number(t.net_amount),
          count: 1,
        });
      }
    });

    return Array.from(supporterMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);
  }, [transactions]);

  // Format chart data for revenue trend
  const chartData = useMemo(() => {
    if (!revenueTrend?.length) return [];
    return revenueTrend.map((point) => ({
      date: point.date,
      dateFormatted: format(parseISO(point.date), 'dd/MM', { locale: ptBR }),
      revenue: Number(point.revenue) || 0,
      count: Number(point.count) || 0,
    }));
  }, [revenueTrend]);

  // Calculate trend: compare last 7 days with previous 7 days
  const trend = useMemo(() => {
    if (chartData.length < 7) return null;
    const lastWeek = chartData.slice(-7).reduce((sum, d) => sum + d.revenue, 0);
    const previousWeek = chartData.slice(-14, -7).reduce((sum, d) => sum + d.revenue, 0);
    if (lastWeek > previousWeek) return 'up';
    if (lastWeek < previousWeek) return 'down';
    return 'stable';
  }, [chartData]);

  // Calculate conversion rate (would need more data in real scenario)
  const conversionRate = useMemo(() => {
    if (!stats || stats.total_count === 0) return 0;
    // Mock: assume 20% of messages are Super DMs
    return 20;
  }, [stats]);

  if (isLoadingStats || isLoadingTransactions) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-lg bg-muted/50">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const totalReceived = stats?.total_received || 0;
  const totalCount = stats?.total_count || 0;
  const averageAmount = stats?.average_amount || 0;

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30">
          <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-1">
            <DollarSign className="h-3 w-3" />
            Total Recebido
          </div>
          <p className="text-xl font-bold text-amber-400">
            {formatCurrency(totalReceived)}
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <MessageSquare className="h-3 w-3" />
            Super DMs
          </div>
          <p className="text-xl font-bold text-foreground">
            {totalCount}
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3 w-3" />
            Média/DM
          </div>
          <p className="text-xl font-bold text-foreground">
            {formatCurrency(averageAmount)}
          </p>
        </div>
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Gem className="h-4 w-4 text-amber-400" />
              Receita Últimos 30 Dias
            </h4>
            {trend && (
              <div className="flex items-center gap-1">
                {trend === 'up' && (
                  <Badge variant="outline" className="text-green-400 border-green-400/30 text-xs gap-1">
                    <TrendingUp className="h-3 w-3" /> Subindo
                  </Badge>
                )}
                {trend === 'down' && (
                  <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs gap-1">
                    <TrendingDown className="h-3 w-3" /> Caindo
                  </Badge>
                )}
                {trend === 'stable' && (
                  <Badge variant="outline" className="text-muted-foreground border-border text-xs gap-1">
                    <Minus className="h-3 w-3" /> Estável
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="superDmRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="dateFormatted" 
                  tick={{ fontSize: 9 }} 
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 9 }} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `R$${v}`}
                  width={45}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length > 0) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-card p-3 rounded-lg border border-amber-500/30 shadow-lg">
                          <p className="font-bold text-amber-400">{formatCurrency(data.revenue)}</p>
                          <p className="text-xs text-muted-foreground">{data.count} Super DM{data.count !== 1 ? 's' : ''}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(45, 93%, 47%)" 
                  strokeWidth={2}
                  fill="url(#superDmRevenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Supporters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" />
            Top Supporters
          </h4>
          <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">
            {topSupporters.length} fãs
          </Badge>
        </div>

        {topSupporters.length > 0 ? (
          <div className="space-y-2">
            {topSupporters.map((supporter, index) => (
              <div
                key={supporter.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="relative">
                  <Avatar className="h-10 w-10 border-2 border-amber-500/30">
                    <AvatarImage src={supporter.avatar} />
                    <AvatarFallback className="bg-amber-500/20 text-amber-400">
                      {supporter.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {index < 3 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black">
                      {index + 1}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{supporter.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {supporter.count} Super DM{supporter.count > 1 ? 's' : ''}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-bold text-amber-400">
                    {formatCurrency(supporter.totalAmount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Star className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Ainda não há Super DMs</p>
            <p className="text-xs">Ative nas configurações para começar a receber</p>
          </div>
        )}
      </div>

      {/* Conversion Rate */}
      {totalCount > 0 && (
        <div className="p-3 rounded-lg bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Taxa de Super DM</span>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              ~{conversionRate}% das mensagens
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
