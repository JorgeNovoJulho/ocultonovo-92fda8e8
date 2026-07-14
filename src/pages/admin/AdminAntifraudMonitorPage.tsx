import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ShieldAlert, RefreshCw, AlertTriangle, Activity, TrendingUp, User } from 'lucide-react';

const RISK_COLOR: Record<string, string> = {
  low: 'bg-muted text-foreground',
  medium: 'bg-yellow-500/20 text-yellow-700',
  high: 'bg-orange-500/20 text-orange-700',
  critical: 'bg-destructive/20 text-destructive',
};

const SEV_COLOR: Record<string, string> = {
  low: 'bg-muted text-foreground',
  medium: 'bg-yellow-500/20 text-yellow-700',
  high: 'bg-orange-500/20 text-orange-700',
  critical: 'bg-destructive/20 text-destructive',
};

const WINDOWS = [15, 60, 360, 1440];

export default function AdminAntifraudMonitorPage() {
  const qc = useQueryClient();
  const [windowMin, setWindowMin] = useState(60);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const { data: userDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['antifraud-user-details', selectedUser?.user_id],
    enabled: !!selectedUser?.user_id,
    queryFn: async () => {
      const uid = selectedUser.user_id;
      const [preds, acts, alerts] = await Promise.all([
        supabase.from('ml_predictions' as any).select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
        supabase.from('ml_actions' as any).select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
        supabase.from('financial_alerts' as any).select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(10),
      ]);
      return {
        predictions: (preds.data as any[]) || [],
        actions: (acts.data as any[]) || [],
        alerts: (alerts.data as any[]) || [],
      };
    },
  });

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['antifraud-realtime', windowMin],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_antifraud_realtime' as any, { p_window_minutes: windowMin });
      if (error) throw error;
      return data as any;
    },
    refetchInterval: autoRefresh ? 15_000 : false,
  });

  // Realtime: invalidar quando novas predições chegam
  useEffect(() => {
    const inv = () => qc.invalidateQueries({ queryKey: ['antifraud-realtime'] });
    const u1 = subscribeTable('ml_predictions', inv, { events: ['INSERT'] });
    const u2 = subscribeTable('ml_actions', inv, { events: ['INSERT'] });
    return () => { u1(); u2(); };
  }, [qc]);

  const k = data?.kpis || {};
  const dist = data?.distribution || {};
  const actions = data?.actions_24h || {};
  const top = (data?.top_risk || []) as any[];
  const alerts = (data?.open_alerts || []) as any[];
  const timeline = (data?.timeline_24h || []) as any[];

  const maxBucket = Math.max(1, ...Object.values(dist).map((v: any) => Number(v) || 0));
  const maxTimeline = Math.max(1, ...timeline.map(t => Number(t.total) || 0));

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          <h1 className="text-2xl md:text-3xl font-bold">Monitor Antifraude</h1>
          {isFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1 border rounded-md p-1">
            {WINDOWS.map(w => (
              <button
                key={w}
                onClick={() => setWindowMin(w)}
                className={`px-2 py-1 text-xs rounded ${windowMin === w ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                {w < 60 ? `${w}m` : w < 1440 ? `${w / 60}h` : '24h'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh(a => !a)}>
            {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
          </Button>
          <Button size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Predições (janela)" value={k.predictions_window ?? 0} loading={isLoading} />
        <Kpi label="Predições 24h" value={k.predictions_24h ?? 0} loading={isLoading} />
        <Kpi label="Crítico (janela)" value={k.critical_window ?? 0} loading={isLoading} highlight />
        <Kpi label="Alto (janela)" value={k.high_window ?? 0} loading={isLoading} />
        <Kpi label="Score médio" value={Number(k.avg_score_window || 0).toFixed(3)} loading={isLoading} />
        <Kpi label="Score máx" value={Number(k.max_score_window || 0).toFixed(3)} loading={isLoading} />
      </div>

      {/* Distribuição + Ações */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Distribuição de score</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {['0.85-1.00', '0.70-0.85', '0.50-0.70', '0.30-0.50', '0.00-0.30'].map(b => {
              const v = Number(dist[b] || 0);
              return (
                <div key={b} className="flex items-center gap-2 text-xs">
                  <span className="w-20 font-mono text-muted-foreground">{b}</span>
                  <div className="flex-1 bg-muted h-3 rounded overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(v / maxBucket) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right font-bold">{v}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Ações automáticas (24h)</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(actions).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ação executada nas últimas 24h.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(actions).map(([type, qty]: any) => (
                  <div key={type} className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground capitalize">{String(type).replace(/_/g, ' ')}</div>
                    <div className="text-2xl font-bold">{qty}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader><CardTitle className="text-base">Timeline 24h (predições / risco alto)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-24 w-full" /> : (
            <div className="flex items-end gap-1 h-24">
              {timeline.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
              {timeline.map((t, i) => {
                const total = Number(t.total) || 0;
                const high = Number(t.high_risk) || 0;
                const h = (total / maxTimeline) * 100;
                const hh = total ? (high / total) * h : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${new Date(t.hour).toLocaleString('pt-BR')} · ${total} (${high} risco)`}>
                    <div className="w-full bg-muted rounded-sm relative" style={{ height: `${h}%` }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-destructive rounded-sm" style={{ height: `${(hh / Math.max(h, 0.01)) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top risco */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top usuários de risco (janela {windowMin}m)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-32 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2">Usuário</th>
                    <th className="text-right">Score</th>
                    <th>Risco</th>
                    <th className="text-right">Ações 24h</th>
                    <th className="text-right">Receita prev. 30d</th>
                    <th>Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((u, i) => (
                    <tr
                      key={u.user_id + i}
                      className="border-b cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedUser(u)}
                    >
                      <td className="py-2 flex items-center gap-2"><User className="h-3 w-3 text-muted-foreground" />{u.name}</td>
                      <td className="text-right font-mono">{Number(u.fraud_score).toFixed(3)}</td>
                      <td><Badge className={RISK_COLOR[u.risk_level] || ''}>{u.risk_level}</Badge></td>
                      <td className="text-right">{u.actions_24h || 0}</td>
                      <td className="text-right">R$ {Number(u.revenue_pred_30d || 0).toFixed(2)}</td>
                      <td className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                  {!top.length && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem predições na janela.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertas financeiros relacionados */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Alertas financeiros abertos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta antifraude aberto.</p>}
          {alerts.map(a => (
            <div key={a.id} className="border rounded-lg p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={SEV_COLOR[a.severity] || ''}>{a.severity}</Badge>
                  <span className="text-xs text-muted-foreground">{a.alert_type}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="font-medium mt-1">{a.title}</div>
                <div className="text-sm text-muted-foreground">{a.message}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">
        Atualizado em {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR') : '—'}
      </p>

      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedUser?.name || 'Usuário'}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap">
              <Badge className={RISK_COLOR[selectedUser?.risk_level] || ''}>{selectedUser?.risk_level}</Badge>
              <span className="font-mono text-xs">score {Number(selectedUser?.fraud_score || 0).toFixed(3)}</span>
              <span className="text-xs">· receita prev. 30d R$ {Number(selectedUser?.revenue_pred_30d || 0).toFixed(2)}</span>
              <span className="text-xs font-mono opacity-60">{selectedUser?.user_id}</span>
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <section>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1"><Activity className="h-4 w-4" /> Predições recentes ({userDetails?.predictions.length || 0})</h4>
                <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {(!userDetails?.predictions.length) && <p className="p-3 text-xs text-muted-foreground">Sem predições.</p>}
                  {userDetails?.predictions.map((p: any) => (
                    <div key={p.id} className="p-2 flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className={RISK_COLOR[p.risk_level] || ''}>{p.risk_level}</Badge>
                        <span className="font-mono text-xs">{Number(p.fraud_score).toFixed(3)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Ações automáticas ({userDetails?.actions.length || 0})</h4>
                <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {(!userDetails?.actions.length) && <p className="p-3 text-xs text-muted-foreground">Nenhuma ação executada.</p>}
                  {userDetails?.actions.map((a: any) => (
                    <div key={a.id} className="p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{String(a.action_type).replace(/_/g, ' ')}</span>
                        <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      {a.reason && <div className="text-xs text-muted-foreground mt-0.5">{a.reason}</div>}
                    </div>
                  ))}
                </div>
              </section>

              {!!userDetails?.alerts.length && (
                <section>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Alertas ({userDetails.alerts.length})</h4>
                  <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                    {userDetails.alerts.map((a: any) => (
                      <div key={a.id} className="p-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge className={SEV_COLOR[a.severity] || ''}>{a.severity}</Badge>
                          <span className="text-xs text-muted-foreground">{a.alert_type}</span>
                        </div>
                        <div className="font-medium mt-0.5">{a.title}</div>
                        {a.message && <div className="text-xs text-muted-foreground">{a.message}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, loading, highlight }: { label: string; value: any; loading?: boolean; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-destructive' : ''}>
      <CardContent className="pt-4 pb-3">
        <div className="text-muted-foreground text-xs">{label}</div>
        {loading ? <Skeleton className="h-7 w-20 mt-2" /> : <div className="text-xl font-bold mt-1">{value}</div>}
      </CardContent>
    </Card>
  );
}
