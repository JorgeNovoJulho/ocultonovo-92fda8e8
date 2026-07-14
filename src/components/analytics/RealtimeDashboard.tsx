import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  DollarSign, 
  MessageSquare, 
  FileImage,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Activity
} from 'lucide-react';
import { useRealtimeMetrics, usePeriodComparison } from '@/hooks/useAdvancedAnalytics';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function RealtimeDashboard() {
  const { data: realtime, isLoading: loadingRealtime, refetch } = useRealtimeMetrics();
  const { data: comparison, isLoading: loadingComparison } = usePeriodComparison(7);

  const metrics = [
    {
      label: 'Usuários Ativos (24h)',
      value: realtime?.activeUsers || 0,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      comparisonKey: 'new_users',
    },
    {
      label: 'Receita (24h)',
      value: realtime?.revenue || 0,
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      prefix: 'R$ ',
      comparisonKey: 'completed_transactions',
    },
    {
      label: 'Mensagens (24h)',
      value: realtime?.messagesSent || 0,
      icon: MessageSquare,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      comparisonKey: 'messages_sent',
    },
    {
      label: 'Posts Criados (24h)',
      value: realtime?.newPosts || 0,
      icon: FileImage,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
      comparisonKey: 'posts_created',
    },
  ];

  const isLoading = loadingRealtime || loadingComparison;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary animate-pulse" />
          <CardTitle className="text-lg">Métricas em Tempo Real</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {realtime?.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Atualizado: {new Date(realtime.updatedAt).toLocaleTimeString('pt-BR')}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => {
            const comp = comparison?.[metric.comparisonKey];
            const trend = comp?.change || 0;

            return (
              <div 
                key={metric.label}
                className={cn("p-4 rounded-lg", metric.bgColor)}
              >
                {isLoading ? (
                  <>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-8 w-24" />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <metric.icon className={cn("h-4 w-4", metric.color)} />
                      <span className="text-xs text-muted-foreground truncate">
                        {metric.label}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <span className="text-2xl font-bold">
                        {metric.prefix || ''}
                        {typeof metric.value === 'number' 
                          ? metric.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                          : metric.value}
                      </span>
                      {comp && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs",
                            trend >= 0 ? "text-green-500 border-green-500/30" : "text-red-500 border-red-500/30"
                          )}
                        >
                          {trend >= 0 ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {trend >= 0 ? '+' : ''}{trend.toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
