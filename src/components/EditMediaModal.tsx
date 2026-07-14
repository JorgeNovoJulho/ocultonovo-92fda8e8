import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lock, Unlock, Video, Image as ImageIcon } from "lucide-react";
import { type MediaItem, type PrivacyLevel, useUpdateMedia } from "@/hooks/useMediaManager";
import { MAX_VIDEO_DOWNLOAD_PRICE, validatePaidVideoDownloadPrice } from "@/lib/paidVideoDownload";
import { toast } from "sonner";

interface EditMediaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  media: MediaItem | null;
}

const privacyLabels: Record<PrivacyLevel, { label: string; color: string }> = {
  public: { label: "Público", color: "bg-emerald-500" },
  friends: { label: "Amigos", color: "bg-blue-500" },
  vip: { label: "VIP", color: "bg-amber-500" },
  hidden: { label: "Invisível", color: "bg-slate-700" },
};

export function EditMediaModal({ open, onOpenChange, media }: EditMediaModalProps) {
  const [caption, setCaption] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [isPaidVideo, setIsPaidVideo] = useState(false);
  const [paidPrice, setPaidPrice] = useState("");
  
  const updateMedia = useUpdateMedia();

  useEffect(() => {
    if (media) {
      setCaption(media.content_text || "");
      setIsLocked(media.is_locked || false);
      setIsPaidVideo(!!media.is_paid);
      setPaidPrice(media.paid_price ? String(media.paid_price).replace('.', ',') : "");
    }
  }, [media]);

  const handleSave = () => {
    if (!media) return;
    const priceResult = isVideo && isPaidVideo ? validatePaidVideoDownloadPrice(paidPrice) : null;
    if (priceResult && !priceResult.success) {
      toast.error(priceResult.error.errors[0]?.message || "Informe um valor válido em R$");
      return;
    }

    updateMedia.mutate(
      { 
        mediaId: media.id, 
        data: { 
          content_text: caption,
          is_locked: isLocked,
          is_paid: !!priceResult?.success,
          paid_price: priceResult?.success ? priceResult.data : null,
        } 
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  if (!media) return null;

  const isVideo = media.media_type === 'video' || media.media_url?.includes('.mp4') || media.media_url?.includes('.webm');
  const privacyConfig = privacyLabels[media.privacy_level];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isVideo ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            Editar Mídia
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preview */}
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
            {isVideo ? (
              <video preload="none"
                src={media.media_url || ''}
                className="w-full h-full object-contain"
                controls
                controlsList="nodownload nofullscreen noremoteplayback"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                muted
              />
            ) : (
              <img loading="lazy" decoding="async"
                src={media.media_url || ''}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            )}
            <Badge 
              className={`absolute top-2 right-2 ${privacyConfig.color} text-white`}
            >
              {privacyConfig.label}
            </Badge>
          </div>

          {/* Caption */}
          <div className="space-y-2">
            <Label htmlFor="caption">Legenda</Label>
            <Textarea
              id="caption"
              placeholder="Adicione uma legenda para sua mídia..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {caption.length}/500 caracteres
            </p>
          </div>

          {/* Lock Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              {isLocked ? (
                <Lock className="h-5 w-5 text-amber-500" />
              ) : (
                <Unlock className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Conteúdo Bloqueado</p>
                <p className="text-sm text-muted-foreground">
                  {isLocked 
                    ? "Usuários precisam desbloquear para ver" 
                    : "Visível conforme nível de privacidade"}
                </p>
              </div>
            </div>
            <Switch
              checked={isLocked}
              onCheckedChange={setIsLocked}
            />
          </div>

          {isVideo && (
            <div className="space-y-3 rounded-lg bg-muted/50 border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Download pago para VIP</p>
                  <p className="text-sm text-muted-foreground">O botão de baixar fica bloqueado até o checkout PIX mock.</p>
                </div>
                <Switch checked={isPaidVideo} onCheckedChange={setIsPaidVideo} />
              </div>
              {isPaidVideo && (
                <div className="space-y-2">
                  <Label htmlFor="edit-paid-video-price">Valor do download (R$)</Label>
                  <Input
                    id="edit-paid-video-price"
                    inputMode="decimal"
                    placeholder="Ex: 19,90"
                    value={paidPrice}
                    onChange={(e) => setPaidPrice(e.target.value.replace(/[^0-9,.]/g, ''))}
                  />
                  <p className="text-xs text-muted-foreground">Permitido de R$ 1,00 até R$ {MAX_VIDEO_DOWNLOAD_PRICE.toFixed(2).replace('.', ',')}.</p>
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>❤️ {media.likes_count} curtidas</span>
            <span>💬 {media.comments_count} comentários</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={updateMedia.isPending || (isVideo && isPaidVideo && !validatePaidVideoDownloadPrice(paidPrice).success)}
          >
            {updateMedia.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
