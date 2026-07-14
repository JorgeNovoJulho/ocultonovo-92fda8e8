import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRevenueTimeSeries } from '@/hooks/useAdminMetrics';
import { brtLastDaysKeys, brtDayLabel } from '@/lib/brtDay';
import { DollarSign } from 'lucide-react';

interface RevenueChartProps {
  days?: number;
}

export function RevenueChart({ days = 30 }: RevenueChartProps) {
  const { data, isLoading } = useRevenueTimeSeries(days);

  const chartData = useMemo(() => {
    const keys = brtLastDaysKeys(days);
    let cumulative = 0;
    return keys.map((k) => {
      const valor = (data?.[k] as number) || 0;
      cumulative += valor;
      return {
        date: brtDayLabel(k),
        receita: valor,
        acumulado: cumulative,
      };
    });
  }, [data, days]);


  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Receita
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-500" />
          Receita (últimos {days} dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              interval={Math.floor(days / 7)}
            />
            <YAxis 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              tickFormatter={(value) => `R$${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => [
                `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                name === 'acumulado' ? 'Acumulado' : 'Diário'
              ]}
            />
            <Area 
              type="monotone" 
              dataKey="acumulado" 
              stroke="hsl(142, 76%, 36%)" 
              fillOpacity={1} 
              fill="url(#colorReceita)" 
              name="Acumulado"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
