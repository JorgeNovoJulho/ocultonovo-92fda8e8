import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useChurnMetrics, usePendingChurnAlerts } from "@/hooks/useChurnTracking";
import { TrendingDown, TrendingUp, AlertTriangle, DollarSign, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ChurnAlertsDashboard() {
  const { data: metrics, isLoading: metricsLoading } = useChurnMetrics();
  const { data: pendingAlerts, isLoading: alertsLoading, refetch } = usePendingChurnAlerts();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-destructive/10">
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.totalAbandoned || 0}</p>
                <p className="text-xs text-muted-foreground">Abandonados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[hsl(142,76%,46%)]/10">
                <TrendingUp className="h-4 w-4 text-[hsl(142,76%,46%)]" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.totalRecovered || 0}</p>
                <p className="text-xs text-muted-foreground">Recuperados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/10">
                <DollarSign className="h-4 w-4 text-[hsl(45,93%,47%)]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(142,76%,46%)]">
                  {formatCurrency(metrics?.totalRecoveredRevenue || 0)}
                </p>
                <p className="text-xs text-muted-foreground">Receita Recuperada</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {metrics?.recoveryRate.toFixed(1) || 0}%
                </p>
                <p className="text-xs text-muted-foreground">Taxa de Recuperação</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Recovery Alerts */}
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                Carrinhos Abandonados
              </CardTitle>
              <CardDescription>
                Usuários que iniciaram checkout mas não concluíram
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {alertsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : pendingAlerts && pendingAlerts.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {pendingAlerts.map((alert: any) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={alert.profiles?.avatar_url} />
                        <AvatarFallback>
                          {alert.profiles?.name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">
                          {alert.profiles?.name || 'Usuário'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {alert.product_type} • {formatCurrency(alert.amount)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {formatDistanceToNow(new Date(alert.abandoned_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </Badge>
                      <Button size="sm" variant="outline" className="text-xs">
                        Enviar Lembrete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-[hsl(142,76%,46%)] mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">
                Nenhum carrinho abandonado no momento
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
