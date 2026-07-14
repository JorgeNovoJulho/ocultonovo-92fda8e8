import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Clock,
  Zap,
  Database,
  CreditCard,
  Globe,
  Settings,
  FileText,
  ExternalLink,
  Bell,
  Send,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';
import { 
  useLatestHealthStatus, 
  useHealthCheckLogs, 
  useActiveIncidents, 
  useIncidentHistory,
  useTriggerHealthCheck,
  useResolveIncident,
  calculateUptime,
  groupLogsByHour,
  type HealthCheckLog,
  type CheckoutIncident,
} from '@/hooks/useCheckoutHealth';
import { useSystemSettings, useUpdateSetting } from '@/hooks/useSystemSettings';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const checkIcons: Record<string, React.ElementType> = {
  'Homepage': Globe,
  'Database': Database,
  'PIX Gateway': Zap,
  'Stripe Gateway': CreditCard,
  'Planos de Assinatura': FileText,
};

function StatusBadge({ status }: { status: 'healthy' | 'degraded' | 'critical' }) {
  switch (status) {
    case 'healthy':
      return (
        <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Saudável
        </Badge>
      );
    case 'degraded':
      return (
        <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Degradado
        </Badge>
      );
    case 'critical':
      return (
        <Badge className="bg-destructive/20 text-destructive border-destructive/30">
          <XCircle className="h-3 w-3 mr-1" />
          Crítico
        </Badge>
      );
  }
}

function OverallStatusCard({ latestChecks }: { latestChecks: Record<string, HealthCheckLog> }) {
  const checks = Object.values(latestChecks);
  const hasCritical = checks.some(c => c.status === 'critical');
  const hasDegraded = checks.some(c => c.status === 'degraded');
  
  const overallStatus = hasCritical ? 'critical' : hasDegraded ? 'degraded' : 'healthy';
  const statusText = hasCritical ? 'Checkout Indisponível' : hasDegraded ? 'Checkout Degradado' : 'Checkout Operacional';
  
  return (
    <Card className={`border-2 ${
      overallStatus === 'critical' ? 'border-destructive bg-destructive/5' :
      overallStatus === 'degraded' ? 'border-amber-500 bg-amber-500/5' :
      'border-emerald-500 bg-emerald-500/5'
    }`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              overallStatus === 'critical' ? 'bg-destructive/20' :
              overallStatus === 'degraded' ? 'bg-amber-500/20' :
              'bg-emerald-500/20'
            }`}>
              {overallStatus === 'healthy' ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              ) : overallStatus === 'degraded' ? (
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive" />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{statusText}</h2>
              <p className="text-muted-foreground">
                {checks.length} verificações • {checks.filter(c => c.status === 'healthy').length} saudáveis
              </p>
            </div>
          </div>
          <StatusBadge status={overallStatus} />
        </div>
      </CardContent>
    </Card>
  );
}

function CheckCard({ check }: { check: HealthCheckLog }) {
  const Icon = checkIcons[check.check_name] || Activity;
  
  return (
    <Card className={`${
      check.status === 'critical' ? 'border-destructive/50' :
      check.status === 'degraded' ? 'border-amber-500/50' :
      'border-border'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              check.status === 'critical' ? 'bg-destructive/20' :
              check.status === 'degraded' ? 'bg-amber-500/20' :
              'bg-emerald-500/20'
            }`}>
              <Icon className={`h-5 w-5 ${
                check.status === 'critical' ? 'text-destructive' :
                check.status === 'degraded' ? 'text-amber-500' :
                'text-emerald-500'
              }`} />
            </div>
            <div>
              <p className="font-medium">{check.check_name}</p>
              <p className="text-xs text-muted-foreground">
                {check.response_time_ms}ms • {format(new Date(check.created_at), "HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
          <StatusBadge status={check.status} />
        </div>
        {check.error_message && (
          <p className="mt-2 text-sm text-destructive bg-destructive/10 rounded px-2 py-1">
            {check.error_message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function IncidentCard({ 
  incident, 
  onResolve 
}: { 
  incident: CheckoutIncident;
  onResolve: (id: string, notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  
  return (
    <Card className={`border-l-4 ${
      incident.severity === 'critical' ? 'border-l-destructive' : 'border-l-amber-500'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={incident.severity === 'critical' ? 'destructive' : 'outline'}>
                {incident.severity === 'critical' ? '🚨 Crítico' : '⚠️ Aviso'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {format(new Date(incident.created_at), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            </div>
            <h4 className="font-medium mt-2">{incident.title}</h4>
            {incident.description && (
              <p className="text-sm text-muted-foreground mt-1">{incident.description}</p>
            )}
            <div className="flex gap-1 mt-2">
              {incident.affected_checks.map(check => (
                <Badge key={check} variant="outline" className="text-xs">
                  {check}
                </Badge>
              ))}
            </div>
          </div>
          
          {!incident.resolved_at && (
            <Dialog open={showResolve} onOpenChange={setShowResolve}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Resolver
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Resolver Incidente</DialogTitle>
                  <DialogDescription>
                    Descreva o que foi feito para resolver este incidente.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  placeholder="Notas de resolução..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowResolve(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => {
                    onResolve(incident.id, notes);
                    setShowResolve(false);
                  }}>
                    Marcar como Resolvido
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        
        {incident.resolved_at && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-emerald-500">
              ✅ Resolvido em {format(new Date(incident.resolved_at), "dd/MM HH:mm", { locale: ptBR })}
            </p>
            {incident.resolution_notes && (
              <p className="text-xs text-muted-foreground mt-1">{incident.resolution_notes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WebhookConfig() {
  const { data: settings, isLoading } = useSystemSettings();
  const updateSetting = useUpdateSetting();
  
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookType, setWebhookType] = useState('discord');
  const [emailEnabled, setEmailEnabled] = useState(true);
  
  useEffect(() => {
    if (settings) {
      const url = settings['alert_webhook_url']?.value;
      setWebhookUrl(typeof url === 'string' && url !== 'null' ? url : '');
      
      const type = settings['alert_webhook_type']?.value;
      setWebhookType(typeof type === 'string' ? type : 'discord');
      
      const email = settings['alert_email_enabled']?.value;
      setEmailEnabled(email === 'true' || email === true);
    }
  }, [settings]);
  
  const handleSave = () => {
    updateSetting.mutate({ key: 'alert_webhook_url', value: webhookUrl || 'null' });
    updateSetting.mutate({ key: 'alert_webhook_type', value: webhookType });
    updateSetting.mutate({ key: 'alert_email_enabled', value: emailEnabled });
  };
  
  const handleTestWebhook = async () => {
    if (!webhookUrl) {
      toast({
        title: 'URL não configurada',
        description: 'Configure uma URL de webhook primeiro.',
        variant: 'destructive',
      });
      return;
    }
    
    const messagePreview = '🧪 Teste do Checkout Sentinel - Oculto';
    let status: 'sent' | 'failed' = 'sent';
    let errorMsg: string | null = null;

    try {
      // Simple test message
      let body: object;
      if (webhookType === 'slack') {
        body = { text: messagePreview };
      } else if (webhookType === 'telegram') {
        body = { text: messagePreview, parse_mode: 'HTML' };
      } else {
        body = {
          embeds: [{
            title: '🧪 Teste do Checkout Sentinel',
            description: 'Este é um teste do sistema de alertas.',
            color: 65280,
            footer: { text: 'Oculto - Checkout Sentinel' },
          }],
        };
      }
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (response.ok) {
        toast({
          title: '✅ Teste enviado',
          description: 'Verifique seu canal de notificações.',
        });
      } else {
        status = 'failed';
        errorMsg = `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }
    } catch (error) {
      status = 'failed';
      errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Falha no teste',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      // Salvar log no banco independente do resultado
      try {
        await supabase.from('notification_dispatch_logs' as any).insert({
          channel: webhookType === 'discord' ? 'webhook' : webhookType,
          recipient: webhookUrl ? webhookUrl.substring(0, 80) + '...' : null,
          message_preview: messagePreview,
          status,
          error_message: errorMsg,
          metadata: { webhook_type: webhookType, source: 'checkout_sentinel_test' },
        });
      } catch (logErr) {
        console.warn('Falha ao salvar log de notificação:', logErr);
      }
    }
  };
  
  if (isLoading) {
    return <Skeleton className="h-48" />;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Configuração de Alertas
        </CardTitle>
        <CardDescription>
          Configure onde receber alertas quando o checkout apresentar problemas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tipo de Webhook</Label>
            <Select value={webhookType} onValueChange={setWebhookType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="telegram">Telegram Bot</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>URL do Webhook</Label>
            <Input
              type="url"
              placeholder={
                webhookType === 'discord' ? 'https://discord.com/api/webhooks/...' :
                webhookType === 'slack' ? 'https://hooks.slack.com/services/...' :
                'https://api.telegram.org/bot.../sendMessage'
              }
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <Label>Alertas por Email</Label>
            <p className="text-xs text-muted-foreground">Enviar para admins via Resend</p>
          </div>
          <Switch
            checked={emailEnabled}
            onCheckedChange={setEmailEnabled}
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={updateSetting.isPending}>
            Salvar Configurações
          </Button>
          <Button variant="outline" onClick={handleTestWebhook}>
            <Send className="h-4 w-4 mr-2" />
            Testar Webhook
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/admin/notification-logs'}
            className="gap-2 border-primary/40 text-primary hover:bg-primary/10 ml-auto"
          >
            <Bell className="h-4 w-4" />
            Ver Logs de Alertas
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
          <p className="font-medium mb-1">Como configurar:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Discord:</strong> Server Settings → Integrations → Webhooks</li>
            <li><strong>Slack:</strong> Apps → Incoming Webhooks</li>
            <li><strong>Telegram:</strong> Crie um bot via @BotFather e use a API</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCheckoutHealthPage() {
  const queryClient = useQueryClient();
  const { data: latestChecks, isLoading: loadingLatest } = useLatestHealthStatus();
  const { data: logs, isLoading: loadingLogs } = useHealthCheckLogs(200);
  const { data: activeIncidents } = useActiveIncidents();
  const { data: incidentHistory } = useIncidentHistory();
  const triggerHealthCheck = useTriggerHealthCheck();
  const resolveIncident = useResolveIncident();
  const [clearingLogs, setClearingLogs] = useState(false);
  const [resolvingAll, setResolvingAll] = useState(false);

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      const { error } = await supabase
        .from('checkout_health_logs')
        .delete()
        .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // older than 1h
      if (error) throw error;
      toast({ title: 'Logs limpos', description: 'Logs antigos removidos com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['checkout-health-logs'] });
      queryClient.invalidateQueries({ queryKey: ['latest-health-status'] });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível limpar os logs.', variant: 'destructive' });
    } finally {
      setClearingLogs(false);
    }
  };

  const handleResolveAllIncidents = async () => {
    setResolvingAll(true);
    try {
      const { error } = await supabase
        .from('checkout_incidents')
        .update({ resolved_at: new Date().toISOString(), resolution_notes: 'Resolvido em massa pelo administrador.' })
        .is('resolved_at', null);
      if (error) throw error;
      toast({ title: 'Incidentes resolvidos', description: 'Todos os incidentes ativos foram marcados como resolvidos.' });
      queryClient.invalidateQueries({ queryKey: ['active-incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident-history'] });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível resolver os incidentes.', variant: 'destructive' });
    } finally {
      setResolvingAll(false);
    }
  };
  
  const uptime = logs ? calculateUptime(logs) : 100;
  const chartData = logs ? groupLogsByHour(logs) : [];
  
  if (loadingLatest || loadingLogs) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Checkout Sentinel
          </h1>
          <p className="text-muted-foreground">
            Monitoramento automático do sistema de checkout
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearLogs}
            disabled={clearingLogs}
            className="gap-2 text-muted-foreground hover:text-destructive hover:border-destructive/50"
          >
            <Trash2 className={`h-4 w-4 ${clearingLogs ? 'animate-pulse' : ''}`} />
            {clearingLogs ? 'Limpando...' : 'Limpar Logs'}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/admin/notification-logs'}
            className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
          >
            <Bell className="h-4 w-4" />
            Ver Logs de Alertas
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button 
            onClick={() => triggerHealthCheck.mutate()}
            disabled={triggerHealthCheck.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${triggerHealthCheck.isPending ? 'animate-spin' : ''}`} />
            Verificar Agora
          </Button>
        </div>
      </div>
      
      {/* Overall Status */}
      {latestChecks && Object.keys(latestChecks).length > 0 && (
        <OverallStatusCard latestChecks={latestChecks} />
      )}
      
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Uptime (24h)</p>
                <p className="text-2xl font-bold">{uptime}%</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                uptime >= 99 ? 'bg-emerald-500/20' : 
                uptime >= 95 ? 'bg-amber-500/20' : 'bg-destructive/20'
              }`}>
                <Activity className={`h-6 w-6 ${
                  uptime >= 99 ? 'text-emerald-500' : 
                  uptime >= 95 ? 'text-amber-500' : 'text-destructive'
                }`} />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Incidentes Ativos</p>
                <p className="text-2xl font-bold">{activeIncidents?.length || 0}</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                (activeIncidents?.length || 0) === 0 ? 'bg-emerald-500/20' : 'bg-destructive/20'
              }`}>
                <AlertTriangle className={`h-6 w-6 ${
                  (activeIncidents?.length || 0) === 0 ? 'text-emerald-500' : 'text-destructive'
                }`} />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Verificações (24h)</p>
                <p className="text-2xl font-bold">{logs?.length || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio</p>
                <p className="text-2xl font-bold">
                  {logs && logs.length > 0 
                    ? Math.round(logs.reduce((acc, l) => acc + (l.response_time_ms || 0), 0) / logs.length)
                    : 0
                  }ms
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Clock className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Check Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {latestChecks && Object.values(latestChecks).map(check => (
          <CheckCard key={check.id} check={check} />
        ))}
      </div>
      
      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Verificações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="healthy" 
                    stackId="1" 
                    stroke="#10b981" 
                    fill="#10b981" 
                    fillOpacity={0.6}
                    name="Saudável"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="degraded" 
                    stackId="1" 
                    stroke="#f59e0b" 
                    fill="#f59e0b" 
                    fillOpacity={0.6}
                    name="Degradado"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="critical" 
                    stackId="1" 
                    stroke="#ef4444" 
                    fill="#ef4444" 
                    fillOpacity={0.6}
                    name="Crítico"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Active Incidents */}
      {activeIncidents && activeIncidents.length > 0 && (
      <Card className="border-destructive">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Incidentes Ativos
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResolveAllIncidents}
                disabled={resolvingAll}
                className="gap-2 text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/50"
              >
                <CheckCircle2 className={`h-4 w-4 ${resolvingAll ? 'animate-pulse' : ''}`} />
                {resolvingAll ? 'Resolvendo...' : 'Resolver Todos'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeIncidents.map(incident => (
              <IncidentCard 
                key={incident.id} 
                incident={incident}
                onResolve={(id, notes) => resolveIncident.mutate({ incidentId: id, notes })}
              />
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* Webhook Config */}
      <WebhookConfig />
      
      {/* Incident History */}
      {incidentHistory && incidentHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Incidentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidentHistory.slice(0, 10).map(incident => (
                  <TableRow key={incident.id}>
                    <TableCell className="text-sm">
                      {format(new Date(incident.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={incident.severity === 'critical' ? 'destructive' : 'outline'}>
                        {incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{incident.title}</TableCell>
                    <TableCell>
                      {incident.resolved_at ? (
                        <Badge className="bg-emerald-500/20 text-emerald-500">Resolvido</Badge>
                      ) : (
                        <Badge variant="destructive">Ativo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {/* Instructions */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sobre o Checkout Sentinel
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            O Checkout Sentinel é um sistema de monitoramento automático que verifica a saúde do 
            sistema de checkout a cada 6 horas. Ele monitora:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Homepage:</strong> Se o site está acessível</li>
            <li><strong>Database:</strong> Se o banco de dados responde</li>
            <li><strong>PIX Gateway:</strong> Se o gateway PIX está ativo e configurado</li>
            <li><strong>Stripe Gateway:</strong> Se a integração com Stripe funciona</li>
            <li><strong>Planos:</strong> Se existem planos de assinatura ativos</li>
          </ul>
          <p className="mt-4">
            Se qualquer verificação crítica falhar, você receberá um alerta imediato via webhook 
            (Discord/Slack/Telegram) e uma notificação in-app.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
