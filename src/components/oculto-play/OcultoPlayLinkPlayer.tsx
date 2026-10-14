/**
 * OcultoPlayLinkPlayer — renderiza um item do Play do tipo `link`. Detecta a
 * plataforma a partir de `source_url` (ou `media_url` como fallback) e mostra
 * o player oficial (YouTube/Vimeo/TikTok/Drive…) ou o OcultoMoviePlayer para
 * arquivos e streams diretos (.mp4/.webm/.mkv/.m3u8/.mpd…).
 *
 * A opção "abrir no VLC" foi removida: nunca funcionou de forma confiável nos
 * navegadores. Formatos que nenhum navegador toca (AVI, WMV, FLV…) mostram uma
 * tela clara com "Abrir link".
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { ExternalLink, PlayCircle, Maximize, Minimize, Download, Info, AlertTriangle } from 'lucide-react';
import { parseEmbeddedVideo } from '@/lib/embeddedVideoUrl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { OcultoMoviePlayer, BROWSER_UNSUPPORTED_EXT } from '@/components/oculto-play/OcultoMoviePlayer';

const FS_PREF_KEY = 'oculto:play:link:fs';
const TIME_PREF_PREFIX = 'oculto:play:link:t:';
const TIME_MIN_SAVE = 3; // segundos — não salva os primeiros 3s
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

function getDirectVideoExt(rawUrl: string): string {
  try { return (new URL(rawUrl).pathname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase(); }
  catch { return ''; }
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
  /** Título mostrado no topo do player em tela cheia. */
  title?: string | null;
}


function appendAutoplayParam(src: string): string {
  try {
    const u = new URL(src);
    u.searchParams.set('autoplay', '1');
    if (!u.searchParams.has('muted')) u.searchParams.set('muted', '1');
    // Forçar preload e buffering agressivo
    u.searchParams.set('preload', 'auto');
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
  title = null,
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

  // Links do Stremio / torrent / computador de quem postou: não tocam para
  // ninguém além do autor. Aviso claro em vez de falhar sem explicação.
  if (parsed.kind === 'magnet' || parsed.kind === 'local') {
    const isMagnet = parsed.kind === 'magnet';
    if (lazyClickToPlay && !autoPlay) {
      // Card na lista: capa + etiqueta compacta (o aviso completo aparece ao abrir).
      return (
        <div className={cn('relative overflow-hidden rounded-lg bg-black mx-auto', aspectClass, className)}>
          {thumbUrl ? <img src={thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" loading="lazy" decoding="async" /> : null}
          <span className="absolute bottom-1.5 left-1.5 right-1.5 z-10 rounded-md bg-amber-500/95 px-2 py-1 text-center text-[10px] font-bold leading-tight text-black">
            {isMagnet ? 'Link torrent — não toca para outros usuários' : 'Link do Stremio/PC — não toca para outros usuários'}
          </span>
        </div>
      );
    }
    return (
      <div className={cn('relative flex items-center justify-center overflow-hidden rounded-lg bg-black p-5 text-center mx-auto', aspectClass, className)}>
        {thumbUrl ? <img src={thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" loading="lazy" decoding="async" /> : null}
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-3 text-white">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/50">
            <Info className="h-6 w-6 text-amber-300" />
          </div>
          <p className="text-sm font-bold">Este filme não está disponível para assistir aqui</p>
          <p className="text-xs leading-relaxed text-white/75">
            {isMagnet
              ? 'O link publicado é um torrent (magnet). Navegadores não reproduzem torrents, então ele não toca para outros usuários.'
              : 'O link publicado aponta para o computador de quem postou (por exemplo, o Stremio aberto naquele PC). Ele só funciona lá e não toca para outros usuários.'}
          </p>
          <p className="text-[11px] text-white/55">Quem publicou pode trocar por um vídeo enviado ao Oculto ou um link MP4, HLS (.m3u8), YouTube, Vimeo ou Internet Archive.</p>
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

    if (BROWSER_UNSUPPORTED_EXT.has(ext)) {
      return (
        <div className={cn('relative flex items-center justify-center overflow-hidden rounded-lg bg-black p-5 text-center mx-auto', aspectClass, className)}>
          {thumbUrl ? <img src={thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" loading="lazy" decoding="async" /> : null}
          <div className="relative z-10 max-w-sm space-y-3 text-white">
            <AlertTriangle className="mx-auto h-9 w-9 text-amber-400" />
            <p className="text-sm font-bold">Formato .{ext.toUpperCase()} não toca no navegador</p>
            <p className="text-xs text-white/70">Para assistir aqui, o filme precisa estar em MP4 (H.264 + AAC), WebM ou HLS (.m3u8). Você ainda pode abrir o link original.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <a href={parsed.embedSrc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-black">
                <ExternalLink className="h-4 w-4" /> Abrir link
              </a>
              <a href={parsed.embedSrc} download className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
                <Download className="h-4 w-4" /> Baixar
              </a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'relative w-full bg-black rounded-lg overflow-hidden mx-auto',
          aspectClass,
          'max-w-full',
          className,
        )}
      >
        <OcultoMoviePlayer
          src={parsed.embedSrc}
          poster={thumbUrl ?? undefined}
          ext={ext}
          title={title}
          itemId={itemId}
          originalUrl={parsed.originalUrl}
          autoPlay={autoPlay}
          videoRefCallback={(el) => { videoRef.current = el; }}
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
        />
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
