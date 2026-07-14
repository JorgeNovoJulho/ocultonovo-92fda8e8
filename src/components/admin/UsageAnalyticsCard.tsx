/**
 * UsageAnalyticsCard — observabilidade de rate-limit.
 * Lê v_usage_stats_24h (admin-visible via RLS já restritiva nas tabelas-fonte).
 */
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabaseExternal';

type Row = { feature: string; plan: 'free'|'premium'|'vip'|string; unique_users: number; total_actions: number; last_seen: string };

const PLAN_COLOR: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  premium: 'bg-primary/15 text-primary',
  vip: 'bg-amber-500/15 text-amber-500',
};

export function UsageAnalyticsCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('v_usage_stats_24h')
      .select('*')
      .order('total_actions', { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { void load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, []);

  // Group by feature
  const byFeature = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.feature] ||= []).push(r);
    return acc;
  }, {});

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Uso & Rate-Limit (últimas 24h)
        </CardTitle>
        <CardDescription>
          Quantas ações cada plano consumiu por feature nas últimas 24 horas. Atualiza a cada 30s.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : error ? (
          <div className="text-sm text-destructive">Erro: {error}</div>
        ) : Object.keys(byFeature).length === 0 ? (
          <div className="text-sm text-muted-foreground">Sem registros nas últimas 24h.</div>
        ) : (
          <div className="space-y-3">
            {Object.entries(byFeature).map(([feature, items]) => {
              const total = items.reduce((s, x) => s + Number(x.total_actions || 0), 0);
              return (
                <div key={feature} className="rounded-md border border-border/50 px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium">{feature}</div>
                    <div className="text-xs text-muted-foreground">{total} ações</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((r) => (
                      <Badge key={`${feature}-${r.plan}`} variant="outline" className={`gap-2 ${PLAN_COLOR[r.plan] ?? ''}`}>
                        <span className="capitalize">{r.plan}</span>
                        <span className="opacity-70">·</span>
                        <span>{r.total_actions}</span>
                        <span className="opacity-50 text-[10px]">({r.unique_users}u)</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
