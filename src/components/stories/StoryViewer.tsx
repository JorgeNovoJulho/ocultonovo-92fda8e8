import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Clock, Eye, Pause, Play, Send, Users, ThumbsUp, ThumbsDown, Flag, Volume2, VolumeX, ImageOff, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { isGifUrl } from '@/lib/mediaType';
import { 
  type UserWithStories, 
  type FlashStory, 
  formatTimeRemaining, 
  useMarkStoryViewed 
} from '@/hooks/useFlashStories';
import { useStoryViews, useStoryViewCount } from '@/hooks/useStoryViews';
import { useStoryMetricsRealtime } from '@/hooks/useStoryMetricsRealtime';
import { 
  useLikeStory, 
  useDislikeStory,
  useStoryLikeStatus,
  useStoryDislikeStatus,
  useStoryLikeCount,
  useStoryDislikeCount,
  useStoryLikers,
  useStoryDislikers
} from '@/hooks/useStoryLikes';
import { useReplyToStory } from '@/hooks/useReplyToStory';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { VerifiedCoupleBadge } from '@/components/VerifiedCoupleBadge';
import { Badge } from '@/components/ui/badge';
import { StoryReportModal } from './StoryReportModal';
// LikeAnimation removida a pedido do usuário — corações poluíam a foto.

interface StoryViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userStories: UserWithStories;
  onNavigateUser: (direction: 'prev' | 'next') => void;
  hasNextUser: boolean;
  hasPrevUser: boolean;
}

const STORY_DURATION = 5000;

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Lê fragmento Media Fragments `#t=start,end` de uma URL de vídeo.
 * Retorna [start, end] em segundos, ou null se ausente.
 * Usado para suportar capítulos virtuais (mesma mídia, ranges diferentes)
 * compartilhando cache HTTP — fragmento `#` nunca é enviado ao servidor.
 */
function parseTimeFragment(url: string): { start: number; end: number } | null {
  if (!url) return null;
  const m = url.match(/#t=([\d.]+)(?:,([\d.]+))?/i);
  if (!m) return null;
  const start = parseFloat(m[1]);
  const end = m[2] ? parseFloat(m[2]) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start) || start < 0) return null;
  return { start, end };
}

/**
 * Remove o fragmento `#t=` para gerar uma URL "limpa" usada no atributo `src`
 * do <video>. Isso garante compatibilidade com navegadores que ignoram Media
 * Fragments (alguns WebViews antigos/Android) — a fatia do capítulo é então
 * aplicada manualmente via JS (seek inicial + clamp em onTimeUpdate).
 */
function stripTimeFragment(url: string): string {
  if (!url) return url;
  return url.replace(/#t=[\d.,]+/i, '');
}

function isStoryVideoUrl(url?: string | null): boolean {
  return !!url && /\.(mp4|mov|webm|ogg|m4v|m3u8)(\?|#|$)/i.test(url);
}

function preserveTimeFragment(preferredUrl: string | null | undefined, originalUrl: string): string {
  const preferred = preferredUrl || originalUrl;
  if (!preferred || preferred.includes('#t=') || !originalUrl.includes('#t=')) return preferred;
  const fragment = originalUrl.match(/#t=[\d.,]+/i)?.[0];
  return fragment ? `${preferred}${fragment}` : preferred;
}

/**
 * Lê condições de rede (Network Information API) para decidir quantos
 * capítulos pré-carregar. Em 2G/3G ou Data Saver, reduz para 1 ou 0 e
 * evita saturar a conexão de celulares fracos.
 */
function getPreloadBudget(): { count: number; preloadAttr: 'auto' | 'metadata' | 'none' } {
  if (typeof navigator === 'undefined') return { count: 2, preloadAttr: 'metadata' };
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  // MOBILE: nunca pré-carrega vídeos paralelos — eles competem por banda
  // com o player principal e causam travamentos/reinício no iOS/Android.
  // O player principal usa `preload="metadata"` para iniciar rápido sem
  // baixar o arquivo inteiro de uma vez.
  if (isCoarsePointer) return { count: 0, preloadAttr: 'metadata' };
  if (!conn) return { count: 2, preloadAttr: 'metadata' };
  if (conn.saveData) return { count: 0, preloadAttr: 'none' };
  const et = String(conn.effectiveType || '').toLowerCase();
  if (et.includes('2g')) return { count: 0, preloadAttr: 'none' };
  if (et === '3g') return { count: 1, preloadAttr: 'metadata' };
  // 4g / wifi / unknown — desktop apenas
  return { count: 2, preloadAttr: 'auto' };
}

type InteractionTab = 'views' | 'likes' | 'dislikes';

export function StoryViewer({
  open,
  onOpenChange,
  userStories,
  onNavigateUser,
  hasNextUser,
  hasPrevUser,
}: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [activeTab, setActiveTab] = useState<InteractionTab>('views');
  const [replyText, setReplyText] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  // showLikeAnimation removido — efeito de corações desativado
  const [nextImageLoaded, setNextImageLoaded] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // SEMPRE inicia em MUTE
  const [volume, setVolume] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.7;
    try {
      const raw = window.localStorage.getItem('story-viewer:volume');
      const v = raw ? parseFloat(raw) : 0.7;
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.7;
    } catch { return 0.7; }
  });
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [optimisticallyDeletedStoryIds, setOptimisticallyDeletedStoryIds] = useState<Set<string>>(() => new Set());
  // Indicador NÃO-bloqueante: aparece como pílula flutuante enquanto o
  // delete real (DB + storage) roda em background. UI continua usável.
  const [bgDeleteProgress, setBgDeleteProgress] = useState<null | 'processing' | 'error'>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Guard: garante que o salto p/ chapterStart só ocorra uma vez por capítulo,
  // evitando loop de re-seek em mobile que causava travamento/reinício do vídeo.
  const chapterSeekedRef = useRef<string | null>(null);
  const manualEndedRef = useRef<string | null>(null);
  const initialVideoSeekRef = useRef<string | null>(null);
  const initialVideoPlayRef = useRef<string | null>(null);
  const pendingPlayAfterSeekRef = useRef<string | null>(null);
  const videoTimeUpdateRafRef = useRef<number | null>(null);
  const videoFrameWatchRef = useRef({ time: 0, frames: 0, stuckTicks: 0 });
  const seekGesture = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTime: number;
    seeking: boolean;
    wasPlaying: boolean;
    pointerId: number | null;
  }>({ active: false, startX: 0, startY: 0, startTime: 0, seeking: false, wasPlaying: false, pointerId: null });
  const [seekPreview, setSeekPreview] = useState<{ delta: number; target: number } | null>(null);

  // Persiste volume (mute permanece sempre default = true em cada abertura).
  useEffect(() => {
    try { window.localStorage.setItem('story-viewer:volume', String(volume)); } catch {}
  }, [volume]);

  useEffect(() => () => {
    if (videoTimeUpdateRafRef.current !== null) cancelAnimationFrame(videoTimeUpdateRafRef.current);
  }, []);
  
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const markViewed = useMarkStoryViewed();
  const replyToStory = useReplyToStory();
  
  const stories = userStories.stories.filter((story) => !optimisticallyDeletedStoryIds.has(story.id));
  const currentStory = stories[currentIndex];
  const author = userStories.author;

  const removeStoryFromLocalCaches = useCallback((storyId: string) => {
    const pruneGroups = (old: UserWithStories[] | undefined) => {
      if (!old) return old;
      return old
        .map((group) => {
          const nextStories = group.stories.filter((story) => story.id !== storyId);
          return {
            ...group,
            stories: nextStories,
            hasUnviewed: nextStories.some((story) => !story.is_viewed),
            oldestUnviewedProgress: nextStories.reduce((min, story) => {
              if (story.is_viewed) return min;
              return Math.min(min, Math.max(0, Math.min(1, story.time_remaining / (24 * 60 * 60 * 1000))));
            }, 1),
          };
        })
        .filter((group) => group.stories.length > 0);
    };

    const pruneUnknownPostsCache = (old: any): any => {
      if (!old) return old;
      if (Array.isArray(old)) return old.filter((item) => item?.id !== storyId);
      if (Array.isArray(old.pages)) return { ...old, pages: old.pages.map(pruneUnknownPostsCache) };
      if (Array.isArray(old.posts)) return { ...old, posts: old.posts.filter((item: any) => item?.id !== storyId) };
      if (Array.isArray(old.data)) return { ...old, data: old.data.filter((item: any) => item?.id !== storyId) };
      return old;
    };

    queryClient.setQueriesData<UserWithStories[]>({ queryKey: ['flash-stories'] }, pruneGroups);
    queryClient.setQueriesData<FlashStory[]>({ queryKey: ['my-flash-stories'] }, (old) =>
      Array.isArray(old) ? old.filter((story) => story.id !== storyId) : old,
    );
    queryClient.setQueriesData<UserWithStories | null>({ queryKey: ['user-flash-stories'] }, (old) => {
      if (!old) return old;
      const nextStories = old.stories.filter((story) => story.id !== storyId);
      if (nextStories.length === 0) return null;
      return { ...old, stories: nextStories, hasUnviewed: nextStories.some((story) => !story.is_viewed) };
    });
    queryClient.setQueriesData({ queryKey: ['posts'] }, pruneUnknownPostsCache);
    queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, pruneUnknownPostsCache);
    queryClient.setQueriesData({ queryKey: ['creator-posts'] }, pruneUnknownPostsCache);
  }, [queryClient]);

  // Carousel: get all images for the current story
  const carouselUrls: string[] = currentStory
    ? (currentStory.media_urls && currentStory.media_urls.length > 0)
      ? currentStory.media_urls
      : currentStory.media_url
        ? [currentStory.media_url]
        : []
    : [];
  const totalSlides = Math.max(carouselUrls.length, 1);
  const isCarousel = carouselUrls.length > 1;
  const rawCurrentMediaUrl = carouselUrls[imageIndex] || '';
  const preferredStoryVideoUrl = currentStory?.video_master_url || currentStory?.video_preview_url || null;
  const primaryStoryVideoUrl = currentStory?.media_url || carouselUrls[0] || '';
  const canUsePreferredStoryVideo =
    !!preferredStoryVideoUrl &&
    isStoryVideoUrl(rawCurrentMediaUrl) &&
    (imageIndex === 0 || stripTimeFragment(rawCurrentMediaUrl) === stripTimeFragment(primaryStoryVideoUrl));
  const currentMediaUrl = canUsePreferredStoryVideo
    ? preserveTimeFragment(preferredStoryVideoUrl, rawCurrentMediaUrl)
    : rawCurrentMediaUrl;
  const isVideo = isStoryVideoUrl(currentMediaUrl);
  const isGif = isGifUrl(currentMediaUrl);

  // Capítulo virtual derivado do fragmento `#t=start,end`. Para vídeos comuns
  // (sem fragmento) cai num intervalo "do começo ao fim" tratado em runtime.
  const chapter = parseTimeFragment(currentMediaUrl);
  const chapterStart = chapter?.start ?? 0;
  const chapterEndRaw = chapter?.end ?? Number.POSITIVE_INFINITY;
  // Src "compatível" sem fragmento — alguns WebViews antigos ignoram `#t=`.
  // Aplicamos o range manualmente via JS (seek + clamp).
  const compatVideoSrc = stripTimeFragment(currentMediaUrl);
  const videoSessionKey = currentStory
    ? `${currentStory.id}:${imageIndex}:${compatVideoSrc}:${chapterStart}:${chapterEndRaw}`
    : null;
  const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  // Orçamento de pré-carregamento sensível à rede (2G/3G/Data Saver reduz).
  const preloadBudget = (typeof window !== 'undefined') ? getPreloadBudget() : { count: 3, preloadAttr: 'auto' as const };

  // Mídias do próximo story (1ª URL) e do próximo slide do carrossel — sempre
  // pré-carregadas para que swipe/tap avancem sem "tela preta" mesmo em 3G.
  const nextStoryFirstUrl: string | null = (() => {
    const next = stories[currentIndex + 1];
    if (!next) return null;
    if (next.media_urls && next.media_urls.length > 0) return next.media_urls[0];
    return next.media_url || null;
  })();

  const carouselPreloadUrls = carouselUrls.slice(imageIndex + 1, imageIndex + 1 + preloadBudget.count);

  // Lista única (sem duplicatas) de vídeos a serem pré-carregados em hidden <video>.
  const preloadUrls: string[] = Array.from(new Set([
    ...carouselPreloadUrls.filter(isStoryVideoUrl),
    ...(nextStoryFirstUrl && isStoryVideoUrl(nextStoryFirstUrl) ? [nextStoryFirstUrl] : []),
  ]));

  // URLs de imagem a serem pré-carregadas via <img loading="eager"> oculto.
  const preloadImageUrls: string[] = Array.from(new Set([
    ...carouselPreloadUrls.filter((u) => !isStoryVideoUrl(u)),
    ...(nextStoryFirstUrl && !isStoryVideoUrl(nextStoryFirstUrl) ? [nextStoryFirstUrl] : []),
  ]));

  // Buffer/preload status para indicador visual no player.
  const [isBuffering, setIsBuffering] = useState(false);
  const [preloadReady, setPreloadReady] = useState<Record<string, boolean>>({});
  // Reset preload tracker quando o carrossel muda.
  useEffect(() => { setPreloadReady({}); setIsBuffering(false); }, [currentIndex, imageIndex]);


  // Verificar se o usuário atual é o dono do story
  const isOwner = profile?.id === userStories.userId;
  const shouldShowFooter = !showViewers && !!user;

  // Dynamic footer offset: measured at runtime so portrait/landscape rotations,
  // safe-area changes and content variations never cause overlap.
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [measuredFooter, setMeasuredFooter] = useState<number>(0);
  useEffect(() => {
    if (!shouldShowFooter) {
      setMeasuredFooter(0);
      return;
    }
    const el = footerRef.current;
    if (!el) return;
    const update = () => setMeasuredFooter(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [shouldShowFooter, isOwner, open]);
  const footerOffset = shouldShowFooter
    ? (measuredFooter > 0 ? `${measuredFooter}px` : (isOwner ? '6rem' : '8.5rem'))
    : '0px';
  
  // Hooks de visualização
  const { data: viewCount } = useStoryViewCount(currentStory?.id || null);
  const { data: viewers } = useStoryViews(isOwner && showViewers ? currentStory?.id : null);

  // Realtime: invalida counts/likers quando outros usuários reagem/visualizam
  useStoryMetricsRealtime(currentStory?.id || null);

  // Hooks de like/dislike
  const likeStory = useLikeStory();
  const dislikeStory = useDislikeStory();
  const { data: isLiked } = useStoryLikeStatus(currentStory?.id);
  const { data: isDisliked } = useStoryDislikeStatus(currentStory?.id);
  const { data: likeCount } = useStoryLikeCount(currentStory?.id);
  const { data: dislikeCount } = useStoryDislikeCount(currentStory?.id);
  const { data: likers } = useStoryLikers(isOwner && showViewers && activeTab === 'likes' ? currentStory?.id : null);
  const { data: dislikers } = useStoryDislikers(isOwner && showViewers && activeTab === 'dislikes' ? currentStory?.id : null);

  // Reset ao mudar de usuário
  useEffect(() => {
    setCurrentIndex(0);
    setImageIndex(0);
    setProgress(0);
    setIsPaused(false);
    setShowViewers(false);
    setActiveTab('views');
    setReplyText('');
    setShowReportModal(false);
    // showLikeAnimation removido
    setNextImageLoaded(false);
    setMediaError(false);
    setIsVideoPlaying(false);
    setOptimisticallyDeletedStoryIds(new Set());
  }, [userStories.userId]);

  // Reset media error when story changes
  useEffect(() => {
    setMediaError(false);
    setIsVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    chapterSeekedRef.current = null; // libera clamp para o novo capítulo
    manualEndedRef.current = null;
    initialVideoSeekRef.current = null;
    initialVideoPlayRef.current = null;
    pendingPlayAfterSeekRef.current = null;
    videoFrameWatchRef.current = { time: 0, frames: 0, stuckTicks: 0 };
    if (videoTimeUpdateRafRef.current !== null) {
      cancelAnimationFrame(videoTimeUpdateRafRef.current);
      videoTimeUpdateRafRef.current = null;
    }
  }, [currentIndex, imageIndex]);

  const syncVideoElementState = useCallback((video: HTMLVideoElement) => {
    video.defaultMuted = isMuted;
    video.muted = isMuted;
    video.volume = volume;
  }, [isMuted, volume]);

  const attemptVideoPlay = useCallback(async (reason: 'auto' | 'resume' = 'auto') => {
    const v = videoRef.current;
    if (!v || !open || !isVideo || isPaused || showViewers || mediaError) return;
    syncVideoElementState(v);
    if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setIsBuffering(true);
      return;
    }
    if (reason === 'auto' && videoSessionKey) {
      if (initialVideoPlayRef.current === videoSessionKey) return;
      initialVideoPlayRef.current = videoSessionKey;
    }
    try {
      const playPromise = v.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
    } catch {
      // Mantém overlay de play visível quando autoplay for bloqueado no mobile.
    }
  }, [mediaError, isPaused, isVideo, open, showViewers, syncVideoElementState, videoSessionKey]);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    syncVideoElementState(video);
    setIsBuffering(false);
    if (!videoSessionKey) return;

    if (chapterStart > 0 && initialVideoSeekRef.current !== videoSessionKey) {
      const target = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(chapterStart, Math.max(0, video.duration - 0.1))
        : chapterStart;
      initialVideoSeekRef.current = videoSessionKey;
      if (Math.abs(video.currentTime - target) > 0.25) {
        pendingPlayAfterSeekRef.current = videoSessionKey;
        try {
          video.currentTime = target;
          return;
        } catch {
          pendingPlayAfterSeekRef.current = null;
        }
      }
    }

    if (pendingPlayAfterSeekRef.current === videoSessionKey) {
      if (Math.abs(video.currentTime - chapterStart) > 0.35) return;
      pendingPlayAfterSeekRef.current = null;
    }

    void attemptVideoPlay('auto');
  }, [attemptVideoPlay, chapterStart, syncVideoElementState, videoSessionKey]);

  // Mantém a função mais recente em ref para o efeito de retomada NÃO
  // re-disparar play() a cada mudança de volume/mute/etc (era a causa de
  // reinício e travamento em mobile — múltiplos play() concorrentes durante
  // o seek inicial do capítulo).
  const attemptVideoPlayRef = useRef(attemptVideoPlay);
  useEffect(() => { attemptVideoPlayRef.current = attemptVideoPlay; }, [attemptVideoPlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (!open || !isVideo || !v) return;

    if (isPaused || showViewers) {
      if (!v.paused) v.pause();
      return;
    }

    // Não tentar replay quando há mediaError — evita loop infinito de
    // reinício no mobile quando uma fonte falha e o componente remonta.
    if (mediaError) return;

    if (pendingPlayAfterSeekRef.current === videoSessionKey) {
      setIsBuffering(true);
      return;
    }

    // Se o vídeo já está tocando, não chamar play() de novo (evita AbortError
    // silencioso que congela alguns Androids).
    if (!v.paused && !v.ended) return;

    void attemptVideoPlayRef.current('resume');
    // mediaError fora das deps de propósito: ele só é checado, mudanças
    // são tratadas pelo remount do <video> (key inclui src).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isVideo, isPaused, showViewers, currentStory?.id, imageIndex, videoSessionKey]);


  // Registrar visualização sempre que abrir/trocar de story.
  // RPC story_view_register é idempotente (PK story_id+viewer), seguro chamar sempre.
  // Sem gate em is_viewed: para o dono, is_viewed já vem true e ignorava o registro,
  // por isso o contador ficava 0 mesmo com visualizadores reais.
  useEffect(() => {
    if (open && currentStory?.id) {
      markViewed.mutate(currentStory.id);
    }
  }, [currentStory?.id, open]);

  // Timer de progresso (NÃO roda enquanto há vídeo: vídeo controla o avanço)
  useEffect(() => {
    if (!open || isPaused || showViewers) return;
    if (isVideo) return; // vídeo controla próprio progresso via onTimeUpdate/onEnded

    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / (STORY_DURATION / 100));
        
        if (newProgress >= 100) {
          // If carousel, advance to next slide first
          if (isCarousel && imageIndex < carouselUrls.length - 1) {
            setImageIndex(i => i + 1);
            setNextImageLoaded(false);
            return 0;
          }
          
          // Next story or next user
          if (currentIndex < stories.length - 1) {
            setCurrentIndex(i => i + 1);
            setImageIndex(0);
            return 0;
          } else if (hasNextUser) {
            onNavigateUser('next');
            return 0;
          } else {
            onOpenChange(false);
            return 100;
          }
        }
        
        return newProgress;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [open, isPaused, showViewers, currentIndex, stories.length, hasNextUser, isCarousel, imageIndex, carouselUrls.length, isVideo]);

  // Navegação por teclado — funciona SEMPRE (independente de buffering),
  // pois setas chamam goToPrevious/goToNext que não dependem de videoRef.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se foco estiver dentro de input/textarea (ex.: campo de resposta)
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        // Permite Escape mesmo dentro de input
        if (e.key !== 'Escape') return;
      }

      // Setas com Shift fazem SEEK no vídeo ativo (±5s). Sem Shift, navegam stories.
      if (isVideo && videoRef.current && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.shiftKey) {
        e.preventDefault();
        const v = videoRef.current;
        const delta = e.key === 'ArrowRight' ? 5 : -5;
        v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta));
        setVideoCurrentTime(v.currentTime);
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'p':
        case 'P':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
        case 'n':
        case 'N':
          e.preventDefault();
          goToNext();
          break;
        case 'ArrowUp':
          if (hasPrevUser) {
            e.preventDefault();
            onNavigateUser('prev');
          }
          break;
        case 'ArrowDown':
          if (hasNextUser) {
            e.preventDefault();
            onNavigateUser('next');
          }
          break;
        case 'Home':
          e.preventDefault();
          setCurrentIndex(0);
          setImageIndex(0);
          setProgress(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentIndex(Math.max(0, stories.length - 1));
          setImageIndex(0);
          setProgress(0);
          break;
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (isVideo && videoRef.current) {
            if (videoRef.current.paused) videoRef.current.play().catch(() => {});
            else videoRef.current.pause();
          } else {
            setIsPaused(p => !p);
          }
          break;
        case 'm':
        case 'M':
          if (isVideo && videoRef.current) {
            const next = !isMuted;
            setIsMuted(next);
            videoRef.current.muted = next;
          }
          break;
        case 'Escape':
          if (showViewers) {
            setShowViewers(false);
          } else {
            onOpenChange(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentIndex, showViewers, isVideo, isMuted, hasPrevUser, hasNextUser, stories.length]);

  const goToPrevious = useCallback(() => {
    // If carousel, go to previous slide first
    if (isCarousel && imageIndex > 0) {
      setImageIndex(i => i - 1);
      setProgress(0);
      return;
    }
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setImageIndex(0);
      setProgress(0);
    } else if (hasPrevUser) {
      onNavigateUser('prev');
    }
  }, [currentIndex, hasPrevUser, onNavigateUser, isCarousel, imageIndex]);

  const goToNext = useCallback(() => {
    // If carousel, advance to next slide first
    if (isCarousel && imageIndex < carouselUrls.length - 1) {
      setImageIndex(i => i + 1);
      setProgress(0);
      setNextImageLoaded(false);
      return;
    }
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(i => i + 1);
      setImageIndex(0);
      setProgress(0);
    } else if (hasNextUser) {
      onNavigateUser('next');
    } else {
      onOpenChange(false);
    }
  }, [currentIndex, stories.length, hasNextUser, onNavigateUser, onOpenChange, isCarousel, imageIndex, carouselUrls.length]);

  // Trava navegação enquanto o vídeo ainda está carregando o primeiro frame
  // — evita múltiplos cliques durante buffering inicial.
  const navLocked = isVideo && isBuffering && progress < 1;

  const setVideoPausedState = useCallback((paused: boolean) => {
    setIsPaused(paused);

    const v = videoRef.current;
    if (!v) return;

    syncVideoElementState(v);

    if (paused) {
      if (!v.paused) v.pause();
      return;
    }

    if (v.paused) {
      void attemptVideoPlay('resume');
    }
  }, [attemptVideoPlay, syncVideoElementState]);

  const handleVideoSurfaceTap = useCallback((clientX: number, bounds: DOMRect) => {
    if (showViewers) return;

    const tapX = clientX - bounds.left;
    const width = bounds.width;

    // Avançar/voltar sempre permitido (mesmo durante buffering — o próximo
    // story já está pré-carregado em <video> oculto).
    if (tapX < width / 3) {
      goToPrevious();
      return;
    }

    if (tapX > (width * 2) / 3) {
      goToNext();
      return;
    }

    // Apenas o tap central (pausar/retomar) respeita navLocked — não faz
    // sentido pausar/retomar antes do primeiro frame estar pronto.
    if (navLocked) return;
    setVideoPausedState(!isPaused);
  }, [showViewers, navLocked, goToPrevious, goToNext, setVideoPausedState, isPaused]);

  // Tap/swipe nas laterais (para stories de imagem) — vídeo tem camada própria
  const imgGesture = useRef<{ x: number; y: number; t: number } | null>(null);
  const handleClick = (_e: React.MouseEvent) => {
    // No-op: navegação para imagem ocorre via onPointerUp para suportar swipe.
  };
  const handleImagePointerDown = (e: React.PointerEvent) => {
    // navLocked não bloqueia mais: swipe/tap devem funcionar mesmo se a próxima
    // mídia ainda está carregando (o pré-carregamento global cobre isso).
    if (showViewers || isVideo) return;
    imgGesture.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const handleImagePointerUp = (e: React.PointerEvent) => {
    if (showViewers || isVideo) return;
    const g = imgGesture.current;
    imgGesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const dt = Date.now() - g.t;
    const isSwipe = dt < 400 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2;
    if (isSwipe) {
      if (dx < 0) goToNext(); else goToPrevious();
      return;
    }
    // Tap: navegação por terço da tela
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    if (x < w / 3) goToPrevious();
    else if (x > (w * 2) / 3) goToNext();
    else setIsPaused(p => !p);
  };

  // Enviar resposta
  const handleSendReply = async () => {
    if (!replyText.trim() || !currentStory || isOwner) return;
    
    setIsPaused(true);
    
    await replyToStory.mutateAsync({
      storyId: currentStory.id,
      authorProfileId: userStories.userId,
      content: replyText.trim()
    });
    
    setReplyText('');
    setIsPaused(false);
  };

  // Handlers de like/dislike
  // Handlers de like/dislike (sem animação de corações)
  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentStory || isOwner) return;
    likeStory.mutate({ storyId: currentStory.id, isLiked: !!isLiked });
  };

  const handleDislike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentStory || isOwner) return;
    dislikeStory.mutate({ storyId: currentStory.id, isDisliked: !!isDisliked });
  };

  // Delete story handler — realmente otimista: remove da UI/cache antes do DB
  // e roda DB + storage em background, sem AlertDialog aninhado do Radix.
  const handleDeleteStory = () => {
    if (!currentStory || !isOwner || isDeleting) return;
    const storyId = currentStory.id;
    const mediaUrl = currentStory.media_url;
    const mediaUrls = currentStory.media_urls ?? [];
    const remainingStories = stories.filter((story) => story.id !== storyId);

    setShowDeleteConfirm(false);
    setIsDeleting(true);
    setBgDeleteProgress('processing');
    setOptimisticallyDeletedStoryIds((prev) => {
      const next = new Set(prev);
      next.add(storyId);
      return next;
    });
    removeStoryFromLocalCaches(storyId);
    try { videoRef.current?.pause(); } catch {}

    if (remainingStories.length === 0) {
      onOpenChange(false);
    } else if (currentIndex >= remainingStories.length) {
      setCurrentIndex(Math.max(0, remainingStories.length - 1));
      setProgress(0);
    } else {
      setProgress(0);
    }
    setImageIndex(0);

    queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
    queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
    queryClient.invalidateQueries({ queryKey: ['user-flash-stories'] });
    queryClient.invalidateQueries({ queryKey: ['posts'] });

    toast({ title: 'Excluindo story', description: 'Removido da tela. Sincronizando em segundo plano.' });

    void (async () => {
      const diag: Record<string, unknown> = { storyId, profileId: profile?.id, userId: user?.id };
      try {
        const { supabase } = await import('@/lib/supabaseExternal');
        const { logger } = await import('@/lib/logger');

        // Delete row — tenta author_id e, se nada apagou, tenta user_id (mapeamento dual)
        let deleted = false;
        let lastError: any = null;
        try {
          const { data: d1, error: e1 } = await (supabase as any)
            .from('posts')
            .delete()
            .eq('id', storyId)
            .eq('author_id', profile?.id ?? '__none__')
            .select('id');
          if (e1) lastError = e1;
          if (!e1 && Array.isArray(d1) && d1.length > 0) deleted = true;
          diag.attempt_author_id = { ok: !e1, rows: Array.isArray(d1) ? d1.length : 0, error: e1?.message };
        } catch (err) { lastError = err; diag.attempt_author_id_throw = String(err); }

        if (!deleted && user?.id) {
          try {
            const { data: d2, error: e2 } = await (supabase as any)
              .from('posts')
              .delete()
              .eq('id', storyId)
              .eq('user_id', user.id)
              .select('id');
            if (e2) lastError = e2;
            if (Array.isArray(d2) && d2.length > 0) deleted = true;
            diag.attempt_user_id = { ok: !e2, rows: Array.isArray(d2) ? d2.length : 0, error: e2?.message };
          } catch (err) { lastError = err; diag.attempt_user_id_throw = String(err); }
        }

        if (!deleted) {
          // Último recurso: deletar só por id (RLS garante segurança no externo)
          try {
            const { data: d3, error: e3 } = await (supabase as any)
              .from('posts').delete().eq('id', storyId).select('id');
            if (e3) lastError = e3;
            if (Array.isArray(d3) && d3.length > 0) deleted = true;
            diag.attempt_id_only = { ok: !e3, rows: Array.isArray(d3) ? d3.length : 0, error: e3?.message };
          } catch (err) { lastError = err; diag.attempt_id_only_throw = String(err); }
        }

        if (!deleted) {
          logger.error('[Story][delete] DB failed', diag, lastError);
          setBgDeleteProgress('error');
          setOptimisticallyDeletedStoryIds((prev) => {
            const next = new Set(prev);
            next.delete(storyId);
            return next;
          });
          toast({
            title: 'Falha ao excluir no servidor',
            description: 'O story sumiu da tela, mas pode reaparecer. Tente novamente.',
            variant: 'destructive',
          });
          // Reverte invalidação para refletir estado real
          queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
          queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
          return;
        }

        // Limpeza de storage em paralelo (não bloqueia)
        const urls = [mediaUrl, ...mediaUrls].filter(Boolean) as string[];
        const storageResults = await Promise.all(urls.map(async (u) => {
          try {
            const m = u.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
            if (!m) return { url: u, ok: true, skipped: true };
            const { error } = await supabase.storage.from(m[1]).remove([m[2]]);
            return { url: u, ok: !error, error: error?.message };
          } catch (err) {
            return { url: u, ok: false, error: String(err) };
          }
        }));
        const storageFailed = storageResults.filter(r => !r.ok);
        if (storageFailed.length > 0) {
          logger.warn('[Story][delete] storage partial failure', storageFailed);
          // Não mostra erro destrutivo: arquivo órfão é tolerável, registro do DB já caiu
        }

        // Revalida após delete real
        queryClient.invalidateQueries({ queryKey: ['flash-stories'] });
        queryClient.invalidateQueries({ queryKey: ['my-flash-stories'] });
        queryClient.invalidateQueries({ queryKey: ['user-flash-stories'] });
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        setBgDeleteProgress(null);
        toast({ title: 'Story excluído', description: 'Exclusão concluída.' });
      } catch (err) {
        const { logger } = await import('@/lib/logger');
        logger.error('[Story][delete] unexpected', err, diag);
        setBgDeleteProgress('error');
        setOptimisticallyDeletedStoryIds((prev) => {
          const next = new Set(prev);
          next.delete(storyId);
          return next;
        });
        toast({
          title: 'Erro inesperado',
          description: 'Não foi possível concluir a exclusão.',
          variant: 'destructive',
        });
      } finally {
        setIsDeleting(false);
        // Auto-some a pílula depois de 4s mesmo em erro (toast já avisou)
        setTimeout(() => setBgDeleteProgress(null), 4000);
      }
    })();
  };


  const openInteractionPanel = (tab: InteractionTab) => {
    setActiveTab(tab);
    setShowViewers(true);
    setIsPaused(true);
  };

  if (!currentStory) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-lg w-full h-[100dvh] max-h-[100dvh] md:h-[90vh] md:max-h-[90vh] p-0 bg-black border-none rounded-none md:rounded-2xl overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Visualizador de Stories</DialogTitle>
          <DialogDescription>
            Use as setas esquerda/direita para navegar entre stories, setas para
            cima/baixo para mudar de usuário, espaço ou K para pausar/retomar,
            M para silenciar o vídeo, Home/End para ir ao início ou fim, e
            Escape para fechar. Em telas touch, toque nas laterais ou deslize
            para avançar.
          </DialogDescription>
        </VisuallyHidden.Root>

        {/* Região live para anunciar mudanças aos leitores de tela */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {`Story ${currentIndex + 1} de ${stories.length}${(author as any)?.username ? `, de @${(author as any).username}` : ''}${isBuffering ? ', carregando mídia' : ''}${isPaused ? ', pausado' : ''}`}
        </div>

        {/* Container principal */}
        <div 
          className="relative w-full h-full flex flex-col touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-inset"
          style={{ ['--story-footer-offset' as string]: footerOffset } as React.CSSProperties}
          role="region"
          aria-roledescription="carrossel de stories"
          aria-label={`Stories de ${(author as any)?.username ? `@${(author as any).username}` : 'usuário'}`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Space K M Home End Escape"
          tabIndex={0}
          onClick={handleClick}
          onPointerDown={handleImagePointerDown}
          onPointerUp={handleImagePointerUp}
        >
          {/* Barra de progresso no topo */}
          <div className="absolute top-0 left-0 right-0 z-20 p-2 bg-gradient-to-b from-black/60 to-transparent space-y-1">
            {/* Story-level progress bars */}
            <div className="flex gap-1">
              {stories.map((_, index) => (
                <div 
                  key={index} 
                  className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
                >
                  <div 
                    className="h-full bg-white transition-all duration-100 ease-linear"
                    style={{
                      width: index < currentIndex 
                        ? '100%' 
                        : index === currentIndex 
                          ? (isCarousel ? `${((imageIndex + (progress / 100)) / totalSlides) * 100}%` : `${progress}%`)
                          : '0%'
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Carousel slide indicators */}
            {isCarousel && currentStory && (
              <div className="flex gap-0.5 justify-center">
                {carouselUrls.map((_, i) => (
                  <div 
                    key={i} 
                    className="h-1 rounded-full overflow-hidden transition-all duration-200"
                    style={{ width: i === imageIndex ? 24 : 6 }}
                  >
                    <div className={cn(
                      "h-full rounded-full",
                      i < imageIndex ? "bg-white" :
                      i === imageIndex ? "bg-white" : "bg-white/40"
                    )} 
                    style={i === imageIndex ? { width: `${progress}%` } : { width: '100%' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Header com info do autor */}
          <div className="absolute top-3 left-0 right-0 z-20 flex items-start justify-between gap-2 px-3">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="w-9 h-9 border-2 border-white/50">
                <AvatarImage src={author.avatar_url || ''} />
                <AvatarFallback className="bg-primary/20 text-primary-foreground">
                  ?
                </AvatarFallback>
              </Avatar>

              <div className="flex flex-col min-w-0">
                {author.is_verified_couple && (
                  <VerifiedCoupleBadge size="sm" />
                )}
                <div className="flex items-center gap-1 text-white/70 text-[11px]">
                  <Clock className="w-3 h-3" />
                  <span>Expira em {formatTimeRemaining(currentStory.time_remaining)}</span>
                </div>
              </div>
            </div>


            <div
              className="flex items-center gap-1.5 shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Ações para o dono — contadores */}
              {isOwner && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-white bg-black/40 ring-1 ring-white/30 hover:bg-white/20 gap-1 rounded-full"
                    onClick={(e) => { e.stopPropagation(); openInteractionPanel('views'); }}
                  >
                    <Eye className="h-4 w-4" />
                    <span className="text-xs">{viewCount || 0}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-pink-300 bg-pink-500/15 ring-1 ring-pink-400/60 hover:bg-pink-500/25 gap-1 rounded-full"
                    onClick={(e) => { e.stopPropagation(); openInteractionPanel('likes'); }}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span className="text-xs">{likeCount || 0}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-red-300 bg-red-500/15 ring-1 ring-red-400/60 hover:bg-red-500/25 gap-1 rounded-full"
                    onClick={(e) => { e.stopPropagation(); openInteractionPanel('dislikes'); }}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    <span className="text-xs">{dislikeCount || 0}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-300 bg-red-500/15 ring-1 ring-red-400/60 hover:bg-red-500/25 rounded-full"
                    onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); setIsPaused(true); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}

              {/* Ações para visitantes — Like / Dislike / Denunciar com contornos coloridos */}
              {!isOwner && user && (
                <>
                  <div
                    className="h-8 px-2 inline-flex items-center gap-1 rounded-full bg-black/40 ring-1 ring-white/30 text-white"
                    title="Visualizações"
                    aria-label="Visualizações"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="text-xs font-bold">{viewCount || 0}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLike}
                    disabled={likeStory.isPending}
                    className={cn(
                      "h-8 px-2 gap-1 rounded-full ring-1 transition-all",
                      isLiked
                        ? "bg-pink-500/30 ring-pink-400 text-pink-200"
                        : "bg-black/40 ring-pink-400/70 text-pink-200 hover:bg-pink-500/20"
                    )}
                  >
                    <ThumbsUp className={cn("h-4 w-4", isLiked && "fill-pink-400")} />
                    <span className="text-xs font-bold">{likeCount || 0}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDislike}
                    disabled={dislikeStory.isPending}
                    className={cn(
                      "h-8 px-2 gap-1 rounded-full ring-1 transition-all",
                      isDisliked
                        ? "bg-red-500/30 ring-red-400 text-red-200"
                        : "bg-black/40 ring-red-400/70 text-red-200 hover:bg-red-500/20"
                    )}
                  >
                    <ThumbsDown className={cn("h-4 w-4", isDisliked && "fill-red-400")} />
                    <span className="text-xs font-bold">{dislikeCount || 0}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-amber-300 bg-black/40 ring-1 ring-amber-400/70 hover:bg-amber-500/20 rounded-full"
                    onClick={(e) => { e.stopPropagation(); setShowReportModal(true); setIsPaused(true); }}
                    aria-label="Denunciar"
                  >
                    <Flag className="h-4 w-4" />
                  </Button>
                </>
              )}

              {/* Botão pausar/play */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoPausedState(!isPaused);
                }}
              >
                {isPaused ? <Play className="h-4 w-4" fill="white" /> : <Pause className="h-4 w-4" fill="white" />}
              </Button>

              {/* Fechar */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); onOpenChange(false); }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Conteúdo do story */}
          <div
            className="flex-1 min-h-0 flex items-center justify-center bg-black relative overflow-hidden"
            style={{ paddingBottom: 'var(--story-footer-offset)' }}
          >
            {/* Blurred background for images */}
            {carouselUrls.length > 0 && !isVideo && !isGif && !mediaError && (
              <img loading="lazy" decoding="async"
                src={currentMediaUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-30"
                aria-hidden="true"
              />
            )}

            {mediaError ? (
              /* Error fallback */
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center z-10">
                <ImageOff className="h-12 w-12 text-white/30" />
                <p className="text-white/60 text-sm">Mídia indisponível</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToNext();
                  }}
                >
                  Pular →
                </Button>
              </div>
            ) : carouselUrls.length > 0 ? (
              <>
                {isVideo ? (
                  /* Video player — autoplay muted, plays in full, then advances */
                  <div
                    className="relative w-full h-full flex items-center justify-center z-[1] px-2 pt-16 md:px-3 md:pt-20"
                    style={{ maxHeight: 'calc(100% - var(--story-footer-offset))' }}
                  >
                    <video
                      ref={videoRef}
                      key={`video-${currentStory.id}-${imageIndex}`}
                      src={compatVideoSrc}
                      className="block w-auto h-auto max-w-full max-h-full object-contain select-none"
                      style={{ WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties}
                      muted={isMuted}
                      autoPlay
                      playsInline
                      {...({ 'webkit-playsinline': 'true' } as any)}
                      preload={preloadBudget.preloadAttr}
                      {...({ disableRemotePlayback: true } as any)}
                      controlsList="nodownload noremoteplayback"
                      onError={() => setMediaError(true)}
                      onWaiting={() => setIsBuffering(true)}
                      onStalled={() => setIsBuffering(true)}
                      onCanPlay={(e) => handleVideoReady(e.currentTarget)}
                      onPlaying={() => setIsBuffering(false)}
                      onSuspend={() => setIsBuffering(false)}
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        const fileDur = v.duration || 0;
                        const effectiveEnd = Math.min(chapterEndRaw, fileDur || chapterEndRaw);
                        const chapterDur = Math.max(0, effectiveEnd - chapterStart);
                        setVideoDuration(chapterDur || fileDur);
                        handleVideoReady(v);
                      }}
                      onSeeked={(e) => {
                        const v = e.currentTarget;
                        if (pendingPlayAfterSeekRef.current === videoSessionKey) {
                          pendingPlayAfterSeekRef.current = null;
                          void attemptVideoPlay('auto');
                        }
                        if (chapterStart > 0) {
                          setVideoCurrentTime(Math.max(0, v.currentTime - chapterStart));
                        }
                      }}
                      onPlay={() => {
                        setIsVideoPlaying(true);
                      }}
                      onPause={() => setIsVideoPlaying(false)}
                      onTimeUpdate={(e) => {
                        const v = e.currentTarget;
                        const fileDur = v.duration || 0;
                        const effectiveEnd = Math.min(chapterEndRaw, fileDur || chapterEndRaw);
                        const chapterDur = Math.max(0.01, effectiveEnd - chapterStart);
                        const quality = (v as any).getVideoPlaybackQuality?.();
                        const frames = Number(quality?.totalVideoFrames ?? 0);
                        const watch = videoFrameWatchRef.current;
                        if (!v.paused && !v.ended && v.currentTime > watch.time + 0.35 && frames <= watch.frames) {
                          watch.stuckTicks += 1;
                          if (watch.stuckTicks >= 4) {
                            const t = v.currentTime;
                            watch.stuckTicks = 0;
                            try { v.currentTime = Math.max(chapterStart, t - 0.08); } catch {}
                            requestAnimationFrame(() => v.play().catch(() => {}));
                          }
                        } else {
                          watch.stuckTicks = 0;
                        }
                        watch.time = v.currentTime;
                        watch.frames = frames;
                        // Clamp manual APENAS uma vez por capítulo (evita loop
                        // de re-seek em mobile que causava travamento).
                        const chapKey = `${currentIndex}-${imageIndex}`;
                        if (
                          chapterStart > 0 &&
                          v.currentTime < chapterStart - 0.5 &&
                          chapterSeekedRef.current !== chapKey
                        ) {
                          chapterSeekedRef.current = chapKey;
                          try { v.currentTime = chapterStart; } catch {}
                          return;
                        }
                        // Posição relativa ao capítulo (0..chapterDur).
                        const rel = Math.max(0, Math.min(chapterDur, v.currentTime - chapterStart));
                        if (videoTimeUpdateRafRef.current === null) {
                          videoTimeUpdateRafRef.current = requestAnimationFrame(() => {
                            videoTimeUpdateRafRef.current = null;
                            setVideoCurrentTime(rel);
                            setProgress(Math.min(100, (rel / chapterDur) * 100));
                          });
                        }
                        // Quando ultrapassa o fim do capítulo, dispara "ended"
                        // manualmente (a tag <video> só dispararia no fim do arquivo).
                        if (
                          Number.isFinite(effectiveEnd) &&
                          v.currentTime >= effectiveEnd - 0.12 &&
                          manualEndedRef.current !== chapKey
                        ) {
                          manualEndedRef.current = chapKey;
                          try { v.pause(); } catch {}
                          if (isCarousel && imageIndex < carouselUrls.length - 1) {
                            setImageIndex(i => i + 1);
                            setProgress(0);
                            setNextImageLoaded(false);
                          } else if (currentIndex < stories.length - 1) {
                            setCurrentIndex(i => i + 1);
                            setImageIndex(0);
                            setProgress(0);
                          } else if (hasNextUser) {
                            onNavigateUser('next');
                          } else {
                            onOpenChange(false);
                          }
                        }
                      }}
                      onEnded={() => {
                        const chapKey = `${currentIndex}-${imageIndex}`;
                        if (manualEndedRef.current === chapKey) return;
                        setIsVideoPlaying(false);
                        setProgress(100);
                        // avança quando o capítulo (ou o vídeo) termina
                        if (isCarousel && imageIndex < carouselUrls.length - 1) {
                          setImageIndex(i => i + 1);
                          setProgress(0);
                          setNextImageLoaded(false);
                        } else if (currentIndex < stories.length - 1) {
                          setCurrentIndex(i => i + 1);
                          setImageIndex(0);
                          setProgress(0);
                        } else if (hasNextUser) {
                          onNavigateUser('next');
                        } else {
                          onOpenChange(false);
                        }
                      }}
                      onContextMenu={(e) => e.preventDefault()}
                    />

                    {/* Indicador de buffering — spinner + texto */}
                    {isBuffering && !mediaError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-[6] gap-2 pointer-events-none">
                        <div className="h-10 w-10 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-label="Carregando" />
                        <span className="text-[11px] font-semibold text-white/90 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm">
                          {progress < 1 ? 'Carregando vídeo…' : 'Buffering…'}
                        </span>
                      </div>
                    )}

                    {/* Barra de progresso linear (capítulo atual) — base do vídeo */}
                    <div className="absolute left-0 right-0 bottom-0 z-[6] h-1 bg-white/15 pointer-events-none">
                      <div
                        className="h-full bg-white/95 transition-[width] duration-150 ease-linear"
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                        aria-label="Progresso do vídeo"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progress)}
                      />
                    </div>


                    {/* Overlay tempo do capítulo + status de pré-carregamento (visível p/ todos) */}
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[6] flex items-center gap-2 px-3 py-1 rounded-full bg-black/65 text-[11px] font-semibold text-white pointer-events-none select-none">
                      <span className="tabular-nums">
                        {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                      </span>
                      {isCarousel && (
                        <span className="text-white/70">
                          • Cap. {imageIndex + 1}/{carouselUrls.length}
                        </span>
                      )}
                      {preloadUrls.length > 0 && (
                        <span
                          className={cn(
                            "ml-1 inline-flex items-center gap-1",
                            Object.values(preloadReady).filter(Boolean).length >= preloadUrls.length
                              ? "text-emerald-300"
                              : "text-amber-300"
                          )}
                          title="Próximos capítulos pré-carregados / total"
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              Object.values(preloadReady).filter(Boolean).length >= preloadUrls.length
                                ? "bg-emerald-400"
                                : "bg-amber-400 animate-pulse"
                            )}
                          />
                          {Object.values(preloadReady).filter(Boolean).length}/{preloadUrls.length}
                        </span>
                      )}
                    </div>

                    {/* Pré-carregamento agressivo das próximas mídias enquanto o
                        capítulo atual toca — vídeos do mesmo arquivo reaproveitam
                        o cache HTTP (fragmento `#t=` não vai ao servidor). */}
                    {preloadUrls.map((u) => (
                      <video
                        key={`preload-${u}`}
                        src={stripTimeFragment(u)}
                        preload={preloadBudget.preloadAttr === 'none' ? 'none' : 'auto'}
                        muted
                        playsInline
                        onLoadedData={() => setPreloadReady(prev => prev[u] ? prev : { ...prev, [u]: true })}
                        onCanPlayThrough={() => setPreloadReady(prev => prev[u] ? prev : { ...prev, [u]: true })}
                        // Mantém oculto mas dentro do DOM para o browser priorizar fetch.
                        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                        tabIndex={-1}
                        aria-hidden
                      />
                    ))}
                    {/* Camada de gesto: tap = navegar/pausar, arrasto horizontal = seek, swipe rápido = prev/next */}
                    <div
                      className="absolute inset-x-0 top-16 bottom-16 z-[5] touch-pan-y"
                      style={{ cursor: seekGesture.current.seeking ? 'ew-resize' : undefined }}
                      onPointerDown={(e) => {
                        const v = videoRef.current;
                        seekGesture.current = {
                          active: true,
                          startX: e.clientX,
                          startY: e.clientY,
                          // Posição relativa ao capítulo (0 se vídeo ainda não carregou)
                          startTime: v ? v.currentTime - chapterStart : 0,
                          seeking: false,
                          wasPlaying: v ? !v.paused : false,
                          pointerId: e.pointerId,
                          // @ts-ignore - extensão runtime para detecção de swipe
                          startedAt: Date.now(),
                        } as any;
                      }}
                      onPointerMove={(e) => {
                        const g = seekGesture.current;
                        const v = videoRef.current;
                        if (!g.active || !v || !v.duration) return;
                        const dx = e.clientX - g.startX;
                        const dy = e.clientY - g.startY;
                        if (!g.seeking) {
                          // Só entra em modo seek depois de um arrasto sustentado (>24px)
                          // para não confundir swipe rápido com seek.
                          if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy)) return;
                          g.seeking = true;
                          try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
                          if (g.wasPlaying) v.pause();
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        const delta = dx / 6; // 6px = 1s
                        const chapterMax = Math.max(0.01, videoDuration);
                        const relTarget = Math.max(0, Math.min(chapterMax, g.startTime + delta));
                        v.currentTime = chapterStart + relTarget;
                        setVideoCurrentTime(relTarget);
                        setSeekPreview({ delta, target: relTarget });
                      }}
                      onPointerUp={(e) => {
                        const g = seekGesture.current as any;
                        const v = videoRef.current;
                        const bounds = e.currentTarget.getBoundingClientRect();
                        const dx = e.clientX - g.startX;
                        const dy = e.clientY - g.startY;
                        const dt = Date.now() - (g.startedAt || 0);
                        const isQuickSwipe =
                          !g.seeking &&
                          dt < 300 &&
                          Math.abs(dx) > 40 &&
                          Math.abs(dx) > Math.abs(dy) * 1.2;

                        if (g.active && g.seeking) {
                          e.stopPropagation();
                          try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
                          if (g.wasPlaying && v) v.play().catch(() => {});
                        } else if (g.active && isQuickSwipe) {
                          // Swipe rápido = navegar entre stories (sem precisar de vídeo carregado)
                          e.stopPropagation();
                          if (dx < 0) goToNext(); else goToPrevious();
                        } else if (g.active) {
                          // Tap simples = navegar/pausar (funciona mesmo sem vídeo pronto)
                          e.stopPropagation();
                          handleVideoSurfaceTap(e.clientX, bounds);
                        }
                        seekGesture.current = { active: false, startX: 0, startY: 0, startTime: 0, seeking: false, wasPlaying: false, pointerId: null };
                        setSeekPreview(null);
                      }}
                      onPointerCancel={() => {
                        seekGesture.current = { active: false, startX: 0, startY: 0, startTime: 0, seeking: false, wasPlaying: false, pointerId: null };
                        setSeekPreview(null);
                      }}
                      aria-label="Toque para avançar/pausar, arraste para buscar, deslize para mudar de story"
                      role="slider"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(videoDuration)}
                      aria-valuenow={Math.round(videoCurrentTime)}
                    />
                    {/* Preview do seek */}
                    {seekPreview && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded-xl bg-black/70 backdrop-blur-sm text-white text-sm font-semibold tabular-nums pointer-events-none">
                        {seekPreview.delta >= 0 ? '⏩' : '⏪'} {formatVideoTime(seekPreview.target)} / {formatVideoTime(videoDuration)}
                        <div className="text-[10px] text-white/70 text-center mt-0.5">
                          {seekPreview.delta >= 0 ? '+' : ''}{Math.round(seekPreview.delta)}s
                        </div>
                      </div>
                    )}
                    {/* Play button overlay — só aparece se autoplay foi bloqueado */}
                    {!isVideoPlaying && !isBuffering && (
                      <button
                        className="absolute inset-0 flex items-center justify-center z-10 bg-black/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVideoPausedState(false);
                        }}
                      >
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          <Play className="h-8 w-8 text-white ml-1" fill="white" />
                        </div>
                      </button>
                    )}
                    {/* Controles de áudio + volume */}
                    <div
                      className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/70 rounded-full px-2 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="p-1.5 rounded-full hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = !isMuted;
                          setIsMuted(next);
                          if (videoRef.current) {
                            videoRef.current.muted = next;
                            if (!next && videoRef.current.volume === 0) {
                              videoRef.current.volume = volume || 0.7;
                            }
                          }
                        }}
                        aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
                      >
                        {isMuted ? (
                          <VolumeX className="h-4 w-4 text-white" />
                        ) : (
                          <Volume2 className="h-4 w-4 text-white" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setVolume(v);
                          const muted = v === 0;
                          setIsMuted(muted);
                          if (videoRef.current) {
                            videoRef.current.muted = muted;
                            videoRef.current.volume = v;
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-20 accent-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        aria-label="Volume do vídeo"
                      />
                    </div>
                    {/* Barra de reprodução (seek) */}
                    <div
                      className="absolute left-0 right-0 z-30 px-4 flex items-center gap-2 text-[10px] text-white/90"
                      style={{ bottom: `calc(var(--story-footer-offset) + 8px)` }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <span className="tabular-nums w-9 text-right">
                        {formatVideoTime(videoCurrentTime)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={videoDuration || 0}
                        step={0.1}
                        value={Math.min(videoCurrentTime, videoDuration || 0)}
                        onChange={(e) => {
                          const t = parseFloat(e.target.value);
                          if (videoRef.current && Number.isFinite(t)) {
                            videoRef.current.currentTime = chapterStart + t;
                            setVideoCurrentTime(t);
                          }
                        }}
                        className="flex-1 accent-primary cursor-pointer h-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        aria-label="Posição do vídeo"
                      />
                      <span className="tabular-nums w-9">
                        {formatVideoTime(videoDuration)}
                      </span>
                    </div>
                  </div>
                ) : isGif ? (
                  /* GIF — render as plain <img loading="lazy" decoding="async"> with stable key to preserve animation */
                  <div
                    className="relative w-full h-full flex items-center justify-center z-[1] px-6 pt-16 pb-6 md:px-10 md:pt-20 md:pb-8"
                  >
                    <img loading="lazy" decoding="async"
                      key={`gif-${currentStory?.id}-${imageIndex}-${currentMediaUrl}`}
                      src={currentMediaUrl}
                      alt={`Story GIF ${imageIndex + 1}`}
                      className="block w-auto h-auto max-w-full max-h-full object-contain select-none relative z-[1]"
                      style={{ WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties}
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                      onError={() => setMediaError(true)}
                      data-media-type="image/gif"
                    />
                  </div>
                ) : (
                  /* Image */
                  <div
                    className="relative w-full h-full flex items-center justify-center z-[1] px-6 pt-16 pb-6 md:px-10 md:pt-20 md:pb-8"
                  >
                    <img decoding="async"
                      key={`slide-${imageIndex}`}
                      src={currentMediaUrl}
                      alt={`Story ${imageIndex + 1}`}
                      className="block w-auto h-auto max-w-full max-h-full object-contain animate-in fade-in duration-200 select-none relative z-[1]"
                      style={{ WebkitTouchCallout: 'none', userSelect: 'none' } as React.CSSProperties}
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                      onError={() => setMediaError(true)}
                      loading="eager"
                    />
                  </div>
                )}
                {/* Transparent overlay to block long-press save */}
                {!isVideo && (
                  <div
                    className="absolute inset-0 z-10"
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )}
                {/* DRM Watermark */}
                {user && (
                  <div
                    className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden"
                    aria-hidden="true"
                  >
                    <span
                      className="absolute top-1/2 left-1/2 whitespace-nowrap font-mono text-[11px]"
                      style={{
                        transform: 'translate(-50%, -50%) rotate(-30deg)',
                        color: 'rgba(255,255,255,0.2)',
                        textShadow: '0 0 2px rgba(0,0,0,0.6)',
                        letterSpacing: '1px',
                      }}
                    >
                      Oculto Swing · @{user.user_metadata?.username || user.user_metadata?.name || 'user'}
                    </span>
                  </div>
                )}
                {/* Prefetch next image */}
                {isCarousel && imageIndex < carouselUrls.length - 1 && !nextImageLoaded && (
                  <img loading="lazy" decoding="async"
                    src={carouselUrls[imageIndex + 1]}
                    alt=""
                    className="hidden"
                    onLoad={() => setNextImageLoaded(true)}
                  />
                )}
                {isCarousel && (
                  <div className="absolute top-16 right-4 z-20 bg-black/50 rounded-full px-2 py-0.5 text-white text-xs">
                    {imageIndex + 1}/{carouselUrls.length}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center p-8 text-center">
                <p className="text-white text-xl font-medium">
                  {currentStory.content_text}
                </p>
              </div>
            )}
          </div>

          {/* Texto sobreposto (se houver mídia e texto) */}
            {carouselUrls.length > 0 && currentStory.content_text && !showViewers && (
              <div
                className="absolute left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"
                style={{ bottom: 'calc(var(--story-footer-offset) + 0.25rem)' }}
              >
              <p className="text-white text-sm">
                {currentStory.content_text}
              </p>
            </div>
          )}

          {/* Footer fixo com Like/Dislike + Input (sempre visível) */}
          {shouldShowFooter && (
            <div
              ref={footerRef}
              className="absolute bottom-0 left-0 right-0 z-[60] bg-gradient-to-t from-black via-black/95 to-black/75 px-3 pt-2 pb-3 space-y-2 pointer-events-auto"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
              onClick={(e) => e.stopPropagation()}
            >
              {isOwner ? (
                <div className="flex h-10 items-center justify-center rounded-md border border-white/15 bg-white/10 px-3 text-xs text-white/65">
                  Suas interações ficam visíveis no topo do story.
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      if (e.target.value.length > 0) setIsPaused(true);
                    }}
                    onFocus={() => setIsPaused(true)}
                    onBlur={() => {
                      if (!replyText.trim()) setIsPaused(false);
                    }}
                    placeholder="Responder ao story..."
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:ring-[#FF007F] h-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || replyToStory.isPending}
                    size="icon"
                    className="bg-[#FF007F] hover:bg-[#FF007F]/90 shrink-0 h-10 w-10"
                   aria-label="Enviar">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Animação de corações removida — feedback do like fica apenas no contador */}

          {/* Modal de interações com tabs (para o dono) */}
          {showViewers && isOwner && (
            <div 
              className="absolute bottom-0 left-0 right-0 z-30 bg-black/95 rounded-t-2xl max-h-[60%] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Tabs */}
              <div className="flex border-b border-white/10">
                <button 
                  className={cn(
                    "flex-1 py-3 text-sm flex items-center justify-center gap-1.5 transition-colors",
                    activeTab === 'views' 
                      ? "text-white border-b-2 border-white" 
                      : "text-white/50 hover:text-white/70"
                  )}
                  onClick={() => setActiveTab('views')}
                >
                  <Eye className="h-4 w-4" />
                  <span>{viewCount || 0}</span>
                </button>
                <button 
                  className={cn(
                    "flex-1 py-3 text-sm flex items-center justify-center gap-1.5 transition-colors",
                    activeTab === 'likes' 
                      ? "text-pink-400 border-b-2 border-pink-400" 
                      : "text-white/50 hover:text-white/70"
                  )}
                  onClick={() => setActiveTab('likes')}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span>{likeCount || 0}</span>
                </button>
                <button 
                  className={cn(
                    "flex-1 py-3 text-sm flex items-center justify-center gap-1.5 transition-colors",
                    activeTab === 'dislikes' 
                      ? "text-red-400 border-b-2 border-red-400" 
                      : "text-white/50 hover:text-white/70"
                  )}
                  onClick={() => setActiveTab('dislikes')}
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span>{dislikeCount || 0}</span>
                </button>
                <button 
                  className="px-4 py-3 text-white/50 hover:text-white"
                  onClick={() => {
                    setShowViewers(false);
                    setIsPaused(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              <ScrollArea className="flex-1 p-2">
                {/* Tab: Visualizações */}
                {activeTab === 'views' && (
                  <>
                    {viewers && viewers.length > 0 ? (
                      <div className="space-y-2">
                        {viewers.map((view) => (
                          <div 
                            key={view.viewer_id} 
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={view.viewer?.avatar_url || ''} />
                              <AvatarFallback>
                                {view.viewer?.name?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-white text-sm font-medium truncate">
                                  {view.viewer?.name || 'Usuário'}
                                </span>
                                {view.viewer?.is_verified_couple && (
                                  <VerifiedCoupleBadge size="sm" />
                                )}
                                {view.viewer?.plan_type === 'vip' && (
                                  <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-[10px] px-1">
                                    VIP
                                  </Badge>
                                )}
                              </div>
                              <span className="text-white/50 text-xs">
                                @{view.viewer?.username || 'user'}
                              </span>
                            </div>
                            <span className="text-white/40 text-xs">
                              {new Date(view.viewed_at).toLocaleTimeString('pt-BR', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Eye className="h-10 w-10 text-white/20 mb-2" />
                        <p className="text-white/50 text-sm">
                          Nenhuma visualização ainda
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Tab: Curtidas */}
                {activeTab === 'likes' && (
                  <>
                    {likers && likers.length > 0 ? (
                      <div className="space-y-2">
                        {likers.map((liker) => (
                          <div 
                            key={liker.id} 
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={liker.avatar_url || ''} />
                              <AvatarFallback>
                                {liker.name?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-white text-sm font-medium truncate">
                                  {liker.name || 'Usuário'}
                                </span>
                                {liker.plan_type === 'vip' && (
                                  <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-[10px] px-1">
                                    VIP
                                  </Badge>
                                )}
                              </div>
                              <span className="text-white/50 text-xs">
                                @{liker.username || 'user'}
                              </span>
                            </div>
                            <ThumbsUp className="h-4 w-4 text-pink-400 fill-pink-400" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ThumbsUp className="h-10 w-10 text-white/20 mb-2" />
                        <p className="text-white/50 text-sm">
                          Nenhuma curtida ainda
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Tab: Negativos */}
                {activeTab === 'dislikes' && (
                  <>
                    {dislikers && dislikers.length > 0 ? (
                      <div className="space-y-2">
                        {dislikers.map((disliker) => (
                          <div 
                            key={disliker.id} 
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={disliker.avatar_url || ''} />
                              <AvatarFallback>
                                {disliker.name?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-white text-sm font-medium truncate">
                                  {disliker.name || 'Usuário'}
                                </span>
                                {disliker.plan_type === 'vip' && (
                                  <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-[10px] px-1">
                                    VIP
                                  </Badge>
                                )}
                              </div>
                              <span className="text-white/50 text-xs">
                                @{disliker.username || 'user'}
                              </span>
                            </div>
                            <ThumbsDown className="h-4 w-4 text-red-400 fill-red-400" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ThumbsDown className="h-10 w-10 text-white/20 mb-2" />
                        <p className="text-white/50 text-sm">
                          Nenhuma negativa ainda
                        </p>
                      </div>
                    )}
                  </>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Navegação lateral - áreas de clique (funcionais mobile + desktop) */}
          {!showViewers && (
            <>
              <button
                type="button"
                aria-label="Voltar"
                className="absolute inset-y-0 left-0 w-1/4 z-[7] cursor-pointer bg-transparent border-0 outline-none focus-visible:bg-white/5"
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (navLocked) return;
                  goToPrevious();
                }}
              />
              <button
                type="button"
                aria-label="Avançar"
                className="absolute inset-y-0 right-0 w-1/4 z-[7] cursor-pointer bg-transparent border-0 outline-none focus-visible:bg-white/5"
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (navLocked) return;
                  goToNext();
                }}
              />
            </>
          )}

          {/* Setas de navegação visíveis */}
          {!showViewers && (hasPrevUser || currentIndex > 0 || (isCarousel && imageIndex > 0)) && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-30 h-12 w-12 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-sm hidden md:flex disabled:opacity-40 disabled:cursor-wait"
              disabled={navLocked}
              aria-disabled={navLocked}
              onClick={(e) => {
                e.stopPropagation();
                if (navLocked) return;
                goToPrevious();
              }}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          
          {!showViewers && (isCarousel || currentIndex < stories.length - 1 || hasNextUser) && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-30 h-12 w-12 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-sm hidden md:flex disabled:opacity-40 disabled:cursor-wait"
              disabled={navLocked}
              aria-disabled={navLocked}
              onClick={(e) => {
                e.stopPropagation();
                if (navLocked) return;
                goToNext();
              }}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}

          {/* Indicador de pausa */}
          {isPaused && !showViewers && !replyText && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
                <Pause className="h-8 w-8 text-white" fill="white" />
              </div>
            </div>
          )}

          {/* ===================================================================
              Pré-carregamento global do próximo story (imagem + vídeo).
              Renderizado SEMPRE (independente do tipo atual) para garantir que
              swipe/tap avancem sem "tela preta" mesmo em redes lentas.
              Imagens: <img> oculto que vai ao cache HTTP do browser.
              Vídeos: <video preload="auto"> oculto — quando entrarmos no
              próximo capítulo o navegador reaproveita o cache.
          =================================================================== */}
          <div aria-hidden className="pointer-events-none absolute opacity-0" style={{ width: 1, height: 1, overflow: 'hidden' }}>
            {preloadImageUrls.map((u) => (
              <img
                key={`preimg-${u}`}
                src={u}
                alt=""
                loading="eager"
                decoding="async"
                onLoad={() => setPreloadReady(prev => prev[u] ? prev : { ...prev, [u]: true })}
              />
            ))}
            {!isVideo && preloadUrls.map((u) => (
              <video
                key={`previd-${u}`}
                src={stripTimeFragment(u)}
                preload={preloadBudget.preloadAttr === 'none' ? 'none' : 'auto'}
                muted
                playsInline
                onLoadedData={() => setPreloadReady(prev => prev[u] ? prev : { ...prev, [u]: true })}
                onCanPlayThrough={() => setPreloadReady(prev => prev[u] ? prev : { ...prev, [u]: true })}
                tabIndex={-1}
                aria-hidden
              />
            ))}
          </div>
        </div>

        {/* Story Report Modal */}
        <StoryReportModal
          open={showReportModal}
          onOpenChange={(open) => {
            setShowReportModal(open);
            if (!open) setVideoPausedState(false);
          }}
          storyId={currentStory.id}
          storyAuthorId={userStories.userId}
        />

        {/* Pílula flutuante NÃO-bloqueante de progresso da exclusão em background.
            Aparece no topo do modal sem travar a interação com o restante da UI. */}
        {bgDeleteProgress && (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-[60]",
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg backdrop-blur-sm",
              bgDeleteProgress === 'processing'
                ? "bg-black/70 text-white border border-white/15"
                : "bg-destructive/90 text-destructive-foreground border border-destructive"
            )}
          >
            {bgDeleteProgress === 'processing' ? (
              <>
                <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sincronizando exclusão…
              </>
            ) : (
              <>
                <Flag className="h-3 w-3" />
                Falha ao excluir no servidor
              </>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog — overlay próprio para não aninhar Radix Dialog dentro do StoryViewer. */}
        {showDeleteConfirm && (
          <div
            className="absolute inset-0 z-[90] flex items-center justify-center bg-black/70 px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="story-delete-title"
            aria-describedby="story-delete-description"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg">
              <div className="space-y-2">
                <h2 id="story-delete-title" className="text-lg font-semibold">Excluir story?</h2>
                <p id="story-delete-description" className="text-sm text-muted-foreground">
                  Este story será removido permanentemente e não poderá ser recuperado.
                </p>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isDeleting}
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setVideoPausedState(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteStory}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <span className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full border-2 border-destructive-foreground/30 border-t-destructive-foreground animate-spin" />
                      Excluindo...
                    </span>
                  ) : 'Excluir'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
