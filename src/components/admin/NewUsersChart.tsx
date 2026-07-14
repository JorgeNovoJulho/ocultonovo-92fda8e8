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
import { useNewUsersTimeSeries } from '@/hooks/useAdminMetrics';
import { brtLastDaysKeys, brtDayLabel } from '@/lib/brtDay';
import { UserPlus } from 'lucide-react';

interface NewUsersChartProps {
  days?: number;
}

export function NewUsersChart({ days = 7 }: NewUsersChartProps) {
  const { data, isLoading } = useNewUsersTimeSeries(days);

  const chartData = useMemo(() => {
    const keys = brtLastDaysKeys(days);
    return keys.map((k) => ({
      date: brtDayLabel(k),
      usuarios: (data?.[k] as number) || 0,
    }));
  }, [data, days]);


  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-500" />
            Novos Usuários
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
          <UserPlus className="h-5 w-5 text-emerald-500" />
          Novos Usuários (últimos {days} dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorUsuarios" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [value, 'Novos usuários']}
            />
            <Area 
              type="monotone" 
              dataKey="usuarios" 
              stroke="hsl(var(--primary))" 
              fillOpacity={1} 
              fill="url(#colorUsuarios)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
