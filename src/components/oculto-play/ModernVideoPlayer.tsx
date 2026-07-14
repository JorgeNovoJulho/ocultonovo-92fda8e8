/**
 * ModernVideoPlayer — reprodutor moderno para MP4/WebM/MOV/M4V/OGG + HLS (.m3u8)
 * e DASH (.mpd). Detecta faixas de áudio e legendas quando disponíveis (via
 * hls.js, dash.js ou APIs nativas de HTMLMediaElement) e permite ao usuário
 * alternar entre elas. Por padrão, prioriza faixas em Português (`pt`, `pt-BR`).
 *
 * Uso restrito ao lado do cliente — nunca importe em contexto SSR.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings, Subtitles, Languages, Check, Loader2, Volume2, Square } from 'lucide-react';

const BOOST_LEVELS = [1, 1.5, 1.85] as const;
const BOOST_LABELS = ['Off', '+50%', '+85%'] as const;
const BOOST_PREF_KEY = 'oculto:play:video:boost-level';

function readBoostPref(): 0 | 1 | 2 {
  try {
    const raw = localStorage.getItem(BOOST_PREF_KEY);
    const n = Number(raw);
    return n === 1 || n === 2 ? n : 0;
  } catch { return 0; }
}

export type ModernPlayerBackend = 'native' | 'hls' | 'dash';

const AUDIO_PREF_KEY = 'oculto:play:video:audio-track';
const SUBTITLE_PREF_KEY = 'oculto:play:video:subtitle-track';

export interface ModernTrack {
  id: string;
  label: string;
  lang: string | null;
  isActive: boolean;
}

interface StoredTrackPreference {
  id?: string | null;
  label?: string | null;
  lang?: string | null;
  disabled?: boolean;
}

interface Props {
  src: string;
  poster?: string | null;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  controls?: boolean;
  /** Extensão detectada (mp4/webm/m3u8/mpd/...). Se ausente, é inferida. */
  ext?: string | null;
  onReady?: (el: HTMLVideoElement) => void;
  onLoadedMetadata?: (el: HTMLVideoElement) => void;
  onTimeUpdate?: (el: HTMLVideoElement) => void;
  onEnded?: (el: HTMLVideoElement) => void;
  onError?: (message: string) => void;
  /** Ref exposto (para controle externo, incluindo currentTime). */
  videoRefCallback?: (el: HTMLVideoElement | null) => void;
}

function detectExt(src: string): string {
  try { return (new URL(src, window.location.origin).pathname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase(); }
  catch { return ''; }
}

function readTrackPreference(key: string): StoredTrackPreference | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as StoredTrackPreference : null;
  } catch { return null; }
}

function writeTrackPreference(key: string, track: Pick<ModernTrack, 'id' | 'label' | 'lang'> | null) {
  try {
    localStorage.setItem(key, JSON.stringify(track ? {
      id: track.id,
      label: track.label,
      lang: track.lang,
      disabled: false,
    } : { disabled: true }));
  } catch { /* noop */ }
}

function norm(v?: string | null): string {
  return String(v || '').trim().toLowerCase();
}

function isPortugueseTrack(track: { lang?: string | null; label?: string | null }): boolean {
  const lang = norm(track.lang).replace('_', '-');
  const label = norm(track.label);
  return /^pt(-|$)/.test(lang) || /portugu[eê]s|brasil|\bpt\b|pt-br/.test(label);
}

/** Escolhe a melhor faixa: preferência salva > Português > primeira faixa. */
function pickPreferredIndex(
  tracks: Array<{ id?: string | null; label?: string | null; lang?: string | null }>,
  preference?: StoredTrackPreference | null,
): number {
  if (!tracks.length) return -1;
  if (preference && !preference.disabled) {
    const prefLang = norm(preference.lang).replace('_', '-');
    const prefLabel = norm(preference.label);
    const prefId = norm(preference.id);
    const byLang = prefLang ? tracks.findIndex(t => norm(t.lang).replace('_', '-') === prefLang) : -1;
    if (byLang >= 0) return byLang;
    const byLabel = prefLabel ? tracks.findIndex(t => norm(t.label) === prefLabel) : -1;
    if (byLabel >= 0) return byLabel;
    const byId = prefId ? tracks.findIndex(t => norm(t.id) === prefId) : -1;
    if (byId >= 0) return byId;
  }
  const idx = tracks.findIndex(isPortugueseTrack);
  if (idx >= 0) return idx;
  return 0;
}

export function ModernVideoPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  muted = false,
  playsInline = true,
  controls = true,
  ext: extProp,
  onReady,
  onLoadedMetadata,
  onTimeUpdate,
  onEnded,
  onError,
  videoRefCallback,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backendRef = useRef<{ kind: ModernPlayerBackend; instance?: any }>({ kind: 'native' });
  const desiredPlayingRef = useRef(false);
  const lastTimeRef = useRef(0);
  const resumingRef = useRef(false);
  const lastFocusLossRef = useRef(0);
  const onErrorRef = useRef(onError);

  const [audioTracks, setAudioTracks] = useState<ModernTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<ModernTrack[]>([]);
  const [subtitlesOn, setSubtitlesOn] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [boostLevel, setBoostLevel] = useState<0 | 1 | 2>(() => readBoostPref());
  const [stopped, setStopped] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const mediaSrcRef = useRef<AudioNode | null>(null);

  const ensureBoostChain = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return null;
    if (gainRef.current) return gainRef.current;
    try {
      const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      const ctx = audioCtxRef.current ?? new AC();
      audioCtxRef.current = ctx;

      // Só cria o MediaElementAudioSourceNode depois que o contexto estiver
      // rodando. Criar/conectar o grafo enquanto o AudioContext está suspended
      // rouba a saída nativa do <video> e deixa o usuário sem áudio.
      if (ctx.state !== 'running') {
        try { await ctx.resume(); } catch { /* noop */ }
      }
      if (ctx.state !== 'running') return null;

      const captureStream = (el as any).captureStream || (el as any).mozCaptureStream;
      const stream: MediaStream | null = typeof captureStream === 'function' ? captureStream.call(el) : null;
      const hasAudioTrack = !!stream?.getAudioTracks?.().length;
      if (!stream || !hasAudioTrack) return null;

      try { el.muted = false; el.volume = 1; } catch { /* noop */ }
      // Não usamos createMediaElementSource: ele substitui a saída nativa do
      // <video> e, quando CORS/AudioContext falha, o resultado prático é som
      // mudo. captureStream mantém o áudio nativo tocando e soma apenas ganho
      // extra por cima, então falhas de boost nunca silenciam o vídeo.
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      mediaSrcRef.current = source;
      gainRef.current = gain;
      return gain;
    } catch { return null; }
  }, []);

  const applyBoost = useCallback(async (level: 0 | 1 | 2): Promise<boolean> => {
    const el = videoRef.current;
    if (!el) return false;
    try { el.muted = false; el.volume = 1; } catch { /* noop */ }

    if (level === 0 && !gainRef.current) return true;
    const gain = await ensureBoostChain();
    if (!gain) return false;
    const ctx = audioCtxRef.current;
    const target = Math.max(0, BOOST_LEVELS[level] - 1);
    try {
      if (ctx && typeof gain.gain.setTargetAtTime === 'function') {
        gain.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
      } else {
        gain.gain.value = target;
      }
    } catch {
      try { gain.gain.value = target; } catch { /* noop */ }
    }
    return true;
  }, [ensureBoostChain]);

  const cycleBoost = useCallback(() => {
    const next = ((boostLevel + 1) % 3) as 0 | 1 | 2;
    void applyBoost(next).then((ok) => {
      const safeNext = ok ? next : 0;
      try { localStorage.setItem(BOOST_PREF_KEY, String(safeNext)); } catch { /* noop */ }
      setBoostLevel(safeNext);
    });
  }, [applyBoost, boostLevel]);

  const handleStop = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    desiredPlayingRef.current = false;
    lastTimeRef.current = 0;
    try { el.pause(); } catch { /* noop */ }
    try { el.currentTime = 0; } catch { /* noop */ }
    setLoading(false);
    setStopped(false);
  }, []);

  useEffect(() => {
    setStopped(false);
  }, [src]);

  useEffect(() => () => {
    try { audioCtxRef.current?.close(); } catch { /* noop */ }
    audioCtxRef.current = null;
    gainRef.current = null;
    mediaSrcRef.current = null;
  }, []);

  const ext = useMemo(() => (extProp || detectExt(src) || '').toLowerCase(), [src, extProp]);
  const isHls = ext === 'm3u8';
  const isDash = ext === 'mpd';

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const rememberTime = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const t = Number(el.currentTime || 0);
    if (Number.isFinite(t) && t >= 0) lastTimeRef.current = t;
  }, []);

  const restoreTimeAndPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el || !desiredPlayingRef.current || document.hidden) return;
    resumingRef.current = true;
    const resumeAt = lastTimeRef.current;
    try {
      if (Number.isFinite(resumeAt) && resumeAt > 0 && Math.abs((el.currentTime || 0) - resumeAt) > 0.75) {
        el.currentTime = resumeAt;
      }
    } catch { /* noop */ }
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* mantém botão nativo ativo */ });
    window.setTimeout(() => { resumingRef.current = false; }, 350);
  }, []);

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    videoRefCallback?.(el);
  }, [videoRefCallback]);

  useEffect(() => {
    desiredPlayingRef.current = autoPlay;
    lastTimeRef.current = 0;
  }, [src, autoPlay]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onPlay = () => {
      desiredPlayingRef.current = true;
      setStopped(false);
      rememberTime();
      if (boostLevel > 0) void applyBoost(boostLevel);
    };
    const onPause = () => {
      rememberTime();
      const recentlyLostFocus = performance.now() - lastFocusLossRef.current < 1200;
      if (!resumingRef.current && !document.hidden && !recentlyLostFocus) desiredPlayingRef.current = false;
    };
    const onEnded = () => {
      desiredPlayingRef.current = false;
      rememberTime();
    };
    const onTime = () => rememberTime();
    const onVisibility = () => {
      if (document.hidden) {
        rememberTime();
        if (!el.paused && !el.ended) desiredPlayingRef.current = true;
        return;
      }
      if (desiredPlayingRef.current) window.setTimeout(restoreTimeAndPlay, 80);
    };
    const onBlur = () => {
      lastFocusLossRef.current = performance.now();
      rememberTime();
      if (!el.paused && !el.ended) desiredPlayingRef.current = true;
    };
    const onFocus = () => {
      if (!desiredPlayingRef.current) return;
      const elapsed = performance.now() - lastFocusLossRef.current;
      window.setTimeout(restoreTimeAndPlay, elapsed < 30_000 ? 80 : 180);
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('playing', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('seeking', onTime);
    document.addEventListener('visibilitychange', onVisibility, { passive: true });
    window.addEventListener('blur', onBlur, { passive: true });
    window.addEventListener('focus', onFocus, { passive: true });
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('playing', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeking', onTime);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [rememberTime, restoreTimeAndPlay, boostLevel, applyBoost]);

  // Attach source + backend when src changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    setLoading(true);
    setAudioTracks([]);
    setSubtitleTracks([]);

    // Destroy any previous backend instance
    const cleanupPrev = () => {
      const prev = backendRef.current.instance;
      if (prev) {
        try { prev.destroy?.(); prev.reset?.(); } catch { /* noop */ }
      }
      backendRef.current = { kind: 'native' };
    };
    cleanupPrev();

    const attachNative = () => {
      backendRef.current = { kind: 'native' };
      if (el.src !== src) el.src = src;
    };

    const applyNativeSubtitlePreference = (tracks: ModernTrack[]) => {
      const pref = readTrackPreference(SUBTITLE_PREF_KEY);
      if (!tracks.length || pref?.disabled || !pref) {
        if (el.textTracks) for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = 'disabled';
        setSubtitlesOn(false);
        return tracks.map(t => ({ ...t, isActive: false }));
      }
      const idx = pickPreferredIndex(tracks, pref);
      if (idx >= 0 && el.textTracks) {
        const nativeTrackIndex = Number(tracks[idx]?.id ?? idx);
        for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = i === nativeTrackIndex ? 'showing' : 'disabled';
      }
      setSubtitlesOn(idx >= 0);
      return tracks.map((t, i) => ({ ...t, isActive: i === idx }));
    };

    const refreshNativeTracks = () => {
      const anyEl = el as any;
      const nativeAudios: ModernTrack[] = [];
      if (anyEl.audioTracks?.length) {
        for (let i = 0; i < anyEl.audioTracks.length; i++) {
          const t = anyEl.audioTracks[i];
          nativeAudios.push({
            id: String(i),
            label: t.label || t.language || `Faixa ${i + 1}`,
            lang: t.language || null,
            isActive: !!t.enabled,
          });
        }
      }
      if (nativeAudios.length && !nativeAudios.some(t => t.isActive)) {
        const idx = pickPreferredIndex(nativeAudios, readTrackPreference(AUDIO_PREF_KEY));
        if (idx >= 0 && anyEl.audioTracks?.[idx]) {
          for (let i = 0; i < anyEl.audioTracks.length; i++) anyEl.audioTracks[i].enabled = i === idx;
          nativeAudios.forEach((t, i) => (t.isActive = i === idx));
        }
      }
      setAudioTracks(nativeAudios);

      const nativeSubs: ModernTrack[] = [];
      if (el.textTracks?.length) {
        for (let i = 0; i < el.textTracks.length; i++) {
          const t = el.textTracks[i];
          if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
          nativeSubs.push({
            id: String(i),
            label: t.label || t.language || `Legenda ${i + 1}`,
            lang: t.language || null,
            isActive: t.mode === 'showing',
          });
        }
      }
      setSubtitleTracks(applyNativeSubtitlePreference(nativeSubs));
    };

    if (isHls) {
      // HLS: prefere nativo em Safari; senão hls.js
      if (el.canPlayType('application/vnd.apple.mpegurl')) {
        attachNative();
        el.addEventListener('loadedmetadata', refreshNativeTracks, { once: false });
      } else {
        import('hls.js').then(({ default: Hls }) => {
          if (cancelled) return;
          if (!Hls.isSupported()) { attachNative(); return; }
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          backendRef.current = { kind: 'hls', instance: hls };
          hls.loadSource(src);
          hls.attachMedia(el);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const audios = (hls.audioTracks || []).map((t: any, i: number) => ({
              id: String(i),
              label: t.name || t.lang || `Faixa ${i + 1}`,
              lang: t.lang || null,
              isActive: hls.audioTrack === i,
            }));
            if (audios.length) {
              const preferred = pickPreferredIndex(audios, readTrackPreference(AUDIO_PREF_KEY));
              if (preferred >= 0 && hls.audioTrack !== preferred) hls.audioTrack = preferred;
              audios.forEach((t, i) => (t.isActive = i === preferred));
            }
            setAudioTracks(audios);

            const subs = (hls.subtitleTracks || []).map((t: any, i: number) => ({
              id: String(i),
              label: t.name || t.lang || `Legenda ${i + 1}`,
              lang: t.lang || null,
              isActive: hls.subtitleTrack === i,
            }));
            const subPref = readTrackPreference(SUBTITLE_PREF_KEY);
            const preferredSub = subPref && !subPref.disabled ? pickPreferredIndex(subs, subPref) : -1;
            hls.subtitleTrack = preferredSub;
            setSubtitlesOn(preferredSub >= 0);
            setSubtitleTracks(subs.map((t, i) => ({ ...t, isActive: i === preferredSub })));
          });
          hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
            if (data?.fatal) {
              try {
                if (data.type === 'networkError') hls.startLoad();
                else if (data.type === 'mediaError') hls.recoverMediaError();
                else onErrorRef.current?.(data?.details || 'Erro de reprodução HLS');
              } catch { onErrorRef.current?.('Erro fatal no HLS'); }
            }
          });
        }).catch(() => { if (!cancelled) attachNative(); });
      }
    } else if (isDash) {
      import('dashjs').then((mod) => {
        if (cancelled) return;
        const dashjs: any = (mod as any).default ?? mod;
        try {
          const player = dashjs.MediaPlayer().create();
          backendRef.current = { kind: 'dash', instance: player };
          player.initialize(el, src, autoPlay);
          player.on('streamInitialized', () => {
            const audios = (player.getTracksFor?.('audio') || []).map((t: any, i: number) => ({
              id: String(t.index ?? i),
              label: t.labels?.[0]?.text || t.lang || `Faixa ${i + 1}`,
              lang: t.lang || null,
              isActive: false,
            }));
            if (audios.length) {
              const preferred = pickPreferredIndex(audios, readTrackPreference(AUDIO_PREF_KEY));
              const tracks = player.getTracksFor('audio');
              if (preferred >= 0 && tracks[preferred]) player.setCurrentTrack(tracks[preferred]);
              audios.forEach((t, i) => (t.isActive = i === preferred));
            }
            setAudioTracks(audios);
            const subs = (player.getTracksFor?.('text') || []).map((t: any, i: number) => ({
              id: String(t.index ?? i),
              label: t.labels?.[0]?.text || t.lang || `Legenda ${i + 1}`,
              lang: t.lang || null,
              isActive: false,
            }));
            const subPref = readTrackPreference(SUBTITLE_PREF_KEY);
            const preferredSub = subPref && !subPref.disabled ? pickPreferredIndex(subs, subPref) : -1;
            if (preferredSub >= 0) player.setTextTrack?.(preferredSub);
            else player.setTextTrack?.(-1);
            setSubtitlesOn(preferredSub >= 0);
            setSubtitleTracks(subs.map((t, i) => ({ ...t, isActive: i === preferredSub })));
          });
          player.on('error', (e: any) => onErrorRef.current?.(e?.error?.message || 'Erro no DASH'));
        } catch {
          if (!cancelled) attachNative();
        }
      }).catch(() => { if (!cancelled) attachNative(); });
    } else {
      attachNative();
      el.addEventListener('loadedmetadata', refreshNativeTracks, { once: false });
    }

    return () => {
      cancelled = true;
      cleanupPrev();
      el.removeEventListener('loadedmetadata', refreshNativeTracks);
    };
  }, [src, isHls, isDash, autoPlay]);

  const handleSelectAudio = (id: string) => {
    const el = videoRef.current;
    if (!el) return;
    const listIndex = Math.max(0, audioTracks.findIndex(t => t.id === id));
    const idx = Number(id);
    const backend = backendRef.current;
    if (backend.kind === 'hls' && backend.instance) {
      backend.instance.audioTrack = idx;
    } else if (backend.kind === 'dash' && backend.instance) {
      const tracks = backend.instance.getTracksFor('audio') || [];
      const track = tracks.find((t: any) => String(t.index) === id) ?? tracks[listIndex] ?? tracks[idx];
      if (track) backend.instance.setCurrentTrack(track);
    } else {
      const anyEl = el as any;
      if (anyEl.audioTracks?.length) {
        for (let i = 0; i < anyEl.audioTracks.length; i++) anyEl.audioTracks[i].enabled = i === idx;
      }
    }
    setAudioTracks(list => {
      const selected = list.find(t => t.id === id) ?? list[listIndex] ?? list[idx];
      if (selected) writeTrackPreference(AUDIO_PREF_KEY, selected);
      return list.map((t, i) => ({ ...t, isActive: t.id === id || i === listIndex }));
    });
  };

  const handleSelectSubtitle = (id: string | null) => {
    const el = videoRef.current;
    if (!el) return;
    const backend = backendRef.current;
    if (id === null) {
      if (backend.kind === 'hls' && backend.instance) backend.instance.subtitleTrack = -1;
      else if (backend.kind === 'dash' && backend.instance) backend.instance.setTextTrack(-1);
      else if (el.textTracks) for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = 'disabled';
      writeTrackPreference(SUBTITLE_PREF_KEY, null);
      setSubtitleTracks(list => list.map(t => ({ ...t, isActive: false })));
      setSubtitlesOn(false);
      return;
    }
    const idx = Number(id);
    const listIndex = Math.max(0, subtitleTracks.findIndex(t => t.id === id));
    if (backend.kind === 'hls' && backend.instance) backend.instance.subtitleTrack = idx;
    else if (backend.kind === 'dash' && backend.instance) backend.instance.setTextTrack(listIndex);
    else if (el.textTracks) {
      for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = i === idx ? 'showing' : 'disabled';
    }
    setSubtitleTracks(list => {
      const selected = list.find(t => t.id === id) ?? list[listIndex] ?? list[idx];
      if (selected) writeTrackPreference(SUBTITLE_PREF_KEY, selected);
      return list.map((t, i) => ({ ...t, isActive: t.id === id || i === listIndex }));
    });
    setSubtitlesOn(true);
  };

  const hasAudioMenu = audioTracks.length > 1;
  const hasSubtitleMenu = subtitleTracks.length > 0;
  const showSettings = hasAudioMenu || hasSubtitleMenu;

  return (
    <div className={cn('relative w-full h-full bg-black', className)}>
      <video
        ref={setVideoEl}
        poster={poster ?? undefined}
        controls={controls}
        controlsList="nodownload noplaybackrate noremoteplayback"
        crossOrigin="anonymous"
        disablePictureInPicture
        playsInline={playsInline}
        autoPlay={autoPlay}
        muted={muted}
        className="absolute inset-0 w-full h-full bg-black"
        onContextMenu={(e) => e.preventDefault()}
        onLoadedMetadata={(e) => { setLoading(false); onLoadedMetadata?.(e.currentTarget); onReady?.(e.currentTarget); }}
        onCanPlay={() => setLoading(false)}
        onCanPlayThrough={() => { if (desiredPlayingRef.current) restoreTimeAndPlay(); }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget)}
        onEnded={(e) => onEnded?.(e.currentTarget)}
        onError={() => { setLoading(false); onError?.('Erro ao reproduzir vídeo'); }}
      />

      {loading ? (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-white/80" />
        </div>
      ) : null}

      {boostLevel > 0 ? (
        <div className="absolute top-2 left-2 z-10 pointer-events-none flex items-center gap-1 rounded-full bg-amber-400/95 text-black text-[11px] font-bold px-2 py-1 shadow-lg ring-1 ring-amber-300">
          <Volume2 className="h-3 w-3" />
          <span>Boost {BOOST_LABELS[boostLevel]}</span>
        </div>
      ) : null}


      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); cycleBoost(); }}
          aria-label={`Boost de volume ${BOOST_LABELS[boostLevel]}`}
          title={`Boost: ${BOOST_LABELS[boostLevel]} (toque para alternar)`}
          className={cn(
            'h-9 w-9 rounded-full bg-black/70 hover:bg-black/85 text-white ring-1 ring-white/20 backdrop-blur relative',
            boostLevel > 0 && 'ring-amber-400 text-amber-300',
          )}
        >
          <Volume2 className="h-4 w-4" />
          {boostLevel > 0 ? (
            <span className="absolute -bottom-1 -right-1 text-[9px] font-bold px-1 rounded bg-amber-400 text-black leading-none py-[1px]">
              {boostLevel === 1 ? '1.5' : '1.85'}
            </span>
          ) : null}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); handleStop(); }}
          aria-label="Parar reprodução"
          title="Parar (voltar ao início)"
          className="h-9 w-9 rounded-full bg-black/70 hover:bg-black/85 text-white ring-1 ring-white/20 backdrop-blur"
        >
          <Square className="h-4 w-4" fill="currentColor" />
        </Button>
        {showSettings ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full bg-black/70 hover:bg-black/85 text-white ring-1 ring-white/20 backdrop-blur"
                aria-label="Configurações de faixa e legenda"
                title="Faixas e legendas"
                onClick={(e) => e.stopPropagation()}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              onClick={(e) => e.stopPropagation()}
              className="w-64 p-2 space-y-3 bg-neutral-950/95 border-white/10 text-white"
            >
              {hasAudioMenu ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/60 px-1">
                    <Languages className="h-3 w-3" /> Faixas de áudio
                  </p>
                  <div className="max-h-40 overflow-auto rounded-md border border-white/10">
                    {audioTracks.map((t, i) => (
                      <button
                        key={t.id + i}
                        type="button"
                        onClick={() => handleSelectAudio(t.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-white/10',
                          t.isActive && 'bg-white/10',
                        )}
                      >
                        <span className="truncate">
                          {t.label}
                          {t.lang ? <span className="ml-1 text-white/50">· {t.lang}</span> : null}
                        </span>
                        {t.isActive ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasSubtitleMenu ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/60 px-1">
                    <Subtitles className="h-3 w-3" /> Legendas
                  </p>
                  <div className="max-h-40 overflow-auto rounded-md border border-white/10">
                    <button
                      type="button"
                      onClick={() => handleSelectSubtitle(null)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-white/10',
                        !subtitlesOn && 'bg-white/10',
                      )}
                    >
                      <span>Desativadas</span>
                      {!subtitlesOn ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                    </button>
                    {subtitleTracks.map((t, i) => (
                      <button
                        key={t.id + i}
                        type="button"
                        onClick={() => handleSelectSubtitle(t.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-white/10',
                          t.isActive && 'bg-white/10',
                        )}
                      >
                        <span className="truncate">
                          {t.label}
                          {t.lang ? <span className="ml-1 text-white/50">· {t.lang}</span> : null}
                        </span>
                        {t.isActive ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

    </div>
  );
}
