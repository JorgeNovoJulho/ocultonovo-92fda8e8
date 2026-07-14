import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { 
  Lock, 
  Image as ImageIcon, 
  Video, 
  Upload, 
  DollarSign,
  Loader2,
  X,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSendLockedMedia } from "@/hooks/useLockedMedia";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

interface SendLockedMediaButtonProps {
  conversationId: string;
  onSuccess?: () => void;
}

export function SendLockedMediaButton({ 
  conversationId, 
  onSuccess 
}: SendLockedMediaButtonProps) {
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [price, setPrice] = useState([10]);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendLockedMedia = useSendLockedMedia();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      toast.error('Selecione uma imagem ou vídeo');
      return;
    }

    setSelectedFile(file);
    setMediaType(isVideo ? 'video' : 'image');
    setPreview(URL.createObjectURL(file));
    setOpen(false);
    setShowModal(true);
  };

  const handleSend = async () => {
    if (!selectedFile) return;

    setIsUploading(true);

    try {
      // Upload to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `locked-media/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Build public URL via string concatenation (zero extra requests)
      const publicUrl = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/post-media/${filePath}`;

      // Send locked message
      await sendLockedMedia.mutateAsync({
        conversationId,
        mediaUrl: publicUrl,
        mediaType,
        unlockPrice: price[0],
        caption: caption || undefined,
      });

      // Reset state
      setSelectedFile(null);
      setPreview(null);
      setCaption('');
      setPrice([10]);
      setShowModal(false);
      onSuccess?.();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar mídia');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    setPrice([10]);
    setShowModal(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const suggestedPrices = [5, 10, 20, 50, 100];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-primary hover:bg-primary/10"
            title="Enviar mídia exclusiva"
           aria-label="Bloqueado">
            <Lock className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-2">
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = 'image/*';
                  fileInputRef.current.click();
                }
              }}
            >
              <ImageIcon className="h-4 w-4 text-primary" />
              Foto Exclusiva
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = 'video/*';
                  fileInputRef.current.click();
                }
              }}
            >
              <Video className="h-4 w-4 text-primary" />
              Vídeo Exclusivo
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Pricing Modal */}
      <Dialog open={showModal} onOpenChange={(o) => !o && handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Enviar Mídia Exclusiva
            </DialogTitle>
            <DialogDescription>
              Defina um preço para desbloquear este conteúdo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Preview */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border">
              {preview && (
                <>
                  {mediaType === 'image' ? (
                    <img loading="lazy" decoding="async"
                      src={preview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video preload="none"
                      src={preview}
                      className="w-full h-full object-cover"
                      muted
                    />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Badge className="bg-primary text-primary-foreground gap-1">
                      <Lock className="h-3 w-3" />
                      Conteúdo Bloqueado
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                    onClick={handleCancel}
                   aria-label="Fechar">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Price Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Preço para Desbloquear</Label>
                <div className="flex items-center gap-1 text-2xl font-bold text-primary">
                  <DollarSign className="h-5 w-5" />
                  <span>R$ {price[0].toFixed(2)}</span>
                </div>
              </div>

              <Slider
                value={price}
                onValueChange={setPrice}
                min={1}
                max={200}
                step={1}
                className="py-4"
              />

              {/* Quick price buttons */}
              <div className="flex flex-wrap gap-2">
                {suggestedPrices.map((p) => (
                  <Button
                    key={p}
                    variant={price[0] === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrice([p])}
                    className={cn(
                      price[0] === p && "bg-primary"
                    )}
                  >
                    R$ {p}
                  </Button>
                ))}
              </div>
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Textarea
                placeholder="Adicione uma mensagem..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Earnings info */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <p className="text-sm text-emerald-500">
                Você receberá <strong>R$ {(price[0] * 0.94 * 0.80).toFixed(2)}</strong> (75,2%)
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSend}
              disabled={isUploading || !selectedFile}
              className="bg-gradient-to-r from-primary to-secondary"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Enviando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Enviar Mídia
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
