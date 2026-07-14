import { AlertTriangle, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CapacityManagementCard } from '@/components/admin/CapacityManagementCard';
import { RealtimeMetricsCards } from '@/components/admin/RealtimeMetricsCards';
import { WaitlistManagementCard } from '@/components/admin/WaitlistManagementCard';
import { CapacityAlertConfigCard } from '@/components/admin/CapacityAlertConfigCard';
import { useRealtimeCapacityMetrics } from '@/hooks/useCapacityMetrics';
import { ConversionFunnelChart } from '@/components/admin/ConversionFunnelChart';

export default function AdminCapacityPage() {
  const { data: metrics } = useRealtimeCapacityMetrics();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          Gestão de Capacidade
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitore e controle o limite de usuários da plataforma em tempo real.
        </p>
      </div>

      {/* Critical Alert */}
      {metrics && metrics.percentage >= 100 && (
        <Alert variant="destructive" className="animate-pulse">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="font-medium">
            🚨 LIMITE DE USUÁRIOS ATINGIDO! Novos cadastros estão bloqueados. 
            {metrics.waitlist_enabled 
              ? ' Usuários estão sendo direcionados para a fila de espera.'
              : ' Considere ativar a fila de espera ou aumentar o limite.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Warning Alert */}
      {metrics && metrics.percentage >= 90 && metrics.percentage < 100 && (
        <Alert className="bg-yellow-500/10 border-yellow-500/30 text-yellow-600">
          <TrendingUp className="h-4 w-4" />
          <AlertDescription>
            ⚠️ A plataforma está com {metrics.percentage.toFixed(1)}% da capacidade. 
            Considere aumentar o limite ou preparar a fila de espera.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Capacity Card */}
      <CapacityManagementCard />

      {/* Realtime Metrics */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Métricas em Tempo Real
        </h2>
        <RealtimeMetricsCards />
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Waitlist Management */}
        <WaitlistManagementCard />

        {/* Alert Configuration */}
        <CapacityAlertConfigCard />
      </div>

      {/* Conversion Funnel */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Funil de Conversão
        </h2>
        <ConversionFunnelChart />
      </div>
    </div>
  );
}
