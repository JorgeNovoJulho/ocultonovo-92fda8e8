/**
 * OcultoPlayLinkPlayer — renderiza um item do Play do tipo `link`. Detecta a
 * plataforma a partir de `source_url` (ou `media_url` como fallback) e mostra
 * o player oficial (YouTube/Vimeo/TikTok) ou um <video> nativo (arquivos
 * diretos .mp4/.webm). Inclui botão de tela cheia (Fullscreen API).
 *
 * Persistência: a preferência de tela cheia é mantida entre reaberturas do
 * modal via `localStorage('oculto:play:link:fs')`. Quando o usuário sai do
 * modal, qualquer fullscreen ativo é fechado automaticamente.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { ExternalLink, PlayCircle, Maximize, Minimize, Download, Info } from 'lucide-react';
import { parseEmbeddedVideo } from '@/lib/embeddedVideoUrl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ModernVideoPlayer } from '@/components/oculto-play/ModernVideoPlayer';

const FS_PREF_KEY = 'oculto:play:link:fs';
const TIME_PREF_PREFIX = 'oculto:play:link:t:';
const TIME_MIN_SAVE = 3; // segundos — não salva os primeiros 3s
const VLC_DETECTED_KEY = 'oculto:play:vlc:detected';
const VLC_DOWNLOAD_URL = 'https://www.videolan.org/vlc/';
const VLC_ANDROID_URL = 'https://play.google.com/store/apps/details?id=org.videolan.vlc';
const VLC_IOS_URL = 'https://apps.apple.com/app/vlc-media-player/id650377962';

type VlcLaunchState = 'idle' | 'opening' | 'opened' | 'fallback';
type VlcPlatform = 'android' | 'ios' | 'desktop';
type BrowserVideoSupport = 'native' | 'hls' | 'dash' | 'handoff';

function readFsPref(): boolean {
  try { return localStorage.getItem(FS_PREF_KEY) === '1'; } catch { return false; }
}
function writeFsPref(value: boolean) {
  try { localStorage.setItem(FS_PREF_KEY, value ? '1' : '0'); } catch { /* noop */ }
}
function readSavedTime(itemId?: string | null): number {
  if (!itemId) return 0;
  try {
    const raw = localStorage.getItem(TIME_PREF_PREFIX + itemId);
    const v = raw ? parseFloat(raw) : 0;
    return Number.isFinite(v) && v > TIME_MIN_SAVE ? v : 0;
  } catch { return 0; }
}
function writeSavedTime(itemId: string, t: number) {
  try {
    if (!Number.isFinite(t) || t < TIME_MIN_SAVE) return;
    localStorage.setItem(TIME_PREF_PREFIX + itemId, String(Math.floor(t)));
  } catch { /* noop */ }
}
function clearSavedTime(itemId: string) {
  try { localStorage.removeItem(TIME_PREF_PREFIX + itemId); } catch { /* noop */ }
}

function getUserAgent(): string {
  try { return navigator.userAgent || ''; } catch { return ''; }
}

function getVlcPlatform(ua = getUserAgent()): VlcPlatform {
  if (/Android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

function getVlcInstallUrl(platform = getVlcPlatform()): string {
  if (platform === 'android') return VLC_ANDROID_URL;
  if (platform === 'ios') return VLC_IOS_URL;
  return VLC_DOWNLOAD_URL;
}

function readVlcDetected(): boolean {
  try { return localStorage.getItem(VLC_DETECTED_KEY) === '1'; } catch { return false; }
}

function writeVlcDetected() {
  try { localStorage.setItem(VLC_DETECTED_KEY, '1'); } catch { /* noop */ }
}

/**
 * Prefs VLC — priorizar áudio em português e legendas desligadas por padrão.
 * VLC ativa automaticamente legendas em pt quando o filme não tem faixa de
 * áudio em pt (comportamento nativo com --sub-language quando --audio-language
 * não é encontrado no arquivo).
 */
const VLC_AUDIO_LANG = 'pt,por,pob';
const VLC_SUB_LANG = 'pt,por,pob';

function buildDesktopVlcUris(mediaUrl: string): string[] {
  const encoded = encodeURIComponent(mediaUrl);
  const hint = `audio-language=${encodeURIComponent(VLC_AUDIO_LANG)}&sub-language=${encodeURIComponent(VLC_SUB_LANG)}&sub-autodetect-file=1`;
  return [
    // Handler vlc-protocol (Windows/macOS/Linux): preserva URLs com query assinada.
    `vlc://weblink?url=${encoded}&${hint}`,
    // Formato padrão de handlers vlc://.
    `vlc://${mediaUrl}`,
  ];
}

function buildVlcHandoffUrls(mediaUrl: string): { platform: VlcPlatform; uris: string[] } {
  const platform = getVlcPlatform();

  if (platform === 'ios') {
    return {
      platform,
      uris: [
        `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(mediaUrl)}`,
        `vlc://${mediaUrl}`,
      ],
    };
  }

  if (platform === 'android') {
    const extras = [
      'S.title=OCULTO%20PLAY',
      `S.audio_language=${encodeURIComponent(VLC_AUDIO_LANG)}`,
      `S.subtitle_language=${encodeURIComponent(VLC_SUB_LANG)}`,
    ].join(';');
    try {
      const parsedUrl = new URL(mediaUrl);
      const scheme = parsedUrl.protocol.replace(':', '');
      const rest = mediaUrl.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
      return {
        platform,
        uris: [
          `intent://${rest}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=org.videolan.vlc;type=video/*;${extras};end`,
          `vlc://${mediaUrl}`,
        ],
      };
    } catch {
      return {
        platform,
        uris: [
          `intent://${mediaUrl.replace(/^[a-z][a-z\d+.-]*:\/\//i, '')}#Intent;scheme=http;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=org.videolan.vlc;type=video/*;${extras};end`,
          `vlc://${mediaUrl}`,
        ],
      };
    }
  }

  // Desktop — o esquema vlc:// não é registrado por instalações padrão do
  // VLC (Win/macOS/Linux). A rota real é o download de .m3u8 (função
  // launchVlcDesktop). Mantemos aqui apenas fallbacks best-effort.
  return {
    platform,
    uris: [
      `vlc://${mediaUrl}`,
    ],
  };
}

function launchExternalAppUri(uri: string, platform: VlcPlatform, mode: 'primary' | 'fallback' = 'primary') {
  if (platform === 'android' || platform === 'ios') {
    window.location.href = uri;
    return;
  }
  const a = document.createElement('a');
  a.href = uri;
  a.rel = 'noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => a.remove(), 0);
  if (mode === 'primary') {
    try {
      const f = document.createElement('iframe');
      f.style.display = 'none';
      f.src = uri;
      document.body.appendChild(f);
      window.setTimeout(() => f.remove(), 2500);
    } catch { /* noop */ }
  }
}

/**
 * Desktop: tenta abrir somente via protocolo externo. Browsers não permitem
 * criar/abrir/deletar arquivo local em segundo plano; por isso removemos o
 * fallback .m3u8 que causava a janela "salvar arquivo".
 */
function launchVlcDesktop(mediaUrl: string, onOpened?: () => void, onFailed?: () => void): boolean {
  const uris = buildDesktopVlcUris(mediaUrl);

  let handoffDetected = false;
  const markOpened = () => {
    if (handoffDetected) return;
    handoffDetected = true;
    try { onOpened?.(); } catch { /* noop */ }
  };
  const onBlur = () => markOpened();
  const onHide = () => { if (document.hidden) markOpened(); };
  window.addEventListener('blur', onBlur, { once: true });
  document.addEventListener('visibilitychange', onHide);

  uris.forEach((uri, index) => window.setTimeout(() => {
    if (handoffDetected || document.hidden) return;
    const a = document.createElement('a');
    a.href = uri;
    a.rel = 'noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => a.remove(), 0);
  }, index * 450));

  window.setTimeout(() => {
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onHide);
    if (!handoffDetected && !document.hidden) onFailed?.();
  }, 2200);

  return true;
}

function getDirectVideoExt(rawUrl: string): string {
  try { return (new URL(rawUrl).pathname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase(); }
  catch { return ''; }
}

function canPlayNativeExt(ext: string): boolean {
  if (typeof document === 'undefined') return false;
  const v = document.createElement('video');
  const candidates: Record<string, string[]> = {
    mp4: ['video/mp4; codecs="avc1.42E01E, mp4a.40.2"', 'video/mp4'],
    m4v: ['video/mp4; codecs="avc1.42E01E, mp4a.40.2"', 'video/mp4'],
    webm: ['video/webm; codecs="vp9, opus"', 'video/webm'],
    ogv: ['video/ogg; codecs="theora, vorbis"', 'video/ogg'],
    ogg: ['video/ogg; codecs="theora, vorbis"', 'video/ogg'],
    mov: ['video/quicktime', 'video/mp4'],
  };
  return (candidates[ext] || []).some(type => !!v.canPlayType(type));
}

function getBrowserVideoSupport(ext: string): BrowserVideoSupport {
  if (ext === 'm3u8') return 'hls';
  if (ext === 'mpd') return 'dash';
  if (canPlayNativeExt(ext)) return 'native';
  return 'handoff';
}


/** Sai de qualquer fullscreen ativo. Útil ao desmontar o modal. */
export async function exitLinkPlayerFullscreen() {
  try {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    }
  } catch { /* noop */ }
}

interface Props {
  sourceUrl: string;
  thumbUrl?: string | null;
  className?: string;
  /** Inicia o iframe somente após o usuário interagir (poupa CPU/dados). */
  lazyClickToPlay?: boolean;
  /** Se true, tenta reentrar em tela cheia automaticamente quando o usuário já
   *  havia preferido isso na sessão anterior. Use no modal de foco. */
  restoreFullscreen?: boolean;
  /** Inicia a reprodução automaticamente (autoplay). Útil quando o usuário
   *  selecionou uma sugestão de "Próximos vídeos". */
  autoPlay?: boolean;
  /** ID do item — usado para persistir o currentTime (apenas .mp4 direto). */
  itemId?: string | null;
  /** Callback disparado após 10s acumulados de reprodução ativa (contagem de
   *  visualização). Para embeds, conta a partir da ativação do iframe. */
  onPlayedThreshold?: () => void;
  /** Callback disparado quando o filme chega ao fim / 95% assistido.
   *  Suporta vídeo direto, YouTube e Vimeo via eventos do player. */
  onCompleted?: () => void;
  /** Segundos de reprodução necessários para considerar uma visualização. */
  viewThresholdSec?: number;
  /** Percentual mínimo para considerar filme completo. */
  completionThreshold?: number;
  /** Início opcional da janela de trailer/preview, em segundos. */
  startSeconds?: number | null;
  /** Fim opcional da janela de trailer/preview, em segundos. */
  endSeconds?: number | null;
  /** Quando true, ignora o thumbnail do provedor (YouTube/Vimeo) e usa apenas o thumbUrl salvo. */
  preferThumb?: boolean;
  /** Ajuste da capa exibida antes do play. 'contain' preserva a imagem completa. */
  coverFit?: 'cover' | 'contain';
}


function appendAutoplayParam(src: string): string {
  try {
    const u = new URL(src);
    u.searchParams.set('autoplay', '1');
    // muted=1 é necessário para a maioria dos browsers permitirem autoplay.
    if (!u.searchParams.has('muted')) u.searchParams.set('muted', '1');
    return u.toString();
  } catch {
    const sep = src.includes('?') ? '&' : '?';
    return `${src}${sep}autoplay=1&muted=1`;
  }
}

function appendEmbedApiParams(src: string, kind?: string | null): string {
  try {
    const u = new URL(src);
    if (kind === 'youtube') {
      u.searchParams.set('enablejsapi', '1');
      u.searchParams.set('origin', window.location.origin);
    }
    if (kind === 'vimeo') {
      u.searchParams.set('api', '1');
      if (!u.searchParams.has('player_id')) u.searchParams.set('player_id', 'oculto-play-link-player');
    }
    return u.toString();
  } catch {
    if (kind !== 'youtube') return src;
    const sep = src.includes('?') ? '&' : '?';
    return `${src}${sep}enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  }
}

function appendEmbedTrimParams(src: string, kind?: string | null, start?: number | null, end?: number | null): string {
  const s = Number(start ?? 0);
  const e = Number(end ?? 0);
  try {
    const u = new URL(src);
    if (kind === 'youtube') {
      if (Number.isFinite(s) && s > 0) u.searchParams.set('start', String(Math.floor(s)));
      if (Number.isFinite(e) && e > s) u.searchParams.set('end', String(Math.floor(e)));
    }
    if (kind === 'vimeo' && Number.isFinite(s) && s > 0) {
      u.hash = `t=${Math.floor(s)}s`;
    }
    return u.toString();
  } catch {
    return src;
  }
}

function parsePlayerMessage(data: unknown): any {
  if (!data) return null;
  if (typeof data === 'object') return data;
  if (typeof data !== 'string') return null;
  try { return JSON.parse(data); } catch { return null; }
}

export function OcultoPlayLinkPlayer({
  sourceUrl,
  thumbUrl,
  className,
  lazyClickToPlay = true,
  restoreFullscreen = false,
  autoPlay = false,
  itemId = null,
  onPlayedThreshold,
  onCompleted,
  viewThresholdSec = 10,
  completionThreshold = 0.95,
  startSeconds = null,
  endSeconds = null,
  preferThumb = false,
  coverFit = 'cover',
}: Props) {
  const parsed = useMemo(() => parseEmbeddedVideo(sourceUrl), [sourceUrl]);
  const [active, setActive] = useState(!lazyClickToPlay || autoPlay);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isFs, setIsFs] = useState(false);
  const restoredRef = useRef(false);
  const viewReportedRef = useRef(false);
  const completionReportedRef = useRef(false);
  const watchedMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const trimStart = Math.max(0, Number(startSeconds ?? 0) || 0);
  const trimEnd = Math.max(0, Number(endSeconds ?? 0) || 0);
  const hasTrimWindow = trimEnd > trimStart;
  const [vlcLaunchState, setVlcLaunchState] = useState<VlcLaunchState>('idle');
  const [vlcKnownInstalled, setVlcKnownInstalled] = useState(() => readVlcDetected());
  const [directPlaybackFailed, setDirectPlaybackFailed] = useState(false);

  const reportCompletion = () => {
    if (completionReportedRef.current) return;
    completionReportedRef.current = true;
    try { onCompleted?.(); } catch { /* noop */ }
  };

  useEffect(() => {
    viewReportedRef.current = false;
    completionReportedRef.current = false;
    watchedMsRef.current = 0;
    lastTickRef.current = null;
    setVlcLaunchState('idle');
    setDirectPlaybackFailed(false);
  }, [itemId, sourceUrl, trimStart, trimEnd]);

  // ---- Reportar visualização após N segundos de reprodução ativa --------
  // Para .mp4 direto usamos o evento 'playing'/'pause'/'timeupdate' do <video>.
  // Para embeds (YouTube/Vimeo/TikTok) não temos API de playback cross-origin,
  // então contamos o tempo desde a ativação do iframe (clique em "play"), o
  // que assume reprodução real (sem som ainda é reprodução).
  useEffect(() => {
    if (!active || !onPlayedThreshold || viewReportedRef.current) return;
    const thresholdMs = Math.max(1, viewThresholdSec) * 1000;
    let raf = 0;
    let stopped = false;

    const tick = () => {
      if (stopped || viewReportedRef.current) return;
      const now = performance.now();
      const v = videoRef.current;
      const isDirect = parsed?.kind === 'direct';
      // Para vídeo nativo, só conta se realmente estiver tocando e com som ou
      // pelo menos com play ativo (paused === false, ended === false).
      const playing = isDirect ? !!(v && !v.paused && !v.ended) : true;
      if (playing) {
        if (lastTickRef.current != null) watchedMsRef.current += now - lastTickRef.current;
        lastTickRef.current = now;
      } else {
        lastTickRef.current = null;
      }
      if (watchedMsRef.current >= thresholdMs) {
        viewReportedRef.current = true;
        try { onPlayedThreshold(); } catch { /* noop */ }
        return;
      }
      raf = window.setTimeout(tick, 500) as unknown as number;
    };
    lastTickRef.current = performance.now();
    raf = window.setTimeout(tick, 500) as unknown as number;
    return () => {
      stopped = true;
      window.clearTimeout(raf);
    };
  }, [active, onPlayedThreshold, parsed?.kind, viewThresholdSec]);

  // ---- Conclusão de filmes em links externos ----------------------------
  useEffect(() => {
    if (!active || !onCompleted) return;
    if (parsed?.kind !== 'youtube' && parsed?.kind !== 'vimeo') return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    let stopped = false;
    let duration = 0;
    let currentTime = 0;
    const threshold = Math.min(0.99, Math.max(0.5, completionThreshold));

    const post = (payload: unknown) => {
      try {
        iframe.contentWindow?.postMessage(
          typeof payload === 'string' ? payload : JSON.stringify(payload),
          '*',
        );
      } catch { /* noop */ }
    };

    const checkProgress = () => {
      if (hasTrimWindow && currentTime >= trimEnd) {
        if (parsed.kind === 'youtube') {
          post({ event: 'command', func: 'pauseVideo', args: [] });
          post({ event: 'command', func: 'seekTo', args: [trimStart, true] });
        }
        if (parsed.kind === 'vimeo') {
          post({ method: 'pause' });
          post({ method: 'setCurrentTime', value: trimStart });
        }
        reportCompletion();
        return;
      }
      if (duration > 0 && currentTime >= Math.max(1, duration * threshold)) reportCompletion();
    };

    const onMessage = (event: MessageEvent) => {
      if (stopped || completionReportedRef.current) return;
      const msg = parsePlayerMessage(event.data);
      if (!msg) return;

      if (parsed.kind === 'youtube') {
        if (msg.event === 'onStateChange' && Number(msg.info) === 0) {
          reportCompletion();
          return;
        }
        const info = msg.info;
        if (msg.event === 'infoDelivery' && info && typeof info === 'object') {
          if (Number.isFinite(Number(info.duration))) duration = Number(info.duration);
          if (Number.isFinite(Number(info.currentTime))) currentTime = Number(info.currentTime);
          checkProgress();
        }
      }

      if (parsed.kind === 'vimeo') {
        if (msg.event === 'ended') {
          reportCompletion();
          return;
        }
        if (msg.event === 'timeupdate') {
          const data = msg.data ?? {};
          const percent = Number(data.percent ?? 0);
          if (!hasTrimWindow && Number.isFinite(percent) && percent >= threshold) {
            reportCompletion();
            return;
          }
          if (Number.isFinite(Number(data.duration))) duration = Number(data.duration);
          if (Number.isFinite(Number(data.seconds))) currentTime = Number(data.seconds);
          checkProgress();
        }
      }
    };

    window.addEventListener('message', onMessage);
    if (parsed.kind === 'youtube') {
      post({ event: 'listening', id: itemId ?? undefined });
      post({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
      if (trimStart > 0) window.setTimeout(() => post({ event: 'command', func: 'seekTo', args: [trimStart, true] }), 900);
    } else if (parsed.kind === 'vimeo') {
      post({ method: 'addEventListener', value: 'ended' });
      post({ method: 'addEventListener', value: 'timeupdate' });
      if (trimStart > 0) window.setTimeout(() => post({ method: 'setCurrentTime', value: trimStart }), 900);
    }

    const poll = window.setInterval(() => {
      if (completionReportedRef.current) return;
      if (parsed.kind === 'youtube') {
        post({ event: 'command', func: 'getDuration', args: [] });
        post({ event: 'command', func: 'getCurrentTime', args: [] });
      }
    }, 1500);

    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.removeEventListener('message', onMessage);
    };
  }, [active, onCompleted, parsed?.kind, itemId, sourceUrl, completionThreshold, hasTrimWindow, trimEnd, trimStart]);



  useEffect(() => {
    const onFs = () => setIsFs(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Restaura a preferência de tela cheia ao montar (apenas uma vez por instância).
  useEffect(() => {
    if (!restoreFullscreen || restoredRef.current) return;
    if (!active) return; // espera a ativação do player
    if (!readFsPref()) return;
    restoredRef.current = true;
    const id = window.setTimeout(() => {
      const el = wrapRef.current as any;
      if (!el || document.fullscreenElement) return;
      try { el.requestFullscreen?.(); } catch { /* noop */ }
    }, 180);
    return () => window.clearTimeout(id);
  }, [restoreFullscreen, active]);

  const toggleFullscreen = async () => {
    const el = wrapRef.current as any;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
        writeFsPref(true);
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
        writeFsPref(false);
      }
    } catch { /* noop */ }
  };

  if (!parsed) {
    return (
      <div className={cn('relative aspect-video grid place-items-center bg-black/60 text-xs text-muted-foreground rounded-lg p-3 text-center', className)}>
        <div className="space-y-2">
          <p className="text-rose-300">Link não suportado.</p>
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            Abrir externamente <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  const isVertical = parsed.kind === 'tiktok';
  const aspectClass = isVertical ? 'aspect-[9/16]' : 'aspect-video';
  const cover = preferThumb ? (thumbUrl || null) : (thumbUrl || parsed.thumbnailUrl);

  if (parsed.kind === 'magnet') {
    return (
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg bg-black p-5 text-center overflow-hidden mx-auto',
          !isFs && aspectClass,
          className,
        )}
      >
        {thumbUrl ? <img src={thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 blur-sm" /> : null}
        <div className="relative z-10 flex max-w-xs flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-full border border-primary/40 bg-primary/15">
            <Info className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">Link Magnet detectado</p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Este formato não roda direto no navegador. Abra em um aplicativo compatível do dispositivo; se não houver app instalado, instale o Stremio.
            </p>
          </div>
          <div className="grid w-full gap-2">
            <Button asChild size="sm" className="h-9 text-xs">
              <a href={parsed.embedSrc}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir no app
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-9 text-xs">
              <a href="https://www.stremio.com/downloads" target="_blank" rel="noreferrer">
                <Download className="mr-2 h-3.5 w-3.5" /> Instalar Stremio
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const FsButton = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
      aria-label={isFs ? 'Sair da tela cheia' : 'Tela cheia'}
      title={isFs ? 'Sair da tela cheia' : 'Tela cheia'}
      className="absolute bottom-2 right-2 z-10 h-9 w-9 grid place-items-center rounded-full bg-black/70 hover:bg-black/85 text-white ring-1 ring-white/20 backdrop-blur transition active:scale-95"
    >
      {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
    </button>
  );

  if (parsed.kind === 'direct') {
    const ext = getDirectVideoExt(parsed.embedSrc);
    const browserSupport = getBrowserVideoSupport(ext);

    if (browserSupport === 'handoff' || directPlaybackFailed) {
      // install URL é obtido on-demand no fallback discreto abaixo
      const openInVlc = () => {
        const url = parsed.embedSrc;
        const platform = getVlcPlatform();
        let opened = false;
        let cleaned = false;

        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          window.removeEventListener('blur', markOpened);
          window.removeEventListener('pagehide', markOpened);
          document.removeEventListener('visibilitychange', markVisibilityOpened);
        };
        const markOpened = () => {
          opened = true;
          writeVlcDetected();
          setVlcKnownInstalled(true);
          setVlcLaunchState('opened');
          window.setTimeout(cleanup, 900);
        };
        const markVisibilityOpened = () => {
          if (document.hidden) markOpened();
        };

        setVlcLaunchState('opening');
        window.addEventListener('blur', markOpened);
        window.addEventListener('pagehide', markOpened);
        document.addEventListener('visibilitychange', markVisibilityOpened);

        // ---------- Desktop: vlc:// direto + fallback .m3u8 --------------
        if (platform === 'desktop') {
          launchVlcDesktop(url, 'OCULTO PLAY', () => {
            writeVlcDetected();
            setVlcKnownInstalled(true);
            setVlcLaunchState('opened');
            cleanup();
          });
          // Se em 1.6s ainda não detectamos handoff, o .m3u8 foi baixado —
          // marcamos "opened" mesmo assim para não confundir o usuário.
          window.setTimeout(() => {
            if (opened) return;
            setVlcLaunchState('opened');
            cleanup();
          }, 1600);
          return;
        }


        // ---------- Mobile: intents / custom schemes ---------------------
        const { uris } = buildVlcHandoffUrls(url);
        try {
          launchExternalAppUri(uris[0], platform, 'primary');
          if (platform === 'android' && uris[1]) {
            window.setTimeout(() => {
              if (!opened && !document.hidden) launchExternalAppUri(uris[1], platform, 'fallback');
            }, 900);
          }
        } catch {
          cleanup();
          setVlcLaunchState('fallback');
          return;
        }

        window.setTimeout(() => {
          cleanup();
          if (!opened && !document.hidden) setVlcLaunchState('fallback');
        }, platform === 'android' ? 4200 : 3200);
      };

      return (
        <div
          className={cn(
            'relative flex flex-col items-center justify-center rounded-lg bg-black overflow-hidden mx-auto',
            !isFs && aspectClass,
            className,
          )}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain bg-black"
              loading="lazy"
              decoding="async"
            />
          ) : null}

          {/* Tag VLC — indica que o filme precisa do VLC */}
          <div className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 rounded-md bg-orange-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg ring-1 ring-black/40">
            VLC
          </div>

          {/* Overlay sutil + play central */}
          <button
            type="button"
            onClick={openInVlc}
            aria-label="Abrir no VLC"
            className="absolute inset-0 z-10 grid place-items-center bg-gradient-to-t from-black/70 via-black/10 to-transparent transition active:scale-[0.99]"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-orange-500/95 text-white shadow-2xl ring-2 ring-white/25 hover:bg-orange-600">
              <PlayCircle className="h-9 w-9" />
            </span>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/15">
              {vlcLaunchState === 'opening' ? 'Abrindo VLC…' : 'Toque para abrir no VLC'}
            </span>
          </button>

          {/* Fallback discreto — só aparece se detectarmos que o VLC não abriu */}
          {vlcLaunchState === 'fallback' && !vlcKnownInstalled ? (
            <a
              href={getVlcInstallUrl()}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-2 right-2 z-20 inline-flex items-center gap-1 rounded-md bg-black/80 px-2 py-1 text-[10px] font-semibold text-orange-200 ring-1 ring-orange-500/40"
            >
              <Download className="h-3 w-3" /> Instalar VLC
            </a>
          ) : null}
        </div>
      );
    }



    return (
      <div
        ref={wrapRef}
        className={cn(
          'relative w-full bg-black rounded-lg overflow-hidden mx-auto',
          !isFs && aspectClass,
          !isFs && 'max-w-full',
          className,
        )}
      >
        <ModernVideoPlayer
          src={parsed.embedSrc}
          poster={thumbUrl ?? undefined}
          ext={ext}
          autoPlay={autoPlay}
          muted={false}
          videoRefCallback={(el) => { videoRef.current = el; }}
          onReady={(v) => {
            // Se o browser bloquear o autoplay com som, cai para muted e
            // tenta novamente — mantendo a reprodução iniciada. O usuário
            // reativa o som pelos controles nativos (não fica silenciado
            // "escondido"). Sem esse fallback, autoplay pode falhar em
            // páginas sem gesto direto (deep-link / suggestions).
            if (!autoPlay) return;
            const tryPlay = async () => {
              try { await v.play(); } catch {
                try { v.muted = true; await v.play(); } catch { /* noop */ }
              }
            };
            tryPlay();
          }}
          onLoadedMetadata={(v) => {
            const saved = hasTrimWindow ? 0 : readSavedTime(itemId);
            const startAt = trimStart > 0 ? trimStart : saved;
            if (startAt > 0 && startAt < (v.duration || Infinity) - 0.25) {
              try { v.currentTime = startAt; } catch { /* noop */ }
            }
          }}
          onTimeUpdate={(v) => {
            if (hasTrimWindow && v.currentTime >= trimEnd) {
              try { v.pause(); v.currentTime = trimStart || 0; } catch { /* noop */ }
              reportCompletion();
              return;
            }
            if (!itemId || hasTrimWindow) return;
            const now = performance.now();
            const last = (v as any)._ltSave || 0;
            if (now - last < 1000) return;
            (v as any)._ltSave = now;
            writeSavedTime(itemId, v.currentTime);
            if (onCompleted && Number.isFinite(v.duration) && v.duration > 0) {
              const thresholdAt = Math.max(1, v.duration * Math.min(0.99, Math.max(0.5, completionThreshold)));
              if (v.currentTime >= thresholdAt) reportCompletion();
            }
          }}
          onEnded={() => { if (itemId && !hasTrimWindow) clearSavedTime(itemId); reportCompletion(); }}
          onError={() => setDirectPlaybackFailed(true)}
        />
        {FsButton}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative w-full bg-black rounded-lg overflow-hidden mx-auto',
        !isFs && aspectClass,
        !isFs && (isVertical ? 'max-w-[320px]' : 'max-w-full'),
        className,
      )}
    >
      {!active && cover ? (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="group absolute inset-0 w-full h-full bg-black"
          aria-label="Reproduzir vídeo"
        >
          <img src={cover} alt="" className={cn('absolute inset-0 h-full w-full', coverFit === 'contain' ? 'object-contain bg-black' : 'object-cover')} />
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors grid place-items-center">
            <PlayCircle className="h-14 w-14 text-white drop-shadow-lg" />
          </div>
        </button>
      ) : (
        <iframe
          ref={iframeRef}
          src={appendEmbedTrimParams(appendEmbedApiParams(autoPlay ? appendAutoplayParam(parsed.embedSrc) : parsed.embedSrc, parsed.kind), parsed.kind, trimStart, trimEnd)}
          className="absolute inset-0 w-full h-full bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          title="Vídeo embutido"
        />
      )}
      {FsButton}
    </div>
  );
}
