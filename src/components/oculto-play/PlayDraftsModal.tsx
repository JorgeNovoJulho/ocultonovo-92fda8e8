/**
 * PlayDraftsModal — Etapa 13
 *
 * Lista os rascunhos e agendamentos do criador, permitindo:
 *  - Publicar agora
 *  - Reagendar (alterar data/hora)
 *  - Cancelar agendamento (volta a virar rascunho)
 *  - Apagar
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CalendarClock, Loader2, Send, Trash2, X, Image as ImageIcon, Video, Music, Pencil,
} from 'lucide-react';
import {
  useOcultoPlayDrafts, useOcultoPlayDraftActions, type OcultoPlayDraft,
} from '@/hooks/useOcultoPlayDrafts';
import { cn } from '@/lib/utils';

interface PlayDraftsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function toLocalInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function PlayDraftsModal({ open, onOpenChange }: PlayDraftsModalProps) {
  const { data, isLoading } = useOcultoPlayDrafts(open);
  const { publishNow, schedule, cancelSchedule, remove } = useOcultoPlayDraftActions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [whenStr, setWhenStr] = useState('');

  const kindIcon = (k: OcultoPlayDraft['kind']) => {
    if (k === 'short_video') return <Video className="h-3 w-3" />;
    if (k === 'audio') return <Music className="h-3 w-3" />;
    return <ImageIcon className="h-3 w-3" />;
  };

  const startEdit = (d: OcultoPlayDraft) => {
    setEditingId(d.id);
    setWhenStr(toLocalInput(d.scheduled_for));
  };

  const submitSchedule = async (id: string) => {
    if (!whenStr) return;
    const when = new Date(whenStr);
    if (isNaN(when.getTime()) || when <= new Date()) return;
    await schedule.mutateAsync({ itemId: id, when });
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-fuchsia-300" />
            Rascunhos & agendamentos do PLAY
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum rascunho ou agendamento.
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {data.map((d) => {
              const isScheduled = !!d.scheduled_for;
              const isEditing = editingId === d.id;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "rounded-lg border p-3 bg-muted/20",
                    isScheduled ? "border-fuchsia-500/40" : "border-border/60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {(d.thumb_url || d.media_url) ? (
                      <img
                        src={d.thumb_url || d.media_url!}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 rounded-md object-cover shrink-0 bg-black/30"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-md grid place-items-center bg-black/30 text-muted-foreground shrink-0">
                        {kindIcon(d.kind)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-card border border-border/60 flex items-center gap-1">
                          {kindIcon(d.kind)} {d.kind}
                        </span>
                        {isScheduled ? (
                          <span className="text-[10px] font-semibold text-fuchsia-300 flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" /> {formatDateTime(d.scheduled_for!)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Rascunho
                          </span>
                        )}
                      </div>
                      {d.title && <p className="text-sm font-medium mt-1 line-clamp-1">{d.title}</p>}
                      {d.caption && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.caption}</p>
                      )}
                      {d.schedule_error && (
                        <p className="text-[10px] text-destructive mt-1 line-clamp-2">{d.schedule_error}</p>
                      )}

                      {isEditing && (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            type="datetime-local"
                            value={whenStr}
                            onChange={(e) => setWhenStr(e.target.value)}
                            min={toLocalInput(new Date(Date.now() + 60_000).toISOString())}
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            onClick={() => submitSchedule(d.id)}
                            disabled={schedule.isPending}
                            className="h-8 bg-fuchsia-500 hover:bg-fuchsia-600"
                          >
                            {schedule.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            className="h-8"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center justify-end gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(d)}
                        className="h-7 text-xs"
                        title={isScheduled ? 'Reagendar' : 'Agendar'}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        {isScheduled ? 'Reagendar' : 'Agendar'}
                      </Button>
                      {isScheduled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelSchedule.mutate(d.id)}
                          disabled={cancelSchedule.isPending}
                          className="h-7 text-xs"
                          title="Cancelar agendamento"
                        >
                          <X className="h-3 w-3 mr-1" /> Cancelar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => publishNow.mutate(d.id)}
                        disabled={publishNow.isPending}
                        className="h-7 text-xs bg-gradient-to-r from-fuchsia-500 to-primary"
                      >
                        <Send className="h-3 w-3 mr-1" /> Publicar agora
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove.mutate(d.id)}
                        disabled={remove.isPending}
                        title="Apagar"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
