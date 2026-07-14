import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ShieldAlert, TrendingDown, Zap, Check, EyeOff, RefreshCw, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from '@/hooks/use-toast';

const fmt = (n: number) => `R$ ${(Number(n) || 0).toFixed(2)}`;

const SEVERITY: Record<string, string> = {
  low: 'bg-muted text-foreground',
  medium: 'bg-yellow-500/20 text-yellow-700',
  high: 'bg-orange-500/20 text-orange-700',
  critical: 'bg-destructive/20 text-destructive',
};

const ALERT_TYPES = ['revenue_drop', 'payment_failures', 'suspicious_withdrawal', 'affiliate_fraud', 'manual'];

export default function AdminFinancialIntelligencePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'ignored' | 'all'>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sevFilter, setSevFilter] = useState<string>('all');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState<string>(monthAgo);
  const [to, setTo] = useState<string>(today);
  const [competencia, setCompetencia] = useState<string>(today.slice(0, 7));

  const { data: alerts = [], isLoading: la } = useQuery({
    queryKey: ['fin-alerts', statusFilter, typeFilter, sevFilter, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financial_alerts' as any, {
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_type: typeFilter === 'all' ? null : typeFilter,
        p_severity: sevFilter === 'all' ? null : sevFilter,
        p_from: from ? new Date(from).toISOString() : null,
        p_to: to ? new Date(to + 'T23:59:59').toISOString() : null,
        p_limit: 200,
      });
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 30_000,
  });

  const { data: profit, isLoading: lp } = useQuery({
    queryKey: ['profit-overview', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profit_overview' as any, { p_from: from, p_to: to });
      if (error) throw error;
      return data as any;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ['fin-realtime-summary', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financial_realtime_summary' as any, {
        p_from: from ? new Date(from).toISOString() : null,
        p_to: to ? new Date(to + 'T23:59:59').toISOString() : null,
      });
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 15_000,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.rpc('set_alert_status' as any, { p_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fin-alerts'] }),
  });

  const runEngine = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_financial_alerts_engine' as any);
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast({ title: 'Engine executada', description: `${d?.inserted ?? 0} alertas gerados` });
      qc.invalidateQueries({ queryKey: ['fin-alerts'] });
      qc.invalidateQueries({ queryKey: ['fin-realtime-summary'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const exportCsv = async () => {
    const compDate = competencia + '-01';
    const { data, error } = await supabase.rpc('export_financial_monthly_csv' as any, { p_competencia: compDate });
    if (error) return toast({ title: 'Erro export', description: error.message, variant: 'destructive' });
    const blob = new Blob([data as string], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `financial_${competencia}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const sevCounts = summary?.by_severity || {};
  const featureChart = useMemo(
    () => (profit?.by_feature || []).map((f: any) => ({ feature: f.feature, profit: Number(f.profit || 0) })),
    [profit]
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold">Inteligência Financeira</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-40" />
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" /> CSV mensal</Button>
          <Button onClick={() => runEngine.mutate()} disabled={runEngine.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${runEngine.isPending ? 'animate-spin' : ''}`} />
            Rodar engine
          </Button>
        </div>
      </div>

      {/* Período */}
      <Card>
        <CardContent className="pt-4 flex gap-3 flex-wrap items-end">
          <div><label className="text-xs text-muted-foreground">De</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">Até</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>

      {/* Resumo realtime: severidade */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Alertas abertos" value={String(summary?.open_total ?? 0)} highlight />
        <Kpi label="Critical" value={String(sevCounts.critical ?? 0)} />
        <Kpi label="High" value={String(sevCounts.high ?? 0)} />
        <Kpi label="Medium" value={String(sevCounts.medium ?? 0)} />
        <Kpi label="Low" value={String(sevCounts.low ?? 0)} />
      </div>

      {/* KPIs profit */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Bruto" value={fmt(profit?.gross || 0)} loading={lp} />
        <Kpi label="Lucro Plataforma" value={fmt(profit?.platform_revenue || 0)} loading={lp} highlight />
        <Kpi label="Margem" value={`${profit?.margin_pct ?? 0}%`} loading={lp} />
        <Kpi label="Transações" value={String(profit?.tx_count || 0)} loading={lp} />
      </div>

      {/* Alertas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Alertas
              <Badge variant="secondary">{alerts.length}</Badge>
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Abertos</SelectItem>
                  <SelectItem value="resolved">Resolvidos</SelectItem>
                  <SelectItem value="ignored">Ignorados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {ALERT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sevFilter} onValueChange={setSevFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Severidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {la ? <Skeleton className="h-32 w-full" /> : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem alertas. ✅</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={SEVERITY[a.severity] || ''}>{a.severity}</Badge>
                      <span className="text-xs text-muted-foreground font-mono">{a.alert_type}</span>
                      {a.status !== 'open' && <Badge variant="outline">{a.status}</Badge>}
                      {a.ref_entity && <span className="text-xs text-muted-foreground">ref: {a.ref_entity.slice(0, 8)}</span>}
                    </div>
                    <div className="font-semibold mt-1">{a.title}</div>
                    <div className="text-sm text-muted-foreground">{a.message}</div>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                  {a.status === 'open' && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: a.id, status: 'resolved' })}>
                        <Check className="h-3 w-3 mr-1" /> Resolver
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: a.id, status: 'ignored' })}>
                        <EyeOff className="h-3 w-3 mr-1" /> Ignorar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Por feature */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Lucro por Feature</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {lp ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={featureChart}>
                <XAxis dataKey="feature" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Bar dataKey="profit" name="Lucro" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top usuários */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingDown className="h-5 w-5" /> Top Usuários por Lucro</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Usuário</th><th className="text-right">Tx</th><th className="text-right">Bruto</th><th className="text-right">Lucro</th></tr>
              </thead>
              <tbody>
                {(profit?.top_users || []).map((u: any) => (
                  <tr key={u.user_id} className="border-b">
                    <td className="py-2">{u.name || u.user_id?.slice(0, 8)}</td>
                    <td className="text-right">{u.tx}</td>
                    <td className="text-right">{fmt(u.gross)}</td>
                    <td className="text-right text-primary font-semibold">{fmt(u.profit)}</td>
                  </tr>
                ))}
                {!profit?.top_users?.length && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem dados</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, loading, highlight }: { label: string; value: string; loading?: boolean; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary' : ''}>
      <CardContent className="pt-4 pb-3">
        <div className="text-muted-foreground text-xs">{label}</div>
        {loading ? <Skeleton className="h-7 w-24 mt-2" /> : <div className="text-xl font-bold mt-1">{value}</div>}
      </CardContent>
    </Card>
  );
}
