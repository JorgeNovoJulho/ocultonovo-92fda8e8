import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Layers, Loader2, BarChart3, Settings2, RefreshCw, Sparkles, Save, RotateCcw } from 'lucide-react';
import { AdminViewModeMetricsPanel } from '@/components/admin/AdminViewModeMetricsPanel';
import { FEED_MODES, FEED_WIDGET_LABELS, type FeedModeId, type FeedWidgetKey } from '@/feed-modes/modes.config';

type WidgetMap = Partial<Record<FeedWidgetKey, boolean>>;

interface Row {
  mode_id: string;
  label: string;
  description: string | null;
  enabled: boolean;
  min_plan: 'free' | 'premium' | 'vip';
  sort_order: number;
  widgets: WidgetMap | null;
}

interface Metrics {
  days: number;
  total_users: number;
  active_users: number;
  distribution: Record<string, number>;
  switches: Record<string, number>;
  by_source: Record<string, number>;
  daily: { day: string; count: number }[];
}

const MODE_COLORS: Record<string, string> = {
  completo:   'hsl(var(--primary))',
  social:     'hsl(280 70% 60%)',
  descoberta: 'hsl(180 70% 50%)',
  limpo:      'hsl(var(--muted-foreground))',
  card:       'hsl(40 90% 55%)',
};

function DistributionBar({ data, total }: { data: Record<string, number>; total: number }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (total === 0) return <div className="text-xs text-muted-foreground">Sem dados.</div>;
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/50">
        {entries.map(([mode, count]) => {
          const pct = (count / total) * 100;
          return (
            <div
              key={mode}
              style={{ width: `${pct}%`, background: MODE_COLORS[mode] ?? 'hsl(var(--muted))' }}
              title={`${mode}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs">
        {entries.map(([mode, count]) => (
          <div key={mode} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MODE_COLORS[mode] ?? 'hsl(var(--muted))' }} />
            <span className="font-mono">{mode}</span>
            <span className="text-muted-foreground ml-auto">
              {count} · {((count / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailySparkline({ daily }: { daily: { day: string; count: number }[] }) {
  if (daily.length === 0) {
    return <div className="text-xs text-muted-foreground">Sem trocas no período.</div>;
  }
  const max = Math.max(...daily.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {daily.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
          <div
            className="w-full rounded-sm bg-primary/60"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: 2 }}
          />
          <span className="text-[8px] text-muted-foreground">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function MetricsPanel() {
  const [days, setDays] = useState(7);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (d: number) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('feed_mode_metrics', { p_days: d });
    setLoading(false);
    if (error) {
      toast.error('Erro ao carregar métricas');
      return;
    }
    setMetrics(data as Metrics);
  };

  useEffect(() => { load(days); }, [days]);

  const totalDist = metrics ? Object.values(metrics.distribution).reduce((a, b) => a + b, 0) : 0;
  const totalSwitches = metrics ? Object.values(metrics.switches).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24h</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => load(days)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading && !metrics ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Usuários totais</div>
              <div className="text-2xl font-bold">{metrics.total_users}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Trocaram modo ({days}d)</div>
              <div className="text-2xl font-bold">{metrics.active_users}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total de trocas</div>
              <div className="text-2xl font-bold">{totalSwitches}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Taxa de adoção</div>
              <div className="text-2xl font-bold">
                {metrics.total_users > 0
                  ? `${((metrics.active_users / metrics.total_users) * 100).toFixed(1)}%`
                  : '—'}
              </div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Distribuição atual (todos os usuários)</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBar data={metrics.distribution} total={totalDist} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Trocas por destino · {days}d</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBar data={metrics.switches} total={totalSwitches} />
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Origem das trocas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 text-xs">
                  {Object.entries(metrics.by_source).length === 0 ? (
                    <div className="text-muted-foreground">Sem dados.</div>
                  ) : (
                    Object.entries(metrics.by_source)
                      .sort((a, b) => b[1] - a[1])
                      .map(([src, n]) => (
                        <div key={src} className="flex justify-between">
                          <span className="font-mono">{src}</span>
                          <span className="text-muted-foreground">
                            {n} · {((n / totalSwitches) * 100 || 0).toFixed(1)}%
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Trocas por dia</CardTitle>
              </CardHeader>
              <CardContent>
                <DailySparkline daily={metrics.daily} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function defaultsForMode(modeId: string): WidgetMap {
  const set = FEED_MODES[modeId as FeedModeId];
  if (!set) return {};
  const out: WidgetMap = {};
  for (const k of Object.keys(FEED_WIDGET_LABELS) as FeedWidgetKey[]) {
    out[k] = set.has(k);
  }
  return out;
}

function WidgetsEditor({
  modeId,
  initial,
  saving,
  onSave,
}: {
  modeId: string;
  initial: WidgetMap | null;
  saving: boolean;
  onSave: (next: WidgetMap) => Promise<void> | void;
}) {
  const baseDefaults = useMemo(() => defaultsForMode(modeId), [modeId]);
  const effective = useMemo<WidgetMap>(() => {
    return { ...baseDefaults, ...(initial ?? {}) };
  }, [baseDefaults, initial]);

  const [draft, setDraft] = useState<WidgetMap>(effective);
  useEffect(() => { setDraft(effective); }, [effective]);

  const dirty = useMemo(
    () => (Object.keys(FEED_WIDGET_LABELS) as FeedWidgetKey[]).some((k) => !!draft[k] !== !!effective[k]),
    [draft, effective],
  );

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium text-foreground/80">
          Itens visíveis neste modo
          <span className="ml-2 text-[10px] text-muted-foreground">
            ({(Object.keys(FEED_WIDGET_LABELS) as FeedWidgetKey[]).filter((k) => draft[k]).length}/
            {Object.keys(FEED_WIDGET_LABELS).length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={() => setDraft(baseDefaults)}
            disabled={saving}
          >
            <RotateCcw className="h-3 w-3" /> Restaurar padrão
          </Button>
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() => onSave(draft)}
            disabled={!dirty || saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {(Object.keys(FEED_WIDGET_LABELS) as FeedWidgetKey[]).map((k) => {
          const meta = FEED_WIDGET_LABELS[k];
          return (
            <label
              key={k}
              className="flex items-start gap-2 rounded-md border border-border/40 bg-background/40 p-2 cursor-pointer hover:border-border/80 transition-colors"
            >
              <Switch
                checked={!!draft[k]}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium leading-tight">{meta.label}</div>
                <div className="text-[10px] text-muted-foreground leading-tight truncate">{meta.description}</div>
              </div>
            </label>
          );
        })}
      </div>
      {dirty && (
        <div className="mt-2 text-[10px] text-amber-400/90">
          Alterações pendentes — clique em Salvar para aplicar no feed em tempo real.
        </div>
      )}
    </div>
  );
}

function ConfigPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingWidgetsId, setSavingWidgetsId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('oculto_feed_modes_config')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) toast.error('Erro ao carregar modos');
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: Partial<Row>) => {
    setSavingId(id);
    const { error } = await supabase
      .from('oculto_feed_modes_config')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('mode_id', id);
    setSavingId(null);
    if (error) {
      toast.error('Falha ao salvar');
      return;
    }
    setRows((r) => r.map((x) => (x.mode_id === id ? { ...x, ...patch } : x)));
    toast.success('Modo atualizado');
  };

  const saveWidgets = async (id: string, widgets: WidgetMap) => {
    setSavingWidgetsId(id);
    const { error } = await supabase
      .from('oculto_feed_modes_config')
      .update({ widgets, updated_at: new Date().toISOString() })
      .eq('mode_id', id);
    setSavingWidgetsId(null);
    if (error) {
      toast.error('Falha ao salvar itens', { description: error.message });
      return;
    }
    setRows((r) => r.map((x) => (x.mode_id === id ? { ...x, widgets } : x)));
    toast.success('Itens aplicados ao feed em tempo real');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.mode_id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">{row.mode_id}</span>
                <span>{row.label}</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                {savingId === row.mode_id && <Loader2 className="h-3 w-3 animate-spin" />}
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(v) => update(row.mode_id, { enabled: v })}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Rótulo exibido</label>
                <Input
                  value={row.label}
                  onChange={(e) => setRows((r) => r.map((x) => x.mode_id === row.mode_id ? { ...x, label: e.target.value } : x))}
                  onBlur={(e) => update(row.mode_id, { label: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Plano mínimo</label>
                <Select
                  value={row.min_plan}
                  onValueChange={(v: Row['min_plan']) => update(row.mode_id, { min_plan: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Descrição</label>
              <Input
                value={row.description ?? ''}
                onChange={(e) => setRows((r) => r.map((x) => x.mode_id === row.mode_id ? { ...x, description: e.target.value } : x))}
                onBlur={(e) => update(row.mode_id, { description: e.target.value })}
              />
            </div>
            {row.mode_id !== 'personalizado' && (
              <WidgetsEditor
                modeId={row.mode_id}
                initial={row.widgets ?? null}
                saving={savingWidgetsId === row.mode_id}
                onSave={(next) => saveWidgets(row.mode_id, next)}
              />
            )}
          </CardContent>
        </Card>
      ))}
      <div className="text-xs text-muted-foreground border-t pt-4">
        Desativar um modo o esconde imediatamente do seletor de todos os usuários (via Realtime).
        Itens marcados/desmarcados em cada modo refletem no feed em tempo real após Salvar.
      </div>
    </div>
  );
}

export default function AdminFeedModesPage() {
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Layers className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Modos de Visualização do Feed</h1>
          <p className="text-sm text-muted-foreground">
            Configure modos disponíveis e acompanhe a adoção pelos usuários.
          </p>
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Configuração
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Métricas
          </TabsTrigger>
          <TabsTrigger value="granular" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Modos Granulares
          </TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-4">
          <ConfigPanel />
        </TabsContent>
        <TabsContent value="metrics" className="mt-4">
          <MetricsPanel />
        </TabsContent>
        <TabsContent value="granular" className="mt-4">
          <AdminViewModeMetricsPanel days={30} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
