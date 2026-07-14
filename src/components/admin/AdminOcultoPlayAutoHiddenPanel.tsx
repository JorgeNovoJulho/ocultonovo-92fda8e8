/**
 * AdminOcultoPlayAutoHiddenPanel — Etapa 10.
 *
 * Mostra itens do PLAY que foram automaticamente ocultos por volume de
 * denúncias. Master decide: restaurar, manter oculto ou apagar.
 */
import { Loader2, ShieldAlert, RotateCcw, EyeOff, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useOcultoPlayAutoHidden,
  useOcultoPlayAutoHiddenDecide,
  type OcultoPlayAutoHiddenRow,
  type OcultoPlayAutoHiddenAction,
} from '@/hooks/useOcultoPlayAutoModeration';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function AdminOcultoPlayAutoHiddenPanel() {
  const { data, isLoading, refetch, isRefetching } = useOcultoPlayAutoHidden();
  const decide = useOcultoPlayAutoHiddenDecide();

  const handle = async (row: OcultoPlayAutoHiddenRow, action: OcultoPlayAutoHiddenAction) => {
    if (action === 'purge' && !confirm('Apagar definitivamente este conteúdo?')) return;
    try {
      await decide.mutateAsync({ itemId: row.item_id, action });
      toast.success(
        action === 'restore' ? 'Conteúdo restaurado'
        : action === 'keep_hidden' ? 'Conteúdo mantido oculto'
        : 'Conteúdo apagado'
      );
    } catch (e: any) {
      toast.error('Falhou: ' + (e?.message ?? 'erro'));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-4 pb-3 flex gap-3 text-sm">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-muted-foreground">
            Itens auto-ocultados quando atingem <strong className="text-foreground">5+ denúncias pendentes</strong>.
            Nada é apagado automaticamente — você decide.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} item(ns) aguardando revisão
        </p>
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
            Nenhum item auto-oculto no momento.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <Card key={row.item_id} className="overflow-hidden border-amber-500/20">
              <CardContent className="p-3 flex gap-3">
                <div className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-black/40 border border-border/40">
                  {row.thumb_url || row.media_url ? (
                    <img
                      src={row.thumb_url || row.media_url || ''}
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

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{row.kind}</Badge>
                    {row.visibility && (
                      <Badge variant="secondary" className="text-[10px] uppercase">{row.visibility}</Badge>
                    )}
                    <Badge variant="destructive" className="text-[10px]">
                      auto-oculto
                    </Badge>
                    <Badge className="text-[10px]" variant="outline">
                      {row.pending_reports} pendente(s)
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(row.auto_hidden_at).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {row.title && <p className="text-sm font-medium line-clamp-1">{row.title}</p>}
                  {row.caption && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{row.caption}</p>
                  )}

                  <div className="text-[11px] text-muted-foreground">
                    Autor: <strong className="text-foreground">@{row.author_username ?? '—'}</strong>
                    {row.author_display_name && ` (${row.author_display_name})`}
                    {' · '}
                    motivo: <span className="text-foreground">{row.auto_hidden_reason ?? '—'}</span>
                    {' · '}
                    snapshot: <span className="text-foreground">{row.auto_hidden_count ?? 0}</span>
                  </div>

                  <div className="flex gap-2 pt-1 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handle(row, 'restore')}
                      disabled={decide.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handle(row, 'keep_hidden')}
                      disabled={decide.isPending}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1" /> Manter oculto
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handle(row, 'purge')}
                      disabled={decide.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Apagar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
