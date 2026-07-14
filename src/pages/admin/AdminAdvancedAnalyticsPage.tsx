import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  TrendingUp, 
  TrendingDown,
  Users, 
  DollarSign,
  Activity,
  Target,
  Bell,
  RefreshCw,
  Crown,
  BarChart3,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';
import {
  useRealtimeDashboardMetrics,
  useGrowthMetrics,
  useTopPerformers,
  useAnalyticsGoals,
  useAnalyticsAlerts,
  useToggleAlert,
  useDeleteAlert,
} from '@/hooks/useAdvancedAnalytics';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function MetricCard({
  title, 
  value, 
  change, 
  changeLabel,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className={`flex items-center text-xs mt-1 ${
            trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : 
             trend === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
            <span>{change > 0 ? '+' : ''}{change}%</span>
            {changeLabel && <span className="ml-1 text-muted-foreground">{changeLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAdvancedAnalyticsPage() {
  const [period, setPeriod] = useState(30);
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useRealtimeDashboardMetrics();
  const { data: growthData, isLoading: growthLoading } = useGrowthMetrics(period);
  const { data: topPerformers } = useTopPerformers(10);
  const { data: goals } = useAnalyticsGoals();
  const { data: alerts } = useAnalyticsAlerts();
  const toggleAlert = useToggleAlert();
  const deleteAlert = useDeleteAlert();

  const chartData = growthData?.map(d => ({
    date: format(new Date(d.metric_date), 'dd/MM', { locale: ptBR }),
    users: d.new_users,
    creators: d.new_creators,
    revenue: d.revenue,
    transactions: d.transactions,
    subscriptions: d.new_subscriptions,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Avançado</h1>
          <p className="text-muted-foreground">Métricas em tempo real e insights preditivos</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-lg overflow-hidden">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={period === d ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(d)}
                className="rounded-none"
              >
                {d}d
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={() => refetchMetrics()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Real-time Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
        <MetricCard
          title="Total Usuários"
          value={metrics?.total_users?.toLocaleString() || '0'}
          change={12}
          changeLabel="vs mês anterior"
          icon={Users}
          trend="up"
        />
        <MetricCard
          title="Usuários Ativos Hoje"
          value={metrics?.active_users_today?.toLocaleString() || '0'}
          icon={Activity}
        />
        <MetricCard
          title="Novos Hoje"
          value={metrics?.new_users_today?.toLocaleString() || '0'}
          change={8}
          icon={TrendingUp}
          trend="up"
        />
        <MetricCard
          title="Receita Hoje"
          value={formatCurrency(metrics?.total_revenue_today || 0)}
          icon={DollarSign}
        />
        <MetricCard
          title="MRR"
          value={formatCurrency(metrics?.mrr || 0)}
          change={15}
          changeLabel="crescimento"
          icon={Zap}
          trend="up"
        />
        <MetricCard
          title="ARR"
          value={formatCurrency(metrics?.arr || 0)}
          icon={Target}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Criadores"
          value={metrics?.total_creators?.toLocaleString() || '0'}
          icon={Crown}
        />
        <MetricCard
          title="Verificados"
          value={metrics?.verified_creators?.toLocaleString() || '0'}
          icon={Users}
        />
        <MetricCard
          title="Assinaturas Ativas"
          value={metrics?.active_subscriptions?.toLocaleString() || '0'}
          icon={Activity}
        />
        <MetricCard
          title="Ticket Médio"
          value={formatCurrency(metrics?.avg_transaction_value || 0)}
          icon={DollarSign}
        />
      </div>

      <Tabs defaultValue="growth" className="space-y-4">
        <TabsList>
          <TabsTrigger value="growth">
            <LineChart className="h-4 w-4 mr-2" />
            Crescimento
          </TabsTrigger>
          <TabsTrigger value="revenue">
            <BarChart3 className="h-4 w-4 mr-2" />
            Receita
          </TabsTrigger>
          <TabsTrigger value="performers">
            <Crown className="h-4 w-4 mr-2" />
            Top Performers
          </TabsTrigger>
          <TabsTrigger value="goals">
            <Target className="h-4 w-4 mr-2" />
            Metas
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <Bell className="h-4 w-4 mr-2" />
            Alertas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="growth" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Novos Usuários</CardTitle>
                <CardDescription>Crescimento diário de usuários</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Area 
                        type="monotone" 
                        dataKey="users" 
                        stroke="hsl(var(--primary))" 
                        fill="hsl(var(--primary))" 
                        fillOpacity={0.2}
                        name="Usuários"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Novos Criadores</CardTitle>
                <CardDescription>Crescimento de criadores de conteúdo</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Area 
                        type="monotone" 
                        dataKey="creators" 
                        stroke="hsl(var(--chart-2))" 
                        fill="hsl(var(--chart-2))" 
                        fillOpacity={0.2}
                        name="Criadores"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Assinaturas vs Transações</CardTitle>
              <CardDescription>Comparativo de novas assinaturas e transações</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="subscriptions" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      name="Assinaturas"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="transactions" 
                      stroke="hsl(var(--chart-3))" 
                      strokeWidth={2}
                      name="Transações"
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Receita Diária</CardTitle>
              <CardDescription>Evolução da receita nos últimos {period} dias</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `R$${v}`} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Bar 
                      dataKey="revenue" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                      name="Receita"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Receita Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {formatCurrency(metrics?.total_revenue_week || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Receita Mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {formatCurrency(metrics?.total_revenue_month || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transações Hoje</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {metrics?.total_transactions_today || 0}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Criadores</CardTitle>
              <CardDescription>Ranking por receita gerada</CardDescription>
            </CardHeader>
            <CardContent>
              {topPerformers?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum criador encontrado
                </div>
              ) : (
                <div className="space-y-4">
                  {topPerformers?.map((performer, index) => (
                    <div 
                      key={performer.creator_id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`
                          h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm
                          ${index === 0 ? 'bg-yellow-500 text-yellow-950' : 
                            index === 1 ? 'bg-gray-300 text-gray-700' :
                            index === 2 ? 'bg-amber-600 text-amber-950' :
                            'bg-muted text-muted-foreground'}
                        `}>
                          {index + 1}
                        </div>
                        <Avatar>
                          <AvatarImage src={performer.avatar_url} />
                          <AvatarFallback>{performer.creator_name?.charAt(0) || '?'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{performer.creator_name}</p>
                          <p className="text-sm text-muted-foreground">@{performer.creator_username}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-8 text-sm">
                        <div className="text-center">
                          <p className="text-muted-foreground">Receita</p>
                          <p className="font-semibold text-primary">{formatCurrency(performer.total_revenue)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">Assinantes</p>
                          <p className="font-semibold">{performer.subscribers_count}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">Posts</p>
                          <p className="font-semibold">{performer.posts_count}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Metas</CardTitle>
                  <CardDescription>Acompanhe o progresso das metas definidas</CardDescription>
                </div>
                <Button>
                  <Target className="h-4 w-4 mr-2" />
                  Nova Meta
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {goals?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma meta cadastrada
                </div>
              ) : (
                <div className="space-y-4">
                  {goals?.map((goal) => {
                    const progress = (goal.current_value / goal.target_value) * 100;
                    return (
                      <div key={goal.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium">{goal.name}</p>
                            <p className="text-sm text-muted-foreground">{goal.description}</p>
                          </div>
                          <Badge variant={goal.status === 'achieved' ? 'default' : 'outline'}>
                            {goal.status === 'achieved' ? 'Alcançada' : 'Em progresso'}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{goal.current_value.toLocaleString()} / {goal.target_value.toLocaleString()}</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <Progress value={Math.min(progress, 100)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Alertas de Métricas</CardTitle>
                  <CardDescription>Configure notificações para mudanças importantes</CardDescription>
                </div>
                <Button>
                  <Bell className="h-4 w-4 mr-2" />
                  Novo Alerta
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {alerts?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum alerta configurado
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts?.map((alert) => (
                    <div 
                      key={alert.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          alert.is_active ? 'bg-primary/10' : 'bg-muted'
                        }`}>
                          <Bell className={`h-5 w-5 ${alert.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{alert.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {alert.condition_type} {alert.threshold_value} ({alert.metric_type})
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {alert.last_triggered_at && (
                          <span className="text-xs text-muted-foreground">
                            Último: {format(new Date(alert.last_triggered_at), 'dd/MM HH:mm')}
                          </span>
                        )}
                        <Switch
                          checked={alert.is_active}
                          onCheckedChange={(checked) => toggleAlert.mutate({ id: alert.id, is_active: checked })}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('Remover este alerta?')) {
                              deleteAlert.mutate(alert.id);
                            }
                          }}
                        >
                          <TrendingDown className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
