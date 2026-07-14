/**
 * OcultoPlayAudioItem — player compacto com sessão compartilhada.
 *
 * Usa `ocultoPlayAudioSession` para manter UM único HTMLAudioElement por
 * `item.id`. Isso garante que o player recolhido e o modal expandido
 * compartilhem a mesma reprodução (estado, currentTime, duration) — abrir
 * o modal não interrompe nem zera o áudio que já estava tocando.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Music, Volume2, VolumeX, SlidersHorizontal, Check, RotateCcw } from 'lucide-react';
import {
  EQ_PRESETS,
  getFxState,
  resetFx,
  setMuted,
  setPreset,
  setVolume,
  subscribeFx,
  toggleMuted,
  type EqPresetId,
} from '@/lib/ocultoPlayAudioFx';
import {
  registerAudio,
  notifyAudioPlaying,
  notifyAudioPaused,
} from '@/lib/ocultoPlayAudioBus';
import {
  getOrCreateAudio,
  subscribeAudio,
  playSharedAudio,
  pauseSharedAudio,
  seekSharedAudio,
  getAudioState,
  ocultoPlayMetaFromItem,
} from '@/lib/ocultoPlayAudioSession';
import { videoManager } from '@/lib/videoManager';
import { PlayStarRating } from '@/components/oculto-play/PlayStarRating';
import { CachedThumbImg } from '@/components/oculto-play/CachedThumbImg';

import { useOcultoPlayActions, type OcultoPlayItem as OPItem } from '@/hooks/useOcultoPlayContent';
import { cn } from '@/lib/utils';

interface Props {
  item: OPItem;
  variant?: 'default' | 'expanded';
}

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function OcultoPlayAudioItem({ item, variant = 'default' }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const suppressNextClickRef = useRef(false);
  const initial = getAudioState(item.id);
  const [playing, setPlaying] = useState(initial.playing);
  const [current, setCurrent] = useState(initial.currentTime);
  const [duration, setDuration] = useState(initial.duration || item.duration_sec || 0);
  const viewedRef = useRef(false);
  const { registerView } = useOcultoPlayActions();

  // Não baixa áudio no mount/viewport. Vários cards iniciando load() em
  // paralelo saturavam banda e faziam o play clicado demorar/travar.
  useEffect(() => {
    if (!item.audio_url) return;
    getOrCreateAudio(item.id, item.audio_url);
  }, [item.id, item.audio_url]);

  // Sincroniza com a sessão compartilhada
  useEffect(() => {
    const unsub = subscribeAudio(item.id, (s) => {
      setPlaying(s.playing);
      setCurrent(s.currentTime);
      if (s.duration > 0) setDuration(s.duration);
    });
    return unsub;
  }, [item.id]);

  // Registra no bus singleton para coordenar com OUTROS áudios
  useEffect(() => {
    const unreg = registerAudio(item.id, () => {
      pauseSharedAudio(item.id);
    });
    return unreg;
  }, [item.id]);

  // NÃO pausamos ao trocar de aba — o áudio continua tocando normalmente
  // (requisito explícito). Apenas mantemos a sessão compartilhada.

  // Estado do FX (volume, mute, equalizador) — compartilhado entre players
  const [fx, setFx] = useState(() => getFxState());
  const [eqOpen, setEqOpen] = useState(false);
  useEffect(() => subscribeFx(setFx), []);
  useEffect(() => {
    if (!eqOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-op-eq-popover]') && !t.closest('[data-op-eq-trigger]')) setEqOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [eqOpen]);


  const toggle = async () => {
    if (playing) {
      // Resposta visual imediata
      setPlaying(false);
      pauseSharedAudio(item.id);
      notifyAudioPaused(item.id);
      try {
        const mod = await import('@/lib/ocultoPlayActivity');
        mod.markOcultoPlayMediaStopped(`audio:${item.id}`);
      } catch { /* noop */ }
      return;
    }
    // Resposta visual imediata — UI mostra Pause antes do áudio começar
    setPlaying(true);
    const playPromise = playSharedAudio(item.id, item.audio_url ?? undefined, ocultoPlayMetaFromItem(item));
    try {
      notifyAudioPlaying(item.id);
      try {
        const mod = await import('@/lib/ocultoPlayActivity');
        mod.markOcultoPlayMediaPlaying(`audio:${item.id}`);
      } catch { /* noop */ }
      window.setTimeout(() => { try { videoManager.pauseActive(); } catch { /* noop */ } }, 0);
      await playPromise;
      if (!viewedRef.current) {
        viewedRef.current = true;
        try { await registerView(item.id, 1, false); } catch { /* noop */ }
      }
    } catch {
      // Se play falhou, sincroniza UI de volta com o estado real
      setPlaying(false);
      try {
        const mod = await import('@/lib/ocultoPlayActivity');
        mod.markOcultoPlayMediaStopped(`audio:${item.id}`);
      } catch { /* noop */ }
    }
  };

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || duration <= 0) return;
    const pct = (e.clientX - r.left) / r.width;
    seekSharedAudio(item.id, Math.max(0, Math.min(duration, pct * duration)));
  };

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const coverSize = variant === 'expanded' ? 'h-20 w-20' : 'h-16 w-16';

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 p-3 rounded-xl border border-fuchsia-500/15',
        'bg-gradient-to-br from-fuchsia-900/30 via-violet-900/25 to-slate-900/40',
      )}
    >
      {/* Capa + linha inferior independentes, para a avaliação/equalizador não esmagarem a coluna direita. */}
      <div className="contents">
        {/* Capa */}
        <div className={cn('relative col-start-1 row-start-1 self-start rounded-lg overflow-hidden bg-fuchsia-500/15 grid place-items-center', coverSize)}>
          {item.thumb_url ? (
            <CachedThumbImg
              src={item.thumb_url}
              alt={item.title ?? 'capa'}
              className="absolute inset-0 w-full h-full object-cover"
              showSkeleton={false}
            />
          ) : (
            <Music className="h-6 w-6 text-fuchsia-200" />
          )}
          <button
            type="button"
            onPointerDown={(e) => {
              suppressNextClickRef.current = true;
              e.preventDefault();
              e.stopPropagation();
              void toggle();
            }}
            onClick={(e) => {
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false;
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              void toggle();
            }}
            aria-label={playing ? 'Pausar' : 'Tocar'}
            className={cn(
              'absolute inset-0 grid place-items-center transition-colors',
              playing ? 'bg-black/35' : 'bg-black/45 hover:bg-black/55',
            )}
          >
            {playing
              ? <Pause className="h-6 w-6 text-white" fill="currentColor" />
              : <Play className="h-6 w-6 text-white" fill="currentColor" />}
          </button>
        </div>

        {/* Estrelas + Equalizador (no espaço abaixo da capa) */}
        <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-1.5">
          <PlayStarRating itemId={item.id} className="shrink-0" />

          {(() => {
            const currentPreset = EQ_PRESETS.find((p) => p.id === fx.presetId) ?? EQ_PRESETS[0];
            return (
              <div className="relative">
                <button
                  type="button"
                  data-op-eq-trigger
                  onClick={() => setEqOpen((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && eqOpen) { e.preventDefault(); setEqOpen(false); }
                  }}
                  aria-label={`Equalizador: ${currentPreset.label}`}
                  aria-haspopup="listbox"
                  aria-expanded={eqOpen}
                  className={cn(
                    'flex items-center gap-1 px-2 h-7 rounded-full text-white shrink-0 text-[10px] font-medium focus-visible:ring-2 focus-visible:ring-fuchsia-400',
                    eqOpen ? 'bg-fuchsia-500/40' : 'bg-white/10 hover:bg-white/20',
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="max-w-[72px] truncate">{currentPreset.label}</span>
                </button>

                {eqOpen && (
                  <div
                    data-op-eq-popover
                    role="listbox"
                    aria-label="Presets de equalização"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { e.preventDefault(); setEqOpen(false); }
                    }}
                    className="absolute left-0 bottom-9 z-50 w-56 rounded-xl border border-fuchsia-500/30 bg-slate-950/95 backdrop-blur p-1.5 shadow-2xl"
                  >
                    <ul
                      className="max-h-64 overflow-y-auto [&::-webkit-scrollbar]:hidden"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                    >
                      {EQ_PRESETS.map((p) => {
                        const active = p.id === fx.presetId;
                        return (
                          <li key={p.id} role="option" aria-selected={active}>
                            <button
                              type="button"
                              onClick={() => { setPreset(p.id as EqPresetId); }}
                              className={cn(
                                'w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left focus-visible:ring-2 focus-visible:ring-fuchsia-400',
                                active ? 'bg-fuchsia-500/20 text-white' : 'text-white/80 hover:bg-white/5',
                              )}
                            >
                              <span>{p.label}</span>
                              {active && <Check className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Coluna direita: info + progresso + controles — compactada para caber junto à coluna esquerda */}
      <div className="col-start-2 row-start-1 min-w-0 flex flex-col justify-between gap-0 self-stretch">
        {playing ? (
          <>
            <div className="oculto-play-marquee" title={item.title ?? 'Sem título'}>
              <span className="oculto-play-marquee-track oculto-play-marquee-track--playing text-sm font-semibold text-white leading-tight">
                <span className="pr-8">{item.title ?? 'Sem título'}</span>
                <span aria-hidden="true" className="pr-8">{item.title ?? 'Sem título'}</span>
              </span>
            </div>
            <div className="oculto-play-marquee" title={`@${item.author_username ?? '—'}`}>
              <span className="oculto-play-marquee-track oculto-play-marquee-track--playing text-[11px] text-white/70 leading-tight">
                <span className="pr-8">@{item.author_username ?? '—'}</span>
                <span aria-hidden="true" className="pr-8">@{item.author_username ?? '—'}</span>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-white truncate text-left leading-tight" title={item.title ?? 'Sem título'}>
              {item.title ?? 'Sem título'}
            </div>
            <div className="text-[11px] text-white/70 truncate text-left leading-tight" title={`@${item.author_username ?? '—'}`}>
              @{item.author_username ?? '—'}
            </div>
          </>
        )}

        <div
          className="mt-0.5 h-2 rounded-full cursor-pointer relative touch-none"
          onPointerDown={seekFromPointer}
          role="slider"
          aria-label="Progresso do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.floor(duration))}
          aria-valuenow={Math.max(0, Math.floor(current))}
        >
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fuchsia-400"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/60 tabular-nums leading-none">
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>

        {/* Controles: volume + mute + reset */}
        <div className="mt-0.5 flex items-center gap-2">
          {(() => {
            const volumePct = Math.round((fx.muted ? 0 : fx.volume) * 100);
            return (
              <>
                <button
                  type="button"
                  onClick={toggleMuted}
                  aria-label={fx.muted || fx.volume === 0 ? 'Ativar som' : 'Silenciar'}
                  aria-pressed={fx.muted}
                  className="grid place-items-center h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-fuchsia-400 text-white shrink-0"
                >
                  {fx.muted || fx.volume === 0
                    ? <VolumeX className="h-3 w-3" />
                    : <Volume2 className="h-3 w-3" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={fx.muted ? 0 : fx.volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    if (v > 0 && fx.muted) setMuted(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMuted(); }
                    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); resetFx(); }
                  }}
                  aria-label="Volume"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={volumePct}
                  aria-valuetext={`Volume ${volumePct}%`}
                  className="flex-1 h-1 accent-fuchsia-400 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 rounded"
                />
                <button
                  type="button"
                  onClick={() => resetFx()}
                  aria-label="Redefinir volume, mute e equalização aos padrões"
                  title="Redefinir padrões"
                  className="grid place-items-center h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-fuchsia-400 text-white shrink-0"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
