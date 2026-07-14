import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Loader2, ImageOff, Maximize2, Minimize2, RotateCw, Gauge, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaItem } from '@/hooks/useMediaManager';
import { isVideoUrl, getVideoMimeType, resolveVideoThumbnail } from '@/lib/mediaType';
import { supabase } from '@/lib/supabaseExternal';
import { videoManager } from '@/lib/videoManager';
import { useCentralColumnRect } from '@/hooks/useCentralColumnRect';

// Dedup por sessão: garante que o RPC só roda uma vez por mídia por carga da página
const sessionPlayedIds = new Set<string>();


function detectIsVideo(m: MediaItem | null): boolean {
  if (!m) return false;
  const t = (m as any).media_type;
  if (t === 'video') return true;
  if (t === 'image' || t === 'gif') return false;
  return isVideoUrl(m.media_url);
}

interface MediaGalleryModalProps {
  open: boolean;
  onClose: () => void;
  media: MediaItem | null;
  allMedia: MediaItem[];
  onNavigate: (media: MediaItem) => void;
}

const PLAYBACK_RATES = [1, 1.5, 2] as const;
const ROTATION_STEP = 90; // 0 → 90 → 180 → 270 → 360(=0)

// === Preferências persistentes na sessão (sobrevive à navegação entre vídeos) ===
type VideoPrefs = {
  volume: number;
  isMuted: boolean;
  rate: number;
  rotation: number;
  wasPlaying: boolean;
};
const sessionPrefs: VideoPrefs = {
  volume: 1,
  isMuted: true,
  rate: 1,
  rotation: 0,
  wasPlaying: true,
};

function describeMediaError(el: HTMLVideoElement | null, mimeType: string): string {
  const err = el?.error;
  const canPlay = el ? el.canPlayType(mimeType) : '';
  if (!err) {
    if (mimeType && canPlay === '') {
      return `Formato não suportado pelo navegador (${mimeType}). Tente Chrome/Edge atualizado ou converta para MP4 (H.264).`;
    }
    return 'Não foi possível carregar o vídeo.';
  }
  switch (err.code) {
    case 1: return 'Carregamento abortado (MEDIA_ERR_ABORTED).';
    case 2: return 'Falha de rede ao baixar o vídeo (MEDIA_ERR_NETWORK). Verifique sua conexão.';
    case 3: return 'Falha ao decodificar o vídeo (MEDIA_ERR_DECODE). Arquivo possivelmente corrompido.';
    case 4: return `Formato/Codec não suportado (MEDIA_ERR_SRC_NOT_SUPPORTED${mimeType ? ` — ${mimeType}` : ''}). Converta para MP4 (H.264 + AAC).`;
    default: return err.message || 'Erro desconhecido ao reproduzir.';
  }
}

export function MediaGalleryModal({ open, onClose, media, allMedia, onNavigate }: MediaGalleryModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(sessionPrefs.isMuted);
  const [volume, setVolume] = useState(sessionPrefs.volume);
  const [rate, setRate] = useState<number>(sessionPrefs.rate);
  const [rotation, setRotation] = useState(sessionPrefs.rotation);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRotationBadge, setShowRotationBadge] = useState(false);
  const [playCount, setPlayCount] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rotationBadgeTimer = useRef<number | null>(null);
  const loadingTimeoutRef = useRef<number | null>(null);

  // Busca contagem atual ao abrir/trocar mídia
  useEffect(() => {
    if (!media?.id) { setPlayCount(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('v_media_play_counts')
        .select('total_plays')
        .eq('media_id', media.id)
        .maybeSingle();
      if (!cancelled) setPlayCount(data?.total_plays ?? 0);
    })();
    return () => { cancelled = true; };
  }, [media?.id]);

  // Registra reprodução (1x por @username por carga de sessão)
  const recordPlayOnce = useCallback(async () => {
    if (!media?.id || sessionPlayedIds.has(media.id)) return;
    sessionPlayedIds.add(media.id);
    try {
      const { data, error } = await (supabase as any).rpc('record_media_play', { p_media_id: media.id });
      if (!error && typeof data === 'number') setPlayCount(data);
    } catch { /* noop */ }
  }, [media?.id]);

  const currentIndex = media ? allMedia.findIndex(m => m.id === media.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allMedia.length - 1;

  const isVideo = detectIsVideo(media);
  const videoSrc = media?.media_url || '';

  // Sync preferências para o storage de sessão sempre que mudarem
  useEffect(() => { sessionPrefs.volume = volume; }, [volume]);
  useEffect(() => { sessionPrefs.isMuted = isMuted; }, [isMuted]);
  useEffect(() => { sessionPrefs.rate = rate; }, [rate]);
  useEffect(() => { sessionPrefs.rotation = rotation; }, [rotation]);
  useEffect(() => { sessionPrefs.wasPlaying = isPlaying; }, [isPlaying]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [open]);

  // Reset SOMENTE o que é específico da mídia (loading/erro/play state). Volume/rate/rotação são preservados.
  useEffect(() => {
    if (media) {
      setIsLoading(true);
      setHasError(false);
      setErrorDetail(null);
      setIsPlaying(false);
    }
  }, [media?.id]);

  // Watchdog: se vídeo não der sinal de vida em 20s, mostra erro de carregamento
  useEffect(() => {
    if (!open || !isVideo || !isLoading || hasError) return;
    if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && v.readyState < 2) {
        setIsLoading(false);
        setHasError(true);
        setErrorDetail('Tempo esgotado ao carregar o vídeo. Verifique sua conexão ou tente novamente.');
      }
    }, 20000);
    return () => {
      if (loadingTimeoutRef.current) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [open, isVideo, isLoading, hasError, media?.id]);

  // Aplica volume/rate ao <video>
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted || volume === 0;
      videoRef.current.playbackRate = rate;
    }
  }, [volume, isMuted, rate, media?.id]);

  // Track fullscreen changes (incl. ESC exit) — restaura rotação/posição reaplicando o transform após sair
  useEffect(() => {
    const onFsChange = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);
      // Ao sair do fullscreen, reaplica estilo do vídeo para garantir rotação/centralização corretas
      if (!inFs && videoRef.current) {
        const v = videoRef.current;
        // força reflow para reaplicar transform/maxWidth/maxHeight
        v.style.transform = `rotate(${sessionPrefs.rotation}deg)`;
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Cleanup video on unmount/change
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, [media?.id]);

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      if (videoRef.current) { videoRef.current.pause(); }
      onNavigate(allMedia[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, allMedia, onNavigate]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      if (videoRef.current) { videoRef.current.pause(); }
      onNavigate(allMedia[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, allMedia, onNavigate]);

  const handleClose = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    onClose();
  }, [onClose]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      if (videoRef.current.readyState === 0) {
        videoRef.current.load();
      }
      videoRef.current.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [isPlaying]);

  const handleVideoSurfaceToggle = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    e?.stopPropagation();
    togglePlay();
  }, [togglePlay]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(prev => !prev);
  }, [isMuted]);

  const cycleRate = useCallback(() => {
    setRate((r) => {
      const idx = PLAYBACK_RATES.indexOf(r as any);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    });
  }, []);

  const rotate = useCallback(() => {
    setRotation((r) => (r + ROTATION_STEP) % 360);
    setShowRotationBadge(true);
    if (rotationBadgeTimer.current) window.clearTimeout(rotationBadgeTimer.current);
    rotationBadgeTimer.current = window.setTimeout(() => setShowRotationBadge(false), 1400);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch { /* noop */ }
  }, []);

  // Handle touch zones for navigation
  const handleTapNavigation = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const third = rect.width / 3;

    if (x < third) {
      goToPrev();
    } else if (x > third * 2) {
      goToNext();
    }
  }, [goToPrev, goToNext]);

  // Auto-play apenas se a sessão estava reproduzindo OU é a primeira abertura
  useEffect(() => {
    if (!open || !isVideo || !videoSrc || !videoRef.current) return;
    if (!sessionPrefs.wasPlaying) return;

    const frame = window.requestAnimationFrame(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.readyState === 0) {
        video.load();
      }
      video.play().catch(() => {
        setIsPlaying(false);
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, isVideo, videoSrc, media?.id]);

  useEffect(() => {
    if (!open || !isVideo) return;

    const playerId = media?.id ? `media-gallery:${media.id}` : 'media-gallery:active';
    videoManager.activate(playerId, () => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      setIsPlaying(false);
    });

    return () => {
      videoManager.deactivate(playerId);
    };
  }, [open, isVideo, media?.id]);

  // Contém o modal na coluna central do app (desktop), evitando sobreposição
  // com a sidebar de chat à direita. Mobile/sm continua fullscreen.
  const columnRect = useCentralColumnRect(open);

  if (!open || !media) return null;

  return (
    <div
      ref={containerRef}
      className="fixed top-0 z-[9999] bg-black/95 backdrop-blur-sm flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      style={{
        height: '100dvh',
        left: columnRect ? `${columnRect.left}px` : 0,
        width: columnRect ? `${columnRect.width}px` : '100vw',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/70 to-transparent shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-sm font-medium">
            {currentIndex + 1} / {allMedia.length}
          </span>
          {isVideo && playCount !== null && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white/90 text-xs font-medium tabular-nums"
              title={`${playCount} reproduções únicas`}
              aria-label={`${playCount} reproduções únicas`}
            >
              <Eye className="h-3.5 w-3.5" />
              {playCount}
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="p-2 rounded-full bg-black/50 text-white active:scale-90 transition-transform"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main content area */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden"
        onClick={!isVideo ? handleTapNavigation : undefined}
      >
        {/* Loading spinner */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center z-[1]">
            <Loader2 className="h-8 w-8 text-white/70 animate-spin" />
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="flex flex-col items-center gap-3 text-white/80 max-w-md text-center px-6 z-[2]">
            <ImageOff className="h-12 w-12" />
            <p className="text-sm font-medium">Mídia indisponível</p>
            {errorDetail && (
              <p className="text-xs text-white/60 leading-relaxed">{errorDetail}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setHasError(false);
                  setErrorDetail(null);
                  setIsLoading(true);
                  if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className="px-4 py-2 rounded-full bg-white/10 text-white text-sm active:scale-95 transition-transform"
              >
                Tentar novamente
              </button>
              <button
                onClick={hasNext ? goToNext : handleClose}
                className="px-4 py-2 rounded-full bg-white/10 text-white text-sm active:scale-95 transition-transform"
              >
                {hasNext ? 'Próxima →' : 'Fechar'}
              </button>
            </div>
          </div>
        )}


        {/* Image */}
        {!isVideo && !hasError && (
          <>
            <img loading="lazy" decoding="async"
              src={media.media_url || ''}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-20 scale-110 pointer-events-none select-none"
              aria-hidden="true"
            />
            <img loading="lazy" decoding="async"
              src={media.media_url || ''}
              alt={media.content_text || 'Mídia'}
              className={cn(
                "relative max-w-full max-h-full object-contain select-none pointer-events-none transition-opacity duration-200 z-[1]",
                isLoading ? "opacity-0" : "opacity-100"
              )}
              draggable={false}
              onLoad={() => setIsLoading(false)}
              onError={() => { setIsLoading(false); setHasError(true); }}
              style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
            />
          </>
        )}

        {/* Video — player customizado padrão do Cofre/Feed */}
        {isVideo && !hasError && (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              preload="metadata"
              ref={videoRef}
              key={videoSrc}
              poster={resolveVideoThumbnail((media as any).thumbnail_url, media.media_url)}
              className={cn(
                "max-w-full max-h-full object-contain transition-all duration-200 will-change-transform cursor-pointer",
                isLoading ? "opacity-0" : "opacity-100"
              )}
              muted={isMuted}
              playsInline
              disablePictureInPicture
              disableRemotePlayback

              onClick={handleVideoSurfaceToggle}
              onContextMenu={e => e.preventDefault()}
              onLoadedMetadata={() => setIsLoading(false)}
              onLoadedData={() => setIsLoading(false)}
              onCanPlay={() => setIsLoading(false)}
              onWaiting={() => setIsLoading(true)}
              onStalled={() => setIsLoading(true)}
              onPlaying={() => { setIsLoading(false); setIsPlaying(true); recordPlayOnce(); }}
              onPlay={() => { setIsPlaying(true); recordPlayOnce(); }}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onError={() => {
                const mime = getVideoMimeType(media.media_url);
                setIsLoading(false);
                setHasError(true);
                setErrorDetail(describeMediaError(videoRef.current, mime));
              }}
              style={{
                WebkitTouchCallout: 'none',
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                maxWidth: rotation % 180 === 0 ? '100%' : '100vh',
                maxHeight: rotation % 180 === 0 ? '100%' : '100vw',
              } as React.CSSProperties}
              data-mime-type={getVideoMimeType(media.media_url)}
            >
              <source src={videoSrc} type={getVideoMimeType(media.media_url)} />
              {/* Fallback sem type para o caso de extensão desconhecida */}
              <source src={videoSrc} />
            </video>

            {/* Indicador visual de "tap para reproduzir" — não bloqueia cliques no <video> */}
            {!isLoading && !isPlaying && (
              <div
                className="absolute inset-0 z-[2] flex items-center justify-center bg-black/20 pointer-events-none"
                aria-hidden="true"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm">
                  <Play className="h-7 w-7 fill-current ml-1" />
                </span>
              </div>
            )}

            {/* Rotation badge */}
            {showRotationBadge && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[3] pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-3 py-1.5 rounded-full bg-black/80 text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
                  <RotateCw className="h-3.5 w-3.5" />
                  {rotation}°
                </div>
              </div>
            )}
          </div>
        )}


        {/* Navigation arrows (desktop) */}
        {hasPrev && !hasError && (
          <button
            onClick={goToPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 active:scale-90 transition-all hidden sm:flex"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && !hasError && (
          <button
            onClick={goToNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 text-white/80 hover:bg-black/60 active:scale-90 transition-all hidden sm:flex"
            aria-label="Próximo"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Video toolbar */}
      {isVideo && !hasError && (
        <div className="relative z-10 shrink-0 bg-gradient-to-t from-black/80 to-transparent px-3 pt-4 pb-2">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button
              onClick={togglePlay}
              className="p-2.5 rounded-full bg-black/60 text-white active:scale-90 transition-transform"
              aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>

            {/* Volume — slider grande, touch-friendly, isolado da navegação */}
            <div
              className="flex items-center gap-2 bg-black/60 rounded-full px-3 py-2"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <button
                onClick={toggleMute}
                className="text-white active:scale-90 transition-transform"
                aria-label={isMuted ? 'Ativar som' : 'Mudo'}
              >
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (v > 0 && isMuted) setIsMuted(false);
                  if (v === 0) setIsMuted(true);
                }}
                onInput={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  setVolume(v);
                  if (v > 0 && isMuted) setIsMuted(false);
                }}
                className="w-24 sm:w-32 h-6 accent-primary cursor-pointer touch-none"
                style={{ WebkitAppearance: 'none', appearance: 'none' } as React.CSSProperties}
                aria-label="Volume"
              />
            </div>

            <button
              onClick={cycleRate}
              className="px-3 py-2 rounded-full bg-black/60 text-white text-xs font-semibold flex items-center gap-1 active:scale-90 transition-transform tabular-nums"
              aria-label="Velocidade de reprodução"
              title="Velocidade"
            >
              <Gauge className="h-4 w-4" />
              {rate}x
            </button>

            <button
              onClick={rotate}
              className="px-3 py-2 rounded-full bg-black/60 text-white text-xs font-semibold flex items-center gap-1 active:scale-90 transition-transform tabular-nums"
              aria-label={`Rotacionar (atual ${rotation}°)`}
              title={`Rotação: ${rotation}°`}
            >
              <RotateCw className="h-4 w-4" />
              {rotation}°
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-full bg-black/60 text-white active:scale-90 transition-transform"
              aria-label={isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Bottom caption */}
      {media.content_text && (
        <div className="relative z-10 shrink-0 px-4 py-2 bg-black/60">
          <p className="text-white/90 text-sm line-clamp-2">{media.content_text}</p>
        </div>
      )}
    </div>
  );
}
