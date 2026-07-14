import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useScheduledPosts, useCancelScheduledPost } from "@/hooks/useScheduledPosts";
import { CalendarClock, Trash2, Image as ImageIcon, Video, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScheduledPostsModalProps {
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

export function ScheduledPostsModal({ open, onOpenChange }: ScheduledPostsModalProps) {
  const { data, isLoading, refetch } = useScheduledPosts(open);
  const cancel = useCancelScheduledPost();
  const { toast } = useToast();

  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast({ title: "Agendamento cancelado" });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro ao cancelar", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Posts agendados
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum post agendado.
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {data.map((s) => {
              const p = s.payload || {};
              const mediaType = p.media_type as string | undefined;
              const text = (p.content_text as string) || '';
              return (
                <div key={s.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatDateTime(s.scheduled_for)}
                        {s.status === 'failed' && (
                          <span className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-destructive/10 text-destructive text-[10px]">
                            <AlertTriangle className="h-3 w-3" /> falhou
                          </span>
                        )}
                      </div>
                      {text && (
                        <p className="text-sm text-foreground mt-1 line-clamp-2 break-words">{text}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {mediaType === 'image' && <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Foto</span>}
                        {mediaType === 'video' && <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> Vídeo</span>}
                        {p.is_paid && <span>· PPV R$ {p.paid_price}</span>}
                        {p.privacy_level && <span>· {p.privacy_level}</span>}
                      </div>
                      {s.last_error && (
                        <p className="text-[10px] text-destructive mt-1 line-clamp-2">{s.last_error}</p>
                      )}
                    </div>
                    {(p.media_url || p.thumbnail_url) && mediaType === 'image' && (
                      <img
                        src={(p.thumbnail_url as string) || (p.media_url as string)}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 rounded-md object-cover shrink-0"
                      />
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleCancel(s.id)}
                      disabled={cancel.isPending}
                      title="Cancelar agendamento"
                      className="text-destructive hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
