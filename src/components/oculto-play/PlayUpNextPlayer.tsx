/**
 * PlayUpNextPlayer — Etapa 35
 *
 * Player sequencial em dialog full-screen para autoplay de itens do Oculto Play.
 * - Vídeos: avança no `ended`.
 * - Imagens/memes: timer de 6s.
 * - Áudios: avança no `ended` do <audio>.
 * Permite Pular, Voltar e exibe a fila lateral com motivo do up-next.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { X, SkipForward, SkipBack, Pause, Play as PlayIcon, ListVideo, ListOrdered, PictureInPicture2, Headphones, Maximize2, Minimize2, Loader2, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayUpNext } from '@/hooks/useOcultoPlayUpNext';
import { useOcultoPlayActions, type OcultoPlayItem } from '@/hooks/useOcultoPlayContent';
import { usePlayTracks, fetchChapters } from '@/hooks/useOcultoPlayTracks';
import { useOcultoPlayPipMode } from '@/hooks/useOcultoPlayPipMode';
import { WatchPartyHostButton } from '@/components/oculto-play/WatchPartyHostButton';
import { PlayPlaybackControls } from '@/components/oculto-play/PlayPlaybackControls';
import { PlayCaptionOverlayButton } from '@/components/oculto-play/PlayCaptionOverlay';
import { useOcultoPlayGestures } from '@/hooks/useOcultoPlayGestures';
import { PlayGestureFeedback, type GestureFeedbackState } from '@/components/oculto-play/PlayGestureFeedback';
import { useOcultoPlayProgressLogger } from '@/hooks/useOcultoPlayProgressLogger';
import { useOcultoPlayResume } from '@/hooks/useOcultoPlayResume';
import { useOcultoPlayChapters } from '@/hooks/useOcultoPlayChapters';
import { PlaySkipIntroButton } from '@/components/oculto-play/PlaySkipIntroButton';
import { PlayHighlightsNavigator } from '@/components/oculto-play/PlayHighlightsNavigator';
import { PlayTimelineReactionsOverlay } from '@/components/oculto-play/PlayTimelineReactionsOverlay';
import { PlayReactionHeatmapBar } from '@/components/oculto-play/PlayReactionHeatmapBar';
import { PlayLiveViewersBadge } from '@/components/oculto-play/PlayLiveViewersBadge';
import { PlayShareTimestampButton } from '@/components/oculto-play/PlayShareTimestampButton';
import { useOcultoPlayAudioSettingsStore } from '@/store/useOcultoPlayAudioSettingsStore';




interface Props {
  open: boolean;
  seed: OcultoPlayItem | null;
  onClose: () => void;
}

const IMAGE_DURATION_MS = 6_000;

export function PlayUpNextPlayer({ open, seed, onClose }: Props) {
  const [history, setHistory] = useState<OcultoPlayItem[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [gestureFb, setGestureFb] = useState<GestureFeedbackState | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const imgTimerRef = useRef<number | null>(null);
  const actions = useOcultoPlayActions();

  // (Re)inicia ao abrir
  useEffect(() => {
    if (open && seed) {
      setHistory([seed]);
      setIndex(0);
      setPaused(false);
      setIsPlaying(false);
      setMediaLoading(false);
      setMediaError(null);
    }
  }, [open, seed?.id]);

  const current = history[index] ?? null;
  const excludeIds = useMemo(() => history.map(i => i.id), [history]);

  const { data: upNext = [] } = useOcultoPlayUpNext(current?.id, excludeIds, 12);
  const { data: tracks = [] } = usePlayTracks(current?.id);
  const { data: dbChapters = [] } = useOcultoPlayChapters(current?.id);

  const [chapters, setChapters] = useState<Array<{ start: number; end: number; label: string }>>([]);
  const [ccEnabled, setCcEnabled] = useState(true);
  const { pipSupported, pipActive, audioOnly, togglePip, toggleAudioOnly } = useOcultoPlayPipMode(videoRef, current?.id);
  const attemptVideoPlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    setMediaError(null);
    setMediaLoading(true);
    try {
      await v.play();
      setPaused(false);
      setIsPlaying(true);
    } catch {
      try {
        v.muted = true;
        setMuted(true);
        await v.play();
        setPaused(false);
        setIsPlaying(true);
      } catch {
        setPaused(true);
        setIsPlaying(false);
        setMediaError('Toque para reproduzir');
      }
    } finally {
      setMediaLoading(false);
    }
  };

  const toggleVideoPlayback = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || paused) void attemptVideoPlay();
    else {
      v.pause();
      setPaused(true);
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next && v.paused) void attemptVideoPlay();
  };

  const toggleFullscreen = async () => {
    const target = playerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    if (!target) return;
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else {
        await target.webkitRequestFullscreen?.();
      }
    } catch {
      // Alguns navegadores só permitem fullscreen após gesto direto do usuário.
    }
  };

  // Carrega capítulos do .vtt (kind=chapters) sempre que o item muda
  useEffect(() => {
    let alive = true;
    const chapterTrack = tracks.find(t => t.kind === 'chapters' && t.is_default) ?? tracks.find(t => t.kind === 'chapters');
    if (!chapterTrack) { setChapters([]); return; }
    fetchChapters(chapterTrack.vtt_url).then(c => { if (alive) setChapters(c); });
    return () => { alive = false; };
  }, [current?.id, tracks]);

  // Etapa 42 — render nativo de captions é desligado pelo PlayCaptionOverlayButton.



  // Registrar view — apenas uma vez por item para evitar loop
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const id = current?.id;
    if (!id) return;
    if (viewedRef.current.has(id)) return;
    viewedRef.current.add(id);
    actions.registerView(id, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Limpa timer de imagem ao trocar item
  const clearImageTimer = () => {
    if (imgTimerRef.current) {
      window.clearTimeout(imgTimerRef.current);
      imgTimerRef.current = null;
    }
  };

  const audioShuffle = useOcultoPlayAudioSettingsStore((s) => s.shuffle);

  // Refs para garantir que cliques rápidos sempre vejam o item mais recente
  // (evita repetir a mesma música ao spammar Próximo/Anterior).
  const currentRef = useRef<OcultoPlayItem | null>(null);
  const recentIdsRef = useRef<string[]>([]);
  useEffect(() => {
    currentRef.current = current ?? null;
    if (current?.id) {
      const ids = recentIdsRef.current.filter((x) => x !== current.id);
      ids.push(current.id);
      // mantém histórico curto para não esgotar a pool em playlists pequenas
      recentIdsRef.current = ids.slice(-5);
    }
  }, [current?.id]);

  const pickRandomAudio = (): OcultoPlayItem | null => {
    const liveCurrentId = currentRef.current?.id ?? current?.id;
    const allAudios = (upNext as OcultoPlayItem[]).filter(
      (it) => it.kind === 'audio' && !!it.audio_url,
    );
    if (!allAudios.length) return null;
    // 1) tenta evitar atual + recentes
    let pool = allAudios.filter(
      (it) => it.id !== liveCurrentId && !recentIdsRef.current.includes(it.id),
    );
    // 2) se esgotou, evita apenas a atual
    if (!pool.length) pool = allAudios.filter((it) => it.id !== liveCurrentId);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // Calcula próximo item sem mutar estado — usado tanto pelo goNext (React)
  // quanto pelo avanço imperativo de áudio em tela bloqueada.
  const computeNextItem = (): OcultoPlayItem | null => {
    if (audioShuffle && (currentRef.current?.kind ?? current?.kind) === 'audio') {
      const rnd = pickRandomAudio();
      if (rnd) return rnd;
    }
    if (index < history.length - 1) return history[index + 1] ?? null;
    return (upNext[0] as OcultoPlayItem | undefined) ?? null;
  };

  const goNext = () => {
    clearImageTimer();
    if (audioShuffle && (currentRef.current?.kind ?? current?.kind) === 'audio') {
      const rnd = pickRandomAudio();
      if (rnd) {
        setHistory((h) => [...h, rnd]);
        setIndex((i) => i + 1);
        return;
      }
    }
    if (index < history.length - 1) {
      setIndex(index + 1);
      return;
    }
    const next = upNext[0];
    if (next) {
      setHistory(h => [...h, next as OcultoPlayItem]);
      setIndex(i => i + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    clearImageTimer();
    if (audioShuffle && (currentRef.current?.kind ?? current?.kind) === 'audio') {
      const rnd = pickRandomAudio();
      if (rnd) {
        setHistory((h) => [...h, rnd]);
        setIndex((i) => i + 1);
        return;
      }
    }
    setIndex(i => Math.max(0, i - 1));
  };

  // Avanço IMPERATIVO para áudio: troca o src do MESMO <audio> e dá play()
  // dentro do mesmo evento `ended`. Isso preserva a sessão de mídia do SO,
  // permitindo continuar tocando com a tela bloqueada no mobile.
  const audioAdvanceImperative = () => {
    const a = audioRef.current;
    const next = computeNextItem();
    if (!next) { onClose(); return; }
    if (next.kind === 'audio' && next.audio_url && a) {
      try {
        a.src = next.audio_url;
        a.load();
        // play() síncrono dentro do handler ended preserva o gesto/sessão.
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* noop */ }
    }
    // Sincroniza estado React (mídia já está tocando)
    if (index < history.length - 1 && history[index + 1]?.id === next.id) {
      setIndex(index + 1);
    } else {
      setHistory(h => [...h, next]);
      setIndex(i => i + 1);
    }
  };


  // Timer p/ imagens/memes
  useEffect(() => {
    clearImageTimer();
    if (!current || paused) return;
    const isImage = current.kind === 'meme' || (current.kind === 'community_post' && !!current.thumb_url && !current.media_url?.endsWith('.mp4'));
    if (isImage) {
      imgTimerRef.current = window.setTimeout(() => {
        goNext();
      }, IMAGE_DURATION_MS);
    }
    return () => clearImageTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, paused]);

  // Carrega/troca a faixa de áudio imperativamente quando muda o item atual,
  // SEM remontar o <audio>. Necessário para manter a sessão de mídia ativa em
  // tela bloqueada (mobile) — combinado com o avanço imperativo no `ended`.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (current?.kind !== 'audio' || !current.audio_url) return;
    // Evita reload se já é o mesmo src
    if (a.src && a.src.endsWith(current.audio_url)) return;
    try {
      a.src = current.audio_url;
      a.load();
      if (!paused) {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch { /* noop */ }
  }, [current?.id, current?.kind, current?.audio_url, paused]);

  // MediaSession API — exibe controles na tela bloqueada e mantém a sessão
  // viva no SO (essencial para autoplay sequencial em background).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!current) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: current.title ?? 'OCULTO Play',
        artist: current.author_username ? `@${current.author_username}` : 'OCULTO',
        album: 'OCULTO Play',
        artwork: current.thumb_url
          ? [{ src: current.thumb_url, sizes: '512x512', type: 'image/jpeg' }]
          : undefined,
      });
    } catch { /* noop */ }
    const setHandler = (action: MediaSessionAction, handler: (() => void) | null) => {
      try { ms.setActionHandler(action, handler); } catch { /* noop */ }
    };
    setHandler('play', () => { setPaused(false); audioRef.current?.play().catch(() => {}); videoRef.current?.play().catch(() => {}); });
    setHandler('pause', () => { setPaused(true); audioRef.current?.pause(); videoRef.current?.pause(); });
    setHandler('nexttrack', () => {
      if ((currentRef.current?.kind ?? current.kind) === 'audio') audioAdvanceImperative();
      else goNext();
    });
    setHandler('previoustrack', () => goPrev());
    return () => {
      setHandler('play', null);
      setHandler('pause', null);
      setHandler('nexttrack', null);
      setHandler('previoustrack', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, history.length, index, upNext.length]);


  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange' as keyof DocumentEventMap, onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange' as keyof DocumentEventMap, onFullscreenChange);
    };
  }, []);

  // Toggle play/pause de vídeo/áudio
  useEffect(() => {
    if (paused) {
      videoRef.current?.pause();
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (current?.kind === 'short_video') void attemptVideoPlay();
      audioRef.current?.play().catch(() => {});
    }
  }, [paused, current?.id]);

  // Logger de retenção (Etapa 44)
  useOcultoPlayProgressLogger({
    itemId: current?.id ?? null,
    mediaRef: (current?.kind === 'audio' ? audioRef : videoRef) as React.RefObject<HTMLVideoElement | HTMLAudioElement | null>,
  });

  // Resume de onde parou (Etapa 45)
  useOcultoPlayResume({
    itemId: current?.id ?? null,
    mediaRef: (current?.kind === 'audio' ? audioRef : videoRef) as React.RefObject<HTMLVideoElement | HTMLAudioElement | null>,
  });



  // Atalhos de teclado
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, history, index, upNext.length]);

  // Gestos mobile (Etapa 43)
  const gestureMediaRef = (current?.kind === 'audio' ? audioRef : videoRef) as React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  const { bindGestures } = useOcultoPlayGestures({
    mediaRef: gestureMediaRef,
    onNext: goNext,
    onPrev: goPrev,
    onToggleControls: () => setControlsHidden(v => !v),
    onDoubleTapSeek: (delta, side) =>
      setGestureFb({ key: performance.now(), side, delta }),
  });

  if (!open || !current) return null;

  const authorTag = current.author_username ? `@${current.author_username}` : 'Alguém';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        ref={playerRef}
        className="max-w-none w-screen h-[100dvh] p-0 bg-black border-0 rounded-none flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <VisuallyHidden asChild>
          <DialogTitle>OCULTO Play</DialogTitle>
        </VisuallyHidden>
        {/* Header */}
        <div
          data-no-gesture
          className={cn(
            'absolute top-0 inset-x-0 z-30 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-200',
            controlsHidden && 'opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-center gap-2 text-white">
            <ListVideo className="h-4 w-4 text-fuchsia-300" />
            <span className="text-xs font-medium opacity-80">Fila Up Next</span>
            <span className="text-[10px] opacity-60">· {index + 1} / {history.length + upNext.length}</span>
            <PlayLiveViewersBadge itemId={current?.id ?? null} className="ml-2" />
          </div>
          <div className="flex items-center gap-1">
            <PlayCaptionOverlayButton
              tracks={tracks}
              mediaRef={(current?.kind === 'audio' ? audioRef : videoRef) as React.RefObject<HTMLVideoElement | HTMLAudioElement | null>}
              enabled={ccEnabled}
              onToggle={setCcEnabled}
            />
            {current.kind === 'short_video' && pipSupported && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('text-white hover:bg-white/10', pipActive && 'bg-fuchsia-500/30')}
                onClick={togglePip}
                title={pipActive ? 'Sair do Picture-in-Picture' : 'Picture-in-Picture'}
               aria-label="Ação">
                <PictureInPicture2 className="h-5 w-5" />
              </Button>
            )}
            {current.kind === 'short_video' && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('text-white hover:bg-white/10', audioOnly && 'bg-fuchsia-500/30')}
                onClick={toggleAudioOnly}
                title={audioOnly ? 'Voltar ao vídeo' : 'Modo áudio (só som)'}
               aria-label="Ação">
                <Headphones className="h-5 w-5" />
              </Button>
            )}
            {current.kind === 'short_video' && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:inline-flex text-white hover:bg-white/10"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </Button>
            )}
            <PlayPlaybackControls
              mediaRef={(current?.kind === 'audio' ? audioRef : videoRef) as React.RefObject<HTMLVideoElement | HTMLAudioElement>}
              onSleep={onClose}
            />
            <WatchPartyHostButton
              itemId={current?.id ?? null}
              videoRef={videoRef}
              isPlaying={!paused}
              title={current?.title ?? null}
            />
            <PlayShareTimestampButton
              itemId={current?.id ?? null}
              mediaRef={(current?.kind === 'audio' ? audioRef : videoRef) as React.RefObject<HTMLVideoElement | HTMLAudioElement>}
              title={current?.title ?? null}
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => setShowQueue(s => !s)}
              title="Mostrar fila"
            >
              <ListVideo className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={onClose}
              title="Fechar"
             aria-label="Fechar">
              <X className="h-5 w-5" />
            </Button>
          </div>

        </div>

        {/* Mídia central */}
        <div className="flex-1 relative grid place-items-center overflow-hidden min-h-0 bg-black" {...bindGestures}>
          <PlayGestureFeedback state={gestureFb} />
          {current.kind === 'short_video' && current.media_url ? (
            <>
              {audioOnly && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-black">
                  <div className="flex flex-col items-center gap-4 text-white">
                    <div className="grid h-40 w-40 place-items-center rounded-3xl bg-gradient-to-br from-fuchsia-500/40 to-primary/30">
                      <Headphones className="h-16 w-16" />
                    </div>
                    <div className="text-xs opacity-70">Modo áudio · toque no fone para voltar</div>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="absolute inset-y-0 left-1/2 z-0 flex w-full max-w-[430px] -translate-x-1/2 items-center justify-center bg-black outline-none md:rounded-[22px] md:overflow-hidden md:border md:border-white/10"
                onClick={toggleVideoPlayback}
                aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}
              >
                <video
                  key={current.id}
                  ref={videoRef}
                  src={current.media_url}
                  poster={current.thumb_url ?? undefined}
                  className={cn(
                    'h-full w-full max-h-full max-w-full object-contain bg-black',
                    'md:h-[calc(100dvh-1rem)] md:w-auto',
                    audioOnly && 'opacity-0 pointer-events-none',
                  )}
                  autoPlay
                  muted={muted}
                  playsInline
                  controls={false}
                  controlsList="nodownload noremoteplayback nofullscreen"
                  disablePictureInPicture
                  disableRemotePlayback
                  preload="metadata"
                  crossOrigin="anonymous"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  onLoadStart={() => { setMediaLoading(true); setMediaError(null); }}
                  onLoadedData={() => setMediaLoading(false)}
                  onCanPlay={() => setMediaLoading(false)}
                  onWaiting={() => setMediaLoading(true)}
                  onPlaying={() => { setMediaLoading(false); setIsPlaying(true); setPaused(false); setMediaError(null); }}
                  onPause={() => setIsPlaying(false)}
                  onError={() => { setMediaLoading(false); setIsPlaying(false); setMediaError('Não foi possível carregar este vídeo'); }}
                  onEnded={goNext}
                >
                  {tracks
                    .filter(t => t.kind === 'subtitles' || t.kind === 'captions')
                    .map(t => (
                      <track
                        key={t.id}
                        kind={t.kind}
                        src={t.vtt_url}
                        srcLang={t.lang}
                        label={t.label}
                        default={t.is_default}
                      />
                    ))}
                </video>
              </button>
              {(mediaLoading || !isPlaying || mediaError) && !audioOnly && (
                <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/15">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                    {mediaLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <PlayIcon className="h-7 w-7 ml-1" fill="currentColor" />}
                  </div>
                  {mediaError && <div className="absolute mt-24 rounded-full bg-black/70 px-3 py-1 text-xs text-white">{mediaError}</div>}
                </div>
              )}
              <button
                type="button"
                data-no-gesture
                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                className="absolute left-4 bottom-24 z-30 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75 md:left-6 md:bottom-28"
                aria-label={muted ? 'Ativar som' : 'Silenciar'}
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </>

          ) : current.kind === 'audio' && current.audio_url ? (
            <div className="flex flex-col items-center gap-4 text-white">
              <div className="grid h-40 w-40 place-items-center rounded-3xl bg-gradient-to-br from-fuchsia-500/40 to-primary/30">
                <PlayIcon className="h-16 w-16" />
              </div>
              {/* IMPORTANTE: sem `key` e sem `src` no JSX — o src é setado
                  imperativamente para reusar o MESMO <audio> entre faixas.
                  Isso mantém a sessão de mídia viva em tela bloqueada (mobile)
                  e permite que a próxima música comece automaticamente. */}
              <audio
                ref={audioRef}
                onEnded={audioAdvanceImperative}
                className="w-72"
                controls
                preload="auto"
              />
            </div>

          ) : (current.thumb_url || current.media_url) ? (
            <img
              key={current.id}
              src={current.thumb_url || current.media_url!}
              alt={current.title ?? ''}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="text-white/60 text-sm">Conteúdo indisponível</div>
          )}
        </div>

        {/* Skip Intro / Recap (Etapa 46 — capítulos do banco) */}
        <PlaySkipIntroButton
          mediaRef={current.kind === 'audio' ? audioRef : videoRef}
          chapters={dbChapters}
          hidden={controlsHidden}
        />

        {/* Highlights Navigator (Etapa 48) */}
        <PlayHighlightsNavigator
          mediaRef={current.kind === 'audio' ? audioRef : videoRef}
          chapters={dbChapters}
          hidden={controlsHidden}
        />

        {/* Reações na Linha do Tempo (Etapa 49) */}
        <PlayTimelineReactionsOverlay
          itemId={current.id}
          mediaRef={current.kind === 'audio' ? audioRef : videoRef}
          hidden={controlsHidden}
        />

        {/* Heatmap de Reações (Etapa 50) */}
        <PlayReactionHeatmapBar
          itemId={current.id}
          mediaRef={current.kind === 'audio' ? audioRef : videoRef}
          hidden={controlsHidden}
        />

        {/* Strip de capítulos (VTT + banco) */}
        {(() => {
          const merged = [
            ...chapters.map(c => ({ start: c.start, label: c.label })),
            ...dbChapters.map(c => ({ start: c.start, label: c.label || c.kind })),
          ].sort((a, b) => a.start - b.start);
          if (merged.length === 0) return null;
          if (current.kind !== 'short_video' && current.kind !== 'audio') return null;
          const targetRef = current.kind === 'audio' ? audioRef : videoRef;
          return (
            <div className="absolute bottom-24 inset-x-0 z-30 px-4">
              <div className="max-w-3xl mx-auto flex items-center gap-2 overflow-x-auto pb-1">
                <ListOrdered className="h-4 w-4 text-fuchsia-300 shrink-0" />
                {merged.map((c, i) => (
                  <button
                    key={i}
                    data-no-gesture
                    onClick={() => {
                      const el = targetRef.current;
                      if (el) {
                        el.currentTime = c.start;
                        el.play().catch(() => {});
                      }
                    }}
                    className="shrink-0 text-[11px] text-white bg-white/10 hover:bg-fuchsia-500/40 backdrop-blur px-2 py-1 rounded-full transition-colors"
                    title={`${Math.floor(c.start / 60)}:${String(Math.floor(c.start % 60)).padStart(2, '0')}`}
                  >
                    {c.label || '•'}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}


        {/* Info inferior */}
        <div
          data-no-gesture
          className={cn(
            'absolute bottom-0 inset-x-0 z-30 p-4 pb-6 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200',
            controlsHidden && 'opacity-0 pointer-events-none',
          )}
        >

          <div className="max-w-3xl mx-auto flex items-end justify-between gap-4">
            <div className="text-white min-w-0">
              <div className="text-xs opacity-70 flex items-center gap-2">
                <span className="tabular-nums opacity-90">#{index + 1}</span>
                {audioShuffle && current?.kind === 'audio' && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide"
                    style={{ background: 'rgba(0,191,255,0.18)', color: '#00BFFF', border: '1px solid rgba(0,191,255,0.45)' }}
                  >
                    ALEATÓRIO
                  </span>
                )}
                <span className="truncate">{authorTag}</span>
              </div>
              {current.title && <div className="text-sm font-semibold truncate">{current.title}</div>}
              {current.caption && <div className="text-xs opacity-80 line-clamp-2">{current.caption}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost" size="icon"
                className="text-white hover:bg-white/10"
                onClick={goPrev}
                disabled={index === 0}
                title="Anterior"
               aria-label="Anterior">
                <SkipBack className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => setPaused(p => !p)}
                title={paused ? 'Reproduzir' : 'Pausar'}
              >
                {paused ? <PlayIcon className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </Button>
              <Button
                variant="ghost" size="icon"
                className="text-white hover:bg-white/10"
                onClick={goNext}
                title="Próximo"
               aria-label="Próximo">
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Painel da fila */}
        {showQueue && (
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-background/95 backdrop-blur border-l border-border/50 z-40 overflow-y-auto">
            <div className="p-3 border-b border-border/40 flex items-center justify-between">
              <span className="text-sm font-semibold">A seguir</span>
              <Button variant="ghost" size="icon" onClick={() => setShowQueue(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="divide-y divide-border/30">
              {upNext.length === 0 && (
                <div className="p-4 text-xs text-muted-foreground">
                  Nada mais na fila por enquanto.
                </div>
              )}
              {upNext.map((it, i) => (
                <button
                  key={it.id}
                  onClick={() => {
                    setHistory(h => [...h, it as OcultoPlayItem]);
                    setIndex(i2 => i2 + 1);
                    setShowQueue(false);
                  }}
                  className={cn(
                    'w-full text-left flex gap-2 p-2 hover:bg-muted/50 transition-colors',
                  )}
                >
                  <div className="h-14 w-14 rounded-md overflow-hidden bg-muted shrink-0">
                    {it.thumb_url ? (
                      <img src={it.thumb_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-muted-foreground">
                        <PlayIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {it.title || it.caption || 'Sem título'}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {it.author_username ? `@${it.author_username}` : 'Alguém'}
                    </div>
                    <div className="text-[10px] text-fuchsia-300/90 mt-0.5">
                      {it.up_next_reason}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground self-center">#{i + 1}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
