import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, FunnelChart, Funnel, LabelList } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversionFunnel } from "@/hooks/useConversionEvents";
import { useConversionMetrics } from "@/hooks/useRevenueMetrics";
import { TrendingUp, Users, ArrowDown, Clock } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ConversionFunnelChart() {
  const [timeRange, setTimeRange] = useState<number>(24);
  const { data: eventFunnel, isLoading: eventLoading } = useConversionFunnel(timeRange);
  const { data: planMetrics, isLoading: planLoading } = useConversionMetrics();

  const isLoading = eventLoading || planLoading;
  const hasEventData = eventFunnel && eventFunnel.totalSignups > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Funil de Conversão</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  // Se não há eventos rastreados, mostrar funil baseado em distribuição de planos
  if (!hasEventData && planMetrics) {
    const funnelData = [
      { 
        name: 'Total', 
        value: planMetrics.total, 
        fill: 'hsl(var(--muted-foreground))',
        percentage: 100,
      },
      { 
        name: 'Free', 
        value: planMetrics.free, 
        fill: 'hsl(var(--muted))',
        percentage: planMetrics.total > 0 ? (planMetrics.free / planMetrics.total) * 100 : 0,
      },
      { 
        name: 'Premium', 
        value: planMetrics.premium, 
        fill: 'hsl(var(--primary))',
        percentage: planMetrics.premiumRate,
      },
      { 
        name: 'VIP', 
        value: planMetrics.vip, 
        fill: 'hsl(45, 93%, 47%)',
        percentage: planMetrics.vipRate,
      },
    ];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Funil de Conversão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  formatter={(value: number, name: string, props: any) => [
                    `${value} usuários (${props.payload.percentage.toFixed(1)}%)`,
                    props.payload.name,
                  ]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Conversion Stats */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 text-primary">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">Taxa de Conversão</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {planMetrics.conversionRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Free → Pagante
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/20">
              <div className="flex items-center gap-2 text-[hsl(45,93%,47%)]">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">Upgrade VIP</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {planMetrics.vipRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Do total de usuários
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            💡 Dados baseados na distribuição de planos. Eventos de conversão serão rastreados automaticamente.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Funil baseado em eventos reais
  if (!eventFunnel) return null;

  const funnelColors = [
    'hsl(var(--primary))',
    'hsl(210, 80%, 55%)',
    'hsl(180, 70%, 50%)',
    'hsl(150, 70%, 50%)',
    'hsl(120, 70%, 50%)',
  ];

  const funnelData = eventFunnel.steps.map((step, index) => ({
    name: step.label,
    value: step.count,
    fill: funnelColors[index] || 'hsl(var(--muted))',
    percentage: step.percentage,
    dropoff: step.dropoff,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Funil de Conversão (Eventos)
          </CardTitle>
          <Tabs value={String(timeRange)} onValueChange={(v) => setTimeRange(Number(v))}>
            <TabsList className="h-8">
              <TabsTrigger value="24" className="text-xs px-2 h-6">24h</TabsTrigger>
              <TabsTrigger value="168" className="text-xs px-2 h-6">7d</TabsTrigger>
              <TabsTrigger value="720" className="text-xs px-2 h-6">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {/* Funnel Steps */}
        <div className="space-y-2">
          {eventFunnel.steps.map((step, index) => {
            const widthPercent = step.count > 0 
              ? Math.max((step.count / eventFunnel.steps[0].count) * 100, 15) 
              : 15;
            
            return (
              <div key={step.event_type} className="relative">
                <div 
                  className="h-10 rounded-lg flex items-center justify-between px-3 transition-all"
                  style={{ 
                    width: `${widthPercent}%`,
                    backgroundColor: funnelColors[index],
                    minWidth: '150px',
                  }}
                >
                  <span className="text-sm font-medium text-white truncate">
                    {step.label}
                  </span>
                  <span className="text-sm font-bold text-white">
                    {step.count.toLocaleString('pt-BR')}
                  </span>
                </div>
                
                {/* Dropoff indicator */}
                {index > 0 && step.dropoff > 0 && (
                  <div className="absolute -top-2 right-0 flex items-center gap-1 text-xs text-destructive">
                    <ArrowDown className="w-3 h-3" />
                    -{step.dropoff.toFixed(0)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 text-primary">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Cadastros</span>
            </div>
            <div className="text-xl font-bold mt-1">
              {eventFunnel.totalSignups.toLocaleString('pt-BR')}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 text-green-600">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Pagamentos</span>
            </div>
            <div className="text-xl font-bold mt-1">
              {eventFunnel.totalPayments.toLocaleString('pt-BR')}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/20">
            <div className="flex items-center gap-2 text-[hsl(45,93%,47%)]">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Conversão</span>
            </div>
            <div className="text-xl font-bold mt-1">
              {eventFunnel.conversionRate.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Plan breakdown */}
        <div className="mt-4 p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Conversão por Plano</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Premium:</span>
              <span className="ml-2 font-medium">
                {eventFunnel.byPlan.premium.payments} pagamentos ({eventFunnel.byPlan.premium.rate.toFixed(1)}%)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">VIP:</span>
              <span className="ml-2 font-medium text-[hsl(45,93%,47%)]">
                {eventFunnel.byPlan.vip.payments} pagamentos ({eventFunnel.byPlan.vip.rate.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
