/**
 * OcultoPlayShortsScroller — feed vertical infinito estilo TikTok.
 *
 * Renderiza N slides full-screen empilhados verticalmente com CSS scroll-snap.
 * O <OcultoPlayVideoItem variant="tiktok" autoplayOnVisible /> já usa
 * IntersectionObserver para tocar APENAS o vídeo visível, então:
 *   - Não há remontagem de <video> ao trocar de slide (sem flicker).
 *   - Áudio/vídeo nunca dessincronizam: cada slide tem seu próprio elemento
 *     <video> persistente; quem ganha viewport ganha o play.
 *   - O dedo do usuário controla o pacing — não há "salto" programático.
 *
 * Ações laterais (like / dislike / save / comentar / compartilhar) são
 * renderizadas POR slide e cada uma usa `useOcultoPlayActions` para gravar
 * no banco e atualizar contadores otimisticamente (mesma engine do feed).
 *
 * "Infinito": quando o slide ativo chega aos últimos 3, chamamos
 * `onNearEnd()` para o pai injetar mais vídeos na fila.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { X, Volume2, VolumeX, Leaf } from 'lucide-react';
import { useDataSaver } from '@/hooks/useDataSaver';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { OcultoPlayActions } from './OcultoPlayActions';
import { OcultoPlaySessionScoreHUD } from './OcultoPlaySessionScoreHUD';
import {
  useOcultoPlayActions,
  type OcultoPlayItem as OPItem,
} from '@/hooks/useOcultoPlayContent';
import { useRegisterOcultoPlayCardView } from '@/hooks/useRegisterOcultoPlayCardView';
import { useOcultoPlaySessionScoreStore } from '@/store/useOcultoPlaySessionScoreStore';
import { markOcultoPlayMediaPlaying, markOcultoPlayMediaStopped } from '@/lib/ocultoPlayActivity';
import { stopOcultoPlayMedia } from '@/lib/ocultoPlayMediaStop';

type PlaybackQuality = 'normal' | 'mobile' | 'low' | 'ultraLow';

function pauseVideoElement(v: HTMLVideoElement) {
  try { v.pause(); } catch { /* noop */ }
  v.muted = true;
}

function shouldStartMutedForMobileAutoplay() {
  try {
    const ua = navigator.userAgent || '';
    const isiOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return isiOS || coarse;
  } catch { return true; }
}

interface Props {
  items: OPItem[];
  seedId: string;
  onClose: () => void;
  showCloseButton?: boolean;
  onActiveChange?: (item: OPItem) => void;
  onComment?: (item: OPItem) => void;
  onShare?: (item: OPItem) => void;
  onReport?: (item: OPItem) => void;
  /** Disparado quando o índice ativo entra nos últimos 3 — pai pode anexar mais. */
  onNearEnd?: () => void;
}

export function OcultoPlayShortsScroller({
  items,
  seedId,
  onClose,
  showCloseButton = true,
  onActiveChange,
  onComment,
  onShare,
  onReport,
  onNearEnd,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Map<string, HTMLElement>>(new Map());
  const playerSlotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const actions = useOcultoPlayActions();
  const registerCardView = useRegisterOcultoPlayCardView();
  const viewedRef = useRef<Set<string>>(new Set());
  const bumpScore = useOcultoPlaySessionScoreStore((s) => s.bump);

  // Garante o seed no topo da fila uma única vez + DEDUP por id.
  // Sem dedup, anexar mais vídeos via onNearEnd duplica os existentes e o
  // usuário rola "infinitamente" sobre os mesmos clipes.
  const orderedItems = useMemo<OPItem[]>(() => {
    if (!items.length) return [];
    const seen = new Set<string>();
    const unique: OPItem[] = [];
    for (const it of items) {
      if (!it?.id || seen.has(it.id)) continue;
      seen.add(it.id);
      unique.push(it);
    }
    const idx = unique.findIndex((it) => it.id === seedId);
    if (idx <= 0) return unique;
    return [unique[idx], ...unique.slice(0, idx), ...unique.slice(idx + 1)];
  }, [items, seedId]);

  const [activeId, setActiveId] = useState<string>(seedId);
  const [globalMuted, setGlobalMuted] = useState<boolean>(() => shouldStartMutedForMobileAutoplay());
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [leanMobile, setLeanMobile] = useState<boolean>(false);
  const [antiStall, setAntiStall] = useState<boolean>(false);
  const activeIdRef = useRef(seedId);
  const antiStallUntilRef = useRef(0);
  // Modo Econômico: auto-ativado SÓ em redes móveis lentas / saveData / hw fraco.
  // Wi-Fi mantém qualidade padrão. Preferência manual é persistida por-usuário.
  const { isDataSaverEnabled, toggleDataSaver, source: ecoSource, qualityLabel, connectionKind } = useDataSaver();
  const isEconomic = isDataSaverEnabled;

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const activateAntiStall = useCallback(() => {
    antiStallUntilRef.current = Date.now() + 45_000;
    setAntiStall(true);
  }, []);

  const pauseInactiveVideos = useCallback((nextActiveId: string) => {
    const root = containerRef.current;
    if (!root) return;
    const nextActiveSection = root.querySelector<HTMLElement>(`section[data-item-id="${CSS.escape(nextActiveId)}"]`);
    root.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
      if (nextActiveSection?.contains(v)) return;
      pauseVideoElement(v);
    });
  }, []);

  // Monitor leve de FPS/long frames. Se o dispositivo engasgar, entra em modo
  // anti-travamento; após uma janela estável, volta automaticamente à qualidade normal.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let slowFrames = 0;
    let stableWindows = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      frames += 1;
      if (dt > 34) slowFrames += 1;
      if (dt > 180) activateAntiStall();
      if (frames >= 90) {
        const slowRatio = slowFrames / frames;
        if (slowRatio > 0.22) {
          stableWindows = 0;
          activateAntiStall();
        } else if (slowRatio < 0.08) {
          stableWindows += 1;
          if (stableWindows >= 3 && Date.now() > antiStallUntilRef.current) setAntiStall(false);
        } else {
          stableWindows = 0;
        }
        frames = 0;
        slowFrames = 0;
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [activateAntiStall]);

  useEffect(() => {
    if (!orderedItems.length) return;
    if (orderedItems.some((it) => it.id === activeIdRef.current)) return;
    const fallbackId = orderedItems[0]?.id;
    if (!fallbackId) return;
    activeIdRef.current = fallbackId;
    setActiveId(fallbackId);
  }, [orderedItems]);

  useEffect(() => {
    const compute = () => {
      const nav = navigator as Navigator & { deviceMemory?: number };
      const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      setLeanMobile(coarse || window.innerWidth <= 768 || lowMemory);
    };
    compute();
    window.addEventListener('resize', compute, { passive: true });
    return () => window.removeEventListener('resize', compute);
  }, []);

  // Posiciona scroll inicial no seed sem animação para evitar flicker.
  useEffect(() => {
    const el = slideRefs.current.get(seedId);
    if (el) {
      // jsdom-safe
      try {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Identifica o slide ativo via IntersectionObserver (comportamento TikTok):
  // o slide cuja maior porção está na viewport vira o ativo — preparar/tocar
  // só acontece a partir desse sinal. Mais preciso e estável que scrollTop
  // em swipes rápidos / momentum scroll do iOS.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || orderedItems.length === 0) return;
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.itemId;
          if (!id) continue;
          ratios.set(id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        ratios.forEach((r, id) => {
          if (r > bestRatio) { bestRatio = r; bestId = id; }
        });
        if (bestId && bestRatio >= 0.6 && bestId !== activeIdRef.current) {
          pauseInactiveVideos(bestId);
          activeIdRef.current = bestId;
          setActiveId(bestId);
        }
      },
      { root, threshold: [0, 0.25, 0.6, 0.9, 1] },
    );
    slideRefs.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [orderedItems, pauseInactiveVideos]);

  const prepareNearbyVideo = useCallback((id: string) => {
    if (antiStall) return;
    const root = containerRef.current;
    if (!root) return;
    const section = root.querySelector<HTMLElement>(
      `section[data-item-id="${CSS.escape(id)}"]`,
    );
    const v = section?.querySelector<HTMLVideoElement>('video[data-op-warm="true"]');
    if (!v || v.readyState >= 1) return;
    try {
      v.muted = true;
      v.preload = 'metadata';
      if (v.networkState === HTMLMediaElement.NETWORK_EMPTY) v.load();
    } catch { /* noop */ }
  }, [antiStall]);

  // Pré-carregamento de rede (±1 vizinho) — DESATIVADO.
  // O hint `<link rel="preload" as="video">` força o browser a baixar o
  // arquivo inteiro em background com alta prioridade, o que: (a) briga
  // pela banda do vídeo ATIVO (causando travamento/lentidão na execução em
  // mobile) e (b) continua baixando depois que o usuário fecha o player,
  // mantendo o arquivo "vivo" e podendo retomar áudio em outras telas.
  // Mantemos apenas o aquecimento via <video preload="metadata"> dos slides
  // vizinhos já renderizados (data-op-warm), que pega só os headers.
  const clearPreloadLinks = useCallback(() => {
    try {
      document.head
        .querySelectorAll<HTMLLinkElement>('link[data-op-preload-video]')
        .forEach((l) => { try { l.remove(); } catch { /* noop */ } });
    } catch { /* noop */ }
  }, []);

  // Notifica pai + aquece o próximo vídeo + dispara onNearEnd.
  // A view fica no onFirstPlay: atualizar cache/RPC durante o swipe competia
  // com o início do decode e causava engasgos em celulares antigos.
  useEffect(() => {
    const it = orderedItems.find((x) => x.id === activeId);
    if (!it) return;
    onActiveChange?.(it);
    const idx = orderedItems.findIndex((x) => x.id === it.id);
    if (idx >= 0) {
      // Aquecimento somente via metadata do <video> warm já renderizado.
      // Sem link rel=preload (ver bloco acima).
      clearPreloadLinks();
      const next = orderedItems[idx + 1];
      const prev = orderedItems[idx - 1];
      const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout?: number }) => number);
      if (next?.id) {
        const run = () => prepareNearbyVideo(next.id);
        if (idle) idle(run, { timeout: 900 });
        else window.setTimeout(run, 420);
      }
      if (prev?.id) {
        const run = () => prepareNearbyVideo(prev.id);
        if (idle) idle(run, { timeout: 1200 });
        else window.setTimeout(run, 700);
      }
    }
    if (onNearEnd && idx >= 0 && idx >= orderedItems.length - 3) onNearEnd();
  }, [activeId, orderedItems, onActiveChange, onNearEnd, prepareNearbyVideo, clearPreloadLinks]);

  // Kill switch global: ao desmontar o scroller (fechar modal, sair de
  // /oculto-play, SPA nav), pausa + zera src + load() de TODOS os <video>
  // dentro do container e remove preloads residuais. Isso elimina o caso
  // em que o vídeo continuava baixando e voltava a tocar áudio em outra tela.
  useEffect(() => () => {
    clearPreloadLinks();
    try { stopOcultoPlayMedia(containerRef.current, { pauseSharedAudio: false }); } catch { /* noop */ }
  }, [clearPreloadLinks]);


  // Cinto de segurança global: a cada troca de slide, pausa imediatamente
  // qualquer <video> que não pertença ao slide ativo. A desmontagem React dos
  // slides não ativos libera o recurso; remover `src` manualmente causava
  // corridas no mobile e podia zerar a fonte do vídeo recém-ativo.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const activeSection = root.querySelector<HTMLElement>(`section[data-item-id="${CSS.escape(activeId)}"]`);
    root.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
      if (activeSection?.contains(v)) return;
      pauseVideoElement(v);
    });
  }, [activeId]);

  const setSlideRef = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) { slideRefs.current.delete(id); return; }
    slideRefs.current.set(id, el);
  }, []);

  const setPlayerSlotRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) { playerSlotRefs.current.delete(id); return; }
    playerSlotRefs.current.set(id, el);
  }, []);

  // Navegação programática (atalhos / botões).
  const goToIndex = useCallback((idx: number, behavior: ScrollBehavior = 'smooth') => {
    if (!orderedItems.length) return;
    const targetIndex = ((idx % orderedItems.length) + orderedItems.length) % orderedItems.length;
    const target = orderedItems[targetIndex];
    if (!target) return;
    const el = slideRefs.current.get(target.id);
    if (el) {
      pauseInactiveVideos(target.id);
      try { el.scrollIntoView({ behavior, block: 'start' }); } catch { /* noop */ }
      setActiveId(target.id);
    }
  }, [orderedItems, pauseInactiveVideos]);

  const goNext = useCallback(() => {
    const idx = orderedItems.findIndex((it) => it.id === activeId);
    const wraps = idx >= orderedItems.length - 1;
    goToIndex(idx < 0 ? 0 : idx + 1, wraps ? 'auto' : 'smooth');
  }, [activeId, orderedItems, goToIndex]);

  const goPrev = useCallback(() => {
    const idx = orderedItems.findIndex((it) => it.id === activeId);
    const wraps = idx <= 0;
    goToIndex(idx < 0 ? orderedItems.length - 1 : idx - 1, wraps ? 'auto' : 'smooth');
  }, [activeId, orderedItems, goToIndex]);

  // Toggle play/pause manual (preserva mute, sem remontagem → sem piscadas).
  const togglePause = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const v = root.querySelector<HTMLVideoElement>(
      `section[data-item-id="${CSS.escape(activeId)}"] video`,
    );
    if (!v) return;
    if (v.paused) {
      setIsPaused(false);
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else {
      setIsPaused(true);
      v.pause();
    }
  }, [activeId]);

  // Atalhos de teclado: ↑/↓/PageUp/PageDown/J/K = navegar,
  // Espaço/K = play/pause, M = mute, Esc = fechar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
        case 'j':
        case 'J':
          e.preventDefault(); goNext(); break;
        case 'ArrowUp':
        case 'PageUp':
        case 'k':
        case 'K':
          e.preventDefault(); goPrev(); break;
        case ' ':
          e.preventDefault(); togglePause(); break;
        case 'm':
        case 'M':
          e.preventDefault(); setGlobalMuted((m) => !m); break;
        case 'Escape':
          e.preventDefault(); onClose(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, togglePause, onClose]);

  // Loop também nos gestos de limite: último + avançar volta ao primeiro;
  // primeiro + voltar pula para o último, mantendo a sessão infinita.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let startY: number | null = null;
    const atEdge = () => {
      const idx = orderedItems.findIndex((it) => it.id === activeId);
      return { first: idx === 0, last: idx === orderedItems.length - 1 };
    };
    const onWheel = (e: WheelEvent) => {
      if (orderedItems.length < 2 || Math.abs(e.deltaY) < 18) return;
      const edge = atEdge();
      if (edge.last && e.deltaY > 0) { e.preventDefault(); goToIndex(0, 'auto'); }
      else if (edge.first && e.deltaY < 0) { e.preventDefault(); goToIndex(orderedItems.length - 1, 'auto'); }
    };
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? null; };
    const onTouchEnd = (e: TouchEvent) => {
      if (startY == null || orderedItems.length < 2) return;
      const endY = e.changedTouches[0]?.clientY ?? startY;
      const dy = endY - startY;
      startY = null;
      if (Math.abs(dy) < 54) return;
      const edge = atEdge();
      if (edge.last && dy < 0) goToIndex(0, 'auto');
      else if (edge.first && dy > 0) goToIndex(orderedItems.length - 1, 'auto');
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchend', onTouchEnd);
    };
  }, [activeId, orderedItems, goToIndex]);

  const handleLike = useCallback((it: OPItem) => {
    actions.toggleLike.mutate(it.id);
    bumpScore('like');
  }, [actions.toggleLike, bumpScore]);
  const handleDislike = useCallback((it: OPItem) => {
    actions.toggleDislike.mutate(it.id);
    bumpScore('dislike');
  }, [actions.toggleDislike, bumpScore]);
  const handleSave = useCallback((it: OPItem) => {
    actions.toggleSave.mutate(it.id);
    bumpScore('save');
  }, [actions.toggleSave, bumpScore]);
  const handleShareInternal = useCallback((it: OPItem) => {
    actions.registerShare.mutate(it.id);
    bumpScore('share');
    onShare?.(it);
  }, [actions.registerShare, onShare, bumpScore]);
  const handleCommentInternal = useCallback((it: OPItem) => {
    bumpScore('comment');
    onComment?.(it);
  }, [onComment, bumpScore]);
  const handleAutoplayMutedFallback = useCallback(() => setGlobalMuted(true), []);

  if (!orderedItems.length) return null;

  const activeIdx = orderedItems.findIndex((it) => it.id === activeId);
  const resolvedActiveId = activeIdx >= 0 ? activeId : (orderedItems[0]?.id ?? activeId);
  const resolvedActiveIdx = activeIdx >= 0 ? activeIdx : 0;
  const activeItem = orderedItems[resolvedActiveIdx] ?? orderedItems[0];
  const adaptiveQuality: PlaybackQuality = antiStall
    ? 'ultraLow'
    : isEconomic
      ? 'low'
      : leanMobile
        ? 'mobile'
        : 'normal';


  return (
    <div className={cn('relative w-full h-full bg-black', (leanMobile || isEconomic || antiStall) && 'oculto-play-lean') }>
      {/* Botão fechar global */}
      {showCloseButton && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Fechar player"
          title="Fechar"
          className="absolute top-3 left-3 z-[60] h-11 w-11 grid place-items-center rounded-full bg-black/70 backdrop-blur ring-2 ring-white/30 text-white shadow-xl hover:bg-black/90 active:scale-95 transition"
          style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <X className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}

      {/* Placar mock de sessão — abaixo do botão fechar */}
      <div
        className="absolute left-3 z-[60]"
        style={{ top: 'calc(max(0.75rem, env(safe-area-inset-top)) + 3.25rem)' }}
      >
        <OcultoPlaySessionScoreHUD />
      </div>

      {/* Controles mute + ECO — centralizados no espaço vazio do topo, entre o botão fechar
          (esquerda) e a coluna de ações (direita). Sempre acima do scroller (z-[70]). */}
      <div
        className={cn(
          'absolute z-[70] flex flex-row items-center justify-center gap-2',
          'left-1/2 -translate-x-1/2 animate-fade-in',
          // garante que em telas estreitas não invada a coluna de ações nem o botão fechar
          'max-[360px]:gap-1.5',
        )}
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top))',
          // margem segura: 4rem para o X à esquerda, 4rem para a coluna de ações à direita
          maxWidth: 'calc(100% - 8rem)',
        }}
        role="toolbar"
        aria-label="Controles de áudio e qualidade"
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setGlobalMuted((m) => !m); }}
          aria-label={globalMuted ? 'Ativar som do vídeo' : 'Silenciar vídeo'}
          aria-pressed={globalMuted}
          title={globalMuted ? 'Ativar som (M)' : 'Silenciar (M)'}
          className={cn(
            'h-11 w-11 min-h-11 min-w-11 grid place-items-center rounded-full',
            'bg-black/70 backdrop-blur ring-2 ring-white/30 text-white shadow-xl',
            'hover:bg-black/90 active:scale-95 transition',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40',
          )}
        >
          {globalMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </button>

        {/* Modo Econômico — toggle (auto-ativado em rede móvel lenta / saveData). */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleDataSaver(); }}
          aria-label={isEconomic ? `Desativar Modo Econômico (atual: ${qualityLabel})` : 'Ativar Modo Econômico'}
          title={
            isEconomic
              ? `Modo Econômico ativo • ${qualityLabel}${ecoSource === 'auto' ? ` (auto · ${connectionKind === 'cellular' ? 'rede móvel' : 'conexão lenta'})` : ' (manual)'} — toque para desligar`
              : `Ativar Modo Econômico (baixa qualidade, fluido)${connectionKind === 'wifi' ? ' — Wi-Fi detectado, qualidade padrão por padrão' : ''}`
          }
          aria-pressed={isEconomic}
          className={cn(
            'h-11 min-h-11 px-3 grid grid-flow-col items-center gap-1.5 rounded-full backdrop-blur ring-2 text-white shadow-xl active:scale-95 transition',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40',
            isEconomic
              ? 'bg-emerald-500/90 ring-emerald-300/60 hover:bg-emerald-500'
              : 'bg-black/70 ring-white/30 hover:bg-black/90',
          )}
        >
          <Leaf className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          <span className="text-[11px] font-bold leading-none">ECO</span>
          {isEconomic && (
            <span className="text-[10px] font-semibold leading-none opacity-90 border-l border-white/40 pl-1.5">
              {qualityLabel}
            </span>
          )}
        </button>
      </div>


      {/* Badges ECO / ANTI-TRAVA — empilhados à esquerda, abaixo do HUD do troféu */}
      {(isEconomic || antiStall) && (
        <div
          className="absolute left-3 z-[60] flex flex-col items-start gap-2"
          style={{ top: 'calc(max(0.75rem, env(safe-area-inset-top)) + 6.5rem)' }}
        >
          {isEconomic && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/85 backdrop-blur text-white text-[10px] font-bold leading-none shadow-lg ring-1 ring-emerald-300/50"
            >
              <Leaf className="h-3 w-3" strokeWidth={2.5} />
              <span>ECO · {qualityLabel}</span>
              <span className="opacity-80 font-medium border-l border-white/40 pl-1.5">
                {ecoSource === 'auto'
                  ? connectionKind === 'cellular' ? 'rede móvel' : 'auto'
                  : 'manual'}
              </span>
            </div>
          )}
          {antiStall && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/90 backdrop-blur text-white text-[10px] font-bold leading-none shadow-lg ring-1 ring-amber-200/60"
            >
              <Leaf className="h-3 w-3" strokeWidth={2.5} />
              <span>ANTI-TRAVA · 360p</span>
            </div>
          )}
        </div>
      )}


      {/* Atalhos desktop: botões de navegação anterior/próximo (md+) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); goPrev(); }}
        aria-label="Vídeo anterior (↑)"
        title="Anterior (↑ / K)"
        className="hidden md:grid absolute right-3 top-1/2 -translate-y-[3.25rem] z-[55] h-11 w-11 place-items-center rounded-full bg-black/55 backdrop-blur ring-1 ring-white/20 text-white hover:bg-black/80 active:scale-95 transition"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); goNext(); }}
        aria-label="Próximo vídeo (↓)"
        title="Próximo (↓ / J)"
        className="hidden md:grid absolute right-3 top-1/2 translate-y-2 z-[55] h-11 w-11 place-items-center rounded-full bg-black/55 backdrop-blur ring-1 ring-white/20 text-white hover:bg-black/80 active:scale-95 transition"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {/* Scroller vertical snap */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory overscroll-contain no-scrollbar"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as any }}
      >
        {orderedItems.map((it, idx) => {
          const isActive = it.id === resolvedActiveId;
          // Player único: o <video> real é uma instância imperativa reutilizada
          // e movida para o slot do slide ativo. Os slides só renderizam poster.
          // Distância física no DOM, sem distância circular. A lógica circular
          // montava o último vídeo quando o primeiro estava ativo (e vice-versa),
          // criando decoder/rede invisível em mobile.
          const distance = Math.abs(idx - resolvedActiveIdx);
          const renderChrome = isActive;
          return (
            <section
              key={it.id}
              data-item-id={it.id}
              ref={(el) => setSlideRef(it.id, el)}
              className="snap-start h-full w-full relative bg-black"
              style={{ height: '100%', contain: 'layout paint size' }}
            >
              {it.media_url ? (
                <div className="absolute inset-0 bg-black">
                  {it.thumb_url && (isActive || !(leanMobile || isEconomic) || distance <= 1) ? (
                    <img
                      src={it.thumb_url}
                      alt=""
                      loading={isActive || distance <= 1 ? 'eager' : 'lazy'}
                      decoding="async"
                      draggable={false}
                      className={cn('absolute inset-0 h-full w-full object-cover pointer-events-none', isActive ? 'opacity-100' : 'opacity-90')}
                    />
                  ) : null}
                  <div
                    ref={(el) => setPlayerSlotRef(it.id, el)}
                    className="absolute inset-0 z-[2] bg-black"
                    data-reusable-video-slot={it.id}
                  />
                </div>
              ) : (
                <div className="grid place-items-center h-full w-full text-white/60 text-sm">
                  Vídeo indisponível
                </div>
              )}

              {renderChrome && (
                <>
                  {/* Ações verticais */}
                  <div className="absolute right-2 bottom-28 z-40 pointer-events-auto" data-no-swipe>
                    <OcultoPlayActions
                      orientation="vertical"
                      itemId={it.id}
                      liked={it.liked_by_me}
                      disliked={it.disliked_by_me}
                      saved={it.saved_by_me}
                      likeCount={it.like_count}
                      dislikeCount={it.dislike_count}
                      commentCount={it.comment_count}
                      saveCount={it.save_count}
                      shareCount={it.share_count}
                      viewCount={it.view_count}
                      onLike={() => handleLike(it)}
                      onDislike={() => handleDislike(it)}
                      onSave={() => handleSave(it)}
                      onComment={onComment ? () => handleCommentInternal(it) : undefined}
                      onShare={() => handleShareInternal(it)}
                      onReport={onReport ? () => onReport(it) : undefined}
                      useShareMenu
                      shareTitle={it.title ?? it.caption}
                      shareAuthor={it.author_username}
                      shareAbovePlayer
                      showCollections={false}
                      isLikePending={actions.toggleLike.isPending && actions.toggleLike.variables === it.id}
                      isDislikePending={actions.toggleDislike.isPending && actions.toggleDislike.variables === it.id}
                      isSavePending={actions.toggleSave.isPending && actions.toggleSave.variables === it.id}
                      isSharePending={actions.registerShare.isPending && actions.registerShare.variables === it.id}
                    />
                  </div>

                  {/* Autor + título */}
                  <div className="absolute left-3 right-20 bottom-16 z-30 text-white pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                      <Avatar className="h-7 w-7 ring-2 ring-fuchsia-400/60">
                        {it.author_avatar_url && <AvatarImage src={it.author_avatar_url} />}
                        <AvatarFallback className="text-[10px]">
                          {(it.author_username ?? '?').slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-bold drop-shadow-md truncate">
                        @{it.author_username ?? 'usuario'}
                      </span>
                    </div>
                    {(it.title || it.caption) && (
                      <p className="mt-1 text-sm font-semibold line-clamp-2 break-words drop-shadow-md">
                        {it.title || it.caption}
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {activeItem?.media_url && (
        <ReusableTikTokVideoPlayer
          key="oculto-play-reusable-video"
          item={activeItem}
          slotRefs={playerSlotRefs}
          muted={globalMuted}
          paused={isPaused}
          economic={isEconomic}
          mobileOptimized={leanMobile}
          playbackQuality={adaptiveQuality}
          onAutoplayMutedFallback={handleAutoplayMutedFallback}
          onPlaybackStress={activateAntiStall}
          onFirstPlay={(itemId) => {
            if (!viewedRef.current.has(itemId)) {
              viewedRef.current.add(itemId);
              try { registerCardView(itemId); } catch { /* noop */ }
            }
          }}
          onEnded={goNext}
        />
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .oculto-play-lean .backdrop-blur,
        .oculto-play-lean .backdrop-blur-sm,
        .oculto-play-lean .backdrop-blur-md,
        .oculto-play-lean .backdrop-blur-lg {
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
        .oculto-play-lean * {
          transition-property: opacity, transform !important;
          transition-duration: 80ms !important;
          animation-duration: 400ms !important;
        }
      `}</style>
    </div>
  );
}

function buildPlaybackUrl(src: string, economic: boolean, mobileOptimized: boolean, playbackQuality: PlaybackQuality) {
  // Storage/CDN atual entrega MP4 único. Query fake (?q=low&h=360) não
  // transcodifica, apenas cria uma URL nova e força re-download/cache miss —
  // exatamente o travamento sentido ao alternar qualidade. Mantemos URL estável.
  void economic;
  void mobileOptimized;
  void playbackQuality;
  return src;
}

function ReusableTikTokVideoPlayer({
  item,
  slotRefs,
  muted,
  paused,
  economic,
  mobileOptimized,
  playbackQuality,
  onAutoplayMutedFallback,
  onPlaybackStress,
  onFirstPlay,
  onEnded,
}: {
  item: OPItem;
  slotRefs: RefObject<Map<string, HTMLDivElement>>;
  muted: boolean;
  paused: boolean;
  economic: boolean;
  mobileOptimized: boolean;
  playbackQuality: PlaybackQuality;
  onAutoplayMutedFallback?: () => void;
  onPlaybackStress?: () => void;
  onFirstPlay?: (itemId: string) => void;
  onEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeItemIdRef = useRef(item.id);
  const retryTimerRef = useRef<number | null>(null);
  const stallWatchTimerRef = useRef<number | null>(null);
  const decodeWatchTimerRef = useRef<number | null>(null);
  const frameCallbackIdRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const decoderRecoveryCountRef = useRef(0);
  const positionsRef = useRef<Map<string, number>>(new Map());
  const firstPlayRef = useRef<Set<string>>(new Set());
  // Acumula tempo de reprodução por item para registrar a view só após 10s reais.
  const viewFiredRef = useRef<Set<string>>(new Set());
  const playAccumByItemRef = useRef<Map<string, number>>(new Map());
  const playingSinceRef = useRef<number | null>(null);
  const VIEW_THRESHOLD_MS = 10_000;
  const lastProgressAtRef = useRef(0);
  const lastProgressTimeRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const lastFrameMediaTimeRef = useRef(0);
  const supportsFrameCallbackRef = useRef(false);
  const mutedRef = useRef(muted);
  const pausedRef = useRef(paused);
  const playbackSrcRef = useRef('');
  const onAutoplayMutedFallbackRef = useRef(onAutoplayMutedFallback);
  const onPlaybackStressRef = useRef(onPlaybackStress);
  const onFirstPlayRef = useRef(onFirstPlay);
  const onEndedRef = useRef(onEnded);

  const playbackSrc = useMemo(
    () => buildPlaybackUrl(item.media_url ?? '', economic, mobileOptimized, playbackQuality),
    [item.media_url, economic, mobileOptimized, playbackQuality],
  );

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { playbackSrcRef.current = playbackSrc; }, [playbackSrc]);
  useEffect(() => { onAutoplayMutedFallbackRef.current = onAutoplayMutedFallback; }, [onAutoplayMutedFallback]);
  useEffect(() => { onPlaybackStressRef.current = onPlaybackStress; }, [onPlaybackStress]);
  useEffect(() => { onFirstPlayRef.current = onFirstPlay; }, [onFirstPlay]);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallWatchTimerRef.current) {
      window.clearTimeout(stallWatchTimerRef.current);
      stallWatchTimerRef.current = null;
    }
  }, []);

  const safePlay = useCallback((v: HTMLVideoElement) => {
    if (pausedRef.current) return;
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        try {
          v.muted = true;
          onAutoplayMutedFallbackRef.current?.();
          const retry = v.play();
          if (retry && typeof retry.catch === 'function') retry.catch(() => {});
        } catch { /* noop */ }
      });
    }
  }, []);

  const recoverFrozenDecoder = useCallback((reason: 'frame-freeze' | 'hard-freeze') => {
    const el = videoRef.current;
    const currentId = activeItemIdRef.current;
    if (!el || !currentId || pausedRef.current || el.ended) return;
    onPlaybackStressRef.current?.();
    const resumeAt = Math.max(0, el.currentTime || positionsRef.current.get(currentId) || 0);
    positionsRef.current.set(currentId, resumeAt);
    decoderRecoveryCountRef.current += 1;
    if (decoderRecoveryCountRef.current > 5) {
      // Se o arquivo tem lacunas reais de frames, nenhum reload consegue criar
      // quadros. Avança para não deixar o usuário ouvindo áudio com imagem morta.
      try { el.pause(); } catch { /* noop */ }
      window.setTimeout(() => onEndedRef.current?.(), 80);
      return;
    }

    try {
      if (reason === 'frame-freeze' && decoderRecoveryCountRef.current <= 4) {
        // Primeiro tenta destravar o compositor; se o arquivo tiver lacunas reais
        // de PTS, pula progressivamente até o próximo quadro válido.
        const jumps = [0.08, 1.5, 4, 8];
        const jump = jumps[Math.min(jumps.length - 1, decoderRecoveryCountRef.current - 1)] ?? 0.08;
        const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Number.POSITIVE_INFINITY;
        el.currentTime = Math.max(0, Math.min(duration - 0.08, resumeAt + jump));
        safePlay(el);
        return;
      }
      // Depois recria o pipeline do decoder, preservando o tempo. Isso corrige
      // o caso clássico: áudio segue, imagem congelada, especialmente no iOS.
      el.pause();
      el.preload = 'metadata';
      el.src = playbackSrcRef.current;
      el.load();
      const restore = () => {
        if (activeItemIdRef.current !== currentId) return;
        try { if (resumeAt > 0 && Number.isFinite(resumeAt)) el.currentTime = resumeAt; } catch { /* noop */ }
        safePlay(el);
      };
      if (el.readyState >= 1) restore();
      else el.addEventListener('loadedmetadata', restore, { once: true });
    } catch {
      safePlay(el);
    }
  }, [safePlay]);

  const scheduleRetry = useCallback((reason: 'error' | 'stalled' | 'waiting') => {
    const v = videoRef.current;
    const currentId = activeItemIdRef.current;
    if (!v || !currentId) return;
    onPlaybackStressRef.current?.();
    positionsRef.current.set(currentId, Math.max(0, v.currentTime || 0));
    clearRetry();
    const nextAttempt = retryCountRef.current + 1;
    if (nextAttempt > 3) {
      clearRetry();
      try { v.pause(); } catch { /* noop */ }
      // Não deixa um arquivo legado/corrompido prender o usuário no slide.
      window.setTimeout(() => onEndedRef.current?.(), 120);
      return;
    }
    const attempt = Math.min(3, nextAttempt);
    retryCountRef.current = attempt;
    const delay = reason === 'waiting' || reason === 'stalled' ? 250 : 450 + attempt * 650;
    retryTimerRef.current = window.setTimeout(() => {
      const el = videoRef.current;
      if (!el || activeItemIdRef.current !== currentId) return;
      const resumeAt = positionsRef.current.get(currentId) ?? 0;
      try {
        el.preload = 'metadata';
        el.muted = mutedRef.current;
        if (reason === 'error' || attempt >= 2 || el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
          el.src = playbackSrcRef.current;
          el.load();
        } else if (resumeAt > 0 && Number.isFinite(resumeAt)) {
          el.currentTime = Math.max(0, resumeAt + 0.01);
        }
      } catch { /* noop */ }
      const restoreAndPlay = () => {
        if (activeItemIdRef.current !== currentId) return;
        try {
          if (resumeAt > 0 && Number.isFinite(resumeAt)) el.currentTime = resumeAt;
        } catch { /* noop */ }
        safePlay(el);
      };
      if (el.readyState >= 1) restoreAndPlay();
      else el.addEventListener('loadedmetadata', restoreAndPlay, { once: true });
    }, delay);
  }, [clearRetry, safePlay]);

  const watchPotentialStall = useCallback((reason: 'stalled' | 'waiting') => {
    const v = videoRef.current;
    if (!v || pausedRef.current || v.ended) return;
    if (v.readyState >= 3) {
      safePlay(v);
      return;
    }
    onPlaybackStressRef.current?.();
    if (stallWatchTimerRef.current) return;
    const id = activeItemIdRef.current;
    const observedTime = Math.max(0, v.currentTime || 0);
    try { v.play().catch(() => { /* noop */ }); } catch { /* noop */ }
    stallWatchTimerRef.current = window.setTimeout(() => {
      stallWatchTimerRef.current = null;
      const el = videoRef.current;
      if (!el || activeItemIdRef.current !== id || pausedRef.current || el.ended) return;
      const advanced = Math.max(0, el.currentTime || 0) > observedTime + 0.08;
      const recentlyProgressed = performance.now() - lastProgressAtRef.current < 1800;
      if (!advanced && !recentlyProgressed && el.readyState < 3) scheduleRetry(reason);
      else safePlay(el);
    }, reason === 'waiting' ? 3200 : 2400);
  }, [safePlay, scheduleRetry]);

  useEffect(() => {
    if (videoRef.current) return;
    const v = document.createElement('video');
    videoRef.current = v;
    v.className = 'absolute inset-0 h-full w-full bg-black object-cover pointer-events-none';
    v.controls = false;
    v.muted = mutedRef.current;
    v.defaultMuted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.autoplay = true;
    v.setAttribute('webkit-playsinline', 'true');
    v.setAttribute('controlsList', 'nodownload noremoteplayback nofullscreen');
    v.setAttribute('disablePictureInPicture', 'true');
    v.setAttribute('disableRemotePlayback', 'true');
    v.setAttribute('draggable', 'false');
    v.setAttribute('fetchpriority', 'high');

    // Acumula tempo de reprodução real do item ativo e dispara onFirstPlay
    // (registrar visualização) somente quando passar de 10s acumulados.
    const flushPlayAccum = () => {
      const id = activeItemIdRef.current;
      const startedAt = playingSinceRef.current;
      playingSinceRef.current = null;
      if (!id || startedAt == null) return;
      // Já contabilizado nesta sessão — não acumula mais nada para este item,
      // mesmo que o usuário pause, dê replay ou faça seek.
      if (viewFiredRef.current.has(id)) return;
      const delta = performance.now() - startedAt;
      if (delta <= 0) return;
      const prev = playAccumByItemRef.current.get(id) ?? 0;
      const next = prev + delta;
      playAccumByItemRef.current.set(id, next);
      if (next >= VIEW_THRESHOLD_MS) {
        viewFiredRef.current.add(id);
        try { onFirstPlayRef.current?.(id); } catch { /* noop */ }
      }
    };

    const onTime = () => {
      positionsRef.current.set(activeItemIdRef.current, Math.max(0, v.currentTime || 0));
      lastProgressAtRef.current = performance.now();
      lastProgressTimeRef.current = Math.max(0, v.currentTime || 0);
      // Tick de acumulação enquanto o vídeo segue tocando (curto-circuita se já firou).
      if (playingSinceRef.current != null && !viewFiredRef.current.has(activeItemIdRef.current)) {
        flushPlayAccum();
        playingSinceRef.current = performance.now();
      }
    };
    const onPlaying = () => {
      retryCountRef.current = 0;
      decoderRecoveryCountRef.current = 0;
      clearRetry();
      lastProgressAtRef.current = performance.now();
      lastProgressTimeRef.current = Math.max(0, v.currentTime || 0);
      lastFrameAtRef.current = performance.now();
      lastFrameMediaTimeRef.current = Math.max(0, v.currentTime || 0);
      markOcultoPlayMediaPlaying(`video:${activeItemIdRef.current}`);
      firstPlayRef.current.add(activeItemIdRef.current);
      // Só (re)inicia o cronômetro se a view ainda não foi contabilizada.
      // Replay/pause/seek após os 10s não geram nova contagem.
      if (!viewFiredRef.current.has(activeItemIdRef.current)) {
        playingSinceRef.current = performance.now();
      } else {
        playingSinceRef.current = null;
      }
    };
    const onPause = () => {
      flushPlayAccum();
      markOcultoPlayMediaStopped(`video:${activeItemIdRef.current}`);
    };
    const onEndedInternal = () => {
      flushPlayAccum();
      markOcultoPlayMediaStopped(`video:${activeItemIdRef.current}`);
      onEndedRef.current?.();
    };
    const onError = () => { flushPlayAccum(); scheduleRetry('error'); };
    const onStalled = () => watchPotentialStall('stalled');
    const onWaiting = () => {
      if (v.readyState < 3) watchPotentialStall('waiting');
    };

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEndedInternal);
    v.addEventListener('error', onError);
    v.addEventListener('stalled', onStalled);
    v.addEventListener('waiting', onWaiting);

    // Pausa o cronômetro de visualização quando o usuário troca de aba,
    // minimiza/bloqueia o navegador, perde foco da janela ou está prestes
    // a sair da página. Sem isto, contaríamos como "assistido" um vídeo
    // que ficou apenas tocando em segundo plano (ou descartado pelo SO).
    const pauseAccumDueToBlur = () => { flushPlayAccum(); };
    const resumeAccumIfPlaying = () => {
      const vid = videoRef.current;
      if (!vid || vid.paused || vid.ended) return;
      if (viewFiredRef.current.has(activeItemIdRef.current)) return;
      if (playingSinceRef.current == null) playingSinceRef.current = performance.now();
    };
    const onVisibility = () => {
      if (document.hidden) pauseAccumDueToBlur();
      else resumeAccumIfPlaying();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', pauseAccumDueToBlur);
    window.addEventListener('focus', resumeAccumIfPlaying);
    window.addEventListener('pagehide', pauseAccumDueToBlur);
    window.addEventListener('beforeunload', pauseAccumDueToBlur);


    const scheduleFrameWatch = () => {
      const rvfc = (v as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: (now: number, metadata: { mediaTime: number }) => void) => number;
        cancelVideoFrameCallback?: (id: number) => void;
      }).requestVideoFrameCallback;
      supportsFrameCallbackRef.current = typeof rvfc === 'function';
      if (!rvfc) return;
      const loop = (now: number, metadata: { mediaTime: number }) => {
        lastFrameAtRef.current = now;
        lastFrameMediaTimeRef.current = Number(metadata.mediaTime || 0);
        try { frameCallbackIdRef.current = rvfc.call(v, loop); } catch { frameCallbackIdRef.current = null; }
      };
      try { frameCallbackIdRef.current = rvfc.call(v, loop); } catch { frameCallbackIdRef.current = null; }
    };
    scheduleFrameWatch();

    decodeWatchTimerRef.current = window.setInterval(() => {
      if (pausedRef.current || v.paused || v.ended || document.hidden) return;
      const now = performance.now();
      const current = Math.max(0, v.currentTime || 0);
      const audioAdvanced = current > lastFrameMediaTimeRef.current + 1.1;
      const noRecentFrame = now - lastFrameAtRef.current > 2600;
      const noRecentTime = now - lastProgressAtRef.current > 3600;
      if (supportsFrameCallbackRef.current && audioAdvanced && noRecentFrame) recoverFrozenDecoder('frame-freeze');
      else if (noRecentTime && v.readyState >= 2) recoverFrozenDecoder('hard-freeze');
    }, 1200);

    return () => {
      clearRetry();
      if (decodeWatchTimerRef.current) {
        window.clearInterval(decodeWatchTimerRef.current);
        decodeWatchTimerRef.current = null;
      }
      const typedVideo = v as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void };
      if (frameCallbackIdRef.current != null && typedVideo.cancelVideoFrameCallback) {
        try { typedVideo.cancelVideoFrameCallback(frameCallbackIdRef.current); } catch { /* noop */ }
      }
      frameCallbackIdRef.current = null;
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEndedInternal);
      v.removeEventListener('error', onError);
      v.removeEventListener('stalled', onStalled);
      v.removeEventListener('waiting', onWaiting);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', pauseAccumDueToBlur);
      window.removeEventListener('focus', resumeAccumIfPlaying);
      window.removeEventListener('pagehide', pauseAccumDueToBlur);
      window.removeEventListener('beforeunload', pauseAccumDueToBlur);
      // Flush final: garante que o cronômetro pare ao desmontar o player.
      flushPlayAccum();
      try { v.pause(); } catch { /* noop */ }
      try { v.remove(); } catch { /* noop */ }
      videoRef.current = null;
    };
  }, [clearRetry, recoverFrozenDecoder, scheduleRetry, watchPotentialStall]);

  useEffect(() => {
    const v = videoRef.current;
    const slot = slotRefs.current?.get(item.id);
    if (!v || !slot || !item.media_url) return;
    const prevId = activeItemIdRef.current;
    const switchingItem = prevId !== item.id;
    if (prevId && prevId !== item.id) {
      positionsRef.current.set(prevId, Math.max(0, v.currentTime || 0));
      markOcultoPlayMediaStopped(`video:${prevId}`);
      // Scroll rápido: encerra qualquer cronômetro pendente sem creditar
      // o item anterior; se ele não atingiu 10s, o progresso parcial é
      // descartado para evitar somar tempo entre vídeos diferentes.
      playingSinceRef.current = null;
      if (!viewFiredRef.current.has(prevId)) {
        playAccumByItemRef.current.delete(prevId);
      }
    }
    activeItemIdRef.current = item.id;
    clearRetry();
    retryCountRef.current = 0;
    decoderRecoveryCountRef.current = 0;
    decoderRecoveryCountRef.current = 0;
    if (v.parentElement !== slot) slot.appendChild(v);
    v.poster = item.thumb_url ?? '';
    v.muted = muted;
    v.defaultMuted = true;
    v.preload = 'metadata';
    const resumeAt = positionsRef.current.get(item.id) ?? Math.max(0, Number(item.trim_start_seconds ?? 0));
    if (switchingItem || !v.getAttribute('src')) {
      try { v.pause(); } catch { /* noop */ }
      v.src = playbackSrc;
      try { v.load(); } catch { /* noop */ }
      const restore = () => {
        try { if (resumeAt > 0 && Number.isFinite(resumeAt)) v.currentTime = resumeAt; } catch { /* noop */ }
        if (!paused) safePlay(v);
      };
      if (v.readyState >= 1) restore();
      else v.addEventListener('loadedmetadata', restore, { once: true });
    } else if (!paused) {
      safePlay(v);
    }
  }, [clearRetry, item, muted, paused, playbackSrc, safePlay, slotRefs]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (paused) {
      try { v.pause(); } catch { /* noop */ }
    } else {
      safePlay(v);
    }
  }, [muted, paused, safePlay]);

  return null;
}
