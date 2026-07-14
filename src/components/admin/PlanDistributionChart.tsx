import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanDistribution } from "@/hooks/useRevenueMetrics";

const PLAN_COLORS: Record<string, string> = {
  free: 'hsl(var(--muted-foreground))',
  premium: 'hsl(var(--primary))',
  vip: 'hsl(45, 93%, 47%)', // Gold
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  premium: 'Premium',
  vip: 'VIP',
};

export function PlanDistributionChart() {
  const { data: distribution, isLoading } = usePlanDistribution();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Plano</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <Skeleton className="h-[200px] w-[200px] rounded-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (distribution || []).map(d => ({
    name: PLAN_LABELS[d.plan_type] || d.plan_type,
    value: Number(d.user_count),
    percentage: Number(d.percentage),
    fill: PLAN_COLORS[d.plan_type] || 'hsl(var(--muted))',
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>📊</span>
          Distribuição por Plano
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                labelLine={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value} usuários (${((value / total) * 100).toFixed(1)}%)`,
                  name,
                ]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          {chartData.map((item) => (
            <div key={item.name} className="p-2 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{item.value}</div>
              <div className="text-xs text-muted-foreground">{item.name}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
