/**
 * OcultoPlayFocusModal — modo destaque do card do Play.
 * - Totalmente responsivo (mobile + desktop), sem cortes.
 * - Scroll interno invisível (sem barra cinza lateral).
 * - Capa clicável: abre lightbox em tela cheia.
 * - Áudio sincronizado com o player recolhido via `ocultoPlayAudioSession`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music2, Cpu, User2, X, Shuffle, Repeat, Repeat1, SkipBack, SkipForward, Mic, Home, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LYRICS_MAX_CHARS } from '@/lib/ocultoPlayLyricsValidation';
import { useLyricsAutosaveState, formatLastSavedTime } from '@/lib/ocultoPlayLyricsAutosave';

import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { OcultoPlayItem as OPItem } from '@/hooks/useOcultoPlayContent';
import { useOcultoPlayActions, useOcultoPlayFeed, useOcultoPlayItemLive } from '@/hooks/useOcultoPlayContent';
import { useRegisterOcultoPlayCardView } from '@/hooks/useRegisterOcultoPlayCardView';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseExternal';
import { playSharedAudio, pauseSharedAudio, prewarmAudio, ocultoPlayMetaFromItem } from '@/lib/ocultoPlayAudioSession';
import { OcultoPlayVideoItem } from './OcultoPlayVideoItem';
import { OcultoPlayImageItem } from './OcultoPlayImageItem';
import { OcultoPlayLinkPlayer, exitLinkPlayerFullscreen } from './OcultoPlayLinkPlayer';
import { PlayLinkSuggestionsStrip } from './PlayLinkSuggestionsStrip';
import { OcultoPlayAudioItem } from './OcultoPlayAudioItem';
import { OcultoPlayActions } from './OcultoPlayActions';
import { OcultoPlayOfflineButton } from './OcultoPlayOfflineButton';
import { OcultoPlayShortsScroller } from './OcultoPlayShortsScroller';
import { useOcultoPlayAudioSettingsStore } from '@/store/useOcultoPlayAudioSettingsStore';
import { cn } from '@/lib/utils';

export type AudioRepeatMode = 'off' | 'all';

interface Props {
  item: OPItem | null;
  open: boolean;
  onClose: () => void;
  onLike?: (item: OPItem) => void;
  onDislike?: (item: OPItem) => void;
  onSave?: (item: OPItem) => void;
  onComment?: (item: OPItem) => void;
  onShare?: (item: OPItem) => void;
  onReport?: (item: OPItem) => void;
  /** Disparado quando o áudio do item termina. Use para auto-avançar. */
  onAudioEnded?: (item: OPItem) => void;
  /** Disparado quando o vídeo do item termina. Use para auto-avançar. */
  onVideoEnded?: (item: OPItem) => void;
  /** Swipe vertical para próximo vídeo. */
  onSwipeNextVideo?: (item: OPItem) => void;
  /** Swipe vertical para vídeo anterior. */
  onSwipePrevVideo?: (item: OPItem) => void;
  audioRepeatMode?: AudioRepeatMode;
  onAudioRepeatModeChange?: (mode: AudioRepeatMode) => void;
  /** Navega para a música anterior do feed de áudios. */
  onAudioPrev?: (item: OPItem) => void;
  /** Navega para a próxima música do feed de áudios. */
  onAudioNext?: (item: OPItem) => void;
  /** Define a prévia do áudio atual como a bio em áudio do perfil do usuário logado. */
  onSetAsAudioBio?: (item: OPItem) => void;
  /** Indica que a operação de bio em áudio está em andamento (para feedback visual). */
  settingAudioBio?: boolean;
  /** Volta ao feed mantendo a sessão de áudio ativa. */
  onNavigateHome?: () => void;
  /** Fila de vídeos para o feed vertical estilo TikTok (somente quando o item é vídeo). */
  videoQueue?: OPItem[];
  /** Disparado quando o feed vertical chega perto do fim — pai pode anexar mais. */
  onVideoFeedNearEnd?: () => void;
  /** Disparado ao clicar em uma sugestão de "Próximos vídeos" no player de link. */
  onSelectLinkSuggestion?: (item: OPItem) => void;
}


function MetaChips({ item }: { item: OPItem }) {
  const has =
    !!item.composer_name ||
    !!item.ai_tool ||
    (item.genre_tags && item.genre_tags.length > 0);
  if (!has) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.composer_name && (
        <span title={`Compositor: ${item.composer_name}`} className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/10 px-2 py-0.5 text-[11px] text-white/85">
          <User2 className="h-3 w-3 text-fuchsia-300" />
          {item.composer_name}
        </span>
      )}
      {item.ai_tool && (
        <span title={`IA: ${item.ai_tool}`} className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/10 px-2 py-0.5 text-[11px] text-white/85">
          <Cpu className="h-3 w-3 text-fuchsia-300" />
          {item.ai_tool}
        </span>
      )}
      {item.genre_tags?.map((t) => (
        <span key={t} title={`Estilo: ${t}`} className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/10 px-2 py-0.5 text-[11px] text-white/85">
          <Music2 className="h-3 w-3 text-fuchsia-300" />
          {t}
        </span>
      ))}
    </div>
  );
}

function AudioModeControls({
  repeatMode,
  onRepeatModeChange,
  onNavigateHome,
  trailing,
}: {
  repeatMode: AudioRepeatMode;
  onRepeatModeChange?: (mode: AudioRepeatMode) => void;
  onNavigateHome?: () => void;
  trailing?: React.ReactNode;
}) {
  const shuffle = useOcultoPlayAudioSettingsStore((s) => s.shuffle);
  const toggleShuffle = useOcultoPlayAudioSettingsStore((s) => s.toggleShuffle);
  const nextRepeat: AudioRepeatMode = repeatMode === 'all' ? 'off' : 'all';
  const RepeatIcon = repeatMode === 'all' ? Repeat : Repeat1;
  const repeatLabel = repeatMode === 'all' ? 'Tocando todas as músicas em sequência' : 'Tocar apenas a música atual';
  const handleShuffleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleShuffle();
  };
  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={handleShuffleClick}
        aria-pressed={shuffle}
        data-active={shuffle ? 'true' : 'false'}
        aria-label={shuffle ? 'Desativar aleatório' : 'Ativar aleatório'}
        title={shuffle ? 'Aleatório ligado — próxima música é sorteada' : 'Aleatório desligado'}
        style={shuffle ? { backgroundColor: '#00BFFF', borderColor: '#00BFFF', boxShadow: '0 0 14px rgba(0, 191, 255, 0.55)' } : undefined}
        className={cn(
          'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold transition-all active:scale-[0.98]',
          shuffle
            ? 'text-white ring-2 ring-[#00BFFF]/50'
            : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground',
        )}
      >
        <Shuffle className="h-3.5 w-3.5 shrink-0" />
        <span>Aleatório</span>
      </button>
      <button
        type="button"
        onClick={() => onRepeatModeChange?.(nextRepeat)}
        aria-pressed={repeatMode === 'all'}
        aria-label={repeatLabel}
        title={repeatLabel}
        className={cn(
          'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors',
          repeatMode === 'all'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground',
        )}
      >
        <RepeatIcon className="h-3.5 w-3.5 shrink-0" />
        <span>{repeatMode === 'all' ? 'Todas' : 'Única'}</span>
      </button>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNavigateHome?.(); }}
        aria-label="Voltar ao feed (música continua tocando)"
        title="Voltar ao feed sem parar a música"
        style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed', boxShadow: '0 0 14px rgba(124, 58, 237, 0.55)' }}
        className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold text-white transition-all active:scale-[0.98] ring-2 ring-violet-400/50"
      >
        <Home className="h-3.5 w-3.5 shrink-0" />
        <span>Navegar</span>
      </button>
      {trailing}
    </div>
  );
}

function CoverLightbox({
  src, alt, open, onClose, lyrics, title, initialView = 'cover', itemId = null,
}: {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  lyrics?: string | null;
  title?: string | null;
  initialView?: 'cover' | 'lyrics';
  itemId?: string | null;
}) {
  const [view, setView] = useState<'cover' | 'lyrics'>(initialView);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const lyricsHeaderRef = useRef<HTMLDivElement>(null);
  const lyricsMetaRef = useRef<HTMLDivElement>(null);
  const lyricsTouchYRef = useRef<number | null>(null);
  const [lyricsHeaderHeight, setLyricsHeaderHeight] = useState(68);
  const [lyricsBodyTop, setLyricsBodyTop] = useState(124);
  const autosave = useLyricsAutosaveState(itemId ?? '');
  useEffect(() => { if (open) setView(initialView); }, [open, initialView]);
  useEffect(() => {
    if (!open || view !== 'lyrics') return;
    requestAnimationFrame(() => {
      if (lyricsScrollRef.current) lyricsScrollRef.current.scrollTop = 0;
    });
  }, [open, view, lyrics]);
  useEffect(() => {
    if (!open || view !== 'lyrics') return;

    const measure = () => {
      const headerHeight = lyricsHeaderRef.current?.offsetHeight ?? 68;
      const metaHeight = lyricsMetaRef.current?.offsetHeight ?? 56;
      setLyricsHeaderHeight(headerHeight);
      setLyricsBodyTop(headerHeight + metaHeight);
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const observers: ResizeObserver[] = [];
    if (typeof ResizeObserver !== 'undefined') {
      [lyricsHeaderRef.current, lyricsMetaRef.current].forEach((node) => {
        if (!node) return;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        observers.push(observer);
      });
    }
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [open, view, lyrics, autosave.status, autosave.lastSavedAt]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useEffect(() => {
    const el = lyricsScrollRef.current;
    if (!el || view !== 'lyrics') return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 180);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [open, view]);
  const handleLyricsTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    lyricsTouchYRef.current = event.touches[0]?.clientY ?? null;
  }, []);
  const handleLyricsTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const el = lyricsScrollRef.current;
    const previousY = lyricsTouchYRef.current;
    const currentY = event.touches[0]?.clientY ?? null;
    if (!el || previousY == null || currentY == null) return;

    el.scrollTop += previousY - currentY;
    lyricsTouchYRef.current = currentY;
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const handleLyricsTouchEnd = useCallback(() => {
    lyricsTouchYRef.current = null;
  }, []);
  if (!open || typeof document === 'undefined') return null;
  const hasLyrics = !!(lyrics && lyrics.trim().length > 0);
  return createPortal(
    <div
      data-cover-lightbox-root
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 bg-black/95 flex items-center justify-center p-2 sm:p-4 animate-in fade-in"
      style={{ zIndex: 2147483000, touchAction: view === 'lyrics' ? 'pan-y' : 'auto' }}
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-3 right-3 h-11 w-11 grid place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 text-white shadow-[0_4px_14px_-2px_rgba(236,72,153,0.6)] ring-2 ring-white/30 hover:from-fuchsia-400 hover:to-rose-400 active:scale-95 transition"
        style={{ zIndex: 2147483001, top: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <X className="h-5 w-5" strokeWidth={2.8} />
      </button>

      {view === 'cover' ? (
        <div
          className="flex flex-col items-center gap-3 max-h-[95vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={src}
            alt={alt}
            onClick={() => { if (hasLyrics) setView('lyrics'); }}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            className={cn(
              'max-h-[80vh] max-w-[95vw] object-contain select-none pointer-events-auto',
              hasLyrics && 'cursor-pointer',
            )}
            draggable={false}
            style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
          />
          {hasLyrics && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setView('lyrics'); }}
              className="px-4 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur"
            >
              📝 Ver letra da música
            </button>
          )}
        </div>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl bg-gradient-to-b from-zinc-950/95 to-black/95 border border-fuchsia-500/30 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            height: 'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))',
            maxHeight: 'calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))',
            touchAction: 'pan-y',
          }}
        >
          <div ref={lyricsHeaderRef} className="absolute inset-x-0 top-0 z-10 px-5 pt-5 pb-3 border-b border-white/10 flex items-center gap-3 bg-zinc-950/95 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setView('cover')}
              className="h-9 px-3 rounded-full border border-primary bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.35)] hover:bg-primary/90 text-[11px] font-bold inline-flex items-center gap-1.5"
              aria-label="Voltar para a capa"
            >
              ← CAPA
            </button>
            <p className="text-white text-sm font-bold truncate flex-1">
              {title || 'Letra da música'}
            </p>
          </div>
          {(() => {
            const lyricsText = lyrics ?? '';
            const lyricsLen = lyricsText.length;
            const isTruncated = lyricsLen >= LYRICS_MAX_CHARS;
            return (
              <>
                <div
                  ref={lyricsMetaRef}
                  className="absolute inset-x-0 z-10 px-5 pt-2 pb-2 border-b border-white/5 flex items-center justify-between gap-2 flex-wrap bg-zinc-950/90 backdrop-blur-sm"
                  style={{ top: lyricsHeaderHeight }}
                >
                  <span
                    className={
                      'text-[11px] font-medium ' +
                      (isTruncated ? 'text-rose-300' : 'text-white/60')
                    }
                    aria-live="polite"
                  >
                    {lyricsLen.toLocaleString('pt-BR')}/{LYRICS_MAX_CHARS.toLocaleString('pt-BR')} caracteres
                  </span>
                  {isTruncated && (
                    <span
                      role="status"
                      className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-200 border border-rose-400/40"
                      title={`Texto truncado no limite de ${LYRICS_MAX_CHARS.toLocaleString('pt-BR')} caracteres.`}
                    >
                      ⚠ texto truncado
                    </span>
                  )}
                  {(() => {
                    const savedTime = formatLastSavedTime(autosave.lastSavedAt);
                    if (autosave.status === 'pending' || autosave.status === 'saving') {
                      return (
                        <span
                          role="status"
                          aria-live="polite"
                          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/40"
                          title={savedTime ? `Última versão salva às ${savedTime} — alterações em andamento.` : 'Alterações em andamento.'}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                          atualizando…
                        </span>
                      );
                    }
                    if (autosave.status === 'saved' && savedTime) {
                      return (
                        <span
                          role="status"
                          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-400/30"
                          title={`Último salvamento bem-sucedido às ${savedTime}.`}
                        >
                          ✓ salvo {savedTime}
                        </span>
                      );
                    }
                    if (autosave.status === 'error') {
                      return (
                        <span
                          role="status"
                          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-200 border border-rose-400/40"
                          title="Falha no salvamento automático — o conteúdo pode estar desatualizado."
                        >
                          ⚠ não salvo
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div
                  ref={lyricsScrollRef}
                  data-lyrics-scroll="true"
                  className="absolute inset-x-0 bottom-0 overflow-y-scroll overscroll-contain px-5 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  style={{
                    top: lyricsBodyTop,
                    maxHeight: `calc(100% - ${lyricsBodyTop}px)`,
                    paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'none',
                    overflowAnchor: 'none',
                  }}
                  onWheel={(e) => e.stopPropagation()}
                  onTouchStart={handleLyricsTouchStart}
                  onTouchMove={handleLyricsTouchMove}
                  onTouchEnd={handleLyricsTouchEnd}
                  onTouchCancel={handleLyricsTouchEnd}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <pre className="whitespace-pre-wrap break-words text-white/95 text-[14px] sm:text-[15px] leading-[1.75] font-sans">
                    {lyricsText}
                  </pre>
                </div>
              </>
            );
          })()}
          {view === 'lyrics' && showScrollTop && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                lyricsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label="Ir ao topo da letra"
              title="Ir ao topo"
              className="absolute bottom-5 right-5 z-20 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.45)] border border-primary/40 inline-flex items-center justify-center hover:bg-primary/90 active:scale-95 transition"
              style={{ marginBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}



export function OcultoPlayFocusModal({
  item: itemProp, open, onClose,
  onLike, onDislike, onSave, onComment, onShare, onReport,
  onAudioEnded,
  onVideoEnded,
  onSwipeNextVideo,
  onSwipePrevVideo,
  audioRepeatMode = 'off',
  onAudioRepeatModeChange,
  onAudioPrev,
  onAudioNext,
  onSetAsAudioBio,
  settingAudioBio = false,
  onNavigateHome,
  videoQueue,
  onVideoFeedNearEnd,
  onSelectLinkSuggestion,
}: Props) {
  const navigate = useNavigate();
  const handleNavigateHome = useCallback(() => {
    if (onNavigateHome) {
      onNavigateHome();
      return;
    }
    // Não chama onClose aqui: alguns hosts pausam o áudio no onClose.
    // A troca de rota desmonta o modal e preserva a sessão compartilhada.
    navigate('/feed');
  }, [navigate, onNavigateHome]);

  // Sai de qualquer fullscreen (link player) sempre que o modal fechar.
  useEffect(() => {
    if (!open) { void exitLinkPlayerFullscreen(); }
  }, [open]);
  // Cleanup defensivo: ao desmontar o modal, garante saída do fullscreen.
  useEffect(() => {
    return () => { void exitLinkPlayerFullscreen(); };
  }, []);
  // Fecha o modal garantindo que nenhum estado de tela cheia fique preso.
  const safeClose = useCallback(() => {
    void exitLinkPlayerFullscreen();
    onClose();
  }, [onClose]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxInitialView, setLightboxInitialView] = useState<'cover' | 'lyrics'>('cover');
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const registerCardView = useRegisterOcultoPlayCardView();

  // ===== Scroll persistente por item dentro do modal =====
  // Restaura a posição salva sempre que o usuário retorna a um item já visto.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const lastScrollItemIdRef = useRef<string | null>(null);

  // Autoplay: ativado quando o usuário escolhe uma sugestão "Próximos vídeos".
  const [autoPlayLink, setAutoPlayLink] = useState(false);
  // Reset autoplay quando o modal fecha ou o item original (vindo de fora) muda.
  useEffect(() => { if (!open) setAutoPlayLink(false); }, [open]);
  useEffect(() => { setAutoPlayLink(false); }, [itemProp?.id]);


  // ===== Fallback interno: navegação prev/next + bio de áudio =====
  // Garante que esses botões funcionem mesmo quando o host não passar handlers.
  const { user } = useAuth();
  const actions = useOcultoPlayActions();
  const isAudioOpen = !!(open && itemProp && itemProp.kind === 'audio');
  const fallbackAudioFeed = useOcultoPlayFeed('normal', isAudioOpen ? 'audio' : undefined, 60);
  const fallbackAudioPool = useMemo<OPItem[]>(() => {
    if (!isAudioOpen) return [];
    const src = (fallbackAudioFeed.data ?? []) as OPItem[];
    return src
      .filter((it) => it.kind === 'audio' && !!it.audio_url)
      .slice()
      .sort((a, b) => {
        const ta = new Date((a as any).created_at ?? (a as any).published_at ?? 0).getTime();
        const tb = new Date((b as any).created_at ?? (b as any).published_at ?? 0).getTime();
        return tb - ta;
      });
  }, [isAudioOpen, fallbackAudioFeed.data]);

  // ===== Fallback interno: fila de vídeos para o feed TikTok =====
  const isVideoOpen = !!(open && itemProp && (itemProp.kind === 'short_video' || itemProp.kind === 'vip_teaser'));
  const fallbackVideoFeed = useOcultoPlayFeed(
    'normal',
    undefined,
    isVideoOpen && (!videoQueue || videoQueue.length === 0) ? 60 : 1,
  );
  const fallbackVideoPool = useMemo<OPItem[]>(() => {
    if (!isVideoOpen) return [];
    const src = (fallbackVideoFeed.data ?? []) as OPItem[];
    return src
      .filter((it) => (it.kind === 'short_video' || it.kind === 'vip_teaser') && !!it.media_url)
      .slice()
      .sort((a, b) => {
        const ta = new Date((a as any).created_at ?? 0).getTime();
        const tb = new Date((b as any).created_at ?? 0).getTime();
        return tb - ta;
      });
  }, [isVideoOpen, fallbackVideoFeed.data]);
  const effectiveVideoQueue = (videoQueue && videoQueue.length > 0) ? videoQueue : fallbackVideoPool;
  // Fila do feed vertical: o vídeo ESCOLHIDO sempre entra (antes, se ele não
  // estivesse na fila, o player caía no primeiro vídeo da seção). Limitada
  // a 150 a partir do escolhido para não pesar em celular modesto.
  const shortsQueue = useMemo<OPItem[]>(() => {
    const isShort = (it: OPItem | null | undefined) =>
      !!it && (it.kind === 'short_video' || it.kind === 'vip_teaser') && !!it.media_url;
    const base = effectiveVideoQueue.filter(isShort);
    const seed = itemProp && isShort(itemProp) ? itemProp : null;
    if (!seed) return base.slice(0, 150);
    const idx = base.findIndex((it) => it.id === seed.id);
    if (idx < 0) return [seed, ...base].slice(0, 150);
    // Começa no escolhido e segue a ordem da seção (com volta ao início).
    return [...base.slice(idx), ...base.slice(0, idx)].slice(0, 150);
  }, [effectiveVideoQueue, itemProp]);

  // ===== Fila de links para navegação prev/next dentro do modal =====
  const isLinkOpen = !!(open && itemProp && itemProp.kind === 'link');
  const linkFeed = useOcultoPlayFeed('normal', isLinkOpen ? 'link' : undefined, isLinkOpen ? 120 : 1);
  const linkPool = useMemo<OPItem[]>(() => {
    if (!isLinkOpen) return [];
    return ((linkFeed.data ?? []) as OPItem[]).filter((it) => it.kind === 'link');
  }, [isLinkOpen, linkFeed.data]);


  const [internalItem, setInternalItem] = useState<OPItem | null>(null);
  useEffect(() => { setInternalItem(null); }, [itemProp?.id]);
  const baseItem = internalItem ?? itemProp;
  // Mantém contagens/flags sempre sincronizadas com o cache do feed (otimistas).
  const liveItem = useOcultoPlayItemLive(baseItem?.id ?? null, baseItem);

  // Fallback de letra: se o item não traz `lyrics` (RPC do feed não retorna a coluna),
  // buscamos diretamente da tabela quando o modal é aberto para um áudio.
  const [fetchedLyrics, setFetchedLyrics] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!open) return;
    const id = liveItem?.id;
    if (!id || liveItem?.kind !== 'audio') return;
    if ((liveItem as any).lyrics != null) return;
    if (id in fetchedLyrics) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('oculto_play_items')
          .select('lyrics')
          .eq('id', id)
          .maybeSingle();
        if (cancelled) return;
        if (error) { setFetchedLyrics((m) => ({ ...m, [id]: null })); return; }
        setFetchedLyrics((m) => ({ ...m, [id]: (data as any)?.lyrics ?? null }));
      } catch {
        if (!cancelled) setFetchedLyrics((m) => ({ ...m, [id]: null }));
      }
    })();
    return () => { cancelled = true; };
  }, [open, liveItem?.id, liveItem?.kind, (liveItem as any)?.lyrics, fetchedLyrics]);

  const effectiveItem = useMemo<OPItem | null>(() => {
    if (!liveItem) return liveItem;
    const id = liveItem.id;
    if ((liveItem as any).lyrics != null) return liveItem;
    if (id in fetchedLyrics) {
      return { ...(liveItem as any), lyrics: fetchedLyrics[id] } as OPItem;
    }
    return liveItem;
  }, [liveItem, fetchedLyrics]);

  // SeedId estável: a fila vertical infinita NÃO deve reordenar a cada
  // avanço/retorno; caso contrário o usuário fica preso aos 1-2 vídeos
  // ao redor do seed reescolhido. Capturamos o id apenas uma vez por abertura
  // (e quando o `itemProp` original muda — nova entrada no modal).
  const stableSeedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && itemProp?.id) stableSeedIdRef.current = itemProp.id;
    if (!open) stableSeedIdRef.current = null;
  }, [open, itemProp?.id]);
  const stableSeedId = stableSeedIdRef.current ?? itemProp?.id ?? '';

  // Não pré-carrega vizinhos enquanto uma música toca: isso concorria com o
  // stream principal e causava travamentos em rede lenta.
  useEffect(() => {
    try {
      if (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 768) return;
    } catch { /* noop */ }
    if (!effectiveItem || effectiveItem.kind !== 'audio') return;
    const pool = fallbackAudioPool;
    if (pool.length < 2) return;
    const idx = pool.findIndex((it) => it.id === effectiveItem.id);
    if (idx < 0) return;
    const nextItem = pool[(idx + 1) % pool.length];
    if (nextItem?.audio_url) window.setTimeout(() => {
      try { prewarmAudio(nextItem.id, nextItem.audio_url, true); } catch { /* noop */ }
    }, 4500);
  }, [effectiveItem, fallbackAudioPool]);

  const goAudio = useCallback((dir: 1 | -1) => {
    if (!effectiveItem || effectiveItem.kind !== 'audio') return;
    const pool = fallbackAudioPool;
    if (pool.length < 2) {
      toast.info('Não há outras músicas disponíveis no feed.');
      return;
    }
    const idx = pool.findIndex((it) => it.id === effectiveItem.id);
    const nextIdx = idx < 0 ? 0 : (idx + dir + pool.length) % pool.length;
    const next = pool[nextIdx];
    if (!next?.audio_url) return;
    try { pauseSharedAudio(effectiveItem.id); } catch { /* noop */ }
    setInternalItem(next);
    // Start playback imediato (sem timeout) — prewarm já fez fetch dos cabeçalhos.
    playSharedAudio(next.id, next.audio_url, ocultoPlayMetaFromItem(next)).catch(() => { /* noop */ });
  }, [effectiveItem, fallbackAudioPool]);

  const internalAudioPrev = useCallback(() => goAudio(-1), [goAudio]);
  const internalAudioNext = useCallback(() => goAudio(1), [goAudio]);

  // Navegação Prev/Next entre links — mantém autoplay + fullscreen + scroll por item.
  const goLink = useCallback((dir: 1 | -1) => {
    const current = (internalItem ?? itemProp) as OPItem | null;
    if (!current || current.kind !== 'link' || linkPool.length < 2) return;
    const idx = linkPool.findIndex((it) => it.id === current.id);
    const nextIdx = idx < 0 ? 0 : (idx + dir + linkPool.length) % linkPool.length;
    const next = linkPool[nextIdx];
    if (!next) return;
    // Desmonta o fullscreen do player atual antes de trocar, evitando que o
    // elemento removido fique como `fullscreenElement` órfão durante o swap.
    void exitLinkPlayerFullscreen();
    setAutoPlayLink(true);
    if (onSelectLinkSuggestion) onSelectLinkSuggestion(next);
    else setInternalItem(next);
  }, [internalItem, itemProp, linkPool, onSelectLinkSuggestion]);





  const [internalSettingBio, setInternalSettingBio] = useState(false);
  const internalSetAsAudioBio = useCallback(async (it: OPItem) => {
    if (!user?.id) { toast.error('Faça login para usar como bio em áudio.'); return; }
    if (!it.audio_url) { toast.error('Esta música não tem prévia disponível.'); return; }
    setInternalSettingBio(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ voice_bio_url: it.audio_url, voice_bio_duration: it.duration_sec ?? null } as any)
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Prévia definida como sua bio em áudio.', { description: it.title ?? undefined });
    } catch (err: any) {
      toast.error('Não foi possível definir a bio em áudio.', { description: err?.message });
    } finally {
      setInternalSettingBio(false);
    }
  }, [user?.id]);

  // Handlers efetivos (props têm prioridade; senão usa o fallback interno)
  const effectiveOnAudioPrev = onAudioPrev ?? ((_: OPItem) => internalAudioPrev());
  const effectiveOnAudioNext = onAudioNext ?? ((_: OPItem) => internalAudioNext());
  const effectiveOnSetAsAudioBio = onSetAsAudioBio ?? internalSetAsAudioBio;
  const effectiveSettingAudioBio = settingAudioBio || internalSettingBio;

  // Auto-advance: ouve o evento `ended` do áudio do item atual (efetivo).
  useEffect(() => {
    const it = effectiveItem;
    if (!open || !it || it.kind !== 'audio' || !it.audio_url) return;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const mod = await import('@/lib/ocultoPlayAudioSession');
        const a = mod.getOrCreateAudio(it.id, it.audio_url || undefined);
        if (!a) return;
        const handler = () => {
          try {
            if (onAudioEnded) onAudioEnded(it);
            else internalAudioNext();
          } catch { /* noop */ }
        };
        a.addEventListener('ended', handler);
        cleanup = () => a.removeEventListener('ended', handler);
      } catch { /* noop */ }
    })();
    return () => { try { cleanup?.(); } catch { /* noop */ } };
  }, [open, effectiveItem, onAudioEnded, internalAudioNext]);

  // ===== Restaurar/salvar scrollTop por item dentro do modal =====
  useEffect(() => {
    const currentId = effectiveItem?.id ?? null;
    const prevId = lastScrollItemIdRef.current;
    const el = scrollContainerRef.current;
    // Salva a posição do item anterior antes de trocar.
    if (el && prevId && prevId !== currentId) {
      scrollPositionsRef.current.set(prevId, el.scrollTop);
    }
    lastScrollItemIdRef.current = currentId;
    if (!open) return;
    if (!el || !currentId) return;
    // Restaura no próximo frame (após o DOM montar o novo item).
    const raf = requestAnimationFrame(() => {
      const saved = scrollPositionsRef.current.get(currentId) ?? 0;
      try { el.scrollTop = saved; } catch { /* noop */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, effectiveItem?.id]);

  // Persiste a posição enquanto o usuário rola.
  useEffect(() => {
    const el = scrollContainerRef.current;
    const id = effectiveItem?.id;
    if (!open || !el || !id) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        scrollPositionsRef.current.set(id, el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open, effectiveItem?.id]);

  // (As posições salvas são mantidas em memória entre reaberturas para
  // que o usuário retome de onde parou.)


  if (!effectiveItem) return null;
  const item = effectiveItem;
  const isVideo = item.kind === 'short_video' || item.kind === 'vip_teaser';
  const isAudio = item.kind === 'audio';
  const isLink = item.kind === 'link';
  const linkSourceUrl = (item as any).source_url || ((item as any).link_provider ? item.media_url : null) || (item.media_url && /^https?:\/\//.test(item.media_url) ? item.media_url : null);
  const cover = item.thumb_url ?? (isLink ? null : item.media_url) ?? undefined;

  const handleSwipeStart = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('button,[role="slider"],input,a,[data-no-swipe]')) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const handleSwipeEnd = (e: React.PointerEvent) => {
    const s = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!s) return;
    const dy = e.clientY - s.y;
    const dx = e.clientX - s.x;
    const dt = performance.now() - s.t;
    if (Math.abs(dy) < 60 || Math.abs(dx) > 60 || dt > 800) return;
    if (dy < 0) onSwipeNextVideo?.(item);
    else onSwipePrevVideo?.(item);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o || lightboxOpen) return;
          // Em áudio, clique fora / ESC não podem desmontar o player e cortar a
          // reprodução. O player só fecha pelos botões explícitos (X/Parar).
          if (isAudio) return;
          safeClose();
        }}
      >
        <DialogContent
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => { if (isAudio) e.preventDefault(); }}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (
              t.closest('[data-cover-lightbox-root]') ||
              t.closest('[data-radix-popper-content-wrapper]') ||
              t.closest('[data-radix-portal]') ||
              t.closest('[role="menu"]') ||
              t.closest('[role="listbox"]') ||
              t.closest('[data-sonner-toaster]')
            ) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (
              t.closest('[data-cover-lightbox-root]') ||
              t.closest('[data-radix-popper-content-wrapper]') ||
              t.closest('[data-radix-portal]') ||
              t.closest('[role="menu"]') ||
              t.closest('[role="listbox"]') ||
              t.closest('[data-sonner-toaster]')
            ) e.preventDefault();
          }}

          className={cn(
            'p-0 overflow-hidden select-none [&>button.rounded-sm]:hidden',
            isVideo
              ? 'bg-black border-0 rounded-none !w-screen !h-[100dvh] !max-w-none !max-h-none sm:!w-auto sm:!h-[94dvh] sm:!max-w-[min(430px,calc(100vw-2rem))] sm:aspect-[9/16] flex flex-col !overflow-hidden'
              : 'bg-card border-border/40 flex flex-col w-[96vw] sm:w-[92vw] max-w-2xl max-h-[92dvh] sm:max-h-[90vh]',
          )}
          style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          <VisuallyHidden.Root>
            <DialogTitle>{item.title ?? 'Oculto Play'}</DialogTitle>
            <DialogDescription>Player de mídia do Oculto Play</DialogDescription>
          </VisuallyHidden.Root>


          {isVideo && item.media_url ? (
            // ====== FEED VERTICAL INFINITO ESTILO TIKTOK ======
            <OcultoPlayShortsScroller
              items={shortsQueue}
              seedId={stableSeedId || item.id}
              onClose={safeClose}
              onActiveChange={undefined}
              onComment={onComment}
              onShare={onShare}
              onReport={onReport}
              onNearEnd={onVideoFeedNearEnd}
            />
          ) : (
            <div ref={scrollContainerRef} className="oculto-play-focus-scroll flex flex-col overflow-y-auto overflow-x-hidden relative">
              {/* Botão fechar — destaque colorido, canto superior direito */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); safeClose(); }}
                aria-label="Fechar"
                title="Fechar"
                data-no-swipe
                className="absolute top-2 right-2 z-50 h-10 w-10 grid place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500 text-white shadow-[0_4px_14px_-2px_rgba(236,72,153,0.6)] ring-2 ring-white/30 hover:from-fuchsia-400 hover:to-rose-400 active:scale-95 transition"
                style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
              >
                <X className="h-5 w-5" strokeWidth={2.8} />
              </button>

              {/* Capa em destaque (áudio/imagem) — clicável para tela cheia */}
              {cover && (
                <div
                  className="relative w-full bg-black flex items-center justify-center"
                  style={{ maxHeight: '40dvh' }}
                >
                  <button
                    type="button"
                    onClick={() => { setLightboxInitialView('cover'); setLightboxOpen(true); }}
                    aria-label="Expandir capa em tela cheia"
                    className="block w-full"
                    style={{ maxHeight: '40dvh' }}
                  >
                    <img
                      src={cover}
                      alt={item.title ?? 'capa'}
                      className="mx-auto max-h-[40dvh] w-auto max-w-full object-contain select-none pointer-events-none"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                      style={{ maxHeight: '40dvh', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
                    />

                  </button>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <div className="pointer-events-none absolute left-3 right-3 bottom-2 text-white">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 ring-2 ring-fuchsia-400/40">
                        {item.author_avatar_url && <AvatarImage src={item.author_avatar_url} />}
                        <AvatarFallback className="text-[10px]">
                          {(item.author_display_name ?? '?').slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[11px] font-bold truncate max-w-[60vw]">
                        {item.author_display_name ?? item.author_username}
                      </span>
                    </div>
                    {(item.title || item.caption) && (
                      <p className="mt-1 text-xs sm:text-sm font-semibold line-clamp-2 break-words">
                        {item.title || item.caption}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Player abaixo */}
              <div ref={playerWrapRef} tabIndex={-1} className="p-3 sm:p-4 bg-background/60 shrink-0 outline-none">
                {isAudio ? (
                  <>
                    <OcultoPlayAudioItem item={item} variant="expanded" />
                    <AudioModeControls
                      repeatMode={audioRepeatMode}
                      onRepeatModeChange={onAudioRepeatModeChange}
                      onNavigateHome={handleNavigateHome}
                      trailing={
                        <OcultoPlayOfflineButton
                          itemId={item.id}
                          audioUrl={item.audio_url ?? item.media_url ?? null}
                          title={item.title ?? item.caption ?? null}
                          thumbUrl={item.thumb_url ?? null}
                          durationSec={item.duration_sec ?? null}
                        />
                      }
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => effectiveOnAudioPrev(item)}
                        aria-label="Música anterior"
                        title="Música anterior"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground hover:bg-muted active:scale-95 transition"
                      >
                        <SkipBack className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={effectiveSettingAudioBio}
                        onClick={() => effectiveOnSetAsAudioBio(item)}
                        aria-label="Definir como bio em áudio do meu perfil"
                        title="Usar prévia como minha bio em áudio"
                        className={cn(
                          'inline-flex h-9 flex-1 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                          'bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 text-white shadow-[0_2px_10px_-2px_rgba(236,72,153,0.55)] ring-1 ring-white/20',
                          'hover:from-fuchsia-400 hover:via-pink-400 hover:to-rose-400 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed',
                        )}
                      >
                        <Mic className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{effectiveSettingAudioBio ? 'Aplicando…' : 'Usar como minha bio'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => effectiveOnAudioNext(item)}
                        aria-label="Próxima música"
                        title="Próxima música"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground hover:bg-muted active:scale-95 transition"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    </div>
                    {(() => {
                      const lyr = (item as any).lyrics as string | null | undefined;
                      const hasLyr = !!(lyr && String(lyr).trim().length > 0);
                      if (!hasLyr) return null;
                      const lyricsOpen = lightboxOpen && lightboxInitialView === 'lyrics';
                      return (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (lyricsOpen) {
                                setLightboxOpen(false);
                              } else {
                                setLightboxInitialView('lyrics');
                                setLightboxOpen(true);
                              }
                            }}
                            aria-pressed={lyricsOpen}
                            aria-label={lyricsOpen ? 'Ocultar letra da música' : 'Mostrar letra da música'}
                            className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/10 border border-fuchsia-500/40 text-fuchsia-100 transition active:scale-[0.98]"
                          >
                            📝 {lyricsOpen ? 'Ocultar letra' : 'Mostrar letra'}
                          </button>
                        </div>
                      );
                    })()}
                  </>
                ) : isLink && linkSourceUrl ? (
                  <>
                    <div className="relative">
                      <OcultoPlayLinkPlayer
                        key={item.id}
                        sourceUrl={linkSourceUrl}
                        thumbUrl={item.thumb_url ?? null}
                        title={item.title ?? null}
                        lazyClickToPlay={false}
                        restoreFullscreen
                        autoPlay={autoPlayLink}
                        itemId={item.id}
                        onCompleted={() => actions.registerMovieCompletion(item.id)}
                      />
                      {linkPool.length > 1 && (
                        <>
                          <button
                            type="button"
                            data-no-swipe
                            onClick={(e) => { e.stopPropagation(); goLink(-1); }}
                            aria-label="Vídeo anterior"
                            title="Anterior"
                            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 grid place-items-center rounded-full bg-black/65 hover:bg-black/85 text-white ring-1 ring-white/20 backdrop-blur transition active:scale-95"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            data-no-swipe
                            onClick={(e) => { e.stopPropagation(); goLink(1); }}
                            aria-label="Próximo vídeo"
                            title="Próximo"
                            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 grid place-items-center rounded-full bg-black/65 hover:bg-black/85 text-white ring-1 ring-white/20 backdrop-blur transition active:scale-95"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                    <PlayLinkSuggestionsStrip
                      currentItem={item}
                      onSelect={(nextItem) => {
                        // Marca autoplay para o próximo item e mantém a tela
                        // cheia (a preferência fica salva via localStorage).
                        setAutoPlayLink(true);
                        if (onSelectLinkSuggestion) onSelectLinkSuggestion(nextItem);
                        else setInternalItem(nextItem);
                      }}
                    />
                  </>

                ) : (item.media_url || item.thumb_url) ? (
                  <OcultoPlayImageItem
                    src={(item.media_url ?? item.thumb_url) as string}
                    alt={item.title ?? ''}
                  />
                ) : null}
              </div>


              {/* Ações */}
              <div className="px-3 sm:px-4 pb-4 pt-3 border-t border-border/40 mt-3 shrink-0">
                <OcultoPlayActions
                  orientation="horizontal"
                  itemId={item.id}
                  liked={item.liked_by_me}
                  disliked={item.disliked_by_me}
                  saved={item.saved_by_me}
                  likeCount={item.like_count}
                  dislikeCount={item.dislike_count}
                  commentCount={item.comment_count}
                  saveCount={item.save_count}
                  shareCount={item.share_count}
                  viewCount={item.view_count}
                  onLike={onLike ? () => onLike(item) : undefined}
                  onDislike={onDislike ? () => onDislike(item) : undefined}
                  onSave={onSave ? () => onSave(item) : undefined}
                  onComment={onComment ? () => onComment(item) : undefined}
                  onShare={onShare ? () => onShare(item) : undefined}
                  useShareMenu
                  shareTitle={item.title ?? item.caption}
                  shareAuthor={item.author_username}
                  shareAbovePlayer
                  onReport={onReport ? () => onReport(item) : undefined}
                  genreTags={item.genre_tags}
                  aiTool={item.ai_tool}
                  composerName={item.composer_name}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {cover && (
        <CoverLightbox
          src={cover}
          alt={item.title ?? 'capa'}
          title={item.title ?? item.caption ?? null}
          lyrics={(item as any).lyrics ?? null}
          itemId={item.id ?? null}
          open={lightboxOpen}
          initialView={lightboxInitialView}
          onClose={() => {
            setLightboxOpen(false);
            // devolve o foco ao player após fechar a capa expandida
            requestAnimationFrame(() => playerWrapRef.current?.focus());
          }}
        />
      )}
    </>
  );
}
