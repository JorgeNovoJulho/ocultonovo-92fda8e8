import { useState, useRef, useEffect, useCallback } from "react";
import { isGifUrl, isVideoUrl, getVideoMimeType, resolveVideoThumbnail } from "@/lib/mediaType";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCentralColumnRect } from "@/hooks/useCentralColumnRect";
import { CommentSection } from "@/components/comments";
import { 
  Heart, 
  ThumbsDown,
  Share2, 
  Bookmark,
  MessageCircle,
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  BadgeCheck,
  Flame,
  Globe,
  Users,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RotateCw,
  Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { type Post } from "@/hooks/usePosts";
import { getPublicHandle } from "@/lib/userHandle";
import { useLikePostExclusive } from "@/hooks/usePostLikes";
import { useDislikePost } from "@/hooks/usePostDislikes";
import { useSavePost } from "@/hooks/usePosts";
import { useAuth } from "@/hooks/useAuth";
import { useCanPerformActions } from "@/hooks/useCanPerformActions";
import { LikersModal } from "./LikersModal";
import { SharePostModal } from "./SharePostModal";
import { SocialDrmOverlay, DrmViolationScreen } from "@/components/drm";
import { useDrmProtection } from "@/hooks/useDrmProtection";
import { supabase } from "@/lib/supabaseExternal";
import { videoManager } from "@/lib/videoManager";

interface PostExpandedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
  isLiked: boolean;
  isDisliked: boolean;
  isSaved: boolean;
}

export function PostExpandedModal({ 
  open, 
  onOpenChange, 
  post,
  isLiked,
  isDisliked,
  isSaved
}: PostExpandedModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { canAct } = useCanPerformActions();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const timeUpdateRafRef = useRef<number | null>(null);
  const videoFrameWatchRef = useRef({ time: 0, frames: 0, stuckTicks: 0 });
  const lastTimeUiUpdateRef = useRef(0);
  const lastReactProgressCommitRef = useRef(0);
  const stableProgressRef = useRef({ currentTime: 0, duration: 0 });
  const progressInputRef = useRef<HTMLInputElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const isSeekingRef = useRef(false);
  const seekReleaseTimerRef = useRef<number | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [duration, setDuration] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [viewsCount, setViewsCount] = useState<number | null>(null);
  const viewRecordedRef = useRef<Set<string>>(new Set());

  useEffect(() => () => {
    if (timeUpdateRafRef.current !== null) cancelAnimationFrame(timeUpdateRafRef.current);
    if (seekReleaseTimerRef.current !== null) window.clearTimeout(seekReleaseTimerRef.current);
  }, []);

  const cleanupVideoElement = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch { /* noop */ }
    setIsPlaying(false);
  }, []);

  const cycleRotation = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((r) => (r + 90) % 360);
  };

  // Registra visualização única por usuário (RPC garante 1x por @username)
  const recordView = useCallback(async () => {
    if (!post?.id || viewRecordedRef.current.has(post.id)) return;
    viewRecordedRef.current.add(post.id);
    try {
      const { data, error } = await (supabase as any).rpc('record_media_play', { p_media_id: post.id });
      if (!error && typeof data === 'number') setViewsCount(data);
    } catch { /* noop */ }
  }, [post?.id]);

  // Busca total inicial ao abrir + assina realtime (defensivo — nunca pode
  // travar o modal nem o player de vídeo). Toda chamada é isolada em try/catch
  // e o canal recebe um sufixo único para evitar colisão entre instâncias.
  useEffect(() => {
    if (!open || !post?.id) return;
    const mediaId = post.id;
    let cancelled = false;
    let pollTimer: number | null = null;

    const fetchCount = async () => {
      try {
        const { data } = await (supabase as any)
          .from('v_media_play_counts')
          .select('total_plays')
          .eq('media_id', mediaId)
          .maybeSingle();
        if (cancelled) return;
        const total = Number((data as any)?.total_plays ?? 0);
        setViewsCount((prev) => {
          if (prev == null) return total;
          // Só sobe — evita "regredir" se um realtime chega antes do select.
          return total > prev ? total : prev;
        });
      } catch { /* noop */ }
    };
    fetchCount();

    // Realtime — opcional. Se a publicação não estiver ativa no banco, o
    // fallback de polling abaixo mantém o contador vivo. Falhas aqui NUNCA
    // afetam o player de vídeo.
    let channel: any = null;
    try {
      const unique = `${mediaId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      channel = (supabase as any)
        .channel(`media-plays-${unique}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'oculto_media_play_views', filter: `media_id=eq.${mediaId}` },
          () => { fetchCount(); }
        )
        .subscribe();
    } catch { /* noop */ }

    // Fallback leve: atualiza a cada 15s enquanto o modal está aberto.
    pollTimer = window.setInterval(fetchCount, 15000);

    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
      try { if (channel) (supabase as any).removeChannel(channel); } catch { /* noop */ }
    };
  }, [open, post?.id]);




  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      const muted = v === 0;
      videoRef.current.muted = muted;
      setIsMuted(muted);
    }
  };

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rates = [1, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  // Build media array from post
  const mediaUrls: string[] = (() => {
    const urls: string[] = [];
    if (post.media_url) urls.push(post.media_url);
    const extra = (post as any).media_urls;
    if (Array.isArray(extra)) {
      extra.forEach((u: string) => { if (u && !urls.includes(u)) urls.push(u); });
    }
    return urls;
  })();

  const preferredVideoUrl = currentMediaIndex === 0 && isVideoUrl((post as any).video_master_url)
    ? (post as any).video_master_url as string
    : null;
  const currentMedia = preferredVideoUrl || mediaUrls[currentMediaIndex] || post.media_url;
  const hasMultipleMedia = mediaUrls.length > 1;
  const authorRouteId = (post.author as any)?.id || (post.author as any)?.user_id || post.user_id;

  // DRM Protection
  const { isViolated, resetViolation } = useDrmProtection({
    containerRef: mediaContainerRef,
    enabled: open && !!currentMedia,
    onViolation: () => {
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    },
  });

  const likePost = useLikePostExclusive();
  const dislikePost = useDislikePost();
  const savePost = useSavePost();

  const isVideo = (url?: string | null) => isVideoUrl(url);
  const currentIsVideo = isVideo(currentMedia);
  const currentIsGif = isGifUrl(currentMedia);
  const currentMime = currentMedia ? getVideoMimeType(currentMedia) : 'video/mp4';
  const author = post.author;
  const commentsCount = Number((post as any).comments_count ?? (post as any).comment_count ?? 0);

  useEffect(() => {
    if (!open) {
      cleanupVideoElement();
      setIsFullscreen(false);
      setCurrentMediaIndex(0);
      setRotation(0);
    }
    return () => {
      if (!open) return;
      cleanupVideoElement();
      videoManager.deactivate(`post-modal:${post.id}`);
    };
  }, [open, post.id, cleanupVideoElement]);

  // Reset rotation/progresso somente quando a mídia realmente muda.
  useEffect(() => {
    setRotation(0);
    stableProgressRef.current = { currentTime: 0, duration: 0 };
    setDuration(0);
    if (progressInputRef.current) {
      progressInputRef.current.value = '0';
      progressInputRef.current.max = '1';
    }
    if (timeLabelRef.current) timeLabelRef.current.textContent = '0:00 / 0:00';
  }, [currentMedia]);

  // Keyboard navigation + bloqueio de DevTools/Download enquanto modal aberto
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Bloqueio de teclas de inspeção/salvar
      const k = e.key.toLowerCase();
      const isDevToolsCombo =
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
        (e.metaKey && e.altKey && (k === 'i' || k === 'j' || k === 'c')) ||
        (e.ctrlKey && (k === 'u' || k === 's')) ||
        (e.metaKey && (k === 'u' || k === 's'));
      if (isDevToolsCombo) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        e.stopPropagation();
        setIsFullscreen(false);
        return;
      }
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };
    const blockDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener('keydown', handler, true);
    window.addEventListener('dragstart', blockDrag);
    return () => {
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('dragstart', blockDrag);
    };
  }, [open, isFullscreen, currentMediaIndex, mediaUrls.length]);

  const goToNext = useCallback(() => {
    if (currentMediaIndex < mediaUrls.length - 1) setCurrentMediaIndex(i => i + 1);
  }, [currentMediaIndex, mediaUrls.length]);

  const goToPrev = useCallback(() => {
    if (currentMediaIndex > 0) setCurrentMediaIndex(i => i - 1);
  }, [currentMediaIndex]);

  // Touch swipe for carousel
  const handleTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goToNext();
      else goToPrev();
    }
    setTouchStartX(null);
  };

  const handlePlayPause = useCallback((e?: React.MouseEvent | React.SyntheticEvent) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    const v = videoRef.current;
    if (!v) return;
    videoManager.activate(`post-modal:${post.id}`, cleanupVideoElement);
    if (v.paused) {
      v.play()
        .then(() => { setIsPlaying(true); recordView(); })
        .catch((err) => {
          console.warn('[PostExpandedModal] play failed:', err);
          setIsPlaying(false);
        });
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [recordView, post.id, cleanupVideoElement]);

  const toggleMute = () => {
    if (videoRef.current) { videoRef.current.muted = !isMuted; setIsMuted(!isMuted); }
  };

  const readStableDuration = useCallback((v: HTMLVideoElement) => {
    const d = v.duration;
    if (Number.isFinite(d) && d > 0) {
      stableProgressRef.current.duration = d;
      return d;
    }
    return stableProgressRef.current.duration;
  }, []);

  const paintProgressUi = useCallback((time: number, total: number) => {
    const safeTotal = Number.isFinite(total) && total > 0 ? total : stableProgressRef.current.duration;
    const safeTime = Number.isFinite(time) && time >= 0 ? Math.min(time, safeTotal || time) : stableProgressRef.current.currentTime;
    const input = progressInputRef.current;
    if (input) {
      input.max = String(Math.max(safeTotal || 0, safeTime, 1));
      input.value = String(safeTime);
    }
    if (timeLabelRef.current) {
      timeLabelRef.current.textContent = `${formatTime(safeTime)} / ${formatTime(safeTotal)}`;
    }
  }, []);

  const syncMediaProgress = useCallback((force = false) => {
    const v = videoRef.current;
    if (!v || (isSeekingRef.current && !force)) return;
    const t = v.currentTime;
    const previousTime = stableProgressRef.current.currentTime;
    const safeDuration = readStableDuration(v);
    const loopRestarted = safeDuration > 0 && previousTime >= safeDuration - 1.5 && t <= 0.25;
    const mobileResetGlitch = previousTime > 1 && t <= 0.05 && !v.ended && !loopRestarted;
    const safeTime = Number.isFinite(t) && t >= 0 && !mobileResetGlitch ? t : previousTime;
    stableProgressRef.current.currentTime = safeTime;
    paintProgressUi(safeTime, safeDuration);
    const now = performance.now();
    if (safeDuration > 0 && (force || now - lastReactProgressCommitRef.current > 1200)) {
      lastReactProgressCommitRef.current = now;
      setDuration((prev) => Math.abs(prev - safeDuration) > 0.25 ? safeDuration : prev);
    }
  }, [paintProgressUi, readStableDuration]);

  const resumePlaybackPipeline = useCallback(() => {
    syncMediaProgress(true);
    const v = videoRef.current;
    if (!v || v.paused || v.ended) return;
    try { v.playbackRate = playbackRate; } catch { /* noop */ }
    try { v.play().catch(() => {}); } catch { /* noop */ }
  }, [playbackRate, syncMediaProgress]);

  useEffect(() => {
    if (!open || !currentIsVideo) return;
    const resumeUiClock = () => {
      resumePlaybackPipeline();
      window.setTimeout(resumePlaybackPipeline, 120);
    };
    document.addEventListener('visibilitychange', resumeUiClock);
    window.addEventListener('focus', resumeUiClock);
    window.addEventListener('pageshow', resumeUiClock);
    window.addEventListener('orientationchange', resumeUiClock);
    return () => {
      document.removeEventListener('visibilitychange', resumeUiClock);
      window.removeEventListener('focus', resumeUiClock);
      window.removeEventListener('pageshow', resumeUiClock);
      window.removeEventListener('orientationchange', resumeUiClock);
    };
  }, [open, currentIsVideo, resumePlaybackPipeline]);

  useEffect(() => {
    if (!open || !currentIsVideo) return;
    syncMediaProgress(true);
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      syncMediaProgress(false);
      timeUpdateRafRef.current = requestAnimationFrame(tick);
    };
    timeUpdateRafRef.current = requestAnimationFrame(tick);
    const timer = window.setInterval(() => syncMediaProgress(false), 500);
    return () => {
      stopped = true;
      if (timeUpdateRafRef.current !== null) {
        cancelAnimationFrame(timeUpdateRafRef.current);
        timeUpdateRafRef.current = null;
      }
      window.clearInterval(timer);
    };
  }, [open, currentIsVideo, syncMediaProgress]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;

    // Mobile guard: se o áudio avança mas os frames não, força um micro-seek
    // para religar o decoder sem remontar o modal nem reiniciar do zero.
    const quality = (v as any).getVideoPlaybackQuality?.();
    const frames = Number(quality?.totalVideoFrames ?? NaN);
    const canWatchFrames = Number.isFinite(frames) && frames > 0;
    const prev = videoFrameWatchRef.current;
    if (canWatchFrames && !v.paused && !v.ended && v.currentTime > prev.time + 0.35 && frames <= prev.frames) {
      prev.stuckTicks += 1;
      if (prev.stuckTicks >= 8) {
        const t = v.currentTime;
        prev.stuckTicks = 0;
        try { v.currentTime = Math.max(0, t - 0.08); } catch { /* noop */ }
        requestAnimationFrame(() => v.play().catch(() => {}));
      }
    } else {
      prev.stuckTicks = 0;
    }
    prev.time = v.currentTime;
    if (canWatchFrames) prev.frames = frames;

    if (isSeekingRef.current) return;
    const now = performance.now();
    if (now - lastTimeUiUpdateRef.current < 180) return;
    lastTimeUiUpdateRef.current = now;
    // Mobile: rAF pode ficar suspenso após notification/lock/orientação e deixar
    // a barra travada para sempre. Atualize direto no evento nativo do vídeo.
    syncMediaProgress();
  };

  // Workaround para WebM/MediaRecorder com duration = Infinity:
  // força o navegador a calcular a duração real ao seek até o fim.
  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    videoManager.activate(`post-modal:${post.id}`, cleanupVideoElement);
    v.playsInline = true;
    v.setAttribute('playsinline', 'true');
    v.setAttribute('webkit-playsinline', 'true');
    v.playbackRate = playbackRate;
    v.volume = volume;
    v.muted = isMuted;
    videoFrameWatchRef.current = { time: v.currentTime || 0, frames: 0, stuckTicks: 0 };
    const d = readStableDuration(v);
    if (d > 0) {
      setDuration(d);
      syncMediaProgress(true);
      return;
    }
    // Não fazer o antigo seek para 1e9: em Android/Chromium ele podia travar
    // o frame enquanto o áudio seguia. Se a duração vier Infinity, o player
    // continua tocando e a barra fica sem máximo até o browser informar valor.
    // Não sobrescreve uma duração já conhecida com 0/Infinity após eventos de
    // background/foreground do mobile; isso era o que zerava a barra/contador.
    setDuration((prev) => prev || stableProgressRef.current.duration || 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (!Number.isFinite(time)) return;
    stableProgressRef.current.currentTime = time;
    paintProgressUi(time, stableProgressRef.current.duration);
    if (videoRef.current) videoRef.current.currentTime = time;
  };

  const beginSeek = () => {
    if (seekReleaseTimerRef.current !== null) window.clearTimeout(seekReleaseTimerRef.current);
    isSeekingRef.current = true;
    seekReleaseTimerRef.current = window.setTimeout(() => {
      isSeekingRef.current = false;
      syncMediaProgress(true);
    }, 1800);
  };

  const endSeek = () => {
    if (seekReleaseTimerRef.current !== null) window.clearTimeout(seekReleaseTimerRef.current);
    seekReleaseTimerRef.current = window.setTimeout(() => {
      isSeekingRef.current = false;
      syncMediaProgress(true);
    }, 80);
  };

  const formatTime = (t: number) => {
    if (!isFinite(t) || isNaN(t) || t < 0) return '0:00';
    return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  };

  const handleLike = () => {
    if (!canAct) { toast({ title: "Conta congelada", description: "Você não pode curtir enquanto congelado", variant: "destructive" }); return; }
    likePost.mutate({ postId: post.id, isLiked });
  };

  const handleDislike = () => {
    if (!canAct) { toast({ title: "Conta congelada", description: "Você não pode reagir enquanto congelado", variant: "destructive" }); return; }
    dislikePost.mutate({ postId: post.id, isDisliked });
  };

  const handleSave = () => {
    if (!canAct) { toast({ title: "Conta congelada", description: "Você não pode salvar enquanto congelado", variant: "destructive" }); return; }
    savePost.mutate({ postId: post.id, isSaved });
  };

  const getVisibilityBadge = () => {
    if (post.privacy_level === 'vip') return <Badge variant="outline" className="gap-1 border-[hsl(45,93%,47%)]/50 text-[hsl(45,93%,47%)]"><Flame className="h-3 w-3" /> VIP</Badge>;
    if (post.privacy_level === 'friends') return <Badge variant="outline" className="gap-1 border-secondary/50 text-secondary"><Users className="h-3 w-3" /> Amigos</Badge>;
    return <Badge variant="outline" className="gap-1"><Globe className="h-3 w-3" /> Público</Badge>;
  };

  // ── FULLSCREEN MEDIA VIEW ──────────────────────────────────────────────
  // Contém o overlay dentro da coluna central (desktop), evitando invadir o chat à direita.
  const fsColumnRect = useCentralColumnRect(isFullscreen);
  if (isFullscreen) {
    return (
      <>
        <div
          className="fixed top-0 z-[100] bg-black flex flex-col"
          onContextMenu={e => e.preventDefault()}
          style={{
            height: '100dvh',
            left: fsColumnRect ? `${fsColumnRect.left}px` : 0,
            width: fsColumnRect ? `${fsColumnRect.width}px` : '100vw',
          }}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 to-transparent">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-10 w-10"
              onClick={() => setIsFullscreen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
            {hasMultipleMedia && (
              <span className="text-white/80 text-sm font-medium">
                {currentMediaIndex + 1} / {mediaUrls.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-10 w-10"
              onClick={() => setIsFullscreen(false)}
            >
              <Minimize2 className="h-5 w-5" />
            </Button>
          </div>

          {/* Media area */}
          <div 
            ref={mediaContainerRef}
            className="flex-1 flex items-center justify-center relative overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {isViolated && <DrmViolationScreen onReset={resetViolation} />}
            {currentMedia && !isViolated && (
              <SocialDrmOverlay
                containerRef={mediaContainerRef}
                isActive={isFullscreen}
                ownerUsername={author?.username}
                stable={currentIsVideo}
              />
            )}

            {currentMedia && !isViolated && (
               currentIsVideo ? (
                <>
                  {/* Wrapper recebe o rotate — aplicar transform direto no
                      <video> congela o frame em mobile (Android/Chromium),
                      enquanto o áudio continua tocando. */}
                  <div
                    className="max-w-full max-h-full transition-transform duration-300"
                    style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
                  >
                  <video preload="auto"
                    ref={videoRef}
                    key={currentMedia}
                    src={currentMedia}
                    poster={resolveVideoThumbnail(null, currentMedia)}
                    className="max-w-full max-h-full object-contain"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' } as React.CSSProperties}
                    autoPlay loop muted={isMuted} playsInline
                    {...({ 'webkit-playsinline': 'true', disableRemotePlayback: true } as any)}
                    controlsList="nodownload nofullscreen noremoteplayback"
                    disablePictureInPicture
                    onClick={handlePlayPause}
                    onContextMenu={e => e.preventDefault()}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                      onLoadedData={() => syncMediaProgress(true)}
                      onDurationChange={() => syncMediaProgress(true)}
                      onPlaying={() => syncMediaProgress(true)}
                    /* Não forçar play() em onCanPlay: o atributo autoPlay já cobre o início,
                       e re-chamar play() a cada canplay (que dispara após cada stall/seek/loop)
                       briga com o pause do usuário e congela o pipeline de vídeo (som segue, frame trava). */
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                  </div>

                  
                  <div className="absolute bottom-20 left-4 right-4">
                    <input
                      ref={progressInputRef}
                      type="range" min={0} max={duration || stableProgressRef.current.duration || 1} step={0.1} defaultValue={stableProgressRef.current.currentTime}
                      onChange={handleSeek}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => { e.stopPropagation(); beginSeek(); }} onMouseUp={endSeek}
                      onTouchStart={(e) => { e.stopPropagation(); beginSeek(); }} onTouchEnd={endSeek}
                      className="w-full h-1 appearance-none bg-white/30 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex gap-2 items-center">
                        <Button variant="ghost" size="icon" aria-label={isPlaying ? 'Pausar' : 'Reproduzir'} className="h-9 w-9 text-white hover:bg-white/20" onClick={handlePlayPause}>
                          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={isMuted ? 'Ativar som' : 'Silenciar'} className="h-9 w-9 text-white hover:bg-white/20" onClick={toggleMute}>
                          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-9 w-9 text-white hover:bg-white/20"
                          onClick={cycleRotation}
                          aria-label={`Rotacionar vídeo (${rotation}°)`}
                          title={`Rotacionar (${rotation}°)`}
                        >
                          <RotateCw className="h-5 w-5" />
                        </Button>
                        <div className="flex items-center gap-1 text-white/80 text-xs ml-1" title="Visualizações únicas">
                          <Eye className="h-4 w-4" />
                          <span>{viewsCount ?? '—'}</span>
                        </div>
                      </div>
                      <span ref={timeLabelRef} className="text-xs text-white/80 font-mono">{formatTime(stableProgressRef.current.currentTime)} / {formatTime(duration || stableProgressRef.current.duration)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <img
                  key={currentIsGif ? `gif-fs-${currentMediaIndex}-${currentMedia}` : undefined}
                  src={currentMedia}
                  alt="Post content"
                  className={cn("max-w-full max-h-full object-contain select-none", currentIsGif && "image-rendering-auto")}
                  style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
                  draggable={false}
                  loading="eager"
                  decoding="async"
                  data-media-type={currentIsGif ? 'image/gif' : undefined}
                  onContextMenu={e => e.preventDefault()}
                />
              )
            )}

            {/* Carousel nav arrows */}
            {hasMultipleMedia && currentMediaIndex > 0 && (
              <Button
                variant="ghost" size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full h-10 w-10"
                onClick={goToPrev}
               aria-label="Voltar">
                <ChevronLeft className="h-6 w-6" />
              </Button>
            )}
            {hasMultipleMedia && currentMediaIndex < mediaUrls.length - 1 && (
              <Button
                variant="ghost" size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full h-10 w-10"
                onClick={goToNext}
               aria-label="Próximo">
                <ChevronRight className="h-6 w-6" />
              </Button>
            )}

            {/* Dots indicator */}
            {hasMultipleMedia && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                {mediaUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentMediaIndex(i)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      i === currentMediaIndex ? "bg-white w-4" : "bg-white/40"
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Bottom action bar in fullscreen */}
          <div className="bg-black/80 backdrop-blur-sm border-t border-white/10 px-4 py-3 safe-area-bottom">
            <div className="flex items-center justify-around max-w-md mx-auto">
              <Button
                variant="ghost" size="sm"
                onClick={handleLike}
                disabled={likePost.isPending}
                className={cn("gap-2 text-white hover:bg-white/10", isLiked && "text-primary")}
              >
                <Heart className={cn("h-6 w-6", isLiked && "fill-current")} />
                <span className="text-sm">{post.likes_count}</span>
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={handleDislike}
                disabled={dislikePost.isPending}
                className={cn("gap-2 text-white hover:bg-white/10", isDisliked && "text-destructive")}
              >
                <ThumbsDown className={cn("h-6 w-6", isDisliked && "fill-current")} />
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={handleSave}
                disabled={savePost.isPending}
                className={cn("gap-2 text-white hover:bg-white/10", isSaved && "text-primary")}
              >
                <Bookmark className={cn("h-6 w-6", isSaved && "fill-current")} />
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => setShowShareModal(true)}
                className="gap-2 text-white hover:bg-white/10"
              >
                <Share2 className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>

        <SharePostModal open={showShareModal} onOpenChange={setShowShareModal} postId={post.id} postPreview={post.content_text || undefined} />
      </>
    );
  }

  // ── NORMAL MODAL VIEW ──────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="!left-0 !top-0 !translate-x-0 !translate-y-0 sm:!left-1/2 sm:!top-1/2 sm:!-translate-x-1/2 sm:!-translate-y-1/2 data-[state=open]:!animate-none data-[state=closed]:!animate-none max-w-lg w-screen sm:w-[95vw] h-[100dvh] max-h-[100dvh] sm:h-[90dvh] sm:max-h-[90dvh] p-0 gap-0 overflow-hidden rounded-none sm:rounded-xl flex flex-col"
          overlayClassName="data-[state=open]:!animate-none data-[state=closed]:!animate-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 left-2 z-20 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Fullscreen button */}
          {currentMedia && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-20 text-white hover:bg-white/20"
              onClick={() => setIsFullscreen(true)}
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
          )}

          {/* Top: mídia ocupa quase todo o modal; comentários saem para modal separado */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* 1. MEDIA — flexível para exibir vídeos verticais completos, sem cortes */}
            <div 
              ref={mediaContainerRef}
              className="w-full flex-1 min-h-0 bg-black flex items-center justify-center relative"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {isViolated && <DrmViolationScreen onReset={resetViolation} />}
              {currentMedia && !isViolated && (
                <SocialDrmOverlay
                  containerRef={mediaContainerRef}
                  isActive={open}
                  ownerUsername={author?.username}
                  stable={currentIsVideo}
                />
              )}

              {currentMedia && !isViolated && (
                currentIsVideo ? (
                  <>
                    {/* Wrapper recebe o rotate — mesma correção do bloco
                        fullscreen para evitar congelar o frame em mobile. */}
                    <div
                      className="w-full h-full transition-transform duration-300 flex items-center justify-center"
                      style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
                    >
                    <video preload="auto"
                      ref={videoRef}
                      key={currentMedia}
                      src={currentMedia}
                      poster={resolveVideoThumbnail(null, currentMedia)}
                      className="w-full h-full object-contain select-none cursor-pointer"
                      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' } as React.CSSProperties}
                      autoPlay loop muted={isMuted} playsInline
                      {...({ 'webkit-playsinline': 'true', disableRemotePlayback: true } as any)}
                      controlsList="nodownload nofullscreen noremoteplayback"
                      disablePictureInPicture
                      onClick={handlePlayPause}
                      onContextMenu={e => e.preventDefault()}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onLoadedData={() => syncMediaProgress(true)}
                      onDurationChange={() => syncMediaProgress(true)}
                      onPlaying={() => syncMediaProgress(true)}
                      /* Não forçar play() em onCanPlay (ver nota no bloco fullscreen). */
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    />
                    </div>

                    <div
                      className="absolute inset-0 z-[5]"
                      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', pointerEvents: 'none' }}
                      onContextMenu={e => e.preventDefault()}
                    />
                    <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 bg-gradient-to-t from-black/70 to-transparent z-10">
                      <input
                        ref={progressInputRef}
                        type="range" min={0} max={duration || stableProgressRef.current.duration || 1} step={0.1} defaultValue={stableProgressRef.current.currentTime}
                        onChange={handleSeek}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => { e.stopPropagation(); beginSeek(); }} onMouseUp={endSeek}
                        onTouchStart={(e) => { e.stopPropagation(); beginSeek(); }} onTouchEnd={endSeek}
                        className="w-full h-1 appearance-none bg-white/30 rounded-full cursor-pointer mb-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1 items-center min-w-0">
                          <Button variant="ghost" size="icon" aria-label={isPlaying ? 'Pausar' : 'Reproduzir'} className="h-8 w-8 text-white hover:bg-white/20 shrink-0" onClick={handlePlayPause}>
                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={isMuted || volume === 0 ? 'Ativar som' : 'Silenciar'} className="h-8 w-8 text-white hover:bg-white/20 shrink-0" onClick={(e) => { e.stopPropagation(); toggleMute(); }}>
                            {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                          </Button>
                          <input
                            type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            className="w-16 sm:w-20 h-1 appearance-none bg-white/30 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                            aria-label="Volume"
                          />
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2 text-xs font-bold text-white hover:bg-white/20 shrink-0"
                            onClick={cyclePlaybackRate}
                            aria-label="Velocidade de reprodução"
                          >
                            {playbackRate}x
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-white hover:bg-white/20 shrink-0"
                            onClick={cycleRotation}
                            aria-label={`Rotacionar vídeo (${rotation}°)`}
                            title={`Rotacionar (${rotation}°)`}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 text-white/80 text-xs" title="Visualizações únicas">
                            <Eye className="h-3.5 w-3.5" />
                            <span>{viewsCount ?? '—'}</span>
                          </div>
                          <span ref={timeLabelRef} className="text-xs text-white/80 font-mono">{formatTime(stableProgressRef.current.currentTime)} / {formatTime(duration || stableProgressRef.current.duration)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <img
                    key={currentIsGif ? `gif-${currentMediaIndex}-${currentMedia}` : undefined}
                    src={currentMedia}
                    alt="Post content"
                    className={cn("w-full h-full object-contain select-none", currentIsGif && "image-rendering-auto")}
                    style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    data-media-type={currentIsGif ? 'image/gif' : undefined}
                    onClick={(e) => { e.stopPropagation(); setIsFullscreen(true); }}
                    onContextMenu={e => e.preventDefault()}
                  />
                )
              )}

              {/* Carousel arrows */}
              {hasMultipleMedia && currentMediaIndex > 0 && (
                <Button
                  variant="ghost" size="icon"
                  className="absolute left-1 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); goToPrev(); }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              {hasMultipleMedia && currentMediaIndex < mediaUrls.length - 1 && (
                <Button
                  variant="ghost" size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full h-8 w-8"
                  onClick={(e) => { e.stopPropagation(); goToNext(); }}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              )}

              {/* Dots indicator */}
              {hasMultipleMedia && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {mediaUrls.map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setCurrentMediaIndex(i); }}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all",
                        i === currentMediaIndex ? "bg-white w-3" : "bg-white/40"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 2. AUTHOR HEADER */}
            <div className="p-2.5 border-b bg-background shrink-0">
              <div className="flex items-center gap-3">
                <Link to={`/creator/${authorRouteId}`}>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={buildSupabaseImageThumb(author?.avatar_url, { width: 96, quality: 72 }) || author?.avatar_url || ''} />
                    <AvatarFallback>{(author?.username || '?')[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link to={`/creator/${authorRouteId}`} className="font-semibold text-sm hover:underline truncate">
                      {getPublicHandle(author as any)}
                    </Link>
                    {author?.is_verified && (
                      <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">@{author?.username || 'usuario'}</p>
                </div>
                {getVisibilityBadge()}
              </div>
            </div>

            {/* 3. DESCRIPTION */}
            {post.content_text && (
              <div className="px-3 py-2 border-b bg-background shrink-0">
                <p className="text-sm line-clamp-2">{post.content_text}</p>
              </div>
            )}
          </div>

          {/* 4. ACTION BUTTONS — shrink-0, sempre visível acima dos comentários */}
          <div
            className="shrink-0 z-30 flex items-center gap-1 px-2 py-1.5 border-y bg-background/95 backdrop-blur-sm"
          >
            <Button
              variant="ghost" size="sm"
              onClick={handleLike}
              disabled={likePost.isPending}
              className={cn(
                "flex-1 gap-1.5 h-9 text-primary hover:bg-primary/10",
                isLiked && "bg-primary/10"
              )}
            >
              <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
              <span className="text-sm">{post.likes_count}</span>
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={handleDislike}
              disabled={dislikePost.isPending}
              className={cn(
                "flex-1 gap-1.5 h-9 text-destructive hover:bg-destructive/10",
                isDisliked && "bg-destructive/10"
              )}
            >
              <ThumbsDown className={cn("h-5 w-5", isDisliked && "fill-current")} />
              <span className="text-sm">{(post as any).dislikes_count || 0}</span>
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={handleSave}
              disabled={savePost.isPending}
              className={cn(
                "flex-1 gap-1.5 h-9 text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10",
                isSaved && "bg-[hsl(45,93%,47%)]/10"
              )}
            >
              <Bookmark className={cn("h-5 w-5", isSaved && "fill-current")} />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowCommentsModal(true)}
              className="flex-1 gap-1.5 h-9 text-muted-foreground hover:bg-muted/50"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-sm">{commentsCount}</span>
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowShareModal(true)}
              className="flex-1 gap-1.5 h-9 text-secondary hover:bg-secondary/10"
            >
              <Share2 className="h-5 w-5" />
            </Button>
          </div>

          {/* Counts compactos — sem área fixa de comentários ocupando o vídeo */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 bg-background text-sm border-b">
            <button onClick={() => setShowLikersModal(true)} className="font-medium hover:underline">
              {post.likes_count} {post.likes_count === 1 ? 'curtida' : 'curtidas'}
            </button>
            <button onClick={() => setShowCommentsModal(true)} className="text-muted-foreground hover:text-foreground transition-colors">
              {commentsCount} {commentsCount === 1 ? 'comentário' : 'comentários'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCommentsModal} onOpenChange={setShowCommentsModal}>
        <DialogContent className="max-w-lg w-[95vw] h-[80dvh] max-h-[80dvh] p-0 gap-0 overflow-hidden flex flex-col rounded-xl">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background">
            <div>
              <DialogTitle className="text-base">Comentários</DialogTitle>
              <DialogDescription className="text-xs">
                {commentsCount} {commentsCount === 1 ? 'comentário' : 'comentários'} neste post
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon" aria-label="Fechar comentários" onClick={() => setShowCommentsModal(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 bg-background overflow-hidden">
            <CommentSection postId={post.id} fillHeight className="h-full" />
          </div>
        </DialogContent>
      </Dialog>

      <LikersModal open={showLikersModal} onOpenChange={setShowLikersModal} postId={post.id} likesCount={post.likes_count} />
      <SharePostModal open={showShareModal} onOpenChange={setShowShareModal} postId={post.id} postPreview={post.content_text || undefined} />
    </>
  );
}
