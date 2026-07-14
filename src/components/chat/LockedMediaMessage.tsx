import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Lock, Unlock, Image as ImageIcon, Video, Loader2, DollarSign, Trash2, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUnlockMedia } from "@/hooks/useLockedMedia";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LockedMediaMessageProps {
  messageId: string;
  senderId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  unlockPrice: number;
  isUnlocked: boolean;
  isOwnMessage: boolean;
  caption?: string;
  timestamp: string;
  formatTimestamp?: (dateStr: string) => string;
  onDelete?: (messageId: string, forEveryone: boolean) => Promise<{ error: Error | null }> | void;
}

export function LockedMediaMessage({
  messageId,
  senderId,
  mediaUrl,
  mediaType,
  unlockPrice,
  isUnlocked,
  isOwnMessage,
  caption,
  timestamp,
  formatTimestamp,
  onDelete,
}: LockedMediaMessageProps) {
  const { user } = useAuth();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showFullMedia, setShowFullMedia] = useState(false);
  const [showDeleteActions, setShowDeleteActions] = useState(false);
  const [showDeleteForEveryone, setShowDeleteForEveryone] = useState(false);
  const [localDeleting, setLocalDeleting] = useState(false);
  const unlockMedia = useUnlockMedia();

  const handleUnlock = async () => {
    await unlockMedia.mutateAsync({
      messageId,
      creatorId: senderId,
      amount: unlockPrice,
    });
    setShowConfirmDialog(false);
  };

  const formatTime = (dateStr: string) => formatTimestamp?.(dateStr) ?? new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Creator sees their own locked content normally
  const showUnlocked = isOwnMessage || isUnlocked;

  // Gate media rendering: do NOT render actual media elements (img/video)
  // until the content has been purchased. This prevents the browser from
  // fetching / decrypting the media URL before payment confirmation.
  const renderMedia = showUnlocked;

  const handleDelete = async (forEveryone: boolean) => {
    setLocalDeleting(true);
    try {
      await onDelete?.(messageId, forEveryone);
    } finally {
      setLocalDeleting(false);
    }
  };

  return (
    <>
      <div className={cn("flex items-start", isOwnMessage ? "justify-end" : "justify-start")}>
        <div className={cn("relative max-w-[86%]", isOwnMessage ? "pl-0 pr-10" : "pl-10 pr-0")}>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteActions(true);
              }}
              className={cn(
                "absolute top-1 z-30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-destructive shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isOwnMessage ? "right-1" : "left-1"
              )}
              aria-label="Apagar mensagem"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          <div
            className={cn(
              "relative max-w-[280px] rounded-2xl overflow-hidden",
              isOwnMessage
                ? "bg-primary/10 rounded-br-md"
                : "bg-muted/50 rounded-bl-md"
            )}
          >
        {/* Media Container */}
        <div 
          className="relative aspect-square cursor-pointer"
          onClick={() => renderMedia && setShowFullMedia(true)}
        >
          {/* Blurred/Locked View — NO real media loaded, just placeholder */}
          {!renderMedia ? (
            <>
              {/* Solid gradient placeholder instead of blurred real media (saves bandwidth + prevents decryption) */}
              <div className="w-full h-full bg-gradient-to-br from-muted via-muted/80 to-muted/60" />

              {/* Frosted glass overlay */}
              <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />

              {/* Lock icon and price */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="p-4 rounded-full bg-primary/20 border border-primary/30">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                
                <Badge className="bg-primary/90 text-primary-foreground px-3 py-1 text-sm font-bold">
                  <DollarSign className="h-4 w-4 mr-1" />
                  R$ {unlockPrice.toFixed(2)}
                </Badge>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmDialog(true);
                  }}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2"
                  size="sm"
                >
                  <Unlock className="h-4 w-4" />
                  Desbloquear
                </Button>
              </div>

              {/* Media type indicator */}
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="bg-black/50 text-white border-0">
                  {mediaType === 'video' ? (
                    <><Video className="h-3 w-3 mr-1" /> Vídeo</>
                  ) : (
                    <><ImageIcon className="h-3 w-3 mr-1" /> Foto</>
                  )}
                </Badge>
              </div>
            </>
          ) : (
            // Unlocked view
            <>
              {mediaType === 'image' ? (
                <img loading="lazy" decoding="async"
                  src={mediaUrl}
                  alt="Media"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video preload="none"
                  src={mediaUrl}
                  className="w-full h-full object-cover"
                  controls
                />
              )}

              {/* Unlocked badge */}
              {!isOwnMessage && (
                <div className="absolute top-2 right-2">
                  <Badge className="bg-emerald-500/90 text-white border-0 gap-1">
                    <Unlock className="h-3 w-3" />
                    Desbloqueado
                  </Badge>
                </div>
              )}

              {/* Creator badge */}
              {isOwnMessage && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-primary/90 text-primary-foreground border-0">
                    R$ {unlockPrice.toFixed(2)}
                  </Badge>
                </div>
              )}
            </>
          )}
        </div>

        {/* Caption and timestamp */}
        <div className="p-3">
          {caption && caption !== '🔒 Mídia exclusiva' && (
            <p className="text-sm mb-1">{caption}</p>
          )}
          <p className="text-right">
            <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">
            {formatTime(timestamp)}
            </span>
          </p>
          </div>
        </div>
      </div>
    </div>

      <AlertDialog open={showDeleteActions} onOpenChange={setShowDeleteActions}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Opções da mensagem</AlertDialogTitle>
            <AlertDialogDescription>O que deseja fazer com esta mensagem?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={() => handleDelete(false)} className="bg-muted text-foreground hover:bg-muted/80" disabled={localDeleting}>
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar para mim
            </AlertDialogAction>
            {isOwnMessage && (
              <AlertDialogAction onClick={() => setShowDeleteForEveryone(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={localDeleting}>
                <Ban className="h-4 w-4 mr-2" />
                Apagar para todos
              </AlertDialogAction>
            )}
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteForEveryone} onOpenChange={setShowDeleteForEveryone}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja apagar esta mensagem para todos?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={() => handleDelete(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={localDeleting}>
              Apagar para todos
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Unlock Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-primary" />
              Desbloquear Mídia
            </DialogTitle>
            <DialogDescription>
              Você está prestes a desbloquear este conteúdo exclusivo.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Price display */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
              <span className="text-sm text-muted-foreground">Valor</span>
              <span className="text-2xl font-bold text-primary">
                R$ {unlockPrice.toFixed(2)}
              </span>
            </div>

            {/* Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• O valor será debitado do seu saldo</p>
              <p>• O criador receberá 74% do valor</p>
              <p>• A mídia ficará disponível permanentemente</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUnlock}
              disabled={unlockMedia.isPending}
              className="bg-gradient-to-r from-primary to-secondary"
            >
              {unlockMedia.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Unlock className="h-4 w-4 mr-2" />
              )}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Media Dialog */}
      <Dialog open={showFullMedia} onOpenChange={setShowFullMedia}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">Visualizar mídia</DialogTitle>
          {mediaType === 'image' ? (
            <img loading="lazy" decoding="async"
              src={mediaUrl}
              alt="Media"
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          ) : (
            <video preload="none"
              src={mediaUrl}
              className="w-full h-auto max-h-[80vh]"
               controls
             />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
