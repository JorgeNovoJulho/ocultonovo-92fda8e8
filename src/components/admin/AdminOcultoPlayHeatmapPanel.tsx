/**
 * AdminOcultoPlayHeatmapPanel — Etapa 20.
 * Heatmap 7x24 (dia da semana x hora) com 2 modos:
 *  - "Audiência ativa": views por hora/dia (oculto_play_admin_heatmap)
 *  - "Melhor para publicar": views médias por item publicado naquela janela
 *    (oculto_play_admin_publish_heatmap)
 *
 * Timezone: America/Sao_Paulo (RPC).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Clock, TrendingUp, Activity, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportToCSV, type ExportColumn } from '@/lib/exportUtils';

type WindowDays = 7 | 14 | 30 | 60;
type Mode = 'audience' | 'publish';

interface AudienceRow {
  dow: number; hour: number;
  views_total: number;
  unique_viewers: number;
  avg_watch_seconds: number;
  avg_completion: number;
}
interface PublishRow {
  dow: number; hour: number;
  items_published: number;
  views_per_item: number;
}

const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function buildMatrix<T extends { dow: number; hour: number }>(
  rows: T[],
  valueKey: keyof T,
): { matrix: number[][]; max: number } {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const r of rows ?? []) {
    const v = Number(r[valueKey] ?? 0);
    matrix[r.dow][r.hour] = v;
    if (v > max) max = v;
  }
  return { matrix, max };
}

function cellColor(v: number, max: number): string {
  if (!max || v <= 0) return 'bg-muted/40';
  const ratio = v / max;
  if (ratio > 0.85) return 'bg-primary/90';
  if (ratio > 0.65) return 'bg-primary/70';
  if (ratio > 0.45) return 'bg-primary/50';
  if (ratio > 0.25) return 'bg-primary/30';
  return 'bg-primary/15';
}

export function AdminOcultoPlayHeatmapPanel() {
  const [days, setDays] = useState<WindowDays>(30);
  const [mode, setMode] = useState<Mode>('audience');

  const audience = useQuery({
    queryKey: ['admin-play-heatmap-audience', days],
    enabled: mode === 'audience',
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'oculto_play_admin_heatmap' as never,
        { p_days: days } as never,
      );
      if (error) throw error;
      return (data ?? []) as AudienceRow[];
    },
  });

  const publish = useQuery({
    queryKey: ['admin-play-heatmap-publish', days],
    enabled: mode === 'publish',
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'oculto_play_admin_publish_heatmap' as never,
        { p_days: days } as never,
      );
      if (error) throw error;
      return (data ?? []) as PublishRow[];
    },
  });

  const loading =
    (mode === 'audience' && audience.isLoading) ||
    (mode === 'publish' && publish.isLoading);

  const { matrix, max, valueLabel } = useMemo(() => {
    if (mode === 'audience') {
      const { matrix, max } = buildMatrix(audience.data ?? [], 'views_total');
      return { matrix, max, valueLabel: 'views' };
    }
    const { matrix, max } = buildMatrix(publish.data ?? [], 'views_per_item');
    return { matrix, max, valueLabel: 'views/item' };
  }, [mode, audience.data, publish.data]);

  // Top 3 slots
  const topSlots = useMemo(() => {
    const flat: { dow: number; hour: number; v: number }[] = [];
    matrix.forEach((row, d) =>
      row.forEach((v, h) => { if (v > 0) flat.push({ dow: d, hour: h, v }); }),
    );
    return flat.sort((a, b) => b.v - a.v).slice(0, 3);
  }, [matrix]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Heatmap de melhor horário
              <Badge variant="outline" className="ml-1 text-[10px]">BR / SP</Badge>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5">
                <Button
                  size="sm" variant={mode === 'audience' ? 'default' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMode('audience')}
                >
                  <Activity className="h-3.5 w-3.5 mr-1" /> Audiência ativa
                </Button>
                <Button
                  size="sm" variant={mode === 'publish' ? 'default' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMode('publish')}
                >
                  <TrendingUp className="h-3.5 w-3.5 mr-1" /> Melhor p/ publicar
                </Button>
              </div>
              <div className="inline-flex rounded-md border p-0.5">
                {([7, 14, 30, 60] as WindowDays[]).map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={days === d ? 'default' : 'ghost'}
                    className="h-7 px-2 text-xs"
                    onClick={() => setDays(d)}
                  >
                    {d}d
                  </Button>
                ))}
              </div>
              <Button
                size="sm" variant="outline" className="h-7 px-2 text-xs"
                disabled={loading || max === 0}
                onClick={() => {
                  if (mode === 'audience') {
                    const cols: ExportColumn[] = [
                      { key: 'dow', label: 'Dia', formatter: (v) => DOW_LABEL[v] ?? v },
                      { key: 'hour', label: 'Hora' },
                      { key: 'views_total', label: 'Views' },
                      { key: 'unique_viewers', label: 'Únicos' },
                      { key: 'avg_watch_seconds', label: 'Watch médio (s)' },
                      { key: 'avg_completion', label: 'Completude', formatter: (v) => `${Math.round((v ?? 0) * 100)}%` },
                    ];
                    exportToCSV(audience.data ?? [], `oculto_play_heatmap_audiencia_${days}d`, cols);
                  } else {
                    const cols: ExportColumn[] = [
                      { key: 'dow', label: 'Dia', formatter: (v) => DOW_LABEL[v] ?? v },
                      { key: 'hour', label: 'Hora' },
                      { key: 'items_published', label: 'Itens publicados' },
                      { key: 'views_per_item', label: 'Views por item' },
                    ];
                    exportToCSV(publish.data ?? [], `oculto_play_heatmap_publicacao_${days}d`, cols);
                  }
                }}
              >
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === 'audience'
              ? 'Quando seus usuários mais consomem (views absolutas por hora/dia).'
              : 'Quando posts publicados nessa janela performaram melhor (views médias por item).'}
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : max === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Sem dados suficientes nesta janela.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                {/* Header de horas */}
                <div className="grid grid-cols-[40px_repeat(24,1fr)] gap-[2px] mb-1">
                  <div />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div
                      key={h}
                      className={cn(
                        'text-[9px] text-muted-foreground text-center',
                        h % 3 !== 0 && 'opacity-0',
                      )}
                    >
                      {h.toString().padStart(2, '0')}
                    </div>
                  ))}
                </div>
                {/* Linhas */}
                {matrix.map((row, d) => (
                  <div
                    key={d}
                    className="grid grid-cols-[40px_repeat(24,1fr)] gap-[2px] mb-[2px]"
                  >
                    <div className="text-[10px] text-muted-foreground flex items-center">
                      {DOW_LABEL[d]}
                    </div>
                    {row.map((v, h) => (
                      <div
                        key={h}
                        title={`${DOW_LABEL[d]} ${h.toString().padStart(2, '0')}h — ${v.toLocaleString('pt-BR')} ${valueLabel}`}
                        className={cn(
                          'h-6 rounded-sm transition-transform hover:scale-110 cursor-help',
                          cellColor(v, max),
                        )}
                      />
                    ))}
                  </div>
                ))}
                {/* Legenda */}
                <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                  <span>menos</span>
                  <div className="h-3 w-4 rounded-sm bg-muted/40" />
                  <div className="h-3 w-4 rounded-sm bg-primary/15" />
                  <div className="h-3 w-4 rounded-sm bg-primary/30" />
                  <div className="h-3 w-4 rounded-sm bg-primary/50" />
                  <div className="h-3 w-4 rounded-sm bg-primary/70" />
                  <div className="h-3 w-4 rounded-sm bg-primary/90" />
                  <span>mais</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {topSlots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Top 3 janelas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topSlots.map((s, i) => (
              <div
                key={`${s.dow}-${s.hour}`}
                className="rounded-lg border p-3 bg-card"
              >
                <p className="text-xs text-muted-foreground">#{i + 1}</p>
                <p className="text-lg font-bold">
                  {DOW_LABEL[s.dow]} · {s.hour.toString().padStart(2, '0')}h
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {s.v.toLocaleString('pt-BR')} {valueLabel}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
