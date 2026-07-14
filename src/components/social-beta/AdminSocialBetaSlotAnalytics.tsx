/**
 * Admin — Social Beta · Analytics por Slot
 * Mostra eventos granulares (clicks, dwell, ações) por sub-área.
 * Master-only via RPC social_beta_slot_analytics.
 *
 * Inclui:
 *  - Filtros de período (24h/7d/30d/total)
 *  - CSV export
 *  - Drilldown por usuário (top usuários) + timeline diária (sparkline)
 */
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Loader2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type Row = {
  slot: string;
  event: string;
  count_total: number;
  count_24h: number;
  count_7d: number;
  count_30d: number;
  unique_users_30d: number;
  avg_seconds_30d: number | null;
  last_event: string | null;
};

type Period = '24h' | '7d' | '30d' | 'total';
const PERIODS: { id: Period; label: string; field: keyof Row; days: number }[] = [
  { id: '24h', label: '24h', field: 'count_24h', days: 1 },
  { id: '7d', label: '7 dias', field: 'count_7d', days: 7 },
  { id: '30d', label: '30 dias', field: 'count_30d', days: 30 },
  { id: 'total', label: 'Total', field: 'count_total', days: 90 },
];

type DrillUser = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  event_count: number;
  last_event: string;
};

type TimelinePoint = { day: string; count_total: number };

export function AdminSocialBetaSlotAnalytics() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>('7d');

  const [drillKey, setDrillKey] = useState<{ slot: string; event: string } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillUsers, setDrillUsers] = useState<DrillUser[]>([]);
  const [drillTimeline, setDrillTimeline] = useState<TimelinePoint[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('social_beta_slot_analytics');
    if (!error && Array.isArray(data)) setRows(data as Row[]);
    else if (error) toast({ title: 'Analytics indisponível', description: error.message, variant: 'destructive' });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const periodMeta = useMemo(
    () => PERIODS.find((p) => p.id === period) ?? PERIODS[1],
    [period],
  );
  const periodField = periodMeta.field;

  const grouped = useMemo(() => {
    const g: Record<string, Row[]> = {};
    for (const r of rows) {
      const v = (r[periodField] as number) ?? 0;
      if (period !== 'total' && v === 0) continue;
      (g[r.slot] ||= []).push(r);
    }
    for (const slot of Object.keys(g)) {
      g[slot].sort((a, b) => ((b[periodField] as number) ?? 0) - ((a[periodField] as number) ?? 0));
    }
    return g;
  }, [rows, periodField, period]);

  const totalsBySlot = useMemo(() => {
    const t: Record<string, number> = {};
    for (const [slot, list] of Object.entries(grouped)) {
      t[slot] = list.reduce((s, r) => s + ((r[periodField] as number) ?? 0), 0);
    }
    return t;
  }, [grouped, periodField]);

  // ── CSV export ─────────────────────────────────────────────
  const exportCsv = () => {
    const flat = Object.entries(grouped).flatMap(([slot, list]) =>
      list.map((r) => ({
        slot,
        event: r.event,
        period: periodMeta.label,
        count_period: (r[periodField] as number) ?? 0,
        count_total: r.count_total,
        unique_users_30d: r.unique_users_30d,
        avg_seconds_30d: r.avg_seconds_30d ?? '',
        last_event: r.last_event ?? '',
      })),
    );
    if (flat.length === 0) {
      toast({ title: 'Nada para exportar', description: 'Sem eventos no período selecionado.' });
      return;
    }
    const headers = Object.keys(flat[0]);
    const escape = (v: any) => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...flat.map((r) => headers.map((h) => escape((r as any)[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `social-beta-analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Drilldown ──────────────────────────────────────────────
  const openDrill = async (slot: string, event: string) => {
    setDrillKey({ slot, event });
    setDrillLoading(true);
    setDrillUsers([]);
    setDrillTimeline([]);
    try {
      const [usersRes, tlRes] = await Promise.all([
        (supabase as any).rpc('social_beta_slot_event_users', {
          _slot: slot, _event: event, _days: periodMeta.days, _limit: 25,
        }),
        (supabase as any).rpc('social_beta_slot_event_timeline', {
          _slot: slot, _event: event, _days: Math.min(periodMeta.days, 30),
        }),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (tlRes.error) throw tlRes.error;
      setDrillUsers((usersRes.data || []) as DrillUser[]);
      setDrillTimeline((tlRes.data || []) as TimelinePoint[]);
    } catch (e: any) {
      toast({ title: 'Drilldown indisponível', description: e?.message, variant: 'destructive' });
    } finally {
      setDrillLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Analytics por slot (eventos granulares)
        </Label>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1 text-xs rounded ${
                  period === p.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading || rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Atualizar'}
          </Button>
        </div>
      </div>

      {rows.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground">
          Sem eventos ainda. Eles aparecem conforme usuários liberados navegam pelas sub-áreas.
        </p>
      )}

      {rows.length > 0 && Object.keys(grouped).length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum evento neste período.</p>
      )}

      <div className="space-y-4">
        {Object.entries(grouped).map(([slot, list]) => (
          <div key={slot} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{slot}</p>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {totalsBySlot[slot]} evento(s) · {periodMeta.label}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1.5">Evento</th>
                    <th className="text-right py-1.5">{periodMeta.label}</th>
                    <th className="text-right py-1.5">Users 30d</th>
                    <th className="text-right py-1.5">Avg dwell</th>
                    <th className="text-right py-1.5">Último</th>
                    <th className="text-right py-1.5 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={`${r.slot}:${r.event}`}
                      className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => openDrill(r.slot, r.event)}
                      title="Ver usuários e timeline"
                    >
                      <td className="py-1.5 font-mono">{r.event}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">{(r[periodField] as number) ?? 0}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.unique_users_30d}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {r.avg_seconds_30d != null ? `${r.avg_seconds_30d}s` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-[10px] text-muted-foreground">
                        {r.last_event ? new Date(r.last_event).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="py-1.5 text-right">
                        <Users className="inline h-3.5 w-3.5 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* ── Drilldown dialog ─────────────────────────────────── */}
      <Dialog open={!!drillKey} onOpenChange={(o) => !o && setDrillKey(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {drillKey?.slot} · <span className="font-mono">{drillKey?.event}</span>
            </DialogTitle>
            <DialogDescription>
              Top usuários e timeline diária ({periodMeta.label}).
            </DialogDescription>
          </DialogHeader>

          {drillLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sparkline */}
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Timeline</p>
                <Sparkline points={drillTimeline} />
                {drillTimeline.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem dados no período.</p>
                )}
              </div>

              {/* Top users */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Top usuários ({drillUsers.length})
                </p>
                {drillUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum usuário no período.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border bg-background">
                    {drillUsers.map((u) => (
                      <li key={u.user_id} className="flex items-center gap-3 p-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatar_url ?? undefined} alt={u.display_name ?? ''} />
                          <AvatarFallback className="text-[10px]">
                            {(u.display_name || u.username || '?').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{u.display_name || u.username || u.user_id.slice(0, 8)}</p>
                          {u.username && (
                            <p className="text-[10px] text-muted-foreground truncate">@{u.username}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{u.event_count}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(u.last_event).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Inline SVG sparkline (sem dependências) ───────────────
function Sparkline({ points }: { points: TimelinePoint[] }) {
  if (points.length === 0) return null;
  const w = 480, h = 60, pad = 4;
  const max = Math.max(1, ...points.map((p) => p.count_total));
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const yFor = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * stepX} ${yFor(p.count_total)}`)
    .join(' ');
  const area = `${d} L ${pad + (points.length - 1) * stepX} ${h - pad} L ${pad} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14" preserveAspectRatio="none">
      <path d={area} fill="hsl(var(--primary) / 0.15)" />
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle
          key={p.day}
          cx={pad + i * stepX}
          cy={yFor(p.count_total)}
          r={1.6}
          fill="hsl(var(--primary))"
        >
          <title>{`${p.day}: ${p.count_total}`}</title>
        </circle>
      ))}
    </svg>
  );
}
