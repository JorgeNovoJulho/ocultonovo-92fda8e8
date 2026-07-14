import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart
} from 'recharts';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { useGrowthPredictions, useDailyMetrics } from '@/hooks/useAdvancedAnalytics';

interface GrowthPredictionChartProps {
  predictionType: string;
  title?: string;
  valuePrefix?: string;
}

export function GrowthPredictionChart({ 
  predictionType, 
  title = 'Previsão de Crescimento',
  valuePrefix = ''
}: GrowthPredictionChartProps) {
  const { data: predictions, isLoading: loadingPredictions } = useGrowthPredictions(predictionType);
  const { data: actuals, isLoading: loadingActuals } = useDailyMetrics({
    metricType: predictionType,
    limit: 30,
  });

  const chartData = useMemo(() => {
    if (!predictions && !actuals) return [];

    const dataMap = new Map<string, { date: string; predicted?: number; actual?: number }>();

    // Adicionar valores reais
    actuals?.forEach((m) => {
      dataMap.set(m.metric_date, {
        date: m.metric_date,
        actual: m.metric_value,
      });
    });

    // Adicionar previsões
    predictions?.forEach((p) => {
      const existing = dataMap.get(p.prediction_date) || { date: p.prediction_date };
      dataMap.set(p.prediction_date, {
        ...existing,
        predicted: p.predicted_value,
      });
    });

    // Converter para array e ordenar
    return Array.from(dataMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        dateLabel: new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      }));
  }, [predictions, actuals]);

  // Calcular métricas
  const metrics = useMemo(() => {
    if (chartData.length === 0) return null;

    const lastActual = chartData.filter(d => d.actual !== undefined).pop();
    const lastPrediction = chartData.filter(d => d.predicted !== undefined).pop();
    const firstActual = chartData.find(d => d.actual !== undefined);

    const growth = firstActual && lastActual 
      ? ((lastActual.actual! - firstActual.actual!) / firstActual.actual!) * 100 
      : 0;

    const accuracy = predictions?.filter(p => p.actual_value !== undefined).map(p => {
      const diff = Math.abs(p.predicted_value - (p.actual_value || 0));
      return 100 - (diff / p.predicted_value) * 100;
    });

    const avgAccuracy = accuracy && accuracy.length > 0 
      ? accuracy.reduce((a, b) => a + b, 0) / accuracy.length 
      : null;

    return {
      currentValue: lastActual?.actual || 0,
      predictedValue: lastPrediction?.predicted || 0,
      growth,
      accuracy: avgAccuracy,
    };
  }, [chartData, predictions]);

  if (loadingPredictions || loadingActuals) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        {metrics && (
          <div className="flex items-center gap-2">
            <Badge 
              variant={metrics.growth >= 0 ? 'default' : 'destructive'}
              className="gap-1"
            >
              {metrics.growth >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {metrics.growth >= 0 ? '+' : ''}{metrics.growth.toFixed(1)}%
            </Badge>
            {metrics.accuracy && (
              <Badge variant="secondary" className="gap-1">
                <Target className="h-3 w-3" />
                {metrics.accuracy.toFixed(0)}% precisão
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <>
            {/* Métricas resumidas */}
            {metrics && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Valor Atual</p>
                  <p className="text-xl font-bold">
                    {valuePrefix}{metrics.currentValue.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="p-3 bg-primary/10 rounded-lg">
                  <p className="text-xs text-muted-foreground">Previsão</p>
                  <p className="text-xl font-bold text-primary">
                    {valuePrefix}{metrics.predictedValue.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            )}

            {/* Gráfico */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="dateLabel" 
                    tick={{ fontSize: 10 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    className="text-muted-foreground"
                    tickFormatter={(value) => `${valuePrefix}${value.toLocaleString('pt-BR')}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      `${valuePrefix}${value.toLocaleString('pt-BR')}`,
                      name === 'actual' ? 'Real' : 'Previsão'
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="predicted"
                    stroke="none"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.1}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                    name="actual"
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="predicted"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Sem dados disponíveis
          </div>
        )}
      </CardContent>
    </Card>
  );
}
