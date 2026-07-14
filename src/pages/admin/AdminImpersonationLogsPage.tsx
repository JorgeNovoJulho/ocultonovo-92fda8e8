import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Eye,
  MessageSquare,
  Wallet,
  Image,
  User,
  AlertTriangle,
  Shield,
  Search,
  Filter,
  RefreshCw,
  Download,
  FileText,
  Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

interface AccessLog {
  id: string;
  session_id: string | null;
  admin_id: string;
  target_user_id: string;
  route_accessed: string;
  route_category: string;
  sensitivity_level: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  admin_profile?: { name: string; avatar_url: string | null };
  target_profile?: { name: string; username: string | null; avatar_url: string | null };
}

const categoryConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  messages: { icon: MessageSquare, label: 'Mensagens', color: 'text-red-500' },
  financial: { icon: Wallet, label: 'Financeiro', color: 'text-orange-500' },
  hidden_content: { icon: Image, label: 'Mídia Oculta', color: 'text-purple-500' },
  profile: { icon: User, label: 'Perfil', color: 'text-blue-500' },
  other: { icon: Eye, label: 'Outro', color: 'text-muted-foreground' },
};

const sensitivityConfig: Record<string, { label: string; variant: 'destructive' | 'default' | 'secondary' | 'outline' }> = {
  critical: { label: 'CRÍTICO', variant: 'destructive' },
  high: { label: 'Alto', variant: 'default' },
  medium: { label: 'Médio', variant: 'secondary' },
  low: { label: 'Baixo', variant: 'outline' },
};

export default function AdminImpersonationLogsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sensitivityFilter, setSensitivityFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Realtime subscription for live updates
  useEffect(() => {
    const unsub = subscribeTable(
      'impersonation_access_logs',
      (payload) => {
        const newLog = payload.new as { sensitivity_level: string; route_category: string };

        if (newLog.sensitivity_level === 'critical' || newLog.sensitivity_level === 'high') {
          toast({
            title: newLog.sensitivity_level === 'critical' ? '🚨 Acesso Crítico Detectado!' : '⚠️ Acesso Sensível',
            description: `Novo acesso a ${newLog.route_category} durante impersonificação`,
            variant: 'destructive',
          });
        }

        queryClient.invalidateQueries({ queryKey: ['impersonation-access-logs'] });
        queryClient.invalidateQueries({ queryKey: ['impersonation-logs-stats'] });
      },
      { events: ['INSERT'] },
    );

    return () => {
      unsub();
    };
  }, [queryClient]);

  // Fetch logs
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['impersonation-access-logs', categoryFilter, sensitivityFilter],
    queryFn: async (): Promise<AccessLog[]> => {
      let query = supabase
        .from('impersonation_access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (categoryFilter !== 'all') {
        query = query.eq('route_category', categoryFilter);
      }

      if (sensitivityFilter !== 'all') {
        query = query.eq('sensitivity_level', sensitivityFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch profiles separately
      const logsData = data || [];
      const adminIds = [...new Set(logsData.map(l => l.admin_id))];
      const targetIds = [...new Set(logsData.map(l => l.target_user_id))];
      const allUserIds = [...new Set([...adminIds, ...targetIds])];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('id', allUserIds);

      const profilesMap = new Map((profiles || []).map(p => [p.id, p]));

      return logsData.map(log => ({
        ...log,
        admin_profile: profilesMap.get(log.admin_id) 
          ? { name: profilesMap.get(log.admin_id)!.name, avatar_url: profilesMap.get(log.admin_id)!.avatar_url }
          : undefined,
        target_profile: profilesMap.get(log.target_user_id)
          ? { 
              name: profilesMap.get(log.target_user_id)!.name, 
              username: profilesMap.get(log.target_user_id)!.username,
              avatar_url: profilesMap.get(log.target_user_id)!.avatar_url 
            }
          : undefined,
      })) as AccessLog[];
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['impersonation-logs-stats'],
    queryFn: async () => {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalResult, criticalResult, messagesResult] = await Promise.all([
        supabase
          .from('impersonation_access_logs')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', last24h.toISOString()),
        supabase
          .from('impersonation_access_logs')
          .select('*', { count: 'exact', head: true })
          .eq('sensitivity_level', 'critical')
          .gte('created_at', last24h.toISOString()),
        supabase
          .from('impersonation_access_logs')
          .select('*', { count: 'exact', head: true })
          .eq('route_category', 'messages')
          .gte('created_at', last24h.toISOString()),
      ]);

      return {
        total24h: totalResult.count || 0,
        critical24h: criticalResult.count || 0,
        messages24h: messagesResult.count || 0,
      };
    },
  });

  // Filter logs by search and date
  const filteredLogs = logs?.filter((log) => {
    // Date filter
    if (dateFrom) {
      const logDate = new Date(log.created_at);
      if (logDate < dateFrom) return false;
    }
    if (dateTo) {
      const logDate = new Date(log.created_at);
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      if (logDate > endDate) return false;
    }

    // Search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.route_accessed.toLowerCase().includes(query) ||
      log.admin_profile?.name?.toLowerCase().includes(query) ||
      log.target_profile?.name?.toLowerCase().includes(query) ||
      log.target_profile?.username?.toLowerCase().includes(query)
    );
  });

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!filteredLogs || filteredLogs.length === 0) {
      toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
      return;
    }

    const headers = ['Data/Hora', 'Admin', 'Usuário Alvo', 'Rota', 'Categoria', 'Nível', 'Detalhes'];
    const rows = filteredLogs.map(log => [
      formatDate(log.created_at),
      log.admin_profile?.name || 'Admin',
      log.target_profile?.name || 'Usuário',
      log.route_accessed,
      categoryConfig[log.route_category]?.label || log.route_category,
      sensitivityConfig[log.sensitivity_level]?.label || log.sensitivity_level,
      log.details ? JSON.stringify(log.details) : '-'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `impersonation-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    link.click();

    toast({ title: 'CSV exportado com sucesso!', description: `${filteredLogs.length} registros` });
  };

  // Export to PDF (print-friendly)
  const exportToPDF = () => {
    if (!filteredLogs || filteredLogs.length === 0) {
      toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erro ao abrir janela de impressão', variant: 'destructive' });
      return;
    }

    const dateRange = dateFrom && dateTo 
      ? `${format(dateFrom, 'dd/MM/yyyy')} a ${format(dateTo, 'dd/MM/yyyy')}`
      : 'Todos os períodos';

    const criticalCount = filteredLogs.filter(l => l.sensitivity_level === 'critical').length;
    const highCount = filteredLogs.filter(l => l.sensitivity_level === 'high').length;
    const messagesCount = filteredLogs.filter(l => l.route_category === 'messages').length;
    const financialCount = filteredLogs.filter(l => l.route_category === 'financial').length;

    const tableRows = filteredLogs.slice(0, 100).map(log => `
      <tr class="${log.sensitivity_level === 'critical' ? 'critical' : log.sensitivity_level === 'high' ? 'high' : ''}">
        <td>${formatDate(log.created_at)}</td>
        <td>${log.admin_profile?.name || 'Admin'}</td>
        <td>${log.target_profile?.name || 'Usuário'}${log.target_profile?.username ? ` (@${log.target_profile.username})` : ''}</td>
        <td><code>${log.route_accessed}</code></td>
        <td>${categoryConfig[log.route_category]?.label || log.route_category}</td>
        <td class="level-${log.sensitivity_level}">${sensitivityConfig[log.sensitivity_level]?.label || log.sensitivity_level}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório de Impersonificação - ${format(new Date(), 'dd/MM/yyyy HH:mm')}</title>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #dc2626; margin: 0; }
          .header p { color: #666; margin: 5px 0 0; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
          .meta div { text-align: center; }
          .meta .label { font-size: 10px; color: #666; }
          .meta .value { font-size: 18px; font-weight: bold; }
          .meta .critical { color: #dc2626; }
          .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
          .stat { padding: 15px; background: #f9f9f9; border-radius: 8px; text-align: center; }
          .stat .value { font-size: 24px; font-weight: bold; }
          .stat .label { font-size: 11px; color: #666; }
          .stat.danger .value { color: #dc2626; }
          .stat.warning .value { color: #f97316; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
          th { background-color: #1f2937; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          tr.critical { background-color: #fef2f2 !important; }
          tr.high { background-color: #fff7ed !important; }
          .level-critical { color: #dc2626; font-weight: bold; }
          .level-high { color: #f97316; font-weight: bold; }
          code { background: #e5e7eb; padding: 2px 4px; border-radius: 2px; font-size: 10px; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10px; color: #666; }
          .footer .hash { font-family: monospace; background: #f5f5f5; padding: 5px; border-radius: 4px; margin-top: 10px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🛡️ Relatório de Auditoria de Impersonificação</h1>
          <p>OCULTO - Sistema de Monitoramento de Acessos Sensíveis</p>
        </div>

        <div class="meta">
          <div>
            <div class="label">Data de Geração</div>
            <div class="value">${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
          </div>
          <div>
            <div class="label">Período Analisado</div>
            <div class="value">${dateRange}</div>
          </div>
          <div>
            <div class="label">Total de Registros</div>
            <div class="value">${filteredLogs.length}</div>
          </div>
          <div>
            <div class="label">Acessos Críticos</div>
            <div class="value critical">${criticalCount}</div>
          </div>
        </div>

        <div class="stats">
          <div class="stat danger">
            <div class="value">${criticalCount}</div>
            <div class="label">Críticos</div>
          </div>
          <div class="stat warning">
            <div class="value">${highCount}</div>
            <div class="label">Alto Risco</div>
          </div>
          <div class="stat">
            <div class="value">${messagesCount}</div>
            <div class="label">Mensagens</div>
          </div>
          <div class="stat">
            <div class="value">${financialCount}</div>
            <div class="label">Financeiro</div>
          </div>
        </div>

        <h3>Registro Detalhado de Acessos${filteredLogs.length > 100 ? ' (primeiros 100)' : ''}</h3>
        <table>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Administrador</th>
              <th>Usuário Alvo</th>
              <th>Rota Acessada</th>
              <th>Categoria</th>
              <th>Nível</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          <p><strong>Documento gerado automaticamente pelo sistema OCULTO</strong></p>
          <p>Este relatório é confidencial e destinado exclusivamente a fins de auditoria interna e compliance (LGPD).</p>
          <div class="hash">
            <strong>Hash de Verificação:</strong> ${btoa(JSON.stringify({ count: filteredLogs.length, critical: criticalCount, generated: new Date().toISOString() })).substring(0, 32)}...
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();

    toast({ title: 'PDF gerado!', description: 'Use Ctrl+P para salvar como PDF' });
  };

  const clearDateFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-500/10 rounded-full">
          <Shield className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Logs de Impersonificação</h1>
          <p className="text-muted-foreground text-sm">
            Rastreamento de acessos a dados sensíveis durante Modo Teste
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Acessos (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.total24h || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Acessos Críticos (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">{stats?.critical24h || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-orange-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-500 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Mensagens Acessadas (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{stats?.messages24h || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por admin, usuário ou rota..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="messages">Mensagens</SelectItem>
              <SelectItem value="financial">Financeiro</SelectItem>
              <SelectItem value="hidden_content">Mídia Oculta</SelectItem>
              <SelectItem value="profile">Perfil</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sensitivityFilter} onValueChange={setSensitivityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sensibilidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos níveis</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="high">Alto</SelectItem>
              <SelectItem value="medium">Médio</SelectItem>
              <SelectItem value="low">Baixo</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Filters */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Calendar className="w-4 h-4" />
                {dateFrom ? format(dateFrom, 'dd/MM/yy') : 'De'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Calendar className="w-4 h-4" />
                {dateTo ? format(dateTo, 'dd/MM/yy') : 'Até'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>

          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={clearDateFilters}>
              Limpar datas
            </Button>
          )}

          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>

            <Button variant="outline" onClick={exportToCSV} className="gap-2">
              <Download className="w-4 h-4" />
              CSV
            </Button>

            <Button variant="outline" onClick={exportToPDF} className="gap-2">
              <FileText className="w-4 h-4" />
              PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registro de Acessos</CardTitle>
          <CardDescription>
            {filteredLogs?.length || 0} logs encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs && filteredLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Usuário Alvo</TableHead>
                    <TableHead>Rota Acessada</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const catConfig = categoryConfig[log.route_category] || categoryConfig.other;
                    const sensConfig = sensitivityConfig[log.sensitivity_level] || sensitivityConfig.low;
                    const CategoryIcon = catConfig.icon;

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={log.admin_profile?.avatar_url || undefined} />
                              <AvatarFallback>
                                {log.admin_profile?.name?.charAt(0) || 'A'}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">
                              {log.admin_profile?.name || 'Admin'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={log.target_profile?.avatar_url || undefined} />
                              <AvatarFallback>
                                {log.target_profile?.name?.charAt(0) || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {log.target_profile?.name || 'Usuário'}
                              </span>
                              {log.target_profile?.username && (
                                <span className="text-xs text-muted-foreground">
                                  @{log.target_profile.username}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {log.route_accessed}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 ${catConfig.color}`}>
                            <CategoryIcon className="w-4 h-4" />
                            <span className="text-sm">{catConfig.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={sensConfig.variant}>{sensConfig.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {log.details && Object.keys(log.details).length > 0 ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="cursor-pointer">
                                  Ver detalhes
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <pre className="text-xs whitespace-pre-wrap">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum log de acesso encontrado</p>
              <p className="text-sm mt-1">
                Os acessos a dados sensíveis durante impersonificação aparecerão aqui
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
