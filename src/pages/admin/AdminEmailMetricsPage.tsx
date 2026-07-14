import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Mail, 
  Send, 
  Eye, 
  MousePointer, 
  AlertTriangle,
  TrendingUp,
  Calendar,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { 
  useEmailStats, 
  useEmailLogs, 
  useTemplatePerformance, 
  useDailyEmailStats,
  useBouncedEmails,
  type EmailLog
} from "@/hooks/useEmailMetrics";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { Shield } from "lucide-react";

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description,
  trend
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  description?: string;
  trend?: number;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-sm ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            <TrendingUp className={`h-4 w-4 ${trend < 0 ? 'rotate-180' : ''}`} />
            <span>{Math.abs(trend).toFixed(1)}% vs período anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    delivered: 'bg-green-500/20 text-green-400 border-green-500/30',
    opened: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    clicked: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    bounced: 'bg-red-500/20 text-red-400 border-red-500/30',
    failed: 'bg-destructive/20 text-destructive border-destructive/30',
  };

  const labels: Record<string, string> = {
    sent: 'Enviado',
    delivered: 'Entregue',
    opened: 'Aberto',
    clicked: 'Clicado',
    bounced: 'Bounce',
    failed: 'Falhou',
  };

  return (
    <Badge className={styles[status] || ''}>
      {labels[status] || status}
    </Badge>
  );
}

export default function AdminEmailMetricsPage() {
  const { data: isAdminMaster } = useIsMasterAdmin();
  const [period, setPeriod] = useState("30");
  
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useEmailStats(parseInt(period));
  const { data: logs, isLoading: logsLoading } = useEmailLogs(50);
  const { data: templatePerf, isLoading: perfLoading } = useTemplatePerformance(parseInt(period));
  const { data: dailyStats, isLoading: dailyLoading } = useDailyEmailStats(parseInt(period));
  const { data: bounces, isLoading: bouncesLoading } = useBouncedEmails(20);

  if (!isAdminMaster) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive">
              <Shield className="h-5 w-5" />
              <p>Acesso restrito a Admin Master.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = statsLoading || logsLoading || perfLoading || dailyLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Métricas de Email
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe o desempenho dos emails enviados pela plataforma
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetchStats()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Emails Enviados"
            value={stats?.total_sent || 0}
            icon={Send}
            description={`Últimos ${period} dias`}
          />
          <StatCard
            title="Taxa de Abertura"
            value={`${(stats?.open_rate || 0).toFixed(1)}%`}
            icon={Eye}
            description={`${stats?.total_opened || 0} abertos`}
          />
          <StatCard
            title="Taxa de Cliques"
            value={`${(stats?.click_rate || 0).toFixed(1)}%`}
            icon={MousePointer}
            description={`${stats?.total_clicked || 0} cliques`}
          />
          <StatCard
            title="Taxa de Bounce"
            value={`${(stats?.bounce_rate || 0).toFixed(1)}%`}
            icon={AlertTriangle}
            description={`${stats?.total_bounced || 0} bounces`}
          />
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolução de Envios</CardTitle>
          <CardDescription>Emails enviados, abertos e clicados por dia</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyLoading ? (
            <Skeleton className="h-[300px]" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(d) => format(new Date(d), 'dd/MM', { locale: ptBR })}
                  className="text-xs"
                />
                <YAxis className="text-xs" />
                <Tooltip 
                  labelFormatter={(d) => format(new Date(d), "dd 'de' MMMM", { locale: ptBR })}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="sent" name="Enviados" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="opened" name="Abertos" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="clicked" name="Clicados" stroke="#eab308" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabs for Details */}
      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Por Template</TabsTrigger>
          <TabsTrigger value="recent">Envios Recentes</TabsTrigger>
          <TabsTrigger value="bounces">Bounces</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance por Template</CardTitle>
            </CardHeader>
            <CardContent>
              {perfLoading ? (
                <Skeleton className="h-64" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead className="text-right">Enviados</TableHead>
                      <TableHead className="text-right">Abertos</TableHead>
                      <TableHead className="text-right">Taxa Abertura</TableHead>
                      <TableHead className="text-right">Cliques</TableHead>
                      <TableHead className="text-right">Taxa Clique</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templatePerf?.map((t) => (
                      <TableRow key={t.template_key}>
                        <TableCell className="font-medium">{t.template_key}</TableCell>
                        <TableCell className="text-right">{t.total_sent}</TableCell>
                        <TableCell className="text-right">{t.opened}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={t.open_rate > 20 ? 'text-green-500' : ''}>
                            {t.open_rate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{t.clicked}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={t.click_rate > 5 ? 'text-green-500' : ''}>
                            {t.click_rate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!templatePerf || templatePerf.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum dado disponível para o período selecionado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Envios Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <Skeleton className="h-64" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Assunto</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(log.created_at), "dd/MM HH:mm")}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.template_key}</TableCell>
                        <TableCell className="text-sm">{log.recipient_email}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{log.subject}</TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                      </TableRow>
                    ))}
                    {(!logs || logs.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhum email enviado ainda
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bounces">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Emails com Bounce
              </CardTitle>
              <CardDescription>
                Emails que não foram entregues - verifique endereços inválidos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bouncesLoading ? (
                <Skeleton className="h-64" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bounces?.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.bounced_at ? format(new Date(log.bounced_at), "dd/MM HH:mm") : '-'}
                        </TableCell>
                        <TableCell className="text-sm">{log.recipient_email}</TableCell>
                        <TableCell className="font-mono text-sm">{log.template_key}</TableCell>
                        <TableCell className="text-sm text-destructive">
                          {log.bounce_reason || 'Motivo não especificado'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!bounces || bounces.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhum bounce registrado 🎉
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
