import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevenueTimeline, useRevenueProjection, useRevenueMetrics } from "@/hooks/useRevenueMetrics";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function RevenueProjectionCard() {
  const { data: timeline, isLoading: loadingTimeline } = useRevenueTimeline(6);
  const { data: projection, isLoading: loadingProjection } = useRevenueProjection();
  const { data: metrics } = useRevenueMetrics();

  const isLoading = loadingTimeline || loadingProjection;

  if (isLoading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Projeção de Receita</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px]">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  // Combinar dados históricos com projeção
  const historicalData = (timeline || []).map(t => ({
    month: t.month,
    monthLabel: t.monthLabel,
    revenue: t.revenue,
    projected: null as number | null,
    type: 'historical',
  }));

  const projectionData = (projection || []).map(p => ({
    month: p.month,
    monthLabel: p.monthLabel,
    revenue: null as number | null,
    projected: p.projected,
    type: 'projection',
  }));

  // Ponto de conexão: último valor histórico = primeiro valor projetado
  const lastHistorical = historicalData[historicalData.length - 1];
  if (lastHistorical && projectionData.length > 0) {
    projectionData[0].revenue = lastHistorical.revenue;
  }

  const combinedData = [
    ...historicalData,
    ...projectionData,
  ];

  // Calcular totais
  const totalHistorical = historicalData.reduce((sum, d) => sum + (d.revenue || 0), 0);
  const totalProjected = projectionData.reduce((sum, d) => sum + (d.projected || 0), 0);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Projeção de Receita (3 meses)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            Histórico
          </Badge>
          <Badge variant="outline" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-primary/50 border border-dashed border-primary"></span>
            Projetado
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={combinedData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="monthLabel" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'revenue' ? 'Receita Real' : 'Projeção',
                ]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              
              {/* Linha de referência no mês atual */}
              <ReferenceLine 
                x={lastHistorical?.monthLabel} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                label={{ value: 'Hoje', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />

              {/* Área de receita histórica */}
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#colorRevenue)"
                connectNulls
              />
              
              {/* Área de projeção */}
              <Area
                type="monotone"
                dataKey="projected"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#colorProjected)"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Receita 6 meses</p>
            <p className="text-lg font-bold">{formatCurrency(totalHistorical)}</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10">
            <p className="text-xs text-muted-foreground">Projeção 3 meses</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(totalProjected)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">MRR Estimado</p>
            <p className="text-lg font-bold">{formatCurrency(metrics?.mrr_estimate || 0)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Churn Rate
            </p>
            <p className="text-lg font-bold">{metrics?.churn_rate?.toFixed(1) || 0}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
