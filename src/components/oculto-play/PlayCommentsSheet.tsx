/**
 * PlayCommentsSheet — Etapa 12
 *
 * Sheet/Dialog de comentários de um item do OCULTO PLAY.
 * - Lista paginada (limit 50), input com 500 chars, autor enriquecido.
 * - Autor do comentário pode apagar; Master pode ocultar/restaurar/apagar.
 */
import { useState } from 'react';
import { Loader2, Send, Trash2, EyeOff, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useOcultoPlayComments, useOcultoPlayCommentActions } from '@/hooks/useOcultoPlayComments';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { cn } from '@/lib/utils';

interface Props {
  itemId: string | null;
  open: boolean;
  onClose: () => void;
}

export function PlayCommentsSheet({ itemId, open, onClose }: Props) {
  const { data, isLoading } = useOcultoPlayComments(open ? itemId : null);
  const { add, remove, moderate } = useOcultoPlayCommentActions(itemId);
  const { data: isMaster } = useIsMasterAdmin();
  const [text, setText] = useState('');

  const handleSend = async () => {
    const body = text.trim();
    if (!body) return;
    try {
      await add.mutateAsync(body);
      setText('');
      if (itemId) {
        window.dispatchEvent(new CustomEvent('oculto-play:comment-added', { detail: { id: itemId } }));
      }
    } catch { /* noop */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-md max-h-[80vh] flex flex-col"
        overlayClassName="!z-[2147482099]"
        style={{ zIndex: 2147482100 }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            Comentários {data ? `(${data.filter((c) => !c.is_hidden).length})` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">
              Sem comentários ainda. Seja o primeiro.
            </p>
          ) : (
            data.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'flex gap-2 items-start text-xs rounded-lg p-2',
                  c.is_hidden && 'opacity-60 bg-rose-500/5 border border-rose-500/20',
                )}
              >
                {c.author_avatar_url ? (
                  <img
                    src={c.author_avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {c.author_display_name || `@${c.author_username ?? 'user'}`}
                    {c.is_hidden && (
                      <span className="ml-2 text-[9px] uppercase text-rose-300">oculto</span>
                    )}
                  </p>
                  <p className="text-foreground/90 break-words whitespace-pre-wrap">{c.body}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {c.mine && (
                    <button
                      onClick={() => remove.mutate(c.id)}
                      title="Apagar"
                      className="text-muted-foreground hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isMaster && !c.mine && (
                    <>
                      {c.is_hidden ? (
                        <button
                          onClick={() => moderate.mutate({ commentId: c.id, action: 'restore' })}
                          title="Restaurar"
                          className="text-muted-foreground hover:text-emerald-400"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => moderate.mutate({ commentId: c.id, action: 'hide' })}
                          title="Ocultar"
                          className="text-muted-foreground hover:text-amber-400"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => moderate.mutate({ commentId: c.id, action: 'delete' })}
                        title="Apagar"
                        className="text-muted-foreground hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border/40 pt-2 flex gap-2 items-end">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="Escreva um comentário…"
            rows={2}
            className="resize-none text-xs"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={add.isPending || !text.trim()}
            className="bg-gradient-to-r from-fuchsia-500 to-primary"
          >
            {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-right">{text.length}/500</p>
      </DialogContent>
    </Dialog>
  );
}
