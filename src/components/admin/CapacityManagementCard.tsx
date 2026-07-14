import { useState, useEffect } from 'react';
import { Users, Settings, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useRealtimeCapacityMetrics,
  useUpdateMaxLimit,
  useToggleWaitlist,
} from '@/hooks/useCapacityMetrics';
import { cn } from '@/lib/utils';

export function CapacityManagementCard() {
  const { data: metrics, isLoading } = useRealtimeCapacityMetrics();
  const updateLimit = useUpdateMaxLimit();
  const toggleWaitlist = useToggleWaitlist();

  const [newLimit, setNewLimit] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (metrics?.max_limit) {
      setNewLimit(metrics.max_limit.toString());
    }
  }, [metrics?.max_limit]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  const getStatusColor = () => {
    if (metrics.percentage >= 100) return 'bg-destructive';
    if (metrics.percentage >= 90) return 'bg-yellow-500';
    if (metrics.percentage >= 75) return 'bg-orange-500';
    return 'bg-primary';
  };

  const getStatusBadge = () => {
    if (metrics.percentage >= 100) {
      return (
        <Badge variant="destructive" className="animate-pulse">
          <AlertTriangle className="w-3 h-3 mr-1" />
          LIMITE ATINGIDO
        </Badge>
      );
    }
    if (metrics.percentage >= 90) {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
          Quase cheio
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <TrendingUp className="w-3 h-3 mr-1" />
        Normal
      </Badge>
    );
  };

  const handleSaveLimit = () => {
    const limit = parseInt(newLimit);
    if (limit > 0 && limit !== metrics.max_limit) {
      updateLimit.mutate(limit);
    }
    setIsEditing(false);
  };

  const handleToggleWaitlist = (checked: boolean) => {
    toggleWaitlist.mutate(checked);
  };

  return (
    <Card className={cn(
      'relative overflow-hidden',
      metrics.percentage >= 100 && 'border-destructive/50 bg-destructive/5'
    )}>
      {/* Decorative gradient */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-1',
          getStatusColor()
        )}
      />

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Gestão de Capacidade
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Main Progress */}
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-4xl font-black text-foreground">
                {metrics.current_users.toLocaleString()}
              </span>
              <span className="text-xl text-muted-foreground ml-1">
                / {metrics.max_limit.toLocaleString()}
              </span>
            </div>
            <span className={cn(
              'text-2xl font-bold',
              metrics.percentage >= 100 ? 'text-destructive' : 
              metrics.percentage >= 90 ? 'text-yellow-500' : 'text-primary'
            )}>
              {metrics.percentage.toFixed(1)}%
            </span>
          </div>
          
          <Progress
            value={Math.min(metrics.percentage, 100)}
            className={cn(
              'h-4',
              metrics.percentage >= 100 && '[&>div]:bg-destructive'
            )}
          />

          {/* Forecast */}
          {metrics.hours_to_full && metrics.percentage < 100 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Clock className="w-4 h-4" />
              <span>
                Neste ritmo, a meta será atingida em{' '}
                <span className="font-medium text-foreground">
                  {metrics.hours_to_full > 24
                    ? `${Math.round(metrics.hours_to_full / 24)} dias`
                    : `${Math.round(metrics.hours_to_full)} horas`}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {metrics.signups_last_hour}
            </div>
            <div className="text-xs text-muted-foreground">Última hora</div>
          </div>
          <div className="text-center border-x border-border">
            <div className="text-2xl font-bold text-foreground">
              {metrics.signups_last_24h}
            </div>
            <div className="text-xs text-muted-foreground">Últimas 24h</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {metrics.waitlist_count}
            </div>
            <div className="text-xs text-muted-foreground">Na fila</div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4 pt-2">
          {/* Limit Setting */}
          <div className="flex items-center gap-4">
            <Label className="flex items-center gap-2 min-w-[120px]">
              <Settings className="w-4 h-4" />
              Limite Máximo
            </Label>
            {isEditing ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="number"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  className="w-32"
                  min={1}
                />
                <Button
                  size="sm"
                  onClick={handleSaveLimit}
                  disabled={updateLimit.isPending}
                >
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setNewLimit(metrics.max_limit.toString());
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {metrics.max_limit.toLocaleString()}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  Editar
                </Button>
              </div>
            )}
          </div>

          {/* Waitlist Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <Label className="font-medium">Fila de Espera</Label>
              <p className="text-sm text-muted-foreground">
                Ativa automaticamente quando limite for atingido
              </p>
            </div>
            <Switch
              checked={metrics.waitlist_enabled}
              onCheckedChange={handleToggleWaitlist}
              disabled={toggleWaitlist.isPending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
