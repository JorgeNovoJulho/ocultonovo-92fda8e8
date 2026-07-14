import { useState, useRef, useCallback, forwardRef } from 'react';
import { X, Image, Camera, Sparkles, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { useCreateFlashStory } from '@/hooks/useFlashStories';
import { cleanupObjectUrls } from '@/lib/smartUpload';
import { cn } from '@/lib/utils';

const MAX_IMAGES = 10;
const MAX_DIMENSION = 1280;
const QUALITY = 0.8;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB (até 10 min)
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
// Vídeo total permitido: até 10 capítulos de 60s = 600s (10 min)
const CHAPTER_SECONDS = 60;
const MAX_CHAPTERS = 10;
const MAX_VIDEO_DURATION = CHAPTER_SECONDS * MAX_CHAPTERS; // 600s
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'];

function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const url = URL.createObjectURL(file);
    const cleanup = () => { URL.revokeObjectURL(url); };
    v.onloadedmetadata = () => {
      const d = v.duration || 0;
      cleanup();
      resolve(Number.isFinite(d) ? d : 0);
    };
    v.onerror = () => { cleanup(); resolve(0); };
    v.src = url;
  });
}

interface CreateStoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MediaItem {
  file: File;
  preview: string;
  // Quando o vídeo é maior que CHAPTER_SECONDS, dividimos em capítulos virtuais
  // que compartilham o MESMO File (upload feito uma única vez) e diferem apenas
  // pelo intervalo [start,end]. URL final ganha fragmento `#t=start,end`.
  chapter?: { start: number; end: number; index: number; total: number };
}

// Client-side resize to prevent OOM on Realme C55
async function resizeImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  // GIFs precisam manter a animação — não recodificar para WebP estático
  if (file.type === 'image/gif') return file;

  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        URL.revokeObjectURL(img.src);
        resolve(file);
        return;
      }

      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/webp' }));
          } else {
            resolve(file);
          }
        },
        'image/webp',
        QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };
    img.src = URL.createObjectURL(file);
  });
}

export const CreateStoryModal = forwardRef<HTMLDivElement, CreateStoryModalProps>(function CreateStoryModal({ open, onOpenChange }, _ref) {
  const [content, setContent] = useState('');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0..100
  const [uploadStatus, setUploadStatus] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { uploadMedia } = useMediaUpload();
  const createStory = useCreateFlashStory();
  const { toast } = useToast();

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_IMAGES - mediaItems.length;
    const selected = files.slice(0, remaining);

    if (files.length > remaining) {
      toast({
        title: `Máximo ${MAX_IMAGES} imagens`,
        description: `${files.length - remaining} arquivo(s) foram ignorados.`,
        variant: 'destructive',
      });
    }

    // Validate
    type Validated = { file: File; duration?: number; isVideo: boolean };
    const validated: Validated[] = [];
    for (const file of selected) {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isImage && !isVideo) {
        toast({ title: 'Formato inválido', description: 'Apenas imagens e vídeos.', variant: 'destructive' });
        continue;
      }
      if (isVideo && !ALLOWED_VIDEO_TYPES.includes(file.type)) {
        toast({
          title: 'Formato de vídeo não suportado',
          description: 'Use MP4, WebM, MOV ou OGG.',
          variant: 'destructive',
        });
        continue;
      }
      const sizeLimit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (file.size > sizeLimit) {
        toast({
          title: 'Arquivo grande demais',
          description: isVideo ? 'Vídeo: máximo 500MB.' : 'Imagem: máximo 20MB.',
          variant: 'destructive',
        });
        continue;
      }
      if (isVideo) {
        const dur = await probeVideoDuration(file);
        if (dur > MAX_VIDEO_DURATION + 0.5) {
          toast({
            title: 'Vídeo muito longo',
            description: `Máximo ${MAX_VIDEO_DURATION / 60} min — este tem ${Math.round(dur)}s.`,
            variant: 'destructive',
          });
          continue;
        }
        validated.push({ file, duration: dur, isVideo: true });
      } else {
        validated.push({ file, isVideo: false });
      }
    }

    // Expande vídeos longos em capítulos virtuais (mesmo File, ranges diferentes).
    // Calcula quantos slots cada arquivo consumirá antes de processar.
    const newItems: MediaItem[] = [];
    let slotsUsed = mediaItems.length;
    for (const v of validated) {
      if (v.isVideo && (v.duration || 0) > CHAPTER_SECONDS + 0.25) {
        const total = Math.min(MAX_CHAPTERS, Math.ceil((v.duration || 0) / CHAPTER_SECONDS));
        if (slotsUsed + total > MAX_IMAGES) {
          toast({
            title: 'Limite de mídias atingido',
            description: `Este vídeo precisa de ${total} capítulos e excede o máximo de ${MAX_IMAGES}.`,
            variant: 'destructive',
          });
          continue;
        }
        const preview = URL.createObjectURL(v.file);
        for (let i = 0; i < total; i++) {
          const start = i * CHAPTER_SECONDS;
          const end = Math.min((v.duration || 0), (i + 1) * CHAPTER_SECONDS);
          newItems.push({
            file: v.file,
            preview, // mesmo objectURL para todos os capítulos do mesmo arquivo
            chapter: { start, end, index: i + 1, total },
          });
        }
        slotsUsed += total;
        toast({
          title: 'Vídeo dividido em capítulos',
          description: `Foi dividido em ${total} parte(s) de até ${CHAPTER_SECONDS}s.`,
        });
      } else {
        if (slotsUsed + 1 > MAX_IMAGES) {
          toast({ title: 'Limite de mídias atingido', description: `Máximo de ${MAX_IMAGES} mídias.`, variant: 'destructive' });
          continue;
        }
        const resized = v.isVideo ? v.file : await resizeImage(v.file);
        newItems.push({ file: resized, preview: URL.createObjectURL(resized) });
        slotsUsed += 1;
      }
    }

    setMediaItems(prev => [...prev, ...newItems]);
    e.target.value = '';
  }, [mediaItems.length, toast]);

  const removeMedia = useCallback((index: number) => {
    setMediaItems(prev => {
      const item = prev[index];
      const next = prev.filter((_, i) => i !== index);
      // Só revoga o objectURL quando nenhum outro capítulo ainda usa o mesmo File.
      if (item && !next.some(x => x.file === item.file)) {
        URL.revokeObjectURL(item.preview);
      }
      return next;
    });
  }, []);

  const resetForm = useCallback(() => {
    setContent('');
    const seen = new Set<File>();
    mediaItems.forEach(item => {
      if (!seen.has(item.file)) {
        seen.add(item.file);
        URL.revokeObjectURL(item.preview);
      }
    });
    setMediaItems([]);
  }, [mediaItems]);

  const handleSubmit = async () => {
    if (!content.trim() && mediaItems.length === 0) {
      toast({ title: 'Conteúdo vazio', description: 'Adicione fotos ou texto ao seu story.', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus(mediaItems.length > 0 ? 'Preparando envio…' : 'Publicando…');

    try {
      let mediaUrl: string | undefined;
      let mediaUrls: string[] | undefined;

      // Dedup de uploads por File: capítulos compartilham o mesmo arquivo,
      // então enviamos uma única vez e reaproveitamos a URL para todos.
      const uploadCache = new Map<File, Promise<string>>();
      const uniqueFiles = Array.from(new Set(mediaItems.map(i => i.file)));
      const totalUniqueUploads = uniqueFiles.length;
      let completedUploads = 0;
      const bump = () => {
        completedUploads += 1;
        const pct = Math.min(95, Math.round((completedUploads / Math.max(totalUniqueUploads, 1)) * 90));
        setUploadProgress(pct);
        setUploadStatus(`Enviando arquivo ${completedUploads}/${totalUniqueUploads}…`);
      };

      const uploadOnce = (file: File): Promise<string> => {
        const cached = uploadCache.get(file);
        if (cached) return cached;
        const folder = file.type.startsWith('video/') ? 'videos' : 'stories';
        const p = uploadMedia(file, folder)
          .then(r => { bump(); return r.publicUrl; });
        uploadCache.set(file, p);
        return p;
      };

      if (mediaItems.length === 1 && !mediaItems[0].chapter) {
        const item = mediaItems[0];
        setUploadStatus(item.file.type.startsWith('video/') ? 'Enviando vídeo…' : 'Enviando imagem…');
        let fake = 5;
        const tick = setInterval(() => {
          fake = Math.min(85, fake + 5);
          setUploadProgress(fake);
        }, 400);
        try {
          mediaUrl = await uploadOnce(item.file);
        } finally {
          clearInterval(tick);
        }
        setUploadProgress(90);
      } else if (mediaItems.length >= 1) {
        // Sobe arquivos únicos em paralelo (concorrência 3) e depois mapeia
        // cada MediaItem para a URL correspondente, anexando fragmento `#t=`
        // quando o item for um capítulo virtual.
        const CONCURRENCY = 3;
        const fileQueue = [...uniqueFiles];
        const workers = Array.from({ length: Math.min(CONCURRENCY, fileQueue.length) }, async () => {
          while (fileQueue.length) {
            const f = fileQueue.shift();
            if (!f) return;
            await uploadOnce(f);
          }
        });
        await Promise.all(workers);
        const urls = await Promise.all(
          mediaItems.map(async (item) => {
            const base = await uploadOnce(item.file);
            if (item.chapter) {
              // Media Fragments URI: o servidor não vê o fragmento (#),
              // então o cache HTTP é compartilhado entre todos os capítulos.
              const { start, end } = item.chapter;
              return `${base}#t=${start.toFixed(2)},${end.toFixed(2)}`;
            }
            return base;
          }),
        );
        mediaUrl = urls[0];
        mediaUrls = urls;
      }

      setUploadStatus('Publicando story…');
      setUploadProgress(97);

      await createStory.mutateAsync({
        mediaUrl,
        mediaUrls,
        contentText: content.trim() || undefined,
      });

      setUploadProgress(100);
      toast({ title: '⚡ Flash Story publicado!', description: 'Seu story estará visível por 24 horas.' });
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      console.error('[CreateStoryModal] Erro completo:', error);
      const msg = error?.message || error?.details || 'Erro desconhecido';
      toast({ title: 'Erro ao publicar', description: msg, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
    }
  };

  const canPublish = content.trim().length > 0 || mediaItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value) resetForm();
      onOpenChange(value);
    }}>
      <DialogContent className="w-[95vw] max-w-md bg-card border-border p-0 gap-0 overflow-hidden flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-6rem)] my-4 md:max-h-[85dvh]">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Criar Flash Story
          </DialogTitle>
        </DialogHeader>

        {/* Conteúdo - scroll invisível */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
          {/* Info */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm text-primary">
              Stories Flash duram 24h • Até {MAX_IMAGES} mídias • Vídeo até {MAX_VIDEO_DURATION / 60} min
              <br />
              Vídeos longos são divididos automaticamente em capítulos de {CHAPTER_SECONDS}s.
            </p>
          </div>

          {/* Preview Grid */}
          {mediaItems.length > 0 && (
            <div className={cn(
              "grid gap-2",
              mediaItems.length === 1 && "grid-cols-1",
              mediaItems.length === 2 && "grid-cols-2",
              mediaItems.length >= 3 && "grid-cols-3"
            )}>
              {mediaItems.map((item, index) => {
                const isVid = item.file.type.startsWith('video/');
                return (
                  <div key={index} className="relative rounded-lg overflow-hidden border border-border bg-black/20" style={{ aspectRatio: mediaItems.length === 1 ? 'auto' : '1' }}>
                    {isVid ? (
                      <video
                        // Fragmento `#t=start,end` faz o navegador limitar o preview ao capítulo.
                        src={item.chapter ? `${item.preview}#t=${item.chapter.start},${item.chapter.end}` : item.preview}
                        className={cn(
                          "w-full object-contain bg-black",
                          mediaItems.length === 1 ? "max-h-[50vh]" : "h-full"
                        )}
                        controls
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={item.preview}
                        alt={`Preview ${index + 1}`}
                        className={cn(
                          "w-full object-contain",
                          mediaItems.length === 1 ? "max-h-[50vh]" : "h-full"
                        )}
                        loading="lazy"
                      />
                    )}
                    <button
                      onClick={() => removeMedia(index)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {index + 1}/{mediaItems.length}
                      {item.chapter ? ` • cap ${item.chapter.index}/${item.chapter.total}` : (isVid ? ' • vídeo' : '')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Botões de mídia */}
          {mediaItems.length < MAX_IMAGES && (
            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <Button
                variant="outline"
                className="flex-1 h-20 flex-col gap-2 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Image className="h-6 w-6 text-primary" />
                <span className="text-sm">Galeria</span>
              </Button>
              
              <Button
                variant="outline"
                className="flex-1 h-20 flex-col gap-2 border-dashed border-2 hover:border-primary/50 hover:bg-primary/5"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-6 w-6 text-primary" />
                <span className="text-sm">Câmera</span>
              </Button>
            </div>
          )}

          {/* Texto do story */}
          <Textarea
            placeholder="Adicione uma legenda... (opcional)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[80px] bg-muted/30 border-border/50 resize-none"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground text-right">{content.length}/500</p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/10 shrink-0 space-y-2">
          {isUploading && (
            <div className="space-y-1" aria-live="polite">
              <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                <span className="truncate">{uploadStatus || 'Enviando…'}</span>
                <span className="tabular-nums font-medium text-primary">{uploadProgress}%</span>
              </div>
              <div
                className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                aria-label="Progresso de envio do story"
              >
                <div
                  className="h-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!canPublish || isUploading}
            className="w-full font-semibold h-11 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                {uploadStatus || 'Publicando...'}
              </span>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Publicar Flash Story
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

CreateStoryModal.displayName = 'CreateStoryModal';
