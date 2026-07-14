import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, Play, RefreshCw, Activity } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const RISK_COLOR: Record<string, string> = {
  low: 'bg-muted text-foreground',
  medium: 'bg-yellow-500/20 text-yellow-700',
  high: 'bg-orange-500/20 text-orange-700',
  critical: 'bg-destructive/20 text-destructive',
};

export default function AdminMLPage() {
  const qc = useQueryClient();
  const [days] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['ml-dashboard', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ml_dashboard' as any, { p_days: days });
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 60_000,
  });

  const runScore = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fn_ml_score_all_active' as any, { p_days: 30, p_limit: 2000 });
      if (error) throw error;
      return data;
    },
    onSuccess: (n: any) => {
      toast({ title: 'Scoring executado', description: `${n} usuários avaliados` });
      qc.invalidateQueries({ queryKey: ['ml-dashboard'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const retrain = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fn_ml_retrain' as any);
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast({ title: 'Modelo retreinado', description: `acc ${d?.accuracy ?? '-'} | f1 ${d?.f1 ?? '-'}` });
      qc.invalidateQueries({ queryKey: ['ml-dashboard'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const m = data?.metrics || {};
  const dist = data?.risk_distribution || {};
  const actions = data?.actions || {};
  const impact = data?.impact || {};
  const top = (data?.top_risk || []) as any[];

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold">ML Antifraude & Receita</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runScore.mutate()} disabled={runScore.isPending}>
            <Play className={`h-4 w-4 mr-2 ${runScore.isPending ? 'animate-pulse' : ''}`} /> Rodar scoring
          </Button>
          <Button onClick={() => retrain.mutate()} disabled={retrain.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${retrain.isPending ? 'animate-spin' : ''}`} /> Retreinar
          </Button>
        </div>
      </div>

      {/* Métricas modelo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Versão" value={m.model_version || 'v1'} loading={isLoading} />
        <Kpi label="Acurácia" value={m.accuracy != null ? `${(m.accuracy * 100).toFixed(1)}%` : '—'} loading={isLoading} highlight />
        <Kpi label="Precisão" value={m.precision != null ? `${(m.precision * 100).toFixed(1)}%` : '—'} loading={isLoading} />
        <Kpi label="Recall" value={m.recall != null ? `${(m.recall * 100).toFixed(1)}%` : '—'} loading={isLoading} />
        <Kpi label="F1" value={m.f1 != null ? m.f1.toString() : '—'} loading={isLoading} />
      </div>

      {/* Distribuição risco */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Distribuição de risco ({days}d)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {['critical', 'high', 'medium', 'low'].map((k) => (
            <div key={k} className="border rounded-lg px-4 py-3 min-w-[120px]">
              <div className="text-xs text-muted-foreground capitalize">{k}</div>
              <div className="text-2xl font-bold">{dist[k] || 0}</div>
            </div>
          ))}
          <div className="border rounded-lg px-4 py-3 min-w-[160px] border-primary">
            <div className="text-xs text-muted-foreground">Receita prevista</div>
            <div className="text-2xl font-bold">R$ {Number(impact.predicted_revenue_total || 0).toFixed(2)}</div>
          </div>
          <div className="border rounded-lg px-4 py-3 min-w-[160px]">
            <div className="text-xs text-muted-foreground">Ações automáticas</div>
            <div className="text-sm">block: {actions.block || 0} · limit: {actions.limit || 0} · upgrade: {actions.upgrade_suggest || 0}</div>
          </div>
        </CardContent>
      </Card>

      {/* Top usuários por risco */}
      <Card>
        <CardHeader><CardTitle>Top usuários por risco</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-32 w-full" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr><th className="py-2">Usuário</th><th className="text-right">Score</th><th>Risco</th><th className="text-right">Receita prevista 30d</th><th>Última previsão</th></tr>
                </thead>
                <tbody>
                  {top.slice(0, 30).map((u, i) => (
                    <tr key={u.user_id + i} className="border-b">
                      <td className="py-2">{u.name}</td>
                      <td className="text-right font-mono">{Number(u.fraud_score).toFixed(3)}</td>
                      <td><Badge className={RISK_COLOR[u.risk_level] || ''}>{u.risk_level}</Badge></td>
                      <td className="text-right">R$ {Number(u.revenue_pred_30d).toFixed(2)}</td>
                      <td className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                  {!top.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem previsões. Rode o scoring.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {m.trained_at && (
        <p className="text-xs text-muted-foreground">Último treino: {new Date(m.trained_at).toLocaleString('pt-BR')} · amostra {m.sample_size}</p>
      )}
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
