import { memo, useState, useMemo, useEffect } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMockVideoThumbnail, isThumbnailKnownInvalid, markThumbnailInvalid } from "@/lib/mediaType";
import { extractVideoFrame } from "@/lib/videoFrameExtractor";
import { isImageCached, markImageCached, isVideoMetadataCached, markVideoMetadataCached } from "@/lib/imageLoadCache";

export type VideoThumbOrientation = "landscape" | "portrait" | "square" | "auto";

interface VideoThumbProps {
  /** URL real do thumbnail salvo (pode ser inválida — cai pro mock automaticamente). */
  thumbnailUrl?: string | null;
  /** URL do vídeo — usada para gerar o mock por extensão. */
  mediaUrl?: string | null;
  /** Proporção visual do thumb. */
  orientation?: VideoThumbOrientation;
  /** Mostrar o ícone de play sobreposto. */
  showPlayIcon?: boolean;
  /** object-fit do <img loading="lazy" decoding="async">. */
  fit?: "cover" | "contain";
  alt?: string;
  className?: string;
  containerClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const ASPECT_MAP: Record<VideoThumbOrientation, string | undefined> = {
  landscape: "16/9",
  portrait: "9/16",
  square: "1/1",
  auto: undefined,
};

/**
 * Componente único para renderizar capa de vídeo com:
 *  - Fallback automático para o mock SVG quando `thumbnail_url` falhar.
 *  - Aspect ratio padronizado (16:9, 9:16, 1:1, ou livre).
 *  - Skeleton enquanto a imagem real carrega.
 */
export const VideoThumb = memo(function VideoThumb({
  thumbnailUrl,
  mediaUrl,
  orientation = "landscape",
  showPlayIcon = true,
  fit = "cover",
  alt = "Capa do vídeo",
  className,
  containerClassName,
  onClick,
}: VideoThumbProps) {
  const mock = useMemo(() => getMockVideoThumbnail(mediaUrl), [mediaUrl]);
  const knownInvalid = thumbnailUrl ? isThumbnailKnownInvalid(thumbnailUrl) : true;
  const hasRealThumb = !!(thumbnailUrl && !knownInvalid);
  const initialSrc = hasRealThumb ? (thumbnailUrl as string) : mock;

  const [src, setSrc] = useState(initialSrc);
  const [loaded, setLoaded] = useState(() => isImageCached(initialSrc) || (!hasRealThumb && isVideoMetadataCached(mediaUrl)));
  const [usingMock, setUsingMock] = useState(!hasRealThumb);

  useEffect(() => {
    setSrc(initialSrc);
    setUsingMock(!hasRealThumb);
    setLoaded(isImageCached(initialSrc) || (!hasRealThumb && isVideoMetadataCached(mediaUrl)));
  }, [initialSrc, hasRealThumb, mediaUrl]);

  // Quando não há thumbnail real, tenta extrair um frame do próprio vídeo.
  useEffect(() => {
    if (hasRealThumb) return;
    if (!mediaUrl) return;
    // Mobile/low-end: não criar <video> oculto para extrair frame no feed.
    // Vários decoders competindo com o player do modal causavam piscadas e
    // casos em que o áudio continuava mas o frame do vídeo travava.
    if (typeof window !== 'undefined') {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const lowMemory = Number((navigator as any).deviceMemory || 8) <= 4;
      if (isMobile || lowMemory || document.querySelector('[role="dialog"][data-state="open"]')) return;
    }
    let cancelled = false;
    extractVideoFrame(mediaUrl, { seekTo: 0.6, maxWidth: 720 }).then((data) => {
      if (cancelled || !data) return;
      setSrc(data);
      setUsingMock(false);
      setLoaded(false);
    });
    return () => { cancelled = true; };
  }, [mediaUrl, hasRealThumb]);

  const aspectRatio = ASPECT_MAP[orientation];

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden bg-muted",
        containerClassName,
      )}
      style={aspectRatio ? { aspectRatio } : undefined}
      onClick={onClick}
    >
      {/* Skeleton/placeholder enquanto carrega */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted" />
      )}

      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => { markImageCached(src); if (mediaUrl) markVideoMetadataCached(mediaUrl); setLoaded(true); }}
        onError={() => {
          if (!usingMock) {
            markThumbnailInvalid(thumbnailUrl);
            setUsingMock(true);
            setSrc(mock);
          } else {
            setLoaded(true);
          }
        }}
        className={cn(
          "w-full h-full pointer-events-none select-none transition-opacity duration-200",
          fit === "cover" ? "object-cover" : "object-contain",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />

      {showPlayIcon && loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/40 pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
            <Play className="h-7 w-7 text-primary-foreground ml-0.5" fill="currentColor" />
          </div>
        </div>
      )}
    </div>
  );
});
