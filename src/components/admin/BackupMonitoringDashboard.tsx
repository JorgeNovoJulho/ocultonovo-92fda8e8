import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, CheckCircle2, XCircle, Clock, RefreshCw, Database } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useCreateBackup } from "@/hooks/useBackupSystem";
import { toast } from "sonner";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// Hook for backup size history
const useBackupSizeHistory = (days: number = 30) => {
  return useQuery({
    queryKey: ['backup-size-history', days],
    queryFn: async () => {
      const startDate = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('backup_history')
        .select('started_at, file_size_bytes, status')
        .gte('started_at', startDate)
        .eq('status', 'completed')
        .order('started_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
};

// Hook for backup status counts
const useBackupStatusCounts = () => {
  return useQuery({
    queryKey: ['backup-status-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backup_history')
        .select('status');

      if (error) throw error;

      const counts = {
        completed: 0,
        failed: 0,
        running: 0,
        pending: 0,
      };

      data?.forEach((item) => {
        const status = item.status as keyof typeof counts;
        if (status in counts) {
          counts[status]++;
        }
      });

      return counts;
    },
  });
};

// Hook for backup type counts
const useBackupTypeCounts = () => {
  return useQuery({
    queryKey: ['backup-type-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backup_history')
        .select('backup_type');

      if (error) throw error;

      const counts: Record<string, number> = {
        manual: 0,
        full: 0,
        pre_restore: 0,
      };

      data?.forEach((item) => {
        const type = item.backup_type;
        if (type in counts) {
          counts[type]++;
        }
      });

      return counts;
    },
  });
};

// Hook for failed backups
const useFailedBackups = (limit: number = 5) => {
  return useQuery({
    queryKey: ['failed-backups', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backup_history')
        .select('*')
        .eq('status', 'failed')
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
};

// Utility functions
const formatBytes = (bytes: number | null): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const COLORS = {
  completed: 'hsl(var(--chart-2))',
  failed: 'hsl(var(--destructive))',
  running: 'hsl(var(--chart-1))',
  pending: 'hsl(var(--muted-foreground))',
};

const TYPE_COLORS = {
  manual: 'hsl(var(--chart-1))',
  full: 'hsl(var(--chart-2))',
  pre_restore: 'hsl(var(--chart-3))',
};

export function BackupMonitoringDashboard() {
  const { data: sizeHistory, isLoading: loadingSizeHistory } = useBackupSizeHistory(30);
  const { data: statusCounts, isLoading: loadingStatusCounts } = useBackupStatusCounts();
  const { data: typeCounts, isLoading: loadingTypeCounts } = useBackupTypeCounts();
  const { data: failedBackups, isLoading: loadingFailed } = useFailedBackups(5);
  const createBackup = useCreateBackup();

  const handleRetryBackup = async () => {
    try {
      await createBackup.mutateAsync({
        include_media: true,
        include_messages: true,
      });
      toast.success('Backup iniciado com sucesso!');
    } catch (error) {
      toast.error('Erro ao iniciar backup');
    }
  };

  // Prepare chart data
  const sizeChartData = sizeHistory?.map((item) => ({
    date: format(new Date(item.started_at!), 'dd/MM', { locale: ptBR }),
    size: item.file_size_bytes ? item.file_size_bytes / (1024 * 1024) : 0, // Convert to MB
    fullDate: format(new Date(item.started_at!), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
  })) || [];

  const statusChartData = statusCounts
    ? [
        { name: 'Sucesso', value: statusCounts.completed, color: COLORS.completed },
        { name: 'Falha', value: statusCounts.failed, color: COLORS.failed },
        { name: 'Executando', value: statusCounts.running, color: COLORS.running },
        { name: 'Pendente', value: statusCounts.pending, color: COLORS.pending },
      ].filter((item) => item.value > 0)
    : [];

  const typeChartData = typeCounts
    ? [
        { name: 'Manual', value: typeCounts.manual, fill: TYPE_COLORS.manual },
        { name: 'Agendado', value: typeCounts.full, fill: TYPE_COLORS.full },
        { name: 'Pré-Restauração', value: typeCounts.pre_restore, fill: TYPE_COLORS.pre_restore },
      ].filter((item) => item.value > 0)
    : [];

  const totalBackups = statusCounts
    ? statusCounts.completed + statusCounts.failed + statusCounts.running + statusCounts.pending
    : 0;

  const successRate = totalBackups > 0 && statusCounts
    ? ((statusCounts.completed / totalBackups) * 100).toFixed(1)
    : 0;

  const hasFailedBackups = (failedBackups?.length || 0) > 0;

  const chartConfig = {
    size: {
      label: "Tamanho (MB)",
      color: "hsl(var(--chart-1))",
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5" />
          Monitoramento de Backups
        </h3>
        <Badge variant={hasFailedBackups ? "destructive" : "outline"}>
          {hasFailedBackups ? `${failedBackups?.length} alertas` : "Sistema OK"}
        </Badge>
      </div>

      {/* Alert for failed backups */}
      {hasFailedBackups && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">
                    {failedBackups?.length} backup(s) falharam recentemente
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Verifique os detalhes abaixo e considere retentar
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetryBackup}
                disabled={createBackup.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${createBackup.isPending ? 'animate-spin' : ''}`} />
                Novo Backup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{totalBackups}</div>
            <p className="text-sm text-muted-foreground">Total de Backups</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{successRate}%</div>
            <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-500">
              {statusCounts?.completed || 0}
            </div>
            <p className="text-sm text-muted-foreground">Concluídos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-destructive">
              {statusCounts?.failed || 0}
            </div>
            <p className="text-sm text-muted-foreground">Falhas</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Size History Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Tamanho dos Backups (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSizeHistory ? (
              <Skeleton className="h-[200px] w-full" />
            ) : sizeChartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Nenhum backup registrado
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sizeChartData}>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value} MB`}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      formatter={(value: number) => [`${value.toFixed(2)} MB`, 'Tamanho']}
                    />
                    <Line
                      type="monotone"
                      dataKey="size"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-1))", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Taxa de Sucesso/Falha
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStatusCounts ? (
              <Skeleton className="h-[200px] w-full" />
            ) : statusChartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Nenhum backup registrado
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Backup Types Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            Backups por Tipo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTypeCounts ? (
            <Skeleton className="h-[150px] w-full" />
          ) : typeChartData.length === 0 ? (
            <div className="h-[150px] flex items-center justify-center text-muted-foreground">
              Nenhum backup registrado
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeChartData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Failed Backups List */}
      {hasFailedBackups && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Backups Falhados Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFailed ? (
              <Skeleton className="h-[100px] w-full" />
            ) : (
              <div className="space-y-3">
                {failedBackups?.map((backup) => (
                  <div
                    key={backup.id}
                    className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {backup.started_at
                            ? format(new Date(backup.started_at), "dd/MM/yyyy 'às' HH:mm", {
                                locale: ptBR,
                              })
                            : 'Data desconhecida'}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {backup.backup_type === 'manual' ? 'Manual' : 
                           backup.backup_type === 'full' ? 'Agendado' : 'Pré-Restauração'}
                        </Badge>
                      </div>
                      {backup.error_message && (
                        <p className="text-sm text-destructive">
                          Erro: {backup.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
