import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Loader2, ShoppingCart, TrendingUp, DollarSign, MessageCircle, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface CartMetrics {
  total_abandoned: number;
  total_recovered: number;
  total_sent: number;
  total_clicked: number;
  recovery_rate: number;
  revenue_recovered: number;
  avg_cart_value: number;
}

export function CartRecoveryMetricsCard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['cart-recovery-metrics'],
    queryFn: async () => {
      // Get metrics from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from('transactions')
        .select('status, amount, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      if (error) throw error;
      
      const failed = data?.filter(c => c.status === 'failed') || [];
      const recovered = data?.filter(c => c.status === 'completed') || [];
      const sent = data || [];
      const clicked = recovered;
      const total_abandoned = failed.length;
      
      const total_recovered = recovered.length;
      const total_sent = sent.length;
      const total_clicked = clicked.length;
      
      const revenue_recovered = recovered.reduce((sum, c) => sum + (c.amount || 0), 0);
      const avg_cart_value = total_abandoned > 0 
        ? data!.reduce((sum, c) => sum + (c.amount || 0), 0) / total_abandoned 
        : 0;
      
      const recovery_rate = total_abandoned > 0 
        ? (total_recovered / total_abandoned) * 100 
        : 0;
      
      return {
        total_abandoned,
        total_recovered,
        total_sent,
        total_clicked,
        recovery_rate,
        revenue_recovered,
        avg_cart_value,
      } as CartMetrics;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const clickRate = metrics && metrics.total_sent > 0 
    ? ((metrics.total_clicked / metrics.total_sent) * 100).toFixed(1)
    : '0';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Recuperação de Carrinho
            </CardTitle>
            <CardDescription>Últimos 30 dias</CardDescription>
          </div>
          <Badge variant="outline" className="text-green-600 bg-green-500/10">
            <MessageCircle className="h-3 w-3 mr-1" />
            WhatsApp
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Carrinhos Abandonados</p>
            <p className="text-2xl font-bold">{metrics?.total_abandoned || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Recuperados</p>
            <p className="text-2xl font-bold text-green-600">{metrics?.total_recovered || 0}</p>
          </div>
        </div>

        {/* Recovery Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <Target className="h-4 w-4" />
              Taxa de Recuperação
            </span>
            <span className="font-medium">{metrics?.recovery_rate.toFixed(1) || 0}%</span>
          </div>
          <Progress value={metrics?.recovery_rate || 0} className="h-2" />
        </div>

        {/* Revenue */}
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Receita Recuperada</span>
            </div>
            <span className="text-lg font-bold text-green-600">
              R$ {metrics?.revenue_recovered.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Enviados</p>
            <p className="font-semibold">{metrics?.total_sent || 0}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Clicados</p>
            <p className="font-semibold">{metrics?.total_clicked || 0}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Taxa Clique</p>
            <p className="font-semibold">{clickRate}%</p>
          </div>
        </div>

        {/* ROI Estimate */}
        {metrics && metrics.revenue_recovered > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm">Ticket Médio</span>
            </div>
            <span className="font-medium">
              R$ {metrics.avg_cart_value.toFixed(2)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
