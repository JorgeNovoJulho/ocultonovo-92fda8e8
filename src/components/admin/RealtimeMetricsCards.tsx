import { Users, Crown, Star, DollarSign, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimeCapacityMetrics } from '@/hooks/useCapacityMetrics';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';
import { cn } from '@/lib/utils';

export function RealtimeMetricsCards() {
  const { data: metrics, isLoading } = useRealtimeCapacityMetrics();
  const { data: onlineCount = 0 } = useOnlineUsers();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-4 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const cards = [
    {
      title: 'FREE',
      value: metrics.plan_distribution.free,
      icon: Users,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/50',
      rpu: 0,
    },
    {
      title: 'PREMIUM',
      value: metrics.plan_distribution.premium,
      icon: Star,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      rpu: 29.90,
    },
    {
      title: 'VIP',
      value: metrics.plan_distribution.vip,
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      rpu: 49.90,
    },
    {
      title: 'MRR Estimado',
      value: `R$ ${metrics.estimated_mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      isMonetary: true,
    },
    {
      title: 'Online Agora',
      value: onlineCount,
      icon: Wifi,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      pulse: onlineCount > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className={cn('relative overflow-hidden', card.bgColor)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <card.icon className={cn('w-4 h-4', card.color)} />
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className={cn(
                'text-2xl font-bold',
                card.isMonetary ? card.color : 'text-foreground'
              )}>
                {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
              </span>
              
              {card.rpu !== undefined && card.rpu > 0 && (
                <span className="text-xs text-muted-foreground">
                  R$ {card.rpu}/mês
                </span>
              )}

              {card.pulse && (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
