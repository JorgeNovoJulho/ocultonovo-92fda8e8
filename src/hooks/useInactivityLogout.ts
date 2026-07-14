import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { isAnyOcultoPlayMediaPlaying } from '@/lib/ocultoPlayActivity';

/**
 * Timeouts por cenário:
 *  - NAV: navegação normal (sem mídia ativa)            → 5 min
 *  - MEDIA: enquanto houver vídeo/áudio reproduzindo    → 30 min (re-check)
 *  - GRACE: período de carência após mídia parar        → 3 min
 *  - PIP/FS: PiP ou fullscreen ativo                    → 60 min (re-check)
 */
const TIMEOUT_NAV_MS = 5 * 60 * 1000;
const TIMEOUT_MEDIA_MS = 30 * 60 * 1000;
const TIMEOUT_PIP_FS_MS = 60 * 60 * 1000;
const GRACE_AFTER_MEDIA_MS = 3 * 60 * 1000;

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'touchmove',
  'scroll',
  'click',
  'wheel',
];

// ===== Embed player tracking =====
// Players com sinal confirmado de "playing" via postMessage / API events.
const playingEmbedFrames = new Set<Window>();
const embedLastEvent = new Map<Window, number>();
const EMBED_STALE_MS = 12_000; // sem sinal por 12s → considera parado

// Heurística: iframes "ativos" sem API confiável (TikTok, Hulu, JW, Brightcove,
// self-hosted HTML5 em iframe). Marcados como tocando quando o usuário interage
// com eles (focus/click) e a aba está visível.
const heuristicActiveFrames = new Set<HTMLIFrameElement>();
const heuristicLastInteraction = new Map<HTMLIFrameElement, number>();
const HEURISTIC_STALE_MS = 90_000; // 90s sem nova interação → considera parado

function isKnownApiEmbed(src: string): 'youtube' | 'vimeo' | 'wistia' | null {
  if (/youtube\.com|youtu\.be/.test(src)) return 'youtube';
  if (/vimeo\.com|player\.vimeo/.test(src)) return 'vimeo';
  if (/wistia\.(net|com)|fast\.wistia/.test(src)) return 'wistia';
  return null;
}

function isHeuristicEmbed(src: string): boolean {
  return /tiktok\.com\/embed|hulu\.com|jwplayer|jwplatform|brightcove|kaltura|dailymotion|twitch\.tv|streamable|loom\.com|videoask|cloudflarestream|iframe\.mediadelivery|bunnycdn|mux\.com|videojs|hls\.js|\.m3u8|\.mp4/.test(
    src,
  );
}

function pingKnownEmbeds() {
  try {
    const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe');
    for (const f of Array.from(iframes)) {
      const src = (f.src || '').toLowerCase();
      if (!src || !f.contentWindow) continue;
      const rect = f.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;

      const kind = isKnownApiEmbed(src);
      try {
        if (kind === 'youtube') {
          f.contentWindow.postMessage(
            JSON.stringify({ event: 'listening', id: 'lov-inactivity' }),
            '*',
          );
          f.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'getPlayerState', args: [] }),
            '*',
          );
        } else if (kind === 'vimeo') {
          f.contentWindow.postMessage(JSON.stringify({ method: 'addEventListener', value: 'play' }), '*');
          f.contentWindow.postMessage(JSON.stringify({ method: 'addEventListener', value: 'pause' }), '*');
          f.contentWindow.postMessage(JSON.stringify({ method: 'addEventListener', value: 'ended' }), '*');
          f.contentWindow.postMessage(JSON.stringify({ method: 'getPaused' }), '*');
        } else if (kind === 'wistia') {
          // Wistia inline embeds usam window._wq na página host. Em iframes embed,
          // tentamos protocolo postMessage simples e marcamos como heurístico.
          f.contentWindow.postMessage({ wistia: { method: 'subscribe', event: 'play' } }, '*');
          f.contentWindow.postMessage({ wistia: { method: 'subscribe', event: 'pause' } }, '*');
          heuristicActiveFrames.add(f);
        } else if (isHeuristicEmbed(src)) {
          // Iframes sem API confiável: usamos foco como sinal.
          if (document.activeElement === f && !document.hidden) {
            heuristicActiveFrames.add(f);
            heuristicLastInteraction.set(f, Date.now());
          }
        }
      } catch {}
    }
  } catch {}
}

let embedListenerInstalled = false;
function installEmbedListener() {
  if (embedListenerInstalled || typeof window === 'undefined') return;
  embedListenerInstalled = true;

  // Interações com iframes (click/focus) marcam como heurístico ativo.
  const markFromIframe = () => {
    try {
      const ae = document.activeElement;
      if (ae && ae.tagName === 'IFRAME') {
        const f = ae as HTMLIFrameElement;
        const src = (f.src || '').toLowerCase();
        if (isHeuristicEmbed(src) || isKnownApiEmbed(src) === 'wistia') {
          heuristicActiveFrames.add(f);
          heuristicLastInteraction.set(f, Date.now());
        }
      }
    } catch {}
  };
  window.addEventListener('blur', markFromIframe);
  window.addEventListener('focus', () => {
    // Voltou ao topo → limpa heurísticos sem interação recente
    const now = Date.now();
    for (const f of Array.from(heuristicActiveFrames)) {
      const last = heuristicLastInteraction.get(f) ?? 0;
      if (now - last > HEURISTIC_STALE_MS) {
        heuristicActiveFrames.delete(f);
        heuristicLastInteraction.delete(f);
      }
    }
  });

  window.addEventListener('message', (ev: MessageEvent) => {
    const src = ev.source as Window | null;
    if (!src) return;
    let data: any = ev.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* keep raw */ }
    }
    if (!data) return;

    // ---- YouTube IFrame API ----
    if (typeof data === 'object' && (data.event === 'onStateChange' || data.event === 'infoDelivery')) {
      const state = data.info?.playerState ?? data.info;
      if (state === 1 || state === 3) {
        playingEmbedFrames.add(src);
        embedLastEvent.set(src, Date.now());
      } else if (state === 0 || state === 2 || state === -1) {
        playingEmbedFrames.delete(src);
        embedLastEvent.set(src, Date.now());
      }
      return;
    }

    // ---- Vimeo Player API ----
    if (typeof data === 'object' && data.event === 'play') {
      playingEmbedFrames.add(src);
      embedLastEvent.set(src, Date.now());
      return;
    }
    if (typeof data === 'object' && (data.event === 'pause' || data.event === 'ended')) {
      playingEmbedFrames.delete(src);
      embedLastEvent.set(src, Date.now());
      return;
    }
    if (typeof data === 'object' && data.method === 'getPaused' && typeof data.value === 'boolean') {
      if (data.value === false) playingEmbedFrames.add(src);
      else playingEmbedFrames.delete(src);
      embedLastEvent.set(src, Date.now());
    }

    // ---- Wistia / genéricos com payload {event:'play'|'pause'|'ended'} ----
    if (typeof data === 'object' && data.wistia) {
      const evName = data.wistia.event;
      if (evName === 'play') {
        playingEmbedFrames.add(src);
        embedLastEvent.set(src, Date.now());
      } else if (evName === 'pause' || evName === 'end' || evName === 'ended') {
        playingEmbedFrames.delete(src);
        embedLastEvent.set(src, Date.now());
      }
    }
  });
}

function anyConfirmedEmbedPlaying(): boolean {
  const now = Date.now();
  let any = false;
  for (const w of Array.from(playingEmbedFrames)) {
    const last = embedLastEvent.get(w) ?? 0;
    if (now - last > EMBED_STALE_MS) {
      playingEmbedFrames.delete(w);
      continue;
    }
    any = true;
  }
  return any;
}

function anyHeuristicEmbedActive(): boolean {
  const now = Date.now();
  let any = false;
  for (const f of Array.from(heuristicActiveFrames)) {
    if (!f.isConnected) {
      heuristicActiveFrames.delete(f);
      heuristicLastInteraction.delete(f);
      continue;
    }
    const last = heuristicLastInteraction.get(f) ?? 0;
    if (now - last > HEURISTIC_STALE_MS) {
      heuristicActiveFrames.delete(f);
      heuristicLastInteraction.delete(f);
      continue;
    }
    const rect = f.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) continue;
    any = true;
  }
  return any;
}

// ===== Picture-in-Picture / Fullscreen =====
function isPictureInPictureActive(): boolean {
  try {
    if ((document as any).pictureInPictureElement) return true;
    const videos = document.querySelectorAll<HTMLVideoElement>('video');
    for (const v of Array.from(videos)) {
      // Safari iOS
      if ((v as any).webkitPresentationMode === 'picture-in-picture') return true;
      if ((v as any).webkitPresentationMode === 'fullscreen') return true;
    }
  } catch {}
  return false;
}

function isFullscreenActive(): boolean {
  try {
    const d: any = document;
    if (d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement) {
      return true;
    }
  } catch {}
  return false;
}

/**
 * Desloga automaticamente o usuário após inatividade.
 * - 5 min em navegação normal
 * - 30 min durante reprodução de vídeo/áudio (apenas re-agenda)
 * - 60 min enquanto PiP/Fullscreen estiver ativo
 * - 3 min de carência após a mídia terminar
 *
 * Detecta players embed via postMessage (YouTube, Vimeo, Wistia) e heurística
 * por foco/interação (TikTok, Hulu, JW, Brightcove, HLS/MP4 em iframe self-hosted),
 * além de PiP e fullscreen — que mantêm a sessão mesmo quando a aba perde foco
 * ou o DOM principal não tem mídia visível.
 */
export function useInactivityLogout() {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMediaActiveAtRef = useRef<number>(0);
  const embedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAnyMediaPlaying = useCallback((): boolean => {
    if (isAnyOcultoPlayMediaPlaying()) return true;
    if (isPictureInPictureActive() || isFullscreenActive()) return true;
    try {
      const mediaEls = document.querySelectorAll<HTMLMediaElement>('video, audio');
      for (const el of Array.from(mediaEls)) {
        if (!el.paused && !el.ended && el.currentTime > 0 && el.readyState > 2) {
          return true;
        }
      }
    } catch {}
    if (anyConfirmedEmbedPlaying()) return true;
    if (anyHeuristicEmbedActive()) return true;
    return false;
  }, []);

  const isImmersiveActive = useCallback((): boolean => {
    return isPictureInPictureActive() || isFullscreenActive();
  }, []);

  const scheduleNext = useCallback((fn: () => void, ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, ms);
  }, []);

  const tryLogout = useCallback(async () => {
    const now = Date.now();
    if (isImmersiveActive()) {
      lastMediaActiveAtRef.current = now;
      scheduleNext(tryLogout, TIMEOUT_PIP_FS_MS);
      return;
    }
    if (isAnyMediaPlaying()) {
      lastMediaActiveAtRef.current = now;
      scheduleNext(tryLogout, TIMEOUT_MEDIA_MS);
      return;
    }
    const sinceMedia = now - lastMediaActiveAtRef.current;
    if (lastMediaActiveAtRef.current > 0 && sinceMedia < GRACE_AFTER_MEDIA_MS) {
      scheduleNext(tryLogout, GRACE_AFTER_MEDIA_MS - sinceMedia);
      return;
    }
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/login', { replace: true });
  }, [navigate, scheduleNext, isAnyMediaPlaying, isImmersiveActive]);

  const resetTimer = useCallback(() => {
    if (isImmersiveActive()) {
      lastMediaActiveAtRef.current = Date.now();
      scheduleNext(tryLogout, TIMEOUT_PIP_FS_MS);
    } else if (isAnyMediaPlaying()) {
      lastMediaActiveAtRef.current = Date.now();
      scheduleNext(tryLogout, TIMEOUT_MEDIA_MS);
    } else {
      scheduleNext(tryLogout, TIMEOUT_NAV_MS);
    }
  }, [scheduleNext, tryLogout, isAnyMediaPlaying, isImmersiveActive]);

  useEffect(() => {
    installEmbedListener();
    resetTimer();

    const opts: AddEventListenerOptions = { passive: true };
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, opts),
    );

    // PiP / Fullscreen → reagenda imediatamente para o timeout estendido
    const onImmersiveChange = () => resetTimer();
    document.addEventListener('fullscreenchange', onImmersiveChange);
    document.addEventListener('webkitfullscreenchange', onImmersiveChange as any);
    document.addEventListener('enterpictureinpicture', onImmersiveChange, true);
    document.addEventListener('leavepictureinpicture', onImmersiveChange, true);
    // Eventos de mídia nativa
    document.addEventListener('play', onImmersiveChange, true);
    document.addEventListener('pause', onImmersiveChange, true);
    document.addEventListener('ended', onImmersiveChange, true);

    pingKnownEmbeds();
    embedPollRef.current = setInterval(() => {
      pingKnownEmbeds();
      // Em PiP/FS, garante que o timer permaneça estendido sem depender de input do usuário.
      if (isImmersiveActive() || anyConfirmedEmbedPlaying()) {
        lastMediaActiveAtRef.current = Date.now();
      }
    }, 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (embedPollRef.current) clearInterval(embedPollRef.current);
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, resetTimer),
      );
      document.removeEventListener('fullscreenchange', onImmersiveChange);
      document.removeEventListener('webkitfullscreenchange', onImmersiveChange as any);
      document.removeEventListener('enterpictureinpicture', onImmersiveChange, true);
      document.removeEventListener('leavepictureinpicture', onImmersiveChange, true);
      document.removeEventListener('play', onImmersiveChange, true);
      document.removeEventListener('pause', onImmersiveChange, true);
      document.removeEventListener('ended', onImmersiveChange, true);
    };
  }, [resetTimer, isImmersiveActive]);
}
