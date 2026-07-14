import { useEarlyBirdMetrics, useEarlyBirdClaimHistory } from '@/hooks/useEarlyBirdMetrics';
import { useEarlyBirdCounters } from '@/hooks/useEarlyBirdPromotion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Flame, 
  TrendingUp, 
  Zap, 
  Clock, 
  Users,
  Calendar,
  Target,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

function KPICard({ title, value, subtitle, icon, trend, color = '#FF007F' }: KPICardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm text-muted-foreground">{title}</p>
            <p className="text-xl sm:text-2xl font-bold" style={{ color }}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div 
            className="p-2 sm:p-3 rounded-lg"
            style={{ backgroundColor: `${color}20` }}
          >
            {icon}
          </div>
        </div>
        {trend && (
          <div className="absolute bottom-2 right-2">
            <Badge 
              variant="outline" 
              className={
                trend === 'up' ? 'text-emerald-500 border-emerald-500/50' :
                trend === 'down' ? 'text-destructive border-destructive/50' :
                'text-muted-foreground'
              }
            >
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EarlyBirdMetricsDashboard() {
  const { data: counters, isLoading: loadingCounters } = useEarlyBirdCounters();
  const { data: history, isLoading: loadingHistory } = useEarlyBirdClaimHistory(30);
  const metrics = useEarlyBirdMetrics(30);

  const isLoading = loadingCounters || loadingHistory;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const {
    totalClaimed,
    totalMax,
    occupancyRate,
    claimsPerDay,
    exhaustionDate,
    daysUntilExhaustion,
    chartData,
    distributionByType,
  } = metrics;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Vagas Ocupadas"
          value={`${totalClaimed}/${totalMax}`}
          subtitle={`${occupancyRate.toFixed(1)}% preenchido`}
          icon={<Flame className="h-5 w-5 text-[#FF007F]" />}
          color="#FF007F"
        />
        <KPICard
          title="Taxa de Ocupação"
          value={`${occupancyRate.toFixed(1)}%`}
          subtitle="Do total de vagas"
          icon={<Target className="h-5 w-5 text-[#FF007F]" />}
          trend={occupancyRate > 50 ? 'up' : 'neutral'}
          color="#FF007F"
        />
        <KPICard
          title="Claims/Dia"
          value={claimsPerDay.toFixed(1)}
          subtitle="Média últimos 30 dias"
          icon={<Zap className="h-5 w-5" style={{ color: 'hsl(45, 93%, 47%)' }} />}
          trend={claimsPerDay > 5 ? 'up' : 'neutral'}
          color="hsl(45, 93%, 47%)"
        />
        <KPICard
          title="Esgotamento Previsto"
          value={
            exhaustionDate 
              ? format(exhaustionDate, 'dd/MM/yy', { locale: ptBR })
              : 'N/A'
          }
          subtitle={
            daysUntilExhaustion 
              ? `Em ${daysUntilExhaustion} dias`
              : 'Sem dados suficientes'
          }
          icon={<Clock className="h-5 w-5 text-purple-500" />}
          color="hsl(280, 70%, 50%)"
        />
      </div>

      {/* Progress Bars por Tipo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-[#FF007F]" />
            Ocupação por Tipo de Plano
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {counters?.map((counter) => {
            const percentage = counter.max_count > 0 
              ? (counter.current_count / counter.max_count) * 100 
              : 0;
            const isUrgent = percentage > 80;
            
            return (
              <div key={counter.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize">
                    {counter.counter_type === 'monthly' ? 'Mensal' : 
                     counter.counter_type === 'annual' ? 'Anual' :
                     counter.counter_type === 'weekly' ? 'Semanal' :
                     counter.counter_type === 'quarterly' ? 'Trimestral' : counter.counter_type}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {counter.current_count}/{counter.max_count}
                    </span>
                    {isUrgent && (
                      <Badge variant="destructive" className="text-xs">
                        Esgotando
                      </Badge>
                    )}
                  </div>
                </div>
                <Progress 
                  value={percentage} 
                  className="h-2"
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Velocity Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#FF007F]" />
              Velocidade de Ocupação
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Claims por dia nos últimos 30 dias
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorClaims" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF007F" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FF007F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="claims"
                    stroke="#FF007F"
                    fillOpacity={1}
                    fill="url(#colorClaims)"
                    name="Claims"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribution Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#FF007F]" />
              Distribuição por Plano
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Claims por tipo de promoção
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => 
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {distributionByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
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
          </CardContent>
        </Card>
      </div>

      {/* Projection Card */}
      {exhaustionDate && daysUntilExhaustion && (
        <Card className="border-[#FF007F]/30 bg-gradient-to-r from-[#FF007F]/10 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-[#FF007F]/20">
                <Calendar className="h-6 w-6 text-[#FF007F]" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Projeção de Esgotamento</h3>
                <p className="text-muted-foreground">
                  Com a velocidade atual de <strong>{claimsPerDay.toFixed(1)} claims/dia</strong>, 
                  todas as vagas serão preenchidas em aproximadamente{' '}
                  <strong>{daysUntilExhaustion} dias</strong> 
                  {' '}({format(exhaustionDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
