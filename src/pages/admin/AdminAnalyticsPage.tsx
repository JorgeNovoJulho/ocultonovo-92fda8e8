import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart3, 
  Activity, 
  TrendingUp, 
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react';
import { RealtimeDashboard } from '@/components/analytics/RealtimeDashboard';
import { EngagementHeatmap } from '@/components/analytics/EngagementHeatmap';
import { GrowthPredictionChart } from '@/components/analytics/GrowthPredictionChart';
import { useMetricsSummary, useTopCreators, useAggregateDailyMetrics } from '@/hooks/useAdvancedAnalytics';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

export default function AdminAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('realtime');
  const { data: summary, isLoading: loadingSummary } = useMetricsSummary(30);
  const { data: topCreators, isLoading: loadingCreators } = useTopCreators(10);
  const aggregateMetrics = useAggregateDailyMetrics();

  const handleAggregateMetrics = () => {
    aggregateMetrics.mutate();
  };

  // Preparar dados para gráfico de linha
  const revenueChartData = summary?.completed_transactions?.data?.map(m => ({
    date: new Date(m.metric_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    value: m.metric_value,
  })) || [];

  const usersChartData = summary?.new_users?.data?.map(m => ({
    date: new Date(m.metric_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    value: m.metric_value,
  })) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Analytics Avançado
          </h1>
          <p className="text-muted-foreground mt-1">
            Métricas em tempo real, previsões e análise de engajamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleAggregateMetrics}
            disabled={aggregateMetrics.isPending}
          >
            {aggregateMetrics.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Atualizar Métricas
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="realtime" className="gap-2">
            <Activity className="h-4 w-4" />
            Tempo Real
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Tendências
          </TabsTrigger>
          <TabsTrigger value="engagement" className="gap-2">
            <Calendar className="h-4 w-4" />
            Engajamento
          </TabsTrigger>
        </TabsList>

        {/* Real-time Tab */}
        <TabsContent value="realtime" className="space-y-6 mt-6">
          <RealtimeDashboard />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Receita (30 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <Skeleton className="h-64 w-full" />
                ) : revenueChartData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
                        <Tooltip 
                          formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    Sem dados disponíveis
                  </div>
                )}
              </CardContent>
            </Card>

            {/* New Users Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Novos Usuários (30 dias)</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <Skeleton className="h-64 w-full" />
                ) : usersChartData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={usersChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip 
                          formatter={(value: number) => [value, 'Novos usuários']}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    Sem dados disponíveis
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Creators */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Criadores por Receita</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCreators ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : topCreators && topCreators.length > 0 ? (
                <div className="space-y-2">
                  {topCreators.map((creator, index) => (
                    <div 
                      key={creator.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-muted-foreground w-6">
                          #{index + 1}
                        </span>
                        <img loading="lazy" decoding="async" 
                          src={creator.avatar_url || '/placeholder.svg'} 
                          alt={creator.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div>
                          <p className="font-medium">{creator.name}</p>
                          {creator.username && (
                            <p className="text-xs text-muted-foreground">@{creator.username}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-bold text-green-500">
                        R$ {(creator.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Nenhum criador encontrado
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GrowthPredictionChart 
              predictionType="new_users" 
              title="Previsão de Novos Usuários"
            />
            <GrowthPredictionChart 
              predictionType="completed_transactions" 
              title="Previsão de Receita"
              valuePrefix="R$ "
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GrowthPredictionChart 
              predictionType="new_subscriptions" 
              title="Previsão de Assinaturas"
            />
            <GrowthPredictionChart 
              predictionType="marketplace_sales" 
              title="Previsão de Vendas Marketplace"
              valuePrefix="R$ "
            />
          </div>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-6 mt-6">
          <EngagementHeatmap title="Atividade Geral (últimos 30 dias)" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EngagementHeatmap 
              eventType="page_view" 
              title="Visualizações de Página"
            />
            <EngagementHeatmap 
              eventType="message_sent" 
              title="Mensagens Enviadas"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EngagementHeatmap 
              eventType="post_like" 
              title="Curtidas em Posts"
            />
            <EngagementHeatmap 
              eventType="subscription" 
              title="Novas Assinaturas"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
