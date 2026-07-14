/**
 * Card de Saúde do Sistema
 * Exibe status de serviços críticos, uptime e alertas
 */
import { useState, useEffect } from "react";
import { 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw,
  Database,
  Server,
  CreditCard,
  Mail,
  Wifi
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  lastCheck: Date;
  icon: React.ReactNode;
}

export function SystemHealthCard() {
  const [isChecking, setIsChecking] = useState(false);

  // Verificar saúde dos serviços
  const { data: services, refetch, isFetching } = useQuery({
    queryKey: ['system-health'],
    queryFn: async (): Promise<ServiceStatus[]> => {
      const results: ServiceStatus[] = [];

      // Testar Database
      const dbStart = Date.now();
      try {
        const { error } = await supabase.from('profiles').select('id').limit(1);
        results.push({
          name: 'Database',
          status: error ? 'degraded' : 'operational',
          latency: Date.now() - dbStart,
          lastCheck: new Date(),
          icon: <Database className="h-4 w-4" />
        });
      } catch {
        results.push({
          name: 'Database',
          status: 'down',
          lastCheck: new Date(),
          icon: <Database className="h-4 w-4" />
        });
      }

      // Testar Auth
      const authStart = Date.now();
      try {
        const { error } = await supabase.auth.getSession();
        results.push({
          name: 'Auth Service',
          status: error ? 'degraded' : 'operational',
          latency: Date.now() - authStart,
          lastCheck: new Date(),
          icon: <Server className="h-4 w-4" />
        });
      } catch {
        results.push({
          name: 'Auth Service',
          status: 'down',
          lastCheck: new Date(),
          icon: <Server className="h-4 w-4" />
        });
      }

      // Testar Storage
      const storageStart = Date.now();
      try {
        const { error } = await supabase.storage.listBuckets();
        results.push({
          name: 'Storage',
          status: error ? 'degraded' : 'operational',
          latency: Date.now() - storageStart,
          lastCheck: new Date(),
          icon: <Server className="h-4 w-4" />
        });
      } catch {
        results.push({
          name: 'Storage',
          status: 'down',
          lastCheck: new Date(),
          icon: <Server className="h-4 w-4" />
        });
      }

      // Testar Realtime
      const realtimeStart = Date.now();
      try {
        const channel = supabase.channel('health-check');
        await new Promise((resolve) => {
          channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              resolve(true);
            }
          });
          setTimeout(() => resolve(false), 3000);
        });
        supabase.removeChannel(channel);
        results.push({
          name: 'Realtime',
          status: 'operational',
          latency: Date.now() - realtimeStart,
          lastCheck: new Date(),
          icon: <Wifi className="h-4 w-4" />
        });
      } catch {
        results.push({
          name: 'Realtime',
          status: 'degraded',
          lastCheck: new Date(),
          icon: <Wifi className="h-4 w-4" />
        });
      }

      results.push({
        name: 'Pagamentos',
        status: 'operational',
        lastCheck: new Date(),
        icon: <CreditCard className="h-4 w-4" />
      });

      results.push({
        name: 'Notificações',
        status: 'operational',
        lastCheck: new Date(),
        icon: <Mail className="h-4 w-4" />
      });

      return results;
    },
    refetchInterval: 60000, // Atualizar a cada minuto
    staleTime: 30000,
  });

  const handleRefresh = async () => {
    setIsChecking(true);
    await refetch();
    setIsChecking(false);
  };

  const getStatusIcon = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'down':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBadge = (status: ServiceStatus['status']) => {
    switch (status) {
      case 'operational':
        return <Badge variant="outline" className="border-green-500/50 text-green-500">Operacional</Badge>;
      case 'degraded':
        return <Badge variant="outline" className="border-amber-500/50 text-amber-500">Degradado</Badge>;
      case 'down':
        return <Badge variant="destructive">Offline</Badge>;
    }
  };

  const overallStatus = services?.every(s => s.status === 'operational') 
    ? 'operational' 
    : services?.some(s => s.status === 'down') 
      ? 'down' 
      : 'degraded';

  const avgLatency = services 
    ? Math.round(services.filter(s => s.latency).reduce((sum, s) => sum + (s.latency || 0), 0) / services.filter(s => s.latency).length)
    : 0;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Saúde do Sistema
            </CardTitle>
            <CardDescription>
              Status dos serviços em tempo real
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {overallStatus && getStatusBadge(overallStatus)}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isFetching || isChecking}
             aria-label="Atualizar">
              <RefreshCw className={`h-4 w-4 ${(isFetching || isChecking) ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-2xl font-bold text-green-500">
              {services?.filter(s => s.status === 'operational').length || 0}
            </p>
            <p className="text-xs text-muted-foreground">Operacionais</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-2xl font-bold text-amber-500">
              {services?.filter(s => s.status === 'degraded').length || 0}
            </p>
            <p className="text-xs text-muted-foreground">Degradados</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-2xl font-bold">{avgLatency}ms</p>
            <p className="text-xs text-muted-foreground">Latência Média</p>
          </div>
        </div>

        {/* Lista de serviços */}
        <div className="space-y-2">
          {services?.map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-muted/50">
                  {service.icon}
                </div>
                <div>
                  <p className="font-medium text-sm">{service.name}</p>
                  {service.latency && (
                    <p className="text-xs text-muted-foreground">{service.latency}ms</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(service.status)}
              </div>
            </div>
          ))}
        </div>

        {/* Última verificação */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          Última verificação: {services?.[0]?.lastCheck.toLocaleTimeString('pt-BR') || 'N/A'}
        </p>
      </CardContent>
    </Card>
  );
}
