/**
 * AdminOcultoPlayRetentionPanel — Etapa 19.
 * Painel admin (Master) com métricas de retenção por item e por kind.
 * Filtro de janela: 1, 7, 14, 30 dias.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, Eye, Users, Clock, CheckCircle2, Loader2, Flame, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportToCSV, type ExportColumn } from '@/lib/exportUtils';

type WindowDays = 1 | 7 | 14 | 30;

interface RetentionRow {
  item_id: string;
  title: string | null;
  kind: string;
  section: string;
  author_username: string | null;
  published_at: string;
  duration_sec: number | null;
  total_views: number;
  unique_viewers: number;
  avg_seconds: number;
  median_seconds: number;
  completion_rate: number;
  retention_score: number;
}

interface KindRow {
  kind: string;
  items_count: number;
  total_views: number;
  unique_viewers: number;
  avg_seconds: number;
  completion_rate: number;
}

const KIND_LABEL: Record<string, string> = {
  short_video: 'Vídeos',
  meme: 'Memes',
  audio: 'Áudios',
  vip_teaser: 'Teasers VIP',
  community_post: 'Comunidades',
  challenge: 'Desafios',
};

const pct = (n: number) => `${Math.round((n ?? 0) * 100)}%`;
const fmtSec = (n: number) => `${Math.round(n ?? 0)}s`;

export function AdminOcultoPlayRetentionPanel() {
  const [days, setDays] = useState<WindowDays>(7);

  const items = useQuery({
    queryKey: ['admin-play-retention', days],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_admin_retention', {
        p_days: days,
        p_limit: 50,
      });
      if (error) throw error;
      return (data ?? []) as RetentionRow[];
    },
  });

  const byKind = useQuery({
    queryKey: ['admin-play-retention-kind', days],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_admin_retention_by_kind', {
        p_days: days,
      });
      if (error) throw error;
      return (data ?? []) as KindRow[];
    },
  });

  const exportItems = () => {
    const cols: ExportColumn[] = [
      { key: 'title', label: 'Título' },
      { key: 'kind', label: 'Tipo', formatter: (v) => KIND_LABEL[v] ?? v },
      { key: 'section', label: 'Seção' },
      { key: 'author_username', label: 'Autor', formatter: (v) => v ? `@${v}` : '' },
      { key: 'published_at', label: 'Publicado em', formatter: (v) => v ? new Date(v).toLocaleString('pt-BR') : '' },
      { key: 'duration_sec', label: 'Duração (s)' },
      { key: 'total_views', label: 'Views' },
      { key: 'unique_viewers', label: 'Únicos' },
      { key: 'avg_seconds', label: 'Média (s)' },
      { key: 'median_seconds', label: 'Mediana (s)' },
      { key: 'completion_rate', label: 'Completude', formatter: (v) => `${Math.round((v ?? 0) * 100)}%` },
      { key: 'retention_score', label: 'Score', formatter: (v) => Number(v ?? 0).toFixed(2) },
    ];
    exportToCSV(items.data ?? [], `oculto_play_retencao_${days}d`, cols);
  };

  const exportKinds = () => {
    const cols: ExportColumn[] = [
      { key: 'kind', label: 'Tipo', formatter: (v) => KIND_LABEL[v] ?? v },
      { key: 'items_count', label: 'Itens' },
      { key: 'total_views', label: 'Views' },
      { key: 'unique_viewers', label: 'Únicos' },
      { key: 'avg_seconds', label: 'Média (s)' },
      { key: 'completion_rate', label: 'Completude', formatter: (v) => `${Math.round((v ?? 0) * 100)}%` },
    ];
    exportToCSV(byKind.data ?? [], `oculto_play_retencao_por_tipo_${days}d`, cols);
  };

  return (
    <div className="space-y-4">
      {/* Filtro de janela */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Janela:</span>
        {([1, 7, 14, 30] as WindowDays[]).map((d) => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? 'default' : 'outline'}
            onClick={() => setDays(d)}
            className="h-7 px-3 text-xs"
          >
            {d === 1 ? '24h' : `${d}d`}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button
            size="sm" variant="outline" className="h-7 px-2 text-xs"
            onClick={exportKinds}
            disabled={!byKind.data?.length}
          >
            <Download className="h-3 w-3 mr-1" /> CSV por tipo
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 px-2 text-xs"
            onClick={exportItems}
            disabled={!items.data?.length}
          >
            <Download className="h-3 w-3 mr-1" /> CSV itens
          </Button>
        </div>
      </div>

      {/* Por Kind */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Retenção por tipo de conteúdo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byKind.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (byKind.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sem dados no período selecionado.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {byKind.data!.map((k) => (
                <div
                  key={k.kind}
                  className="p-3 rounded-md border border-border/40 bg-muted/20 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {KIND_LABEL[k.kind] ?? k.kind}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                      {k.items_count} itens
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {k.total_views}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {k.unique_viewers}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {fmtSec(k.avg_seconds)}
                    </span>
                    <span
                      className={cn(
                        'flex items-center gap-1',
                        k.completion_rate >= 0.6 ? 'text-emerald-400' :
                        k.completion_rate >= 0.3 ? 'text-amber-400' : 'text-muted-foreground',
                      )}
                    >
                      <CheckCircle2 className="h-3 w-3" /> {pct(k.completion_rate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top itens */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-400" />
            Itens com maior retenção (top 50)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (items.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem itens publicados no período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-left px-2 py-2">Tipo</th>
                    <th className="text-right px-2 py-2">Views</th>
                    <th className="text-right px-2 py-2">Únicos</th>
                    <th className="text-right px-2 py-2">Média</th>
                    <th className="text-right px-2 py-2">Mediana</th>
                    <th className="text-right px-2 py-2">Compl.</th>
                    <th className="text-right px-3 py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {items.data!.map((r) => (
                    <tr
                      key={r.item_id}
                      className="border-t border-border/30 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 max-w-[200px]">
                        <div className="truncate font-medium">
                          {r.title || <span className="text-muted-foreground italic">Sem título</span>}
                        </div>
                        {r.author_username && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            @{r.author_username}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.total_views}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.unique_viewers}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtSec(r.avg_seconds)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmtSec(r.median_seconds)}</td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right tabular-nums',
                          r.completion_rate >= 0.6 ? 'text-emerald-400' :
                          r.completion_rate >= 0.3 ? 'text-amber-400' : 'text-muted-foreground',
                        )}
                      >
                        {pct(r.completion_rate)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-semibold tabular-nums',
                          r.retention_score >= 0.6 ? 'text-emerald-300' :
                          r.retention_score >= 0.3 ? 'text-amber-300' : 'text-muted-foreground',
                        )}
                      >
                        {r.retention_score.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
