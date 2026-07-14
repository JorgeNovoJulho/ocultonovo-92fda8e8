import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, Medal, Award, TrendingUp } from 'lucide-react';
import { useTopAfilhadas, useCommissionsByAfilhada } from '@/hooks/useCommissionHistory';
import { cn } from '@/lib/utils';

interface AfilhadasRankingProps {
  limit?: number;
  showChart?: boolean;
}

const rankColors = [
  'hsl(45, 93%, 47%)', // Gold
  'hsl(210, 15%, 60%)', // Silver
  'hsl(30, 50%, 45%)', // Bronze
  'hsl(var(--primary))',
  'hsl(var(--muted-foreground))',
];

const RankIcon = ({ rank }: { rank: number }) => {
  switch (rank) {
    case 1:
      return <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />;
    case 2:
      return <Medal className="h-4 w-4 text-[hsl(210,15%,60%)]" />;
    case 3:
      return <Award className="h-4 w-4 text-[hsl(30,50%,45%)]" />;
    default:
      return <span className="text-xs font-medium text-muted-foreground">#{rank}</span>;
  }
};

export function AfilhadasRanking({ limit = 5, showChart = true }: AfilhadasRankingProps) {
  const { data: topAfilhadas, isLoading } = useTopAfilhadas(limit);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const chartData = useMemo(() => {
    return topAfilhadas.map((a, index) => ({
      name: a.name.split(' ')[0], // First name only for chart
      total: a.total,
      fill: rankColors[index] || rankColors[4],
    }));
  }, [topAfilhadas]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">{data.name}</p>
          <p className="text-lg font-bold text-primary">
            {formatCurrency(data.total)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (topAfilhadas.length === 0) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Top Afilhadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhuma afilhada com vendas ainda.</p>
            <p className="text-sm mt-1">Quando suas afilhadas fizerem vendas, o ranking aparecerá aqui.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Crown className="h-5 w-5 text-[hsl(45,93%,47%)]" />
          Top Afilhadas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ranking List */}
        <div className="space-y-3">
          {topAfilhadas.map((afilhada, index) => (
            <div
              key={afilhada.afilhada_id}
              className={cn(
                'flex items-center gap-3 p-2 rounded-lg transition-colors',
                index === 0 && 'bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/20',
                index === 1 && 'bg-[hsl(210,15%,60%)]/10',
                index === 2 && 'bg-[hsl(30,50%,45%)]/10'
              )}
            >
              <div className="w-6 flex justify-center">
                <RankIcon rank={index + 1} />
              </div>
              <Avatar className="h-10 w-10 border-2 border-border">
                <AvatarImage src={afilhada.avatar} />
                <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                  {afilhada.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {afilhada.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {afilhada.count} {afilhada.count === 1 ? 'venda' : 'vendas'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">
                  {formatCurrency(afilhada.total)}
                </p>
                <Badge variant="secondary" className="text-[10px] px-1">
                  {afilhada.percentage.toFixed(1)}%
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        {showChart && chartData.length > 0 && (
          <div className="h-[180px] w-full mt-4 pt-4 border-t border-border/30">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `R$${v}`}
                  className="text-muted-foreground"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={60}
                  className="text-muted-foreground"
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
