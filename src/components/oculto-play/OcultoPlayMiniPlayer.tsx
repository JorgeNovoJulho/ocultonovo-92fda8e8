import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music2, Pause, Play, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayFeed, type OcultoPlayItem } from '@/hooks/useOcultoPlayContent';
import {
  getActiveAudioState,
  ocultoPlayMetaFromItem,
  pauseSharedAudio,
  playNextSharedAudio,
  playSharedAudio,
  subscribeActiveAudio,
  type ActiveAudioState,
} from '@/lib/ocultoPlayAudioSession';
import { getFxState, setMuted, setVolume, subscribeFx } from '@/lib/ocultoPlayAudioFx';
import { disableOcultoPlayMiniPlayer, isOcultoPlayMiniPlayerEnabled, subscribeOcultoPlayMiniPlayer } from '@/lib/ocultoPlayMiniPlayerState';

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function OcultoPlayMiniPlayer() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(() => isOcultoPlayMiniPlayerEnabled());
  const [active, setActive] = useState<ActiveAudioState | null>(() => getActiveAudioState());
  const [fx, setFx] = useState(() => getFxState());
  const suppressNextClickRef = useRef(false);
  const audioFeed = useOcultoPlayFeed('normal', 'audio', 60);

  useEffect(() => subscribeActiveAudio(setActive), []);
  useEffect(() => subscribeFx(setFx), []);
  useEffect(() => subscribeOcultoPlayMiniPlayer(setEnabled), []);

  const activeItem = useMemo(() => {
    const items = (audioFeed.data ?? []) as OcultoPlayItem[];
    return active?.id ? items.find((it) => it.id === active.id) ?? null : null;
  }, [active?.id, audioFeed.data]);

  const togglePlay = useCallback(() => {
    if (!active?.id) return;
    if (active.playing) {
      try { pauseSharedAudio(active.id); } catch { /* noop */ }
    } else {
      const src = activeItem?.audio_url ?? undefined;
      playSharedAudio(active.id, src, active.meta ?? (activeItem ? ocultoPlayMetaFromItem(activeItem) : undefined))
        .catch(() => { /* noop */ });
    }
  }, [active?.id, active?.playing, active?.meta, activeItem]);

  const goNext = useCallback(() => {
    if (!active?.id) return;
    playNextSharedAudio('manual').catch(() => { /* noop */ });
  }, [active?.id]);

  const stop = useCallback(() => {
    if (active?.id) pauseSharedAudio(active.id);
    disableOcultoPlayMiniPlayer();
    setEnabled(false);
  }, [active?.id]);

  const openExpanded = useCallback(() => {
    if (!active?.id) return;
    try {
      if (typeof window !== 'undefined' && window.location.pathname === '/oculto-play') {
        window.dispatchEvent(new CustomEvent('oculto-play:open-focus', { detail: { id: active.id } }));
      } else {
        // SPA navigation — preserva o áudio em reprodução (sem full reload).
        navigate(`/oculto-play?item=${encodeURIComponent(active.id)}`);
        // Garante foco no item mesmo se a página já estiver montada.
        setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('oculto-play:open-focus', { detail: { id: active.id } }));
          } catch { /* noop */ }
        }, 80);
      }
    } catch { /* noop */ }
  }, [active?.id, navigate]);

  if (!enabled || !active) return null;

  const title = activeItem?.title ?? active.meta?.title ?? 'Oculto Play';
  const artist = activeItem?.author_display_name ?? activeItem?.author_username ?? active.meta?.artist ?? 'Oculto';
  const artwork = activeItem?.thumb_url ?? activeItem?.media_url ?? active.meta?.artwork ?? null;
  const duration = active.duration || activeItem?.duration_sec || 0;
  const progress = duration > 0 ? Math.min(1, active.currentTime / duration) : 0;
  const volumePct = Math.round((fx.muted ? 0 : fx.volume) * 100);
  const isPlaying = active.playing;

  return (
    <div className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-[60] md:inset-x-auto md:left-auto md:right-5 md:bottom-5 md:w-[26rem]">

      <div className="relative overflow-hidden rounded-2xl border-2 border-cyan-400 bg-[#031026] shadow-[0_0_24px_rgba(34,211,238,0.75),0_0_48px_rgba(59,130,246,0.5),0_8px_32px_rgba(0,0,0,0.7)]">
        {/* Glow overlay nas bordas */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-cyan-300/60 shadow-[inset_0_0_22px_rgba(34,211,238,0.35)]" />
        <div className="h-1.5 bg-cyan-500/30 shadow-[0_0_8px_rgba(34,211,238,0.9)]">
          <div className="h-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 shadow-[0_0_10px_rgba(34,211,238,1)]" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="relative flex items-center gap-2 p-2.5">
          <button
            type="button"
            onClick={openExpanded}
            aria-label="Abrir player expandido"
            className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-cyan-500/25 ring-1 ring-cyan-300/70 shadow-[0_0_14px_rgba(34,211,238,0.6)] active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {artwork ? (
              <img src={artwork} alt="Capa da música" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <Music2 className="h-5 w-5 text-cyan-100 drop-shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-foreground">{title}</div>
            <div className="truncate text-[10px] text-muted-foreground">@{artist}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground tabular-nums">
              <span>{fmt(active.currentTime)}</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              <span>{fmt(duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMuted(!(fx.muted || fx.volume === 0))}
              aria-label={fx.muted || fx.volume === 0 ? 'Ativar som' : 'Silenciar'}
              className="grid h-8 w-8 place-items-center rounded-full bg-cyan-900/70 text-cyan-100 ring-1 ring-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.5)] active:scale-95 hover:bg-cyan-800/70"
            >
              {fx.muted || fx.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fx.muted ? 0 : fx.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              aria-valuenow={volumePct}
              className="h-1 w-12 accent-cyan-400 sm:w-16"
            />
            <button
              type="button"
              onPointerDown={(e) => {
                suppressNextClickRef.current = true;
                e.preventDefault();
                e.stopPropagation();
                togglePlay();
              }}
              onClick={(e) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                togglePlay();
              }}
              aria-label={isPlaying ? 'Pausar música' : 'Reproduzir música'}
              className="grid h-8 w-8 place-items-center rounded-full bg-cyan-400 text-[#031026] shadow-[0_0_14px_rgba(34,211,238,0.9)] ring-1 ring-cyan-200/80 active:scale-95 hover:bg-cyan-300"
            >
              {isPlaying
                ? <Pause className="h-4 w-4" fill="currentColor" />
                : <Play className="h-4 w-4" fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Próxima música"
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full bg-cyan-900/70 text-cyan-100 ring-1 ring-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.5)] active:scale-95 hover:bg-cyan-800/70',
                ((audioFeed.data ?? []) as OcultoPlayItem[]).length < 2 && 'opacity-45',
              )}
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={stop}
              aria-label="Fechar mini player"
              className="grid h-8 w-8 place-items-center rounded-full text-cyan-100 ring-1 ring-cyan-400/50 shadow-[0_0_8px_rgba(34,211,238,0.4)] hover:bg-cyan-900/60 active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}