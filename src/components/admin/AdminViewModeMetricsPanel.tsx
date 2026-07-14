/**
 * Painel admin: métricas dos Modos de Visualização granulares
 * (Simples / Personalizado / Universo Completo).
 * Lê RPC `view_mode_metrics` (master admin).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, Users2 } from 'lucide-react';

interface ViewModeMetrics {
  days: number;
  distribution: { mode: string; users: number }[];
  active_switchers: number;
  daily: { day: string; events: number }[];
  top_sections: { section: string; on: number; off: number }[];
}

const MODE_LABEL: Record<string, string> = {
  simple: 'Simples',
  custom: 'Personalizado',
  complete: 'Universo Completo',
};

const MODE_COLOR: Record<string, string> = {
  simple: 'bg-emerald-500',
  custom: 'bg-amber-500',
  complete: 'bg-violet-500',
};

export function AdminViewModeMetricsPanel({ days = 30 }: { days?: number }) {
  const { data, isLoading } = useQuery<ViewModeMetrics | null>({
    queryKey: ['view-mode-metrics', days],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('view_mode_metrics', { p_days: days });
      if (error) throw error;
      return data as ViewModeMetrics;
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Sem dados ainda.</p>;
  }

  const totalUsers = data.distribution.reduce((s, d) => s + d.users, 0);
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.events));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users2 className="h-4 w-4" /> Usuários com preferência
          </div>
          <div className="text-2xl font-bold mt-1">{totalUsers}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> Trocaram de modo ({data.days}d)
          </div>
          <div className="text-2xl font-bold mt-1">{data.active_switchers}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BarChart3 className="h-4 w-4" /> Eventos totais ({data.days}d)
          </div>
          <div className="text-2xl font-bold mt-1">
            {data.daily.reduce((s, d) => s + d.events, 0)}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Distribuição atual</h3>
        <div className="space-y-2">
          {data.distribution.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum usuário ainda.</p>
          )}
          {data.distribution.map((d) => {
            const pct = totalUsers > 0 ? Math.round((d.users / totalUsers) * 100) : 0;
            return (
              <div key={d.mode} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{MODE_LABEL[d.mode] ?? d.mode}</span>
                  <span className="text-muted-foreground">{d.users} ({pct}%)</span>
                </div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div
                    className={`h-full ${MODE_COLOR[d.mode] ?? 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Eventos por dia (últimos {data.days}d)</h3>
        {data.daily.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem eventos no período.</p>
        ) : (
          <div className="flex items-end gap-1 h-24">
            {data.daily.map((d) => (
              <div
                key={d.day}
                className="flex-1 bg-primary/40 rounded-sm relative group"
                style={{ height: `${(d.events / maxDaily) * 100}%`, minHeight: 2 }}
                title={`${d.day}: ${d.events}`}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Seções mais ajustadas (top 20)</h3>
        {data.top_sections.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum toggle registrado ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {data.top_sections.map((s) => {
              const total = s.on + s.off;
              const onPct = total > 0 ? Math.round((s.on / total) * 100) : 0;
              return (
                <div key={s.section} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate font-mono">{s.section}</span>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden flex">
                    <div className="bg-emerald-500 h-full" style={{ width: `${onPct}%` }} />
                    <div className="bg-rose-500 h-full" style={{ width: `${100 - onPct}%` }} />
                  </div>
                  <span className="text-muted-foreground tabular-nums">
                    {s.on} on / {s.off} off
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
