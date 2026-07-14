import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Heart, MessageCircle, FileText } from 'lucide-react';

interface EngagementStats {
  real: {
    count: number;
    totalLikes: number;
    totalComments: number;
  };
  seed: {
    count: number;
    totalLikes: number;
    totalComments: number;
  };
}

interface EngagementComparisonChartProps {
  stats: EngagementStats | null;
  isLoading?: boolean;
}

export function EngagementComparisonChart({ stats, isLoading }: EngagementComparisonChartProps) {
  // Apenas dados de usuários reais
  const barChartData = useMemo(() => {
    if (!stats) return [];

    return [
      { name: 'Posts', value: stats.real.count },
      { name: 'Curtidas', value: stats.real.totalLikes },
      { name: 'Comentários', value: stats.real.totalComments },
    ];
  }, [stats]);

  const avgLikes = stats && stats.real.count > 0
    ? (stats.real.totalLikes / stats.real.count).toFixed(1)
    : '0';
  const avgComments = stats && stats.real.count > 0
    ? (stats.real.totalComments / stats.real.count).toFixed(1)
    : '0';

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Engajamento de Usuários Reais</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Engajamento de Usuários Reais
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Chart */}
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={barChartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Bar dataKey="value" name="Total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Summary Stats — apenas reais */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <FileText className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{stats.real.count}</p>
            <p className="text-xs text-muted-foreground">Posts</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <Heart className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{stats.real.totalLikes}</p>
            <p className="text-xs text-muted-foreground">Curtidas</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <MessageCircle className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{stats.real.totalComments}</p>
            <p className="text-xs text-muted-foreground">Comentários</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <Users className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{avgLikes}</p>
            <p className="text-xs text-muted-foreground">Média Likes/Post</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
