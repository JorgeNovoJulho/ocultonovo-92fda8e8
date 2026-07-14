/**
 * OcultoPlayVideoItem — player com proporção natural do vídeo, máscara
 * de URL via blob (dificulta o download direto), e bloqueios anti-download:
 *  - controlsList="nodownload noremoteplayback nofullscreen"
 *  - disablePictureInPicture / disableRemotePlayback
 *  - context menu desabilitado
 *  - drag desabilitado
 *  - download via fetch->blob com query "máscara" aleatória; reposiciona o
 *    src como `blob:` para que a URL real não fique exposta no DOM/devtools.
 *
 * Outro de marca OCULTO continua nos últimos 3 segundos.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Play, Volume2, VolumeX, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import outroAsset from '@/assets/oculto-play-outro.png.asset.json';
import { videoManager } from '@/lib/videoManager';
import { markOcultoPlayMediaPlaying, markOcultoPlayMediaStopped } from '@/lib/ocultoPlayActivity';
import { pauseAllAudios } from '@/lib/ocultoPlayAudioBus';
import { setMediaSessionMeta } from '@/lib/ocultoPlayAudioSession';


interface Props {
  src: string;
  poster?: string | null;
  preloadMeta?: boolean;
  className?: string;
  variant?: 'inline' | 'tiktok';
  disableOutro?: boolean;
  trimStart?: number | null;
  trimEnd?: number | null;
  /** Limite (MB) para mascarar via blob. Acima disso, mantém URL com query aleatória. */
  blobMaskMaxMB?: number;
  /** Disparado ao terminar o vídeo — usado para auto-advance no feed TikTok. */
  onEnded?: () => void;
  /** Autoplay quando visível na viewport (variant=tiktok). */
  autoplayOnVisible?: boolean;
  /** Controle externo de mute usado pelo scroller TikTok. */
  forceMuted?: boolean;
  /** Disparado UMA ÚNICA VEZ no primeiro play efetivo do vídeo. Usado para
   *  registrar visualização real (só conta quando o vídeo realmente toca). */
  onFirstPlay?: () => void;
  /** Modo Econômico — reduz preload (metadata em vez de auto), prioridade
   *  de fetch baixa e adiciona hint `?q=low` no URL para CDNs que respeitem. */
  economic?: boolean;
  /** Mantém o próximo vídeo aquecido com um único preload real e baixa prioridade.
   *  Usado no feed vertical para evitar que o download comece só depois do swipe. */
  preloadAhead?: boolean;
  /** Perfil leve automático para celular: não muda o toggle ECO, só pede uma
   *  variante menor ao CDN quando disponível para reduzir engasgos no decode. */
  mobileOptimized?: boolean;
  /** Qualidade adaptativa do feed vertical; anti-travamento força 360p/24fps. */
  playbackQuality?: 'normal' | 'mobile' | 'low' | 'ultraLow';
  /** Sinaliza ao scroller que houve stress de reprodução para ativar anti-trava. */
  onPlaybackStress?: () => void;
}

const OUTRO_DURATION = 2;
const DEFAULT_RATIO = 16 / 9;

function setBooleanState(setter: (value: boolean) => void, current: MutableRefObject<boolean>, next: boolean) {
  if (current.current === next) return;
  current.current = next;
  setter(next);
}

export function OcultoPlayVideoItem({
  src,
  poster,
  preloadMeta = false,
  className,
  variant = 'inline',
  disableOutro = false,
  trimStart,
  trimEnd,
  blobMaskMaxMB = 25,
  onEnded,
  autoplayOnVisible,
  forceMuted,
  onFirstPlay,
  economic = false,
  preloadAhead = false,
  mobileOptimized = false,
  playbackQuality = 'normal',
  onPlaybackStress,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const userUnmutedRef = useRef(false);
  const playerId = useId();
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [muted, setMuted] = useState(() => variant !== 'tiktok');
  const [volume, setVolume] = useState(1);
  const startedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  // Spinner só aparece se o loading persistir > 320ms. Evita flash em
  // arranques rápidos e elimina "spinner fantasma" no mobile.
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimerRef = useRef<number | null>(null);
  const [error, setError] = useState(false);
  const errorRef = useRef(false);
  const [showOutro, setShowOutro] = useState(false);
  const showOutroRef = useRef(false);
  const [ratio, setRatio] = useState<number>(DEFAULT_RATIO);
  const [maskedSrc, setMaskedSrc] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const outroDoneRef = useRef(false);
  const outroTimerRef = useRef<number | null>(null);
  const tiktokAuto = autoplayOnVisible ?? variant === 'tiktok';
  const [manualLoad, setManualLoad] = useState(false);
  const shouldAttachSrc = variant !== 'tiktok' || tiktokAuto || preloadMeta || preloadAhead || manualLoad;
  const playbackTokenRef = useRef(0);
  const firstFrameReadyRef = useRef(false);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  // Quando o player inline entra na viewport, aquecemos o buffer (preload=auto +
  // load) para que o tap dispare play() instantâneo no mobile, sem aquela
  // espera de 1-3s para baixar os primeiros segmentos.
  const [warmBuffer, setWarmBuffer] = useState(false);

  const markFirstFrameReady = useCallback(() => {
    if (firstFrameReadyRef.current) return;
    firstFrameReadyRef.current = true;
    setFirstFrameReady(true);
  }, []);

  useEffect(() => { showOutroRef.current = showOutro; }, [showOutro]);

  // Sincroniza showSpinner ao loading, mas com debounce de 320ms para abrir
  // e fechamento imediato. Limpa timer ao desmontar.
  useEffect(() => {
    if (loading) {
      if (spinnerTimerRef.current) window.clearTimeout(spinnerTimerRef.current);
      spinnerTimerRef.current = window.setTimeout(() => setShowSpinner(true), 320);
    } else {
      if (spinnerTimerRef.current) {
        window.clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
      setShowSpinner(false);
    }
    return () => {
      if (spinnerTimerRef.current) {
        window.clearTimeout(spinnerTimerRef.current);
        spinnerTimerRef.current = null;
      }
    };
  }, [loading]);


  // Quando este vídeo começa a tocar fora do feed TikTok, registra no manager
  // global. No TikTok o scroller já garante 1 player; envolver no manager
  // global permitia que áudio/preview externo pausasse o vídeo ativo no mobile.
  useEffect(() => {
    if (!playing || variant === 'tiktok') return;
    pauseAllAudios();
    videoManager.activate(playerId, () => {
      const v = videoRef.current;
      if (v && !v.paused) { try { v.pause(); } catch { /* noop */ } }
      // Não seta estado aqui: o evento onPause do próprio <video> sincroniza.
      // Atualizar React a partir do manager global gerava renders cruzados.
    });
    return () => { videoManager.deactivate(playerId); };
  }, [playing, playerId, variant]);


  // Usa a URL original para aproveitar cache/range requests do storage/CDN.
  // Query aleatória fazia cada abertura baixar de novo e travava celulares fracos.
  // Em celular/dispositivo lento, pede uma variante menor ao CDN quando
  // disponível para reduzir trabalho de rede/decoder. O anti-trava força 360p.
  const computedPlaybackSrc = useMemo(() => {
    // O storage atual entrega um único MP4. Parâmetros fake de qualidade
    // (?q=low&h=360) não geram variante menor; só criam cache miss e forçam
    // novo download. Mantemos URL estável para preservar Range/cache do browser.
    void economic;
    void mobileOptimized;
    void playbackQuality;
    return src;
  }, [src, economic, mobileOptimized, playbackQuality]);

  // MP4 não troca qualidade de forma suave como HLS. Se a qualidade adaptativa
  // muda enquanto o vídeo ativo toca, o browser reinicia o download/decoder e
  // isso vira exatamente o "travamento" sentido no mobile. No TikTok, travamos
  // a URL do slide atual e aplicamos a nova qualidade só no próximo mount/slide.
  const [lockedTiktokSrc, setLockedTiktokSrc] = useState(computedPlaybackSrc);
  useEffect(() => {
    if (variant !== 'tiktok') return;
    setLockedTiktokSrc(computedPlaybackSrc);
    // Intencional: não reagir a economic/mobileOptimized/playbackQuality no
    // mesmo `src`, para não recarregar o vídeo ativo no meio da reprodução.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, variant]);

  const initialMaskedSrc = variant === 'tiktok' ? lockedTiktokSrc : computedPlaybackSrc;

  const effectiveSrc = maskedSrc ?? initialMaskedSrc;

  useEffect(() => {
    firstFrameReadyRef.current = false;
    setFirstFrameReady(false);
    if (outroTimerRef.current) {
      window.clearTimeout(outroTimerRef.current);
      outroTimerRef.current = null;
    }
    setShowOutro(false);
    setBooleanState(setError, errorRef, false);
    setBooleanState(setLoading, loadingRef, false);
  }, [effectiveSrc]);

  useEffect(() => {
    if (typeof forceMuted !== 'boolean') return;
    const v = videoRef.current;
    if (v && v.muted !== forceMuted) v.muted = forceMuted;
    setMuted(forceMuted);
    if (!forceMuted) userUnmutedRef.current = true;
  }, [forceMuted]);

  // Limpa blob ao trocar src/desmontar
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src]);

  // Kill switch no desmonte para QUALQUER variant: pause + remoção de src +
  // load() liberam o decoder/cancelam download em andamento. Sem isso, o vídeo
  // podia continuar baixando após o usuário fechar o player ou sair da página
  // /oculto-play e até retomar áudio em outras telas no mobile.
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (!v) return;
      try { v.pause(); } catch { /* noop */ }
      try { v.muted = true; } catch { /* noop */ }
      try { v.autoplay = false; } catch { /* noop */ }
      try {
        v.removeAttribute('src');
        while (v.firstChild) v.removeChild(v.firstChild);
        v.load();
      } catch { /* noop */ }
      try { markOcultoPlayMediaStopped(`video:${playerId}`); } catch { /* noop */ }
    };
  }, [playerId]);


  // Pausa fora da viewport · autoplay (silencioso) ao entrar (estilo TikTok)
  // No variant=tiktok o modal já garante que o vídeo está em tela cheia, então
  // pulamos o IntersectionObserver para evitar uma corrida com o autoplay rAF
  // abaixo (estava causando re-load e tela "travada" em mobile).
  useEffect(() => {
    if (variant === 'tiktok') return;
    const wrap = wrapRef.current;
    const v = videoRef.current;
    if (!wrap || !v) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // Pré-aquece o buffer assim que o player aparece (mesmo parcialmente),
          // garantindo play instantâneo no tap em mobile.
          if (e.isIntersecting && e.intersectionRatio > 0.05) {
            if (!warmBuffer) setWarmBuffer(true);
            try {
              if (v.preload !== 'auto') v.preload = 'auto';
              if (v.readyState < 2) v.load();
            } catch { /* noop */ }
          }
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            if (tiktokAuto && v.paused) {
              if (!userUnmutedRef.current) {
                v.muted = true;
                setMuted(true);
              }
              v.play().then(() => {
                setBooleanState(setPlaying, playingRef, true);
                startedRef.current = true;
              }).catch(() => { /* gesto necessário */ });
            }
          } else if (!e.isIntersecting) {
            v.pause();
            setBooleanState(setPlaying, playingRef, false);
          }
        }
      },
      { threshold: [0, 0.05, 0.6, 1] },
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, [tiktokAuto, variant, warmBuffer]);

  // Autoplay inline: o TikTok é orquestrado pelo SyncPlayback do scroller.
  // Ter dois pontos chamando play()/pause() no mesmo frame causava corrida,
  // queda de buffer e piscadas em mobile.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !tiktokAuto || variant === 'tiktok') return;
    let cancelled = false;
    const token = ++playbackTokenRef.current;

    const tryPlay = () => {
      if (cancelled || !videoRef.current || playbackTokenRef.current !== token) return;
      try {
        if (!userUnmutedRef.current) {
          const defaultMuted = true;
          v.muted = defaultMuted;
          setMuted(defaultMuted);
        }
        const ts = typeof trimStart === 'number' && trimStart > 0 ? trimStart : 0;
        if (ts > 0 && (v.currentTime < ts - 0.1 || v.currentTime >= (trimEnd ?? Number.POSITIVE_INFINITY))) {
          try { v.currentTime = ts; } catch { /* noop */ }
        }
        const p = v.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (cancelled || playbackTokenRef.current !== token) return;
            setBooleanState(setPlaying, playingRef, true);
            startedRef.current = true;
            setBooleanState(setError, errorRef, false);
            setBooleanState(setLoading, loadingRef, false);
          }).catch(() => {
            // Autoplay bloqueado por gesto: aguarda o usuário tocar — sem retry agressivo.
            if (!cancelled && playbackTokenRef.current === token) setBooleanState(setLoading, loadingRef, false);
          });
        }
      } catch {
        setBooleanState(setLoading, loadingRef, false);
      }
    };

    if (v.readyState < 2) setBooleanState(setLoading, loadingRef, true);
    const onReadyEnough = () => {
      setBooleanState(setLoading, loadingRef, false);
      if (!cancelled && v.paused) tryPlay();
    };
    // Inicia assim que o primeiro frame estiver decodificado (HAVE_CURRENT_DATA=2),
    // não esperando `canplay` (HAVE_FUTURE_DATA=3). Reduz o "tempo até o play"
    // em mobile/redes lentas. O watchdog do scroller cuida de stalls posteriores.
    v.addEventListener('loadeddata', onReadyEnough);
    v.addEventListener('canplay', onReadyEnough);
    requestAnimationFrame(tryPlay);


    return () => {
      cancelled = true;
      playbackTokenRef.current += 1;
      v.removeEventListener('loadeddata', onReadyEnough);
      v.removeEventListener('canplay', onReadyEnough);
      // Pausa o vídeo que está saindo do slot ativo SEM mexer no estado React.
      // O evento `onPause` natural já dispara `setPlaying(false)` no momento
      // certo (depois do commit do frame), evitando a "piscada" do overlay
      // escuro que aparecia entre o cleanup e a re-renderização do próximo
      // ciclo de autoplay em mobile.
      try { v.pause(); } catch { /* noop */ }
    };
  }, [effectiveSrc, tiktokAuto, variant, trimStart, trimEnd]);

  // Vídeo fora da tela: apenas PAUSA. NÃO removemos o src — remover causa
  // re-download completo ao rolar de volta (era a causa do "travado/lento"
  // estilo carregamento eterno). O browser libera buffer sozinho quando precisa.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || variant !== 'tiktok' || tiktokAuto) return;
    try { v.pause(); } catch { /* noop */ }
    setBooleanState(setPlaying, playingRef, false);
    setBooleanState(setLoading, loadingRef, false);
  }, [variant, tiktokAuto]);


  const segmentStart = typeof trimStart === 'number' && trimStart > 0 ? trimStart : 0;
  const segmentEnd = typeof trimEnd === 'number' && trimEnd > segmentStart ? trimEnd : duration;
  const segmentDuration = Math.max(0, (segmentEnd || duration) - segmentStart);

  // Refs estáveis para callbacks/props que mudam a cada render do pai.
  // Sem isso, o useEffect abaixo (de outro/trim) re-anexava listeners de
  // timeupdate em todo render do scroller, causando "piscadas" no mobile.
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  useEffect(() => { trimStartRef.current = trimStart; }, [trimStart]);
  useEffect(() => { trimEndRef.current = trimEnd; }, [trimEnd]);

  // Outro + respeito ao trim + progresso — anexa UMA única vez por src.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    outroDoneRef.current = false;

    const finishWithOutro = () => {
      if (outroDoneRef.current) return;
      outroDoneRef.current = true;
      try { v.pause(); } catch { /* noop */ }
      setBooleanState(setPlaying, playingRef, false);
      if (disableOutro) {
        setShowOutro(false);
        try { onEndedRef.current?.(); } catch { /* noop */ }
        return;
      }
      if (showOutroRef.current) {
        setShowOutro(false);
        try { onEndedRef.current?.(); } catch { /* noop */ }
        return;
      }
      setShowOutro(true);
      if (outroTimerRef.current) window.clearTimeout(outroTimerRef.current);
      outroTimerRef.current = window.setTimeout(() => {
        outroTimerRef.current = null;
        setShowOutro(false);
        try { onEndedRef.current?.(); } catch { /* noop */ }
      }, OUTRO_DURATION * 1000);
    };

    const seekToStart = () => {
      const ts = trimStartRef.current;
      if (ts != null && ts > 0 && Math.abs(v.currentTime - ts) > 0.2) {
        try { v.currentTime = ts; } catch { /* noop */ }
      }
    };
    const onLoaded = () => {
      if (v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight);
      if (isFinite(v.duration)) setDuration(v.duration);
      seekToStart();
    };
    let raf = 0;
    let lastUi = 0;
    const commitTime = () => {
      raf = 0;
      setCurrentTime(currentTimeRef.current);
    };
    const scheduleTimeUi = () => {
      const now = performance.now();
      // TikTok precisa priorizar decode/compositor; atualizar React a cada
      // 240ms derrubava FPS em aparelhos fracos. 1Hz mantém UI útil sem jank.
      const minInterval = variant === 'tiktok' ? 1000 : 300;
      if (now - lastUi < minInterval) return;
      lastUi = now;
      if (!raf) raf = window.requestAnimationFrame(commitTime);
    };
    const onTime = () => {
      currentTimeRef.current = v.currentTime;
      const te = trimEndRef.current;
      if (te != null && te > 0 && v.currentTime >= te - 0.05) {
        finishWithOutro();
        return;
      }
      scheduleTimeUi();
      if (disableOutro) return;
      const effectiveEnd = (te != null && te > 0) ? te : v.duration;
      if (!isFinite(effectiveEnd) || effectiveEnd <= 0) return;
      const remaining = effectiveEnd - v.currentTime;
      const nextOutro = remaining <= OUTRO_DURATION && remaining > 0.05;
      if (nextOutro !== showOutroRef.current) setShowOutro(nextOutro);
    };
    const onEndedInternal = () => {
      finishWithOutro();
    };
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('durationchange', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEndedInternal);
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('durationchange', onLoaded);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', onEndedInternal);
      if (raf) window.cancelAnimationFrame(raf);
      if (outroTimerRef.current) {
        window.clearTimeout(outroTimerRef.current);
        outroTimerRef.current = null;
      }
    };
  }, [disableOutro, src, variant]);

  // Máscara pesada DESATIVADA: o fetch->blob baixa o arquivo inteiro, dobra o uso
  // de RAM e trava decodificação em celulares antigos. Mantemos apenas a máscara
  // leve por query string (initialMaskedSrc).
  async function ensureBlobMask() {
    return;
  }

  const toggle = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setBooleanState(setError, errorRef, false);
      // Atalho mobile: chama play() ANTES de qualquer await/setTimeout para
      // preservar o gesto do usuário e iniciar a reprodução instantaneamente.
      let p: Promise<void> | undefined;
      try {
        if (!shouldAttachSrc) {
          setManualLoad(true);
          v.src = effectiveSrc;
        }
        if (v.preload !== 'auto') v.preload = 'auto';
        p = v.play();
        setBooleanState(setPlaying, playingRef, true);
        startedRef.current = true;
      } catch { /* fallback abaixo */ }
      // Spinner só se realmente demorar (>400ms) — não bloqueia o play.
      window.setTimeout(() => {
        if (videoRef.current && videoRef.current.paused && !startedRef.current) {
          setBooleanState(setLoading, loadingRef, true);
        }
      }, 400);
      try { setMediaSessionMeta({ title: 'Oculto Play', artist: 'Oculto', album: 'Oculto Play', artwork: poster ?? null }); } catch { /* noop */ }
      try {
        if (p) await p;
      } catch {
        try {
          v.muted = true;
          setMuted(true);
          const p2 = v.play();
          setBooleanState(setPlaying, playingRef, true);
          startedRef.current = true;
          await p2;
        } catch {
          setBooleanState(setError, errorRef, true);
          setBooleanState(setPlaying, playingRef, false);
        }
      } finally {
        setBooleanState(setLoading, loadingRef, false);
      }
    } else {
      v.pause();
      setBooleanState(setPlaying, playingRef, false);
    }
  };


  const toggleMute = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next) userUnmutedRef.current = true;
  };

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !segmentDuration) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const next = segmentStart + pct * segmentDuration;
    try { v.currentTime = next; } catch { /* noop */ }
    setCurrentTime(next);
  };

  type FSDoc = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
  };
  type FSEl = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  const toggleFullscreen = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const el = wrapRef.current as FSEl | null;
    const doc = document as FSDoc;
    if (!el) return;
    const current = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    try {
      if (current) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    const doc = document as FSDoc;
    const onChange = () => {
      const fs = !!(doc.fullscreenElement ?? doc.webkitFullscreenElement);
      setIsFullscreen(fs && doc.fullscreenElement === wrapRef.current || fs && doc.webkitFullscreenElement === wrapRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      onContextMenu={(e) => e.preventDefault()}
      style={
        isFullscreen
          ? { width: '100vw', height: '100vh' }
          : variant === 'tiktok'
            ? undefined
            : { aspectRatio: String(ratio) }
      }
      className={cn(
        'relative w-full overflow-hidden bg-black select-none touch-manipulation',
        isFullscreen
          ? 'rounded-none max-h-none flex items-center justify-center fixed inset-0 z-[9999]'
          : variant === 'tiktok'
            ? 'h-full rounded-none max-h-none'
            : 'rounded-2xl max-h-[calc(100dvh-7rem)]',
        className,
      )}
      onClick={toggle}
    >

      <video
        ref={videoRef}
        src={shouldAttachSrc ? effectiveSrc : undefined}
        poster={poster ?? undefined}
        playsInline
        muted={muted}
        preload={(variant === 'tiktok' && tiktokAuto) || warmBuffer ? 'auto' : 'metadata'}
        controls={false}
        controlsList="nodownload noremoteplayback nofullscreen"
        disablePictureInPicture
        disableRemotePlayback
        draggable={false}
        // @ts-expect-error — fetchpriority é atributo HTML válido (Chrome/Edge/Safari TP)
        fetchpriority={variant === 'tiktok' ? 'high' : (preloadMeta || preloadAhead || economic ? 'low' : 'auto')}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className={cn(
          'absolute inset-0 z-[2] w-full h-full bg-black pointer-events-none transition-opacity duration-150',
          variant === 'tiktok' ? 'object-cover' : 'object-contain',
          poster && !firstFrameReady ? 'opacity-0' : 'opacity-100',
        )}

        onLoadStart={() => {
          if (variant !== 'tiktok') setBooleanState(setLoading, loadingRef, true);
          setBooleanState(setError, errorRef, false);
        }}
        onLoadedData={() => {
          markFirstFrameReady();
          setBooleanState(setLoading, loadingRef, false);
        }}
        onLoadedMetadata={() => {
          if (videoRef.current?.readyState && videoRef.current.readyState >= 2) markFirstFrameReady();
        }}
        onCanPlay={() => {
          markFirstFrameReady();
          setBooleanState(setLoading, loadingRef, false);
        }}
        onCanPlayThrough={() => setBooleanState(setLoading, loadingRef, false)}
        onWaiting={() => {
          const v = videoRef.current;
          if (variant === 'tiktok') onPlaybackStress?.();
          // Só mostra loading se realmente não tem bytes — evita spinner fantasma
          if (v && v.readyState < 3 && variant !== 'tiktok') setBooleanState(setLoading, loadingRef, true);
        }}
        onProgress={() => {
          const v = videoRef.current;
          if (v && v.readyState >= 3) setBooleanState(setLoading, loadingRef, false);
        }}
        onStalled={() => {
          // Não chamar load() aqui: em mobile isso descarta buffer e reinicia download.
          const v = videoRef.current;
          if (!v) return;
          if (variant === 'tiktok') onPlaybackStress?.();
          if (tiktokAuto) {
            try { v.play().catch(() => { /* noop */ }); } catch { /* noop */ }
          }
        }}
        onPlaying={() => {
          markFirstFrameReady();
          setBooleanState(setLoading, loadingRef, false);
          setBooleanState(setPlaying, playingRef, true);
          const wasStarted = startedRef.current;
          startedRef.current = true;
          setBooleanState(setError, errorRef, false);
          try { markOcultoPlayMediaPlaying(`video:${playerId}`); } catch { /* noop */ }
          if (!wasStarted) { try { onFirstPlay?.(); } catch { /* noop */ } }
        }}
        onPause={() => {
          setBooleanState(setPlaying, playingRef, false);
          try { markOcultoPlayMediaStopped(`video:${playerId}`); } catch { /* noop */ }
        }}
        onEnded={() => {
          try { markOcultoPlayMediaStopped(`video:${playerId}`); } catch { /* noop */ }
        }}
        onError={() => {
          setBooleanState(setLoading, loadingRef, false);
          setBooleanState(setError, errorRef, true);
          setBooleanState(setPlaying, playingRef, false);
          try { markOcultoPlayMediaStopped(`video:${playerId}`); } catch { /* noop */ }
        }}
      />

      {/* Poster permanente atrás do vídeo. Fica visível só até o primeiro frame
          estar pronto, evitando flash preto entre o mount e a decodificação. */}
      {poster && !firstFrameReady && (
        <img
          src={poster}
          alt=""
          loading={tiktokAuto ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="absolute inset-0 z-[1] h-full w-full object-cover pointer-events-none bg-black"
        />
      )}

      {/* Outro OCULTO — últimos 2s */}
      {!disableOutro && (
        <div
          aria-hidden={!showOutro}
          className={cn(
            'absolute inset-0 z-10 pointer-events-none bg-black transition-opacity duration-500',
            showOutro ? 'opacity-100' : 'opacity-0',
          )}
        >
          <img
            src={outroAsset.url}
            alt="OCULTO — ocultoswing.com.br"
            loading="lazy"
            decoding="async"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full object-contain pointer-events-none"
          />
        </div>
      )}

      {/* Overlay de play / loading / erro — spinner inteligente (debounce 320ms).
          No modo TikTok com autoplay ativo, NÃO mostramos o overlay escuro com
          ícone de Play enquanto o vídeo está apenas carregando: isso causa uma
          "piscada" do fundo escuro entre o swipe e o início real do play. Erro
          continua sendo exibido para o usuário poder tentar novamente. */}
      {(error || (!playing && !tiktokAuto && variant !== 'tiktok' && !showOutro) || (showSpinner && !showOutro && !tiktokAuto && variant !== 'tiktok')) && (
        <div className={cn(
          "absolute inset-0 grid place-items-center bg-black/30",
          error ? "pointer-events-auto" : "pointer-events-none",
        )}>
          {error ? (
            <div
              className="flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {poster ? (
                <img
                  src={poster}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none"
                  draggable={false}
                />
              ) : null}
              <div className="relative z-10 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                Falha ao carregar o vídeo
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (!v) return;
                  setBooleanState(setError, errorRef, false);
                  setBooleanState(setLoading, loadingRef, true);
                  try { v.load(); } catch { /* noop */ }
                  try {
                    const p = v.play();
                    if (p && typeof (p as Promise<void>).catch === 'function') {
                      (p as Promise<void>).catch(() => { /* aguarda gesto */ });
                    }
                  } catch { /* noop */ }
                }}
                className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-white text-black px-3 py-1.5 text-xs font-semibold shadow-lg hover:bg-white/90"
                aria-label="Tentar reproduzir novamente"
              >
                <Play className="h-3.5 w-3.5" /> Tentar novamente
              </button>
            </div>
          ) : (
            <div className="h-14 w-14 rounded-full bg-white/15 backdrop-blur grid place-items-center">
              {showSpinner ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Play className="h-6 w-6 text-white ml-0.5" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Indicador discreto de aquecimento de buffer (variant inline).
          Mostra "Preparando vídeo…" enquanto o player aquece e troca para
          "Pronto para tocar" quando o primeiro frame está decodificado.
          Some assim que o vídeo começa a tocar ou em caso de erro. */}
      {variant !== 'tiktok' && !error && !showOutro && !playing && warmBuffer && (
        <div
          className="absolute top-2 left-2 z-30 pointer-events-none select-none"
          aria-live="polite"
        >
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-sm shadow-sm transition-opacity duration-300',
              firstFrameReady ? 'bg-emerald-500/70' : 'bg-black/55',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                firstFrameReady ? 'bg-white' : 'bg-emerald-400 animate-pulse',
              )}
            />
            {firstFrameReady ? 'Pronto para tocar' : 'Preparando vídeo…'}
          </div>
        </div>
      )}

      {/* Volume + mute (bottom-left). No TikTok há mute global no scroller;
          remover este controle de cada slide reduz DOM/backdrop em mobile. */}
      {variant !== 'tiktok' && <div
        className="absolute bottom-7 left-3 z-30 flex items-center gap-2 bg-black/60 backdrop-blur rounded-full pl-1.5 pr-2.5 py-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={toggleMute}
          className="h-7 w-7 grid place-items-center rounded-full text-white hover:bg-white/15"
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
          title={muted ? 'Ativar som' : 'Silenciar'}
        >
          {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setVolume(v);
            const el = videoRef.current;
            if (el) {
              el.volume = v;
              const shouldMute = v === 0;
              el.muted = shouldMute;
              setMuted(shouldMute);
              if (!shouldMute) userUnmutedRef.current = true;
            }
          }}
          className="w-20 h-1 accent-fuchsia-400 cursor-pointer"
          aria-label="Volume"
        />
      </div>}


      {/* Fullscreen toggle — desktop (sm+) */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="hidden sm:grid absolute bottom-3 right-3 z-20 h-8 w-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75 transition-colors"
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>

      {/* Progress bar clicável — TikTok/inline */}
      {segmentDuration > 0 && (() => {
        const localTime = Math.max(0, Math.min(segmentDuration, currentTime - segmentStart));
        const pct = Math.min(100, Math.max(0, (localTime / segmentDuration) * 100));
        const remaining = Math.max(0, segmentDuration - localTime);
        const mm = Math.floor(remaining / 60);
        const ss = Math.floor(remaining % 60);
        const remainingLabel = `-${mm}:${ss.toString().padStart(2, '0')}`;
        return (
          <div className="absolute left-0 right-0 bottom-0 z-30 pointer-events-auto">
            <div className="px-3 pb-0.5 flex justify-end">
              <span className="text-[10px] tabular-nums text-white/90 bg-black/45 rounded px-1.5 py-0.5 backdrop-blur-sm">
                {remainingLabel}
              </span>
            </div>
            <div
              className="h-4 cursor-pointer touch-none"
              onPointerDown={seekFromPointer}
              onClick={(e) => e.stopPropagation()}
              role="slider"
              aria-label="Progresso do vídeo"
              aria-valuemin={0}
               aria-valuemax={Math.max(0, Math.floor(segmentDuration))}
               aria-valuenow={Math.max(0, Math.floor(localTime))}
            >
              <div className="relative top-1/2 h-[3px] -translate-y-1/2 bg-white/15">
              <div
                className="h-full bg-gradient-to-r from-fuchsia-400 to-rose-400 transition-[width] duration-150"
                style={{ width: `${pct}%` }}
              />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
