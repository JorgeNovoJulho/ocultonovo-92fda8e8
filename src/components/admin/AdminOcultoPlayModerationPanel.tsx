/**
 * AdminOcultoPlayModerationPanel — Etapa 5.
 *
 * Fila de denúncias do OCULTO PLAY (apenas Master). Permite descartar,
 * despublicar (remove) ou apagar (remove_purge). Todas as ações chamam
 * `oculto_play_review_report` (RPC) — nada é mutado direto na tabela.
 */
import { useState } from 'react';
import { Loader2, ShieldAlert, Eye, EyeOff, Trash2, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useOcultoPlayPendingReports,
  useOcultoPlayReviewReport,
  type OcultoPlayReportRow,
  type OcultoPlayReviewAction,
} from '@/hooks/useOcultoPlayModeration';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_TABS = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'dismissed', label: 'Descartadas' },
  { id: 'removed', label: 'Removidas' },
  { id: 'all', label: 'Todas' },
] as const;

export function AdminOcultoPlayModerationPanel() {
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]['id']>('pending');
  const { data, isLoading, refetch, isRefetching } = useOcultoPlayPendingReports(status);
  const review = useOcultoPlayReviewReport();

  const handle = async (row: OcultoPlayReportRow, action: OcultoPlayReviewAction) => {
    if (action === 'remove_purge' && !confirm('Apagar o conteúdo definitivamente?')) return;
    try {
      await review.mutateAsync({ reportId: row.report_id, action });
      const msg =
        action === 'dismiss' ? 'Denúncia descartada'
        : action === 'remove' ? 'Conteúdo despublicado'
        : 'Conteúdo apagado';
      toast.success(msg);
    } catch (e: any) {
      toast.error('Falhou: ' + (e?.message ?? 'erro'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <ShieldAlert className="h-6 w-6 mx-auto mb-2 opacity-50" />
            Nenhuma denúncia nessa categoria.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <Card key={row.report_id} className="overflow-hidden">
              <CardContent className="p-3 flex gap-3">
                {/* Thumb */}
                <div className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-black/40 border border-border/40">
                  {row.item_thumb_url || row.item_media_url ? (
                    <img
                      src={row.item_thumb_url || row.item_media_url || ''}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted-foreground text-[10px]">
                      sem mídia
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{row.item_kind ?? '—'}</Badge>
                    {row.item_visibility && (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {row.item_visibility}
                      </Badge>
                    )}
                    {row.item_is_published === false && (
                      <Badge variant="destructive" className="text-[10px]">despublicado</Badge>
                    )}
                    <Badge className="text-[10px]" variant="outline">
                      {row.item_report_count ?? 0} denúncia(s)
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(row.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {row.item_title && (
                    <p className="text-sm font-medium line-clamp-1">{row.item_title}</p>
                  )}
                  {row.item_caption && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{row.item_caption}</p>
                  )}

                  <div className="text-[11px] text-muted-foreground">
                    Autor:{' '}
                    <strong className="text-foreground">
                      @{row.author_username ?? '—'}
                    </strong>
                    {row.author_display_name && ` (${row.author_display_name})`}
                  </div>

                  <div className="rounded-md bg-amber-500/5 border border-amber-500/30 p-2 text-xs">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ShieldAlert className="h-3 w-3 text-amber-500" />
                      <span className="font-semibold">{row.reason || 'sem motivo'}</span>
                      <span className="text-muted-foreground ml-auto">
                        por @{row.reporter_username ?? row.reporter_id.slice(0, 6)}
                      </span>
                    </div>
                    {row.details && <p className="text-muted-foreground">{row.details}</p>}
                  </div>

                  {row.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handle(row, 'dismiss')}
                        disabled={review.isPending}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Descartar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handle(row, 'remove')}
                        disabled={review.isPending}
                      >
                        {row.item_is_published ? (
                          <EyeOff className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 mr-1" />
                        )}
                        Despublicar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handle(row, 'remove_purge')}
                        disabled={review.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
