/**
 * OcultoMoviePlayer — player de filmes do Oculto Play (estilo Netflix).
 *
 * Formatos: MP4/M4V/MOV/WebM/OGV/MKV (nativo do navegador), HLS (.m3u8, via
 * hls.js ou nativo no Safari) e DASH (.mpd, via dash.js).
 *
 * Controles próprios (funcionam igual em tela cheia, celular e computador):
 *  - play/pausa, voltar/avançar 10s, barra com o quanto já carregou, tempo e
 *    duração, volume (computador) e mudo, tela cheia, PiP;
 *  - Configurações: legendas (do arquivo, do stream, salvas no banco ou
 *    carregadas do aparelho .srt/.vtt), tamanho da legenda, faixas de áudio,
 *    modos de som (Normal, Voz clara, Noturno, Volume +), velocidade e
 *    qualidade (HLS).
 *  - Celular: toque mostra/esconde os controles, toque duplo nas laterais
 *    volta/avança 10s, tela cheia gira para paisagem.
 *  - Teclado: espaço/K, ←/→, ↑/↓, F, M, C.
 *
 * Leve para celulares fracos: estado de tempo atualizado só pelos eventos do
 * <video> (~4x/s), sem desfoque, sem animações contínuas, menus dentro do
 * próprio player (aparecem também em tela cheia).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, Settings,
  Subtitles, Loader2, Check, ChevronLeft, PictureInPicture2, Upload, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlayTracks, convertSrtToVtt } from '@/hooks/useOcultoPlayTracks';

/* ───────────────────────── tipos e utilitários ───────────────────────── */

type Backend = 'native' | 'hls' | 'dash';
type SoundMode = 'normal' | 'voice' | 'night' | 'boost';
type SubSize = 'sm' | 'md' | 'lg' | 'xl';
type Cue = { start: number; end: number; text: string };

type SubSource =
  | { id: string; label: string; lang: string | null; type: 'native'; index: number }
  | { id: string; label: string; lang: string | null; type: 'hls'; index: number }
  | { id: string; label: string; lang: string | null; type: 'dash'; index: number }
  | { id: string; label: string; lang: string | null; type: 'url'; url: string; isDefault?: boolean }
  | { id: string; label: string; lang: string | null; type: 'cues'; cues: Cue[] };

type AudioTrackOpt = { id: string; label: string; lang: string | null; index: number };
type QualityOpt = { index: number; label: string };

const PREF_KEY = 'oculto:movie-player:prefs:v1';
type Prefs = { volume: number; muted: boolean; subsOn: boolean; subLang: string | null; subSize: SubSize; sound: SoundMode; rate: number };
const DEFAULT_PREFS: Prefs = { volume: 1, muted: false, subsOn: false, subLang: null, subSize: 'md', sound: 'normal', rate: 1 };

function readPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') as Partial<Prefs>) }; }
  catch { return DEFAULT_PREFS; }
}
function writePrefs(p: Partial<Prefs>) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...readPrefs(), ...p })); } catch { /* noop */ }
}

export function detectVideoExt(src: string): string {
  try { return (new URL(src, window.location.origin).pathname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase(); }
  catch { return ''; }
}

/** Formatos que nenhum navegador toca (não adianta tentar). */
export const BROWSER_UNSUPPORTED_EXT = new Set(['avi', 'wmv', 'flv', 'asf', 'vob', 'mxf', 'mpg', 'mpeg', 'ts', 'm2ts', 'rm', 'rmvb', 'divx', '3g2']);

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function isPt(lang?: string | null, label?: string | null) {
  const l = String(lang || '').toLowerCase();
  const b = String(label || '').toLowerCase();
  return /^pt|^por|^pob/.test(l) || /portugu|brasil/.test(b);
}

function langLabel(lang?: string | null): string {
  const l = String(lang || '').toLowerCase();
  if (/^pt|^por|^pob/.test(l)) return 'Português';
  if (/^en|^eng/.test(l)) return 'Inglês';
  if (/^es|^spa/.test(l)) return 'Espanhol';
  if (/^fr|^fre|^fra/.test(l)) return 'Francês';
  if (/^it|^ita/.test(l)) return 'Italiano';
  if (/^de|^ger|^deu/.test(l)) return 'Alemão';
  if (/^ja|^jpn/.test(l)) return 'Japonês';
  return lang ? lang.toUpperCase() : '';
}

/** Lê SRT ou VTT e devolve os trechos com tempo. */
export function parseSubtitleText(raw: string): Cue[] {
  const text = convertSrtToVtt(raw);
  const lines = text.split(/\r?\n/);
  const re = /(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/;
  const toSec = (h: string | undefined, m: string, s: string, ms?: string) =>
    (h ? +h : 0) * 3600 + (+m) * 60 + (+s) + (ms ? +`0.${ms.padEnd(3, '0')}` : 0);
  const out: Cue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    const buf: string[] = [];
    i++;
    while (i < lines.length && lines[i].trim() !== '') {
      buf.push(lines[i].replace(/<[^>]+>/g, '').replace(/\{\\[^}]+\}/g, '').trim());
      i++;
    }
    const t = buf.join('\n').trim();
    if (t && end > start) out.push({ start, end, text: t });
  }
  return out.sort((a, b) => a.start - b.start);
}

function cueAt(cues: Cue[], t: number): string {
  // busca binária pelo último trecho que começou antes de t
  let lo = 0, hi = cues.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const parts: string[] = [];
  for (let i = idx; i >= 0 && i > idx - 4; i--) if (cues[i].end > t) parts.unshift(cues[i].text);
  return parts.join('\n');
}

/** Só processa áudio (modos de som) quando o navegador permite ler o som do vídeo. */
function canUseCrossOrigin(src: string): boolean {
  try {
    const u = new URL(src, window.location.origin);
    return u.origin === window.location.origin || /\.supabase\.co$/i.test(u.hostname);
  } catch { return false; }
}

const isLowEnd = () => {
  try {
    const mem = (navigator as any).deviceMemory as number | undefined;
    return (mem != null && mem <= 4) || (navigator.hardwareConcurrency || 8) <= 4;
  } catch { return false; }
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SOUND_LABEL: Record<SoundMode, string> = { normal: 'Normal', voice: 'Voz clara', night: 'Noturno', boost: 'Volume +' };
const SOUND_HINT: Record<SoundMode, string> = {
  normal: 'Som original',
  voice: 'Realça os diálogos',
  night: 'Equilibra explosões e falas baixas',
  boost: 'Mais alto, sem distorcer',
};
const SUB_SIZE_CLASS: Record<SubSize, string> = {
  sm: 'text-[13px] sm:text-base',
  md: 'text-[15px] sm:text-xl',
  lg: 'text-lg sm:text-2xl',
  xl: 'text-xl sm:text-[32px]',
};
const SUB_SIZE_LABEL: Record<SubSize, string> = { sm: 'Pequena', md: 'Média', lg: 'Grande', xl: 'Enorme' };

/* ── peças da interface (fora do componente: não remontam a cada quadro) ── */

const PokeCtx = createContext<() => void>(() => {});

function IconBtn({ onClick, label, children, className: c }: { onClick: () => void; label: string; children: ReactNode; className?: string }) {
  const poke = useContext(PokeCtx);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); poke(); }}
      aria-label={label}
      title={label}
      className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 active:scale-95 sm:h-11 sm:w-11', c)}
    >
      {children}
    </button>
  );
}

function Row({ onClick, active, children, hint }: { onClick: () => void; active?: boolean; children: ReactNode; hint?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{children}</span>
        {hint && <span className="block truncate text-[11px] text-white/55">{hint}</span>}
      </span>
      {active && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
    </button>
  );
}

function Back({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-bold text-white hover:bg-white/10">
      <ChevronLeft className="h-4 w-4" /> {title}
    </button>
  );
}

/* ───────────────────────────── componente ───────────────────────────── */

export interface OcultoMoviePlayerProps {
  src: string;
  poster?: string | null;
  title?: string | null;
  /** Item do Play — carrega as legendas salvas no banco. */
  itemId?: string | null;
  ext?: string | null;
  autoPlay?: boolean;
  className?: string;
  /** Link original para "Abrir link" na tela de erro. */
  originalUrl?: string | null;
  onReady?: (el: HTMLVideoElement) => void;
  onLoadedMetadata?: (el: HTMLVideoElement) => void;
  onTimeUpdate?: (el: HTMLVideoElement) => void;
  onEnded?: (el: HTMLVideoElement) => void;
  onError?: (message: string) => void;
  videoRefCallback?: (el: HTMLVideoElement | null) => void;
}

export function OcultoMoviePlayer({
  src, poster, title, itemId, ext: extProp, autoPlay = false, className, originalUrl,
  onReady, onLoadedMetadata, onTimeUpdate, onEnded, onError, videoRefCallback,
}: OcultoMoviePlayerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backendRef = useRef<{ kind: Backend; inst?: any }>({ kind: 'native' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prefs = useMemo(readPrefs, []);
  const ext = useMemo(() => (extProp || detectVideoExt(src) || '').toLowerCase(), [src, extProp]);
  const useCors = useMemo(() => canUseCrossOrigin(src), [src]);
  const lowEnd = useMemo(isLowEnd, []);
  const isTouch = useMemo(() => {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
  }, []);
  const isIOS = useMemo(() => /iPad|iPhone|iPod/i.test(navigator.userAgent || ''), []);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(prefs.volume);
  const [muted, setMuted] = useState(prefs.muted);
  const [rate, setRate] = useState(prefs.rate);
  const [isFs, setIsFs] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [panel, setPanel] = useState<null | 'main' | 'subs' | 'audio' | 'sound' | 'speed' | 'quality' | 'size'>(null);
  const [error, setError] = useState<string | null>(null);
  const [slowNet, setSlowNet] = useState(false);
  const [seekHover, setSeekHover] = useState<{ x: number; t: number } | null>(null);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [tapFx, setTapFx] = useState<null | { side: 'l' | 'r'; key: number }>(null);

  const [subSources, setSubSources] = useState<SubSource[]>([]);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [subText, setSubText] = useState('');
  const [subSize, setSubSize] = useState<SubSize>(prefs.subSize);
  const cueCache = useRef(new Map<string, Cue[]>());
  const [audioOpts, setAudioOpts] = useState<AudioTrackOpt[]>([]);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const [qualities, setQualities] = useState<QualityOpt[]>([]);
  const [quality, setQuality] = useState(-1);
  const [sound, setSound] = useState<SoundMode>('normal');
  const [soundAvailable, setSoundAvailable] = useState(false);
  const audioGraph = useRef<{ ctx: AudioContext; source: MediaElementAudioSourceNode; nodes: AudioNode[] } | null>(null);
  const localCount = useRef(0);

  const { data: storedTracks } = usePlayTracks(itemId ?? null);

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    videoRefCallback?.(el);
  }, [videoRefCallback]);

  /* ── carregar a fonte (nativo / HLS / DASH) ─────────────────────────── */
  const [reloadKey, setReloadKey] = useState(0);
  const resumeAtRef = useRef(0);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSlowNet(false);
    setQualities([]);
    setQuality(-1);
    setAudioOpts([]);
    setSubSources((prev) => prev.filter((s) => s.type === 'url'));
    setActiveSub(null);
    setSubText('');
    setPlaying(false);
    setStarted(false);

    const destroy = () => {
      const inst = backendRef.current.inst;
      if (inst) { try { inst.destroy?.(); } catch { /* noop */ } try { inst.reset?.(); } catch { /* noop */ } }
      backendRef.current = { kind: 'native' };
    };
    destroy();

    const native = () => {
      backendRef.current = { kind: 'native' };
      if (useCors) el.crossOrigin = 'anonymous'; else el.removeAttribute('crossorigin');
      el.src = src;
      el.load();
    };

    if (ext === 'm3u8' && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { native(); return; }
        const hls = new Hls({
          enableWorker: true,
          startFragPrefetch: true,
          capLevelToPlayerSize: true,
          maxBufferLength: lowEnd ? 20 : 40,
          maxMaxBufferLength: lowEnd ? 40 : 90,
          backBufferLength: lowEnd ? 15 : 30,
          abrEwmaDefaultEstimate: 1_500_000,
          startLevel: -1,
        });
        backendRef.current = { kind: 'hls', inst: hls };
        hls.loadSource(src);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const lv = (hls.levels || []).map((l: any, i: number) => ({ index: i, label: l.height ? `${l.height}p` : `${Math.round((l.bitrate || 0) / 1000)} kbps` }));
          setQualities(lv.length > 1 ? lv.sort((a: QualityOpt, b: QualityOpt) => parseInt(b.label) - parseInt(a.label)) : []);
          const at = (hls.audioTracks || []).map((t: any, i: number) => ({ id: `hls-a${i}`, index: i, label: t.name || langLabel(t.lang) || `Faixa ${i + 1}`, lang: t.lang || null }));
          setAudioOpts(at);
          if (at.length) {
            const pt = at.findIndex((t: AudioTrackOpt) => isPt(t.lang, t.label));
            if (pt >= 0) hls.audioTrack = pt;
            setActiveAudio(at[pt >= 0 ? pt : hls.audioTrack]?.id ?? null);
          }
          const st = (hls.subtitleTracks || []).map((t: any, i: number) => ({ id: `hls-s${i}`, type: 'hls' as const, index: i, label: t.name || langLabel(t.lang) || `Legenda ${i + 1}`, lang: t.lang || null }));
          hls.subtitleTrack = -1;
          setSubSources((prev) => [...st, ...prev.filter((s) => s.type === 'url' || s.type === 'cues')]);
          setSoundAvailable(true);
        });
        let netRetries = 0;
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (!data?.fatal) return;
          if (data.type === 'networkError' && netRetries < 3) { netRetries++; setSlowNet(true); hls.startLoad(); return; }
          if (data.type === 'mediaError') { hls.recoverMediaError(); return; }
          setError('Não foi possível carregar este filme (stream HLS).');
          onError?.(data?.details || 'hls');
        });
      }).catch(native);
    } else if (ext === 'mpd') {
      import('dashjs').then((mod) => {
        if (cancelled) return;
        const dashjs: any = (mod as any).default ?? mod;
        try {
          const p = dashjs.MediaPlayer().create();
          backendRef.current = { kind: 'dash', inst: p };
          p.initialize(el, src, false);
          p.on('streamInitialized', () => {
            const at = (p.getTracksFor?.('audio') || []).map((t: any, i: number) => ({ id: `dash-a${i}`, index: i, label: t.labels?.[0]?.text || langLabel(t.lang) || `Faixa ${i + 1}`, lang: t.lang || null }));
            setAudioOpts(at);
            const pt = at.findIndex((t: AudioTrackOpt) => isPt(t.lang, t.label));
            if (pt >= 0) { try { p.setCurrentTrack(p.getTracksFor('audio')[pt]); } catch { /* noop */ } }
            setActiveAudio(at[Math.max(0, pt)]?.id ?? null);
            const st = (p.getTracksFor?.('text') || []).map((t: any, i: number) => ({ id: `dash-s${i}`, type: 'dash' as const, index: i, label: t.labels?.[0]?.text || langLabel(t.lang) || `Legenda ${i + 1}`, lang: t.lang || null }));
            try { p.setTextTrack?.(-1); } catch { /* noop */ }
            setSubSources((prev) => [...st, ...prev.filter((s) => s.type === 'url' || s.type === 'cues')]);
            setSoundAvailable(true);
          });
          p.on('error', () => { setError('Não foi possível carregar este filme (stream DASH).'); onError?.('dash'); });
        } catch { native(); }
      }).catch(native);
    } else {
      native();
      setSoundAvailable(useCors);
    }

    return () => { cancelled = true; destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, ext, reloadKey]);

  /* ── legendas embutidas no arquivo (textTracks nativos) ─────────────── */
  const refreshNativeSubs = useCallback(() => {
    const el = videoRef.current;
    if (!el || backendRef.current.kind !== 'native') return;
    const list: SubSource[] = [];
    for (let i = 0; i < (el.textTracks?.length || 0); i++) {
      const t = el.textTracks[i];
      if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
      if (t.label === '__oculto__') continue;
      t.mode = 'disabled';
      list.push({ id: `nat-${i}`, type: 'native', index: i, label: t.label || langLabel(t.language) || `Legenda ${i + 1}`, lang: t.language || null });
    }
    setSubSources((prev) => [...list, ...prev.filter((s) => s.type !== 'native')]);
    // faixas de áudio nativas (Safari / alguns Chrome)
    const at = (el as any).audioTracks;
    if (at?.length > 1) {
      const opts: AudioTrackOpt[] = [];
      for (let i = 0; i < at.length; i++) opts.push({ id: `nat-a${i}`, index: i, label: at[i].label || langLabel(at[i].language) || `Faixa ${i + 1}`, lang: at[i].language || null });
      setAudioOpts(opts);
      let on = -1;
      for (let i = 0; i < at.length; i++) if (at[i].enabled) on = i;
      const pt = opts.findIndex((o) => isPt(o.lang, o.label));
      if (pt >= 0 && pt !== on) { for (let i = 0; i < at.length; i++) at[i].enabled = i === pt; on = pt; }
      setActiveAudio(opts[Math.max(0, on)]?.id ?? null);
    }
  }, []);

  /* ── legendas salvas no banco para este item ────────────────────────── */
  const storedSig = (storedTracks ?? []).map((t) => `${t.id}|${t.vtt_url}|${t.label}|${t.is_default}`).join(',');
  useEffect(() => {
    const list = (storedTracks ?? []).filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
    setSubSources((prev) => [
      ...prev.filter((s) => s.type !== 'url'),
      ...list.map((t) => ({ id: `db-${t.id}`, type: 'url' as const, url: t.vtt_url, label: t.label || langLabel(t.lang) || 'Legenda', lang: t.lang || null, isDefault: t.is_default })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSig]);

  /* ── escolher legenda ───────────────────────────────────────────────── */
  const selectSub = useCallback(async (id: string | null, remember = true) => {
    const el = videoRef.current;
    const b = backendRef.current;
    // desliga tudo
    if (el?.textTracks) for (let i = 0; i < el.textTracks.length; i++) el.textTracks[i].mode = 'disabled';
    if (b.kind === 'hls' && b.inst) { try { b.inst.subtitleTrack = -1; b.inst.subtitleDisplay = false; } catch { /* noop */ } }
    if (b.kind === 'dash' && b.inst) { try { b.inst.setTextTrack(-1); } catch { /* noop */ } }
    setSubText('');
    setActiveSub(id);
    const s = subSources.find((x) => x.id === id);
    if (remember) writePrefs({ subsOn: !!s, subLang: s?.lang ?? null });
    if (!s || !el) return;
    if (s.type === 'native') { const t = el.textTracks[s.index]; if (t) t.mode = 'hidden'; }
    if (s.type === 'hls' && b.inst) { try { b.inst.subtitleTrack = s.index; b.inst.subtitleDisplay = true; } catch { /* noop */ } }
    if (s.type === 'dash' && b.inst) { try { b.inst.setTextTrack(s.index); } catch { /* noop */ } }
    if (s.type === 'url' && !cueCache.current.has(s.id)) {
      try {
        const res = await fetch(s.url, { cache: 'force-cache' });
        cueCache.current.set(s.id, res.ok ? parseSubtitleText(await res.text()) : []);
      } catch { cueCache.current.set(s.id, []); }
    }
  }, [subSources]);

  // ativa automaticamente a legenda preferida (uma vez por filme)
  const autoSubDone = useRef(false);
  useEffect(() => { autoSubDone.current = false; setActiveSub(null); }, [src]);
  useEffect(() => {
    if (autoSubDone.current || !subSources.length) return;
    const p = readPrefs();
    const def = subSources.find((s) => s.type === 'url' && s.isDefault);
    let pick: SubSource | undefined;
    if (p.subsOn) pick = subSources.find((s) => p.subLang && s.lang === p.subLang) || subSources.find((s) => isPt(s.lang, s.label)) || subSources[0];
    else if (def && p.subLang === null && !localStorage.getItem(PREF_KEY)) pick = def;
    autoSubDone.current = true;
    if (pick) void selectSub(pick.id, false);
  }, [subSources, selectSub]);

  /* ── texto da legenda no tempo atual ────────────────────────────────── */
  const updateSubText = useCallback((t: number) => {
    const el = videoRef.current;
    if (!activeSub || !el) { setSubText((p) => (p ? '' : p)); return; }
    const s = subSources.find((x) => x.id === activeSub);
    if (!s) return;
    let txt = '';
    if (s.type === 'url' || s.type === 'cues') {
      const cues = s.type === 'cues' ? s.cues : cueCache.current.get(s.id) || [];
      txt = cueAt(cues, t);
    } else {
      // HLS/DASH/nativo: lê as cues ativas da faixa que o player criou
      for (let i = 0; i < (el.textTracks?.length || 0); i++) {
        const tr = el.textTracks[i];
        if (tr.mode === 'showing') tr.mode = 'hidden';
        if (tr.mode !== 'hidden' || !tr.activeCues) continue;
        for (let j = 0; j < tr.activeCues.length; j++) {
          const c: any = tr.activeCues[j];
          const v = String(c.text || '').replace(/<[^>]+>/g, '');
          if (v) txt += (txt ? '\n' : '') + v;
        }
      }
    }
    setSubText((p) => (p === txt ? p : txt));
  }, [activeSub, subSources]);

  /* ── carregar legenda do aparelho ───────────────────────────────────── */
  const onLocalSubtitle = async (file: File | undefined | null) => {
    if (!file) return;
    try {
      const cues = parseSubtitleText(await file.text());
      if (!cues.length) { alert('Não encontrei falas nesse arquivo. Use .srt ou .vtt.'); return; }
      localCount.current += 1;
      const id = `local-${localCount.current}`;
      const label = file.name.replace(/\.(srt|vtt)$/i, '') || 'Minha legenda';
      setSubSources((prev) => [...prev, { id, type: 'cues', cues, label, lang: null }]);
      setActiveSub(id);
      setPanel(null);
    } catch { alert('Não consegui ler esse arquivo de legenda.'); }
  };

  /* ── modos de som (Web Audio) ───────────────────────────────────────── */
  const applySound = useCallback(async (mode: SoundMode) => {
    const el = videoRef.current;
    if (!el) return;
    setSound(mode);
    writePrefs({ sound: mode });
    if (mode === 'normal' && !audioGraph.current) return;
    try {
      if (!audioGraph.current) {
        const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const source = ctx.createMediaElementSource(el);
        audioGraph.current = { ctx, source, nodes: [] };
      }
      const g = audioGraph.current;
      if (g.ctx.state !== 'running') { try { await g.ctx.resume(); } catch { /* noop */ } }
      try { g.source.disconnect(); } catch { /* noop */ }
      g.nodes.forEach((n) => { try { n.disconnect(); } catch { /* noop */ } });
      const ctx = g.ctx;
      const chain: AudioNode[] = [];
      if (mode === 'voice') {
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
        const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 250; low.gain.value = -4;
        const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2600; pres.Q.value = 0.9; pres.gain.value = 6;
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
        chain.push(hp, low, pres, comp);
      } else if (mode === 'night') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -38; comp.knee.value = 24; comp.ratio.value = 10; comp.attack.value = 0.005; comp.release.value = 0.25;
        const mk = ctx.createGain(); mk.gain.value = 1.7;
        chain.push(comp, mk);
      } else if (mode === 'boost') {
        const pre = ctx.createGain(); pre.gain.value = 1.9;
        const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
        chain.push(pre, lim);
      }
      let node: AudioNode = g.source;
      for (const n of chain) { node.connect(n); node = n; }
      node.connect(ctx.destination);
      g.nodes = chain;
    } catch {
      setSoundAvailable(false);
      setSound('normal');
    }
  }, []);

  useEffect(() => () => { try { audioGraph.current?.ctx.close(); } catch { /* noop */ } audioGraph.current = null; }, []);

  /* ── eventos do <video> ─────────────────────────────────────────────── */
  const stallTimer = useRef<number | null>(null);
  const clearStall = () => { if (stallTimer.current) { window.clearTimeout(stallTimer.current); stallTimer.current = null; } };
  useEffect(() => clearStall, []);

  const onVideoTime = (el: HTMLVideoElement) => {
    setCurrent(el.currentTime);
    try {
      const b = el.buffered;
      let end = 0;
      for (let i = 0; i < b.length; i++) if (b.start(i) <= el.currentTime + 0.5) end = Math.max(end, b.end(i));
      setBufferedEnd(end);
    } catch { /* noop */ }
    updateSubText(el.currentTime);
    onTimeUpdate?.(el);
  };

  /* ── ações ──────────────────────────────────────────────────────────── */
  const play = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    if (audioGraph.current?.ctx.state === 'suspended') { try { await audioGraph.current.ctx.resume(); } catch { /* noop */ } }
    try { await el.play(); }
    catch {
      // autoplay com som bloqueado: toca mudo e mostra o botão de som
      try { el.muted = true; setMuted(true); await el.play(); } catch { /* noop */ }
    }
  }, []);
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) void play(); else el.pause();
  }, [play]);
  const seekBy = useCallback((d: number) => {
    const el = videoRef.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : el.currentTime + d;
    el.currentTime = Math.max(0, Math.min(max - 0.1, el.currentTime + d));
  }, []);
  const setVol = useCallback((v: number) => {
    const el = videoRef.current;
    if (!el) return;
    const vol = Math.max(0, Math.min(1, v));
    el.volume = vol;
    el.muted = vol === 0;
    setVolume(vol);
    setMuted(vol === 0);
    writePrefs({ volume: vol, muted: vol === 0 });
  }, []);
  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const m = !el.muted;
    el.muted = m;
    if (!m && el.volume === 0) { el.volume = 0.6; setVolume(0.6); }
    setMuted(m);
    writePrefs({ muted: m });
  }, []);
  const setSpeed = (r: number) => {
    const el = videoRef.current;
    if (el) el.playbackRate = r;
    setRate(r);
    writePrefs({ rate: r });
    setPanel('main');
  };
  const setQ = (i: number) => {
    const b = backendRef.current;
    if (b.kind === 'hls' && b.inst) b.inst.currentLevel = i; // -1 = automático
    setQuality(i);
    setPanel('main');
  };
  const setAudio = (o: AudioTrackOpt) => {
    const b = backendRef.current;
    const el = videoRef.current as any;
    if (b.kind === 'hls' && b.inst) b.inst.audioTrack = o.index;
    else if (b.kind === 'dash' && b.inst) { try { b.inst.setCurrentTrack(b.inst.getTracksFor('audio')[o.index]); } catch { /* noop */ } }
    else if (el?.audioTracks) for (let i = 0; i < el.audioTracks.length; i++) el.audioTracks[i].enabled = i === o.index;
    setActiveAudio(o.id);
    setPanel('main');
  };

  const toggleFs = useCallback(async () => {
    const w = wrapRef.current as any;
    const v = videoRef.current as any;
    if (!w) return;
    const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
    try {
      if (fsEl) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else (document as any).webkitExitFullscreen?.();
        try { (screen.orientation as any)?.unlock?.(); } catch { /* noop */ }
        return;
      }
      if (w.requestFullscreen) await w.requestFullscreen({ navigationUI: 'hide' });
      else if (w.webkitRequestFullscreen) w.webkitRequestFullscreen();
      else if (v?.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return; } // iPhone
      if (isTouch) { try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* noop */ } }
    } catch {
      try { v?.webkitEnterFullscreen?.(); } catch { /* noop */ }
    }
  }, [isTouch]);

  const togglePip = async () => {
    const v = videoRef.current as any;
    try {
      if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture();
      else await v?.requestPictureInPicture?.();
    } catch { /* noop */ }
  };
  const pipSupported = typeof document !== 'undefined' && !!(document as any).pictureInPictureEnabled && !isIOS;

  useEffect(() => {
    const on = () => setIsFs(!!(document.fullscreenElement || (document as any).webkitFullscreenElement) && (document.fullscreenElement === wrapRef.current || (document as any).webkitFullscreenElement === wrapRef.current));
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on as any);
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on as any); };
  }, []);

  /* ── mostrar/esconder controles ─────────────────────────────────────── */
  const hideTimer = useRef<number | null>(null);
  const poke = useCallback(() => {
    setShowUi(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const el = videoRef.current;
      if (el && !el.paused) setShowUi(false);
    }, isTouch ? 3500 : 2600);
  }, [isTouch]);
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);
  const uiVisible = showUi || !playing || !!panel || loading || !!error || scrubbing != null;

  /* ── teclado ────────────────────────────────────────────────────────── */
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
    else if (k === 'arrowright') { e.preventDefault(); seekBy(10); }
    else if (k === 'arrowleft') { e.preventDefault(); seekBy(-10); }
    else if (k === 'arrowup') { e.preventDefault(); setVol(volume + 0.1); }
    else if (k === 'arrowdown') { e.preventDefault(); setVol(volume - 0.1); }
    else if (k === 'f') { e.preventDefault(); void toggleFs(); }
    else if (k === 'm') { e.preventDefault(); toggleMute(); }
    else if (k === 'c') {
      e.preventDefault();
      if (activeSub) void selectSub(null);
      else if (subSources[0]) void selectSub((subSources.find((s) => isPt(s.lang, s.label)) || subSources[0]).id);
    } else if (k === 'escape' && panel) { setPanel(null); }
    poke();
  };

  /* ── toques: 1 toque mostra/esconde, 2 toques nas laterais = ±10s ───── */
  const lastTap = useRef<{ t: number; x: number } | null>(null);
  const tapTimer = useRef<number | null>(null);
  const onSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panel) { setPanel(null); return; }
    if (!isTouch) { togglePlay(); poke(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const now = Date.now();
    const prev = lastTap.current;
    lastTap.current = { t: now, x };
    if (prev && now - prev.t < 300 && (x < 0.35 || x > 0.65)) {
      if (tapTimer.current) { window.clearTimeout(tapTimer.current); tapTimer.current = null; }
      const side = x < 0.5 ? 'l' : 'r';
      seekBy(side === 'l' ? -10 : 10);
      setTapFx({ side, key: now });
      return;
    }
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null;
      if (uiVisible && playing) setShowUi(false); else poke();
    }, 260);
  };
  useEffect(() => {
    if (!tapFx) return;
    const t = window.setTimeout(() => setTapFx(null), 550);
    return () => window.clearTimeout(t);
  }, [tapFx]);

  /* ── barra de progresso ─────────────────────────────────────────────── */
  const barRef = useRef<HTMLDivElement | null>(null);
  const timeFromX = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || !duration) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const onBarDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setScrubbing(timeFromX(e.clientX));
  };
  const onBarMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = timeFromX(e.clientX);
    if (scrubbing != null) setScrubbing(t);
    if (!isTouch) {
      const r = barRef.current?.getBoundingClientRect();
      if (r) setSeekHover({ x: e.clientX - r.left, t });
    }
  };
  const onBarUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbing == null) return;
    const el = videoRef.current;
    const t = timeFromX(e.clientX);
    if (el) el.currentTime = t;
    setCurrent(t);
    setScrubbing(null);
    poke();
  };

  const isLive = !Number.isFinite(duration) || duration === Infinity;
  const shownTime = scrubbing ?? current;
  const pct = duration > 0 && !isLive ? (shownTime / duration) * 100 : 0;
  const bufPct = duration > 0 && !isLive ? Math.min(100, (bufferedEnd / duration) * 100) : 0;
  const activeSubLabel = subSources.find((s) => s.id === activeSub)?.label;

  /* ── UI ─────────────────────────────────────────────────────────────── */
  return (
    <PokeCtx.Provider value={poke}>
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseMove={() => { if (!isTouch) poke(); }}
      onMouseLeave={() => { if (!isTouch && playing) setShowUi(false); }}
      className={cn(
        'group/player relative h-full w-full select-none overflow-hidden bg-black text-white outline-none',
        !uiVisible && 'cursor-none',
        className,
      )}
    >
      <video
        ref={setVideoEl}
        poster={poster ?? undefined}
        playsInline
        preload="auto"
        muted={muted}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        onContextMenu={(e) => e.preventDefault()}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setDuration(el.duration);
          el.volume = volume;
          el.playbackRate = rate;
          refreshNativeSubs();
          if (resumeAtRef.current > 0) { try { el.currentTime = resumeAtRef.current; } catch { /* noop */ } resumeAtRef.current = 0; }
          onLoadedMetadata?.(el);
          onReady?.(el);
          if (autoPlay) void play();
          if (prefs.sound !== 'normal' && soundAvailable) void applySound(prefs.sound);
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onCanPlay={() => { setLoading(false); setSlowNet(false); clearStall(); }}
        onWaiting={() => {
          setLoading(true);
          clearStall();
          stallTimer.current = window.setTimeout(() => setSlowNet(true), 8000);
        }}
        onPlaying={() => { setLoading(false); setSlowNet(false); clearStall(); setPlaying(true); setStarted(true); poke(); }}
        onPlay={() => { setPlaying(true); setStarted(true); }}
        onPause={() => { setPlaying(false); setShowUi(true); }}
        onTimeUpdate={(e) => onVideoTime(e.currentTarget)}
        onProgress={(e) => onVideoTime(e.currentTarget)}
        onSeeked={(e) => onVideoTime(e.currentTarget)}
        onEnded={(e) => { setPlaying(false); setShowUi(true); onEnded?.(e.currentTarget); }}
        onError={(e) => {
          if (backendRef.current.kind !== 'native') return;
          const code = e.currentTarget.error?.code;
          setLoading(false);
          clearStall();
          setError(code === 4
            ? `Este filme não abriu: o link pode estar fora do ar ou o arquivo${ext ? ` (.${ext.toUpperCase()})` : ''} usa um formato que o navegador não toca.`
            : code === 2
              ? 'A conexão caiu enquanto o filme carregava.'
              : 'Não foi possível reproduzir este filme.');
          onError?.(`media-error-${code ?? 0}`);
        }}
      />

      {/* superfície de toque/clique */}
      <div className="absolute inset-0 z-[1]" onClick={onSurfaceClick} onDoubleClick={() => { if (!isTouch) void toggleFs(); }} />

      {/* efeito do toque duplo */}
      {tapFx && (
        <div key={tapFx.key} className={cn('pointer-events-none absolute top-1/2 z-[2] -translate-y-1/2 rounded-full bg-black/55 px-4 py-3 text-sm font-bold', tapFx.side === 'l' ? 'left-[12%]' : 'right-[12%]')}>
          {tapFx.side === 'l' ? '« 10s' : '10s »'}
        </div>
      )}

      {/* legenda */}
      {subText && (
        <div className={cn('pointer-events-none absolute inset-x-0 z-[3] flex justify-center px-4 transition-[bottom] duration-200', uiVisible ? 'bottom-[92px] sm:bottom-[104px]' : 'bottom-6 sm:bottom-10')}>
          <p className={cn('max-w-[92%] whitespace-pre-line rounded-md bg-black/75 px-2.5 py-1 text-center font-semibold leading-snug text-white', SUB_SIZE_CLASS[subSize])} style={{ textShadow: '0 1px 2px #000' }}>
            {subText}
          </p>
        </div>
      )}

      {/* carregando / rede lenta */}
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-[4] grid place-items-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-12 w-12 animate-spin text-white/90" />
            {slowNet && <p className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold">Conexão lenta — carregando…</p>}
          </div>
        </div>
      )}

      {/* play central */}
      {!playing && !loading && !error && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void play(); }}
          aria-label="Reproduzir"
          className="absolute left-1/2 top-1/2 z-[5] grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-black shadow-xl active:scale-95 sm:h-20 sm:w-20"
        >
          <Play className="h-8 w-8 translate-x-0.5 fill-current sm:h-10 sm:w-10" />
        </button>
      )}

      {/* erro */}
      {error && (
        <div className="absolute inset-0 z-[8] grid place-items-center bg-black/85 p-5 text-center">
          <div className="max-w-sm space-y-3">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
            <p className="text-sm font-bold">{error}</p>
            <p className="text-xs text-white/65">Formatos que funcionam em qualquer aparelho: MP4 (H.264 + AAC), WebM ou HLS (.m3u8).</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => { resumeAtRef.current = videoRef.current?.currentTime || current; setReloadKey((k) => k + 1); }}
                className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black"
              >
                Tentar de novo
              </button>
              {(originalUrl || src) && (
                <a href={originalUrl || src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
                  <ExternalLink className="h-4 w-4" /> Abrir link
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* topo: título (em tela cheia) */}
      {title && isFs && uiVisible && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[6] bg-gradient-to-b from-black/80 to-transparent px-5 pb-10 pt-4">
          <p className="truncate text-base font-bold sm:text-xl">{title}</p>
        </div>
      )}

      {/* controles inferiores */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-[6] bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-1.5 pt-10 transition-opacity duration-200 sm:px-4 sm:pb-3',
          uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* barra */}
        {!isLive && (
          <div
            ref={barRef}
            role="slider"
            aria-label="Posição do filme"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration) || 0}
            aria-valuenow={Math.round(shownTime)}
            className="group/bar relative mx-1 flex h-6 cursor-pointer touch-none items-center"
            onPointerDown={onBarDown}
            onPointerMove={onBarMove}
            onPointerUp={onBarUp}
            onPointerCancel={() => setScrubbing(null)}
            onPointerLeave={() => setSeekHover(null)}
          >
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/bar:h-1.5">
              <div className="absolute inset-y-0 left-0 bg-white/45" style={{ width: `${bufPct}%` }} />
              <div className="absolute inset-y-0 left-0 bg-red-600" style={{ width: `${pct}%` }} />
            </div>
            <div className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 ring-2 ring-white/90" style={{ left: `${pct}%` }} />
            {(seekHover || scrubbing != null) && (
              <div
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-black/90 px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                style={{ left: scrubbing != null ? `${pct}%` : seekHover!.x }}
              >
                {fmtTime(scrubbing ?? seekHover!.t)}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 sm:gap-1">
          <IconBtn onClick={togglePlay} label={playing ? 'Pausar' : 'Reproduzir'}>
            {playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
          </IconBtn>
          {!isLive && (
            <>
              <IconBtn onClick={() => seekBy(-10)} label="Voltar 10 segundos">
                <span className="relative grid place-items-center"><RotateCcw className="h-6 w-6" /><span className="absolute text-[8px] font-black">10</span></span>
              </IconBtn>
              <IconBtn onClick={() => seekBy(10)} label="Avançar 10 segundos">
                <span className="relative grid place-items-center"><RotateCw className="h-6 w-6" /><span className="absolute text-[8px] font-black">10</span></span>
              </IconBtn>
            </>
          )}
          <div className="group/vol flex items-center">
            <IconBtn onClick={toggleMute} label={muted || volume === 0 ? 'Ativar som' : 'Silenciar'}>
              {muted || volume === 0 ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
            </IconBtn>
            {!isTouch && !isIOS && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(e) => setVol(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                aria-label="Volume"
                className="h-1 w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100"
              />
            )}
          </div>
          <span className="ml-1 whitespace-nowrap text-[12px] font-semibold tabular-nums text-white/90 sm:text-sm">
            {isLive ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black">AO VIVO</span> : <>{fmtTime(shownTime)} <span className="text-white/50">/ {fmtTime(duration)}</span></>}
          </span>

          <div className="flex-1" />

          <IconBtn
            onClick={() => {
              if (activeSub) void selectSub(null);
              else if (subSources.length) void selectSub((subSources.find((s) => isPt(s.lang, s.label)) || subSources[0]).id);
              else setPanel('subs');
            }}
            label={activeSub ? 'Ocultar legendas' : 'Mostrar legendas'}
            className={cn(activeSub && 'text-red-500')}
          >
            <Subtitles className="h-6 w-6" />
          </IconBtn>
          <IconBtn onClick={() => setPanel((p) => (p ? null : 'main'))} label="Configurações">
            <Settings className={cn('h-6 w-6 transition-transform', panel && 'rotate-45')} />
          </IconBtn>
          {pipSupported && !isTouch && (
            <IconBtn onClick={() => void togglePip()} label="Miniplayer (PiP)">
              <PictureInPicture2 className="h-6 w-6" />
            </IconBtn>
          )}
          <IconBtn onClick={() => void toggleFs()} label={isFs ? 'Sair da tela cheia' : 'Tela cheia'}>
            {isFs ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
          </IconBtn>
        </div>
      </div>

      {/* painel de configurações (dentro do player: aparece em tela cheia) */}
      {panel && (
        <div
          className="absolute bottom-16 right-2 z-[7] max-h-[calc(100%-5rem)] w-[min(300px,calc(100%-1rem))] overflow-y-auto overscroll-contain rounded-xl bg-neutral-950/95 p-1.5 shadow-2xl ring-1 ring-white/10 sm:bottom-20 sm:right-4"
          onClick={(e) => e.stopPropagation()}
        >
          {panel === 'main' && (
            <>
              <Row onClick={() => setPanel('subs')} hint={activeSubLabel ? activeSubLabel : 'Desativadas'}>Legendas</Row>
              <Row onClick={() => setPanel('size')} hint={SUB_SIZE_LABEL[subSize]}>Tamanho da legenda</Row>
              {audioOpts.length > 1 && <Row onClick={() => setPanel('audio')} hint={audioOpts.find((a) => a.id === activeAudio)?.label}>Idioma do áudio</Row>}
              <Row onClick={() => setPanel('sound')} hint={soundAvailable ? SOUND_LABEL[sound] : 'Indisponível para este link'}>Modo de som</Row>
              <Row onClick={() => setPanel('speed')} hint={rate === 1 ? 'Normal' : `${rate}x`}>Velocidade</Row>
              {qualities.length > 0 && <Row onClick={() => setPanel('quality')} hint={quality === -1 ? 'Automática' : qualities.find((q) => q.index === quality)?.label}>Qualidade</Row>}
            </>
          )}
          {panel === 'subs' && (
            <>
              <Back title="Legendas" onBack={() => setPanel('main')} />
              <Row onClick={() => { void selectSub(null); setPanel(null); }} active={!activeSub}>Desativadas</Row>
              {subSources.map((s) => (
                <Row key={s.id} onClick={() => { void selectSub(s.id); setPanel(null); }} active={activeSub === s.id} hint={s.type === 'cues' ? 'Do seu aparelho' : s.type === 'url' ? 'Enviada pelo autor' : 'Do arquivo do filme'}>
                  {s.label}
                </Row>
              ))}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-white/25 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                <Upload className="h-4 w-4" /> Carregar legenda (.srt / .vtt)
              </button>
            </>
          )}
          {panel === 'size' && (
            <>
              <Back title="Tamanho da legenda" onBack={() => setPanel('main')} />
              {(['sm', 'md', 'lg', 'xl'] as SubSize[]).map((s) => (
                <Row key={s} onClick={() => { setSubSize(s); writePrefs({ subSize: s }); setPanel('main'); }} active={subSize === s}>{SUB_SIZE_LABEL[s]}</Row>
              ))}
            </>
          )}
          {panel === 'audio' && (
            <>
              <Back title="Idioma do áudio" onBack={() => setPanel('main')} />
              {audioOpts.map((o) => <Row key={o.id} onClick={() => setAudio(o)} active={activeAudio === o.id}>{o.label}</Row>)}
            </>
          )}
          {panel === 'sound' && (
            <>
              <Back title="Modo de som" onBack={() => setPanel('main')} />
              {soundAvailable ? (
                (['normal', 'voice', 'night', 'boost'] as SoundMode[]).map((m) => (
                  <Row key={m} onClick={() => { void applySound(m); setPanel('main'); }} active={sound === m} hint={SOUND_HINT[m]}>{SOUND_LABEL[m]}</Row>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-white/65">Este link é de outro site e não permite ajustar o som. Os modos funcionam em filmes enviados ao Oculto e em streams HLS/DASH.</p>
              )}
            </>
          )}
          {panel === 'speed' && (
            <>
              <Back title="Velocidade" onBack={() => setPanel('main')} />
              {SPEEDS.map((r) => <Row key={r} onClick={() => setSpeed(r)} active={rate === r}>{r === 1 ? 'Normal' : `${r}x`}</Row>)}
            </>
          )}
          {panel === 'quality' && (
            <>
              <Back title="Qualidade" onBack={() => setPanel('main')} />
              <Row onClick={() => setQ(-1)} active={quality === -1} hint="Ajusta à sua internet">Automática</Row>
              {qualities.map((q) => <Row key={q.index} onClick={() => setQ(q.index)} active={quality === q.index}>{q.label}</Row>)}
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip"
        className="hidden"
        onChange={(e) => { void onLocalSubtitle(e.target.files?.[0]); e.target.value = ''; }}
      />
    </div>
    </PokeCtx.Provider>
  );
}
