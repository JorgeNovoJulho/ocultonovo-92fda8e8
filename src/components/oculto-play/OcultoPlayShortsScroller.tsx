/**
 * OcultoPlayShortsScroller — feed vertical infinito estilo TikTok (v2).
 *
 * Por que foi reescrito: a versão anterior usava UM único <video> que trocava
 * de `src` a cada rolagem — cada troca recomeçava o download do zero (troca
 * lenta), o slot tinha fundo preto por cima da capa (tela preta até carregar)
 * e um monitor de quadros rodava o tempo todo (engasgos em celular).
 *
 * Agora:
 *   - POOL DE 3 PLAYERS fixos: o vídeo atual + os 2 próximos. Os próximos já
 *     ficam carregando no próprio slide, então ao rolar o vídeo começa na hora.
 *     Os elementos nunca são recriados — só trocam de vídeo quando saem da
 *     janela (sem acúmulo de players / decoders).
 *   - A CAPA fica visível até o primeiro quadro (o <video> aparece por cima
 *     só quando tem imagem) — nunca tela preta.
 *   - Começa mudo (regra dos navegadores) com aviso grande "Toque para ativar
 *     o som". O toque libera o som nos 3 players de uma vez (iOS exige gesto
 *     por elemento), então os próximos já tocam com som.
 *   - Gestos: toque = pausa/continua · dois toques = curtir · segurar = 2x ·
 *     arrastar para a esquerda = abrir o perfil do criador.
 *   - Visualização conta após 2 s assistidos (tempo real de mídia, aba visível).
 *   - Barra de progresso fina e indicador de carregamento só se demorar.
 *
 * Ações laterais (like / dislike / save / comentar / compartilhar) seguem
 * usando `useOcultoPlayActions` (mesma engine do feed). "Infinito": quando o
 * slide ativo chega aos últimos 3, chamamos `onNearEnd()`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Volume2, VolumeX, Leaf, Play, Heart, Loader2, AlertTriangle } from 'lucide-react';
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
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useOcultoPlaySessionScoreStore } from '@/store/useOcultoPlaySessionScoreStore';
import { markOcultoPlayMediaPlaying, markOcultoPlayMediaStopped } from '@/lib/ocultoPlayActivity';
import { stopOcultoPlayMedia } from '@/lib/ocultoPlayMediaStop';

const POOL_SIZE = 3;
const VIEW_THRESHOLD_MS = 2_000;
const STALL_SKIP_MS = 7_000;
const BUFFER_HINT_DELAY_MS = 500;
const DOUBLE_TAP_MS = 280;
const HOLD_MS = 380;
const GAP_ITEMS_KEY = 'oculto-play:file-gap-items';

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

/* ------------------------------------------------------------------ */
/* Pool de players                                                      */
/* ------------------------------------------------------------------ */

interface PoolEntry {
  v: HTMLVideoElement;
  itemId: string | null;
  item: OPItem | null;
  retried: boolean;
}

const trimStartOf = (it: OPItem | null | undefined) => {
  const n = Number(it?.trim_start_seconds ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const trimEndOf = (it: OPItem | null | undefined) => {
  const n = Number(it?.trim_end_seconds ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
};

interface PoolOptions {
  items: OPItem[];
  activeIdx: number;
  slotRefs: RefObject<Map<string, HTMLDivElement>>;
  muted: boolean;
  paused: boolean;
  economic: boolean;
  /** Celular / aparelho modesto (base: Realme C55): menos vídeos carregados ao mesmo tempo. */
  lowEnd: boolean;
  onAutoplayBlocked: () => void;
  /** O ARQUIVO tem buracos de imagem gravados (não é o aparelho). */
  onFileGaps?: (itemId: string) => void;
  onView: (itemId: string) => void;
  onEnded: () => void;
  onBuffering: (buffering: boolean) => void;
  onProgress: (ratio: number) => void;
}

function useShortsVideoPool(opts: PoolOptions) {
  const poolRef = useRef<PoolEntry[]>([]);
  const currentIdRef = useRef<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const viewAccumRef = useRef<Map<string, number>>(new Map());
  const viewedRef = useRef<Set<string>>(new Set());
  const lastMediaTimeRef = useRef<WeakMap<HTMLVideoElement, number>>(new WeakMap());
  const lastProgressAtRef = useRef(0);
  const bufferTimerRef = useRef<number | null>(null);
  const bufferingRef = useRef(false);
  // Aparelho perdendo quadros na decodificação → só o vídeo atual fica carregado.
  const [lowPower, setLowPower] = useState(false);
  const lowPowerRef = useRef(false);
  lowPowerRef.current = lowPower;
  const nextUpgradedRef = useRef(false);
  const qualityBaseRef = useRef<{ total: number; dropped: number; at: number } | null>(null);
  const gapStateRef = useRef<{ id: string | null; token: number; lastMedia: number; lastDropped: number; gaps: number; reported: Set<string> }>({ id: null, token: 0, lastMedia: -1, lastDropped: 0, gaps: 0, reported: new Set() });

  const isCurrent = useCallback((e: PoolEntry) => !!e.itemId && e.itemId === currentIdRef.current, []);

  const clearBuffer = useCallback(() => {
    if (bufferTimerRef.current) {
      window.clearTimeout(bufferTimerRef.current);
      bufferTimerRef.current = null;
    }
    if (bufferingRef.current) {
      bufferingRef.current = false;
      optsRef.current.onBuffering(false);
    }
  }, []);

  const startBuffer = useCallback(() => {
    if (bufferTimerRef.current || bufferingRef.current) return;
    bufferTimerRef.current = window.setTimeout(() => {
      bufferTimerRef.current = null;
      bufferingRef.current = true;
      optsRef.current.onBuffering(true);
    }, BUFFER_HINT_DELAY_MS);
  }, []);

  const safePlay = useCallback((e: PoolEntry) => {
    const v = e.v;
    let p: Promise<void> | undefined;
    try { p = v.play(); } catch { return; }
    if (p && typeof p.catch === 'function') {
      p.catch((err: { name?: string } | undefined) => {
        if (!isCurrent(e)) return;
        // Navegador recusou som sem gesto: toca mudo e mostra o aviso.
        if (err?.name === 'NotAllowedError' && !v.muted) {
          v.muted = true;
          optsRef.current.onAutoplayBlocked();
          v.play().catch(() => { /* noop */ });
        }
      });
    }
  }, [isCurrent]);

  const reloadAt = useCallback((e: PoolEntry) => {
    const src = e.item?.media_url;
    if (!src) return;
    const at = Math.max(0, e.v.currentTime || 0);
    e.retried = true;
    try {
      e.v.src = src;
      e.v.load();
    } catch { /* noop */ }
    e.v.addEventListener('loadedmetadata', () => {
      try { if (at > 0) e.v.currentTime = at; } catch { /* noop */ }
      if (isCurrent(e) && !optsRef.current.paused) safePlay(e);
    }, { once: true });
  }, [isCurrent, safePlay]);

  // Cria os 3 players UMA vez.
  useEffect(() => {
    const entries: PoolEntry[] = [];
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const v = document.createElement('video');
      v.className = 'absolute inset-0 h-full w-full object-cover pointer-events-none';
      v.style.opacity = '0';
      v.style.transition = 'opacity 120ms linear';
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.controls = false;
      v.preload = 'metadata';
      v.setAttribute('playsinline', 'true');
      v.setAttribute('webkit-playsinline', 'true');
      v.setAttribute('controlsList', 'nodownload noremoteplayback nofullscreen');
      v.setAttribute('disablePictureInPicture', 'true');
      v.setAttribute('disableRemotePlayback', 'true');
      v.setAttribute('draggable', 'false');
      const e: PoolEntry = { v, itemId: null, item: null, retried: false };

      const show = () => { v.style.opacity = '1'; };
      v.addEventListener('loadeddata', show);
      v.addEventListener('loadedmetadata', () => {
        const ts = trimStartOf(e.item);
        if (ts > 0 && v.currentTime < ts) {
          try { v.currentTime = ts; } catch { /* noop */ }
        }
      });
      v.addEventListener('playing', () => {
        show();
        if (!isCurrent(e)) return;
        lastProgressAtRef.current = performance.now();
        clearBuffer();
        markOcultoPlayMediaPlaying(`video:${e.itemId}`);
      });
      v.addEventListener('pause', () => {
        if (e.itemId) markOcultoPlayMediaStopped(`video:${e.itemId}`);
      });
      v.addEventListener('waiting', () => { if (isCurrent(e)) startBuffer(); });
      v.addEventListener('timeupdate', () => {
        if (!isCurrent(e) || !e.itemId) return;
        const id = e.itemId;
        lastProgressAtRef.current = performance.now();
        clearBuffer();
        const t = Math.max(0, v.currentTime || 0);
        const prev = lastMediaTimeRef.current.get(v) ?? t;
        lastMediaTimeRef.current.set(v, t);
        const delta = t - prev;
        if (!viewedRef.current.has(id) && delta > 0 && delta < 1.5 && !document.hidden) {
          const acc = (viewAccumRef.current.get(id) ?? 0) + delta * 1000;
          viewAccumRef.current.set(id, acc);
          if (acc >= VIEW_THRESHOLD_MS) {
            viewedRef.current.add(id);
            try { optsRef.current.onView(id); } catch { /* noop */ }
          }
        }
        const ts = trimStartOf(e.item);
        const te = trimEndOf(e.item);
        const fallbackDur = Number(e.item?.duration_sec ?? 0);
        const end = te ?? (Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (fallbackDur > 0 ? fallbackDur : 0));
        // O próximo vídeo só começa a baixar de verdade depois que o atual
        // engrenou (1 s), para não disputar rede/decodificador na largada.
        if (!nextUpgradedRef.current && t - ts >= 1 && !lowPowerRef.current) {
          nextUpgradedRef.current = true;
          for (const other of entries) {
            if (other !== e && other.itemId && other.v.preload !== 'auto') other.v.preload = 'auto';
          }
        }
        if (end > ts) optsRef.current.onProgress(Math.min(1, Math.max(0, (t - ts) / (end - ts))));
        if (te && t >= te) {
          try { v.pause(); } catch { /* noop */ }
          optsRef.current.onEnded();
        }
      });
      v.addEventListener('ended', () => { if (isCurrent(e)) optsRef.current.onEnded(); });
      v.addEventListener('error', () => {
        if (!isCurrent(e) || !e.v.getAttribute('src')) return;
        if (!e.retried) reloadAt(e);
        else optsRef.current.onEnded(); // arquivo com defeito: não prende o usuário
      });
      entries.push(e);
    }
    poolRef.current = entries;

    // Vigia de travamento: sem progresso por 7 s → recarrega uma vez, depois pula.
    const watch = window.setInterval(() => {
      const cur = entries.find(isCurrent);
      if (!cur || optsRef.current.paused || cur.v.paused || cur.v.ended || document.hidden) return;
      // Quadros descartados pelo decodificador (aparelho no limite).
      try {
        const q = cur.v.getVideoPlaybackQuality?.();
        if (q && !lowPowerRef.current) {
          const now = performance.now();
          const base = qualityBaseRef.current;
          if (!base) {
            qualityBaseRef.current = { total: q.totalVideoFrames, dropped: q.droppedVideoFrames, at: now };
          } else if (now - base.at >= 3000) {
            const dTotal = q.totalVideoFrames - base.total;
            const dDropped = q.droppedVideoFrames - base.dropped;
            qualityBaseRef.current = { total: q.totalVideoFrames, dropped: q.droppedVideoFrames, at: now };
            if (dTotal >= 30 && dDropped / dTotal > 0.2) {
              console.warn('[shorts] aparelho perdendo quadros — liberando vídeos pré-carregados');
              setLowPower(true);
            }
          }
        }
      } catch { /* noop */ }
      if (performance.now() - lastProgressAtRef.current < STALL_SKIP_MS) return;
      lastProgressAtRef.current = performance.now();
      if (!cur.retried) reloadAt(cur);
      else optsRef.current.onEnded();
    }, 1000);

    return () => {
      window.clearInterval(watch);
      if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
      for (const e of entries) {
        try { e.v.pause(); } catch { /* noop */ }
        if (e.itemId) markOcultoPlayMediaStopped(`video:${e.itemId}`);
        try { e.v.removeAttribute('src'); e.v.load(); } catch { /* noop */ }
        try { e.v.remove(); } catch { /* noop */ }
      }
      poolRef.current = [];
    };
  }, [isCurrent, clearBuffer, startBuffer, reloadAt]);

  /**
   * Detecta buracos GRAVADOS no arquivo: a imagem salta >110 ms entre dois
   * quadros apresentados sem que o decodificador tenha descartado nada.
   * Acontecia com vídeos gravados no envio por aparelhos que não
   * acompanhavam o tempo real.
   */
  const watchFileGaps = useCallback((e: PoolEntry) => {
    const v = e.v as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
    };
    if (typeof v.requestVideoFrameCallback !== 'function' || !e.itemId) return;
    const st = gapStateRef.current;
    if (st.reported.has(e.itemId)) return;
    st.id = e.itemId;
    st.token += 1;
    st.lastMedia = -1;
    st.gaps = 0;
    const id = e.itemId;
    const token = st.token;
    const loop = (_now: number, meta: { mediaTime: number }) => {
      if (e.itemId !== id || currentIdRef.current !== id || st.id !== id || st.token !== token) return;
      const t = Number(meta?.mediaTime ?? 0);
      let dropped = 0;
      try { dropped = v.getVideoPlaybackQuality?.().droppedVideoFrames ?? 0; } catch { /* noop */ }
      if (st.lastMedia >= 0 && v.playbackRate === 1) {
        const d = t - st.lastMedia;
        if (d > 0.11 && d < 2 && dropped === st.lastDropped) st.gaps += 1;
      }
      st.lastMedia = t;
      st.lastDropped = dropped;
      if (st.gaps >= 6 && !st.reported.has(id)) {
        st.reported.add(id);
        try { optsRef.current.onFileGaps?.(id); } catch { /* noop */ }
        return;
      }
      try { v.requestVideoFrameCallback!(loop); } catch { /* noop */ }
    };
    try { v.requestVideoFrameCallback(loop); } catch { /* noop */ }
  }, []);

  // Distribui os players: atual + 2 próximos (só 1 próximo no celular / modo econômico).
  const wanted = useMemo(() => {
    const list: OPItem[] = [];
    const add = (it: OPItem | undefined) => {
      if (it?.media_url && !list.some((x) => x.id === it.id)) list.push(it);
    };
    add(opts.items[opts.activeIdx]);
    add(opts.items[opts.activeIdx + 1]);
    if (!opts.economic && !opts.lowEnd && !lowPower) add(opts.items[opts.activeIdx + 2]);
    return list;
  }, [opts.items, opts.activeIdx, opts.economic, opts.lowEnd, lowPower]);
  const wantedKey = wanted.map((w) => `${w.id}|${w.media_url}`).join(',');
  const activeId = opts.items[opts.activeIdx]?.id ?? null;

  useEffect(() => {
    const entries = poolRef.current;
    if (!entries.length) return;
    const o = optsRef.current;
    const wantedIds = new Set(wanted.map((w) => w.id));

    if (currentIdRef.current !== activeId) {
      currentIdRef.current = activeId;
      nextUpgradedRef.current = false;
      qualityBaseRef.current = null;
      lastProgressAtRef.current = performance.now();
      clearBuffer();
      o.onProgress(0);
    }

    // Libera players cujo vídeo saiu da janela.
    const free: PoolEntry[] = [];
    for (const e of entries) {
      if (e.itemId && wantedIds.has(e.itemId)) continue;
      if (e.itemId) {
        try { e.v.pause(); } catch { /* noop */ }
        markOcultoPlayMediaStopped(`video:${e.itemId}`);
        try { e.v.removeAttribute('src'); e.v.load(); } catch { /* noop */ }
        try { e.v.remove(); } catch { /* noop */ }
      }
      e.v.style.opacity = '0';
      e.itemId = null;
      e.item = null;
      e.retried = false;
      free.push(e);
    }

    wanted.forEach((it, rank) => {
      let e = entries.find((x) => x.itemId === it.id);
      if (!e) {
        e = free.shift();
        if (!e) return;
        e.itemId = it.id;
        e.item = it;
        e.retried = false;
        e.v.style.opacity = '0';
        // Só o atual baixa tudo de cara; os próximos ficam no cabeçalho até o atual engrenar.
        e.v.preload = rank === 0 ? 'auto' : 'metadata';
        lastMediaTimeRef.current.delete(e.v);
        try {
          e.v.src = it.media_url as string;
          e.v.load();
        } catch { /* noop */ }
      } else {
        e.item = it;
        if (rank === 0 && e.v.preload !== 'auto') e.v.preload = 'auto';
      }
      const slot = o.slotRefs.current?.get(it.id);
      if (slot && e.v.parentElement !== slot) slot.appendChild(e.v);

      if (rank === 0) {
        e.v.muted = o.muted;
        e.v.playbackRate = 1;
        if (!o.paused) safePlay(e);
        watchFileGaps(e);
      } else {
        if (!e.v.paused) { try { e.v.pause(); } catch { /* noop */ } }
        e.v.muted = true;
        const ts = trimStartOf(it);
        if (e.v.readyState >= 1 && Math.abs((e.v.currentTime || 0) - ts) > 0.3) {
          try { e.v.currentTime = ts; } catch { /* noop */ }
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, activeId, safePlay, clearBuffer, watchFileGaps]);

  // Som / pausa do vídeo atual.
  useEffect(() => {
    const e = poolRef.current.find(isCurrent);
    if (!e) return;
    e.v.muted = opts.muted;
    if (opts.paused) {
      try { e.v.pause(); } catch { /* noop */ }
    } else if (e.v.paused && !e.v.ended) {
      safePlay(e);
    }
  }, [opts.muted, opts.paused, isCurrent, safePlay]);

  /** Chamar DENTRO de um toque do usuário: libera som nos 3 players. */
  const unlockSound = useCallback(() => {
    for (const e of poolRef.current) {
      if (isCurrent(e)) {
        e.v.muted = false;
        safePlay(e);
        continue;
      }
      if (!e.v.getAttribute('src')) continue;
      try {
        e.v.muted = false;
        const p = e.v.play();
        e.v.pause();
        e.v.muted = true;
        if (p && typeof p.catch === 'function') p.catch(() => { /* noop */ });
      } catch { /* noop */ }
    }
  }, [isCurrent, safePlay]);

  const setRate = useCallback((rate: number) => {
    const e = poolRef.current.find(isCurrent);
    if (e) { try { e.v.playbackRate = rate; } catch { /* noop */ } }
  }, [isCurrent]);

  const restartCurrent = useCallback(() => {
    const e = poolRef.current.find(isCurrent);
    if (!e) return;
    try { e.v.currentTime = trimStartOf(e.item); } catch { /* noop */ }
    safePlay(e);
  }, [isCurrent, safePlay]);

  return useMemo(() => ({ unlockSound, setRate, restartCurrent }), [unlockSound, setRate, restartCurrent]);
}

/* ------------------------------------------------------------------ */
/* Scroller                                                             */
/* ------------------------------------------------------------------ */

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
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Map<string, HTMLElement>>(new Map());
  const playerSlotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const actions = useOcultoPlayActions();
  const registerCardView = useRegisterOcultoPlayCardView();
  const bumpScore = useOcultoPlaySessionScoreStore((s) => s.bump);

  // Seed no topo da fila + DEDUP por id (anexar via onNearEnd não pode
  // duplicar clipes já na fila).
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
  // Sempre começa mudo: é a única forma de autoplay garantido em todos os
  // navegadores. O aviso "Toque para ativar o som" libera o som.
  const [globalMuted, setGlobalMuted] = useState<boolean>(true);
  const [userChoseMute, setUserChoseMute] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [buffering, setBuffering] = useState<boolean>(false);
  const [fastForward, setFastForward] = useState<boolean>(false);
  const [hearts, setHearts] = useState<Array<{ key: number; x: number; y: number }>>([]);
  const [leanMobile, setLeanMobile] = useState<boolean>(() => {
    try {
      const nav = navigator as Navigator & { deviceMemory?: number };
      return (window.matchMedia?.('(pointer: coarse)').matches ?? false)
        || window.innerWidth <= 768
        || (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4);
    } catch { return true; }
  });
  const { data: isMaster } = useIsMasterAdmin();
  const [gapItems, setGapItems] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(GAP_ITEMS_KEY) || '[]')); } catch { return new Set<string>(); }
  });
  const activeIdRef = useRef(seedId);
  const { isDataSaverEnabled, toggleDataSaver, source: ecoSource, qualityLabel, connectionKind } = useDataSaver();
  const isEconomic = isDataSaverEnabled;

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

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

  // Posiciona o scroll inicial no seed sem animação.
  useEffect(() => {
    const el = slideRefs.current.get(seedId);
    if (el) {
      try { el.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slide ativo = o que ocupa mais da tela (estável em swipes rápidos/iOS).
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
          activeIdRef.current = bestId;
          setActiveId(bestId);
        }
      },
      { root, threshold: [0, 0.25, 0.6, 0.9, 1] },
    );
    slideRefs.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [orderedItems]);

  const activeIdx = Math.max(0, orderedItems.findIndex((it) => it.id === activeId));
  const activeItem = orderedItems[activeIdx] ?? orderedItems[0];

  // Ao trocar de vídeo: volta a tocar, velocidade normal, avisa o pai e
  // pede mais itens perto do fim.
  useEffect(() => {
    setIsPaused(false);
    setFastForward(false);
    setBuffering(false);
    const it = orderedItems[activeIdx];
    if (!it) return;
    onActiveChange?.(it);
    if (onNearEnd && activeIdx >= orderedItems.length - 3) onNearEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Ao desmontar (fechar modal, sair da página): para tudo dentro do container.
  useEffect(() => () => {
    try { stopOcultoPlayMedia(containerRef.current, { pauseSharedAudio: false }); } catch { /* noop */ }
  }, []);

  const goToIndex = useCallback((idx: number, behavior: ScrollBehavior = 'smooth') => {
    if (!orderedItems.length) return;
    const targetIndex = ((idx % orderedItems.length) + orderedItems.length) % orderedItems.length;
    const target = orderedItems[targetIndex];
    if (!target) return;
    const el = slideRefs.current.get(target.id);
    if (el) {
      try { el.scrollIntoView({ behavior, block: 'start' }); } catch { /* noop */ }
      activeIdRef.current = target.id;
      setActiveId(target.id);
    }
  }, [orderedItems]);

  const goNext = useCallback(() => {
    const idx = orderedItems.findIndex((it) => it.id === activeIdRef.current);
    const wraps = idx >= orderedItems.length - 1;
    goToIndex(idx < 0 ? 0 : idx + 1, wraps ? 'auto' : 'smooth');
  }, [orderedItems, goToIndex]);

  const goPrev = useCallback(() => {
    const idx = orderedItems.findIndex((it) => it.id === activeIdRef.current);
    const wraps = idx <= 0;
    goToIndex(idx < 0 ? orderedItems.length - 1 : idx - 1, wraps ? 'auto' : 'smooth');
  }, [orderedItems, goToIndex]);

  const handleEnded = useCallback(() => {
    if (orderedItems.length <= 1) { pool.restartCurrent(); return; }
    goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedItems.length, goNext]);

  const handleView = useCallback((itemId: string) => {
    try { registerCardView(itemId); } catch { /* noop */ }
  }, [registerCardView]);

  const handleProgress = useCallback((ratio: number) => {
    const bar = progressBarRef.current;
    if (bar) bar.style.transform = `scaleX(${ratio})`;
  }, []);

  const pool = useShortsVideoPool({
    items: orderedItems,
    activeIdx,
    slotRefs: playerSlotRefs,
    muted: globalMuted,
    paused: isPaused,
    economic: isEconomic,
    lowEnd: leanMobile,
    onAutoplayBlocked: () => { setGlobalMuted(true); setUserChoseMute(false); },
    onFileGaps: (itemId) => {
      console.warn('[shorts] arquivo com quadros faltando:', itemId);
      setGapItems((prev) => {
        if (prev.has(itemId)) return prev;
        const next = new Set(prev).add(itemId);
        try { localStorage.setItem(GAP_ITEMS_KEY, JSON.stringify([...next].slice(-200))); } catch { /* noop */ }
        return next;
      });
    },
    onView: handleView,
    onEnded: handleEnded,
    onBuffering: setBuffering,
    onProgress: handleProgress,
  });

  const enableSound = useCallback(() => {
    pool.unlockSound();
    setUserChoseMute(false);
    setGlobalMuted(false);
  }, [pool]);

  const toggleMute = useCallback(() => {
    if (globalMuted) {
      enableSound();
    } else {
      setUserChoseMute(true);
      setGlobalMuted(true);
    }
  }, [globalMuted, enableSound]);

  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  // Atalhos de teclado: ↑/↓/PageUp/PageDown/J/K = navegar,
  // Espaço = play/pause, M = som, Esc = fechar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowDown': case 'PageDown': case 'j': case 'J':
          e.preventDefault(); goNext(); break;
        case 'ArrowUp': case 'PageUp': case 'k': case 'K':
          e.preventDefault(); goPrev(); break;
        case ' ':
          e.preventDefault(); togglePause(); break;
        case 'm': case 'M':
          e.preventDefault(); toggleMute(); break;
        case 'Escape':
          e.preventDefault(); onClose(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, togglePause, toggleMute, onClose]);

  // Loop nas pontas: último + avançar volta ao primeiro, e vice-versa.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let startY: number | null = null;
    const atEdge = () => {
      const idx = orderedItems.findIndex((it) => it.id === activeIdRef.current);
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
  }, [orderedItems, goToIndex]);

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

  const openAuthor = useCallback((it: OPItem) => {
    const target = it.author_username || it.author_id;
    if (!target) return;
    onClose();
    navigate(`/creator/${encodeURIComponent(target)}`);
  }, [navigate, onClose]);

  // ---- Gestos na área do vídeo ----
  const gestureRef = useRef<{
    x: number; y: number; t: number; moved: boolean; holding: boolean; holdTimer: number | null;
  } | null>(null);
  const lastTapRef = useRef<{ t: number; timer: number | null }>({ t: 0, timer: null });

  const endHold = useCallback(() => {
    const g = gestureRef.current;
    if (g?.holdTimer) { window.clearTimeout(g.holdTimer); g.holdTimer = null; }
    if (g?.holding) {
      g.holding = false;
      pool.setRate(1);
      setFastForward(false);
    }
  }, [pool]);

  const onGesturePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, holding: false, holdTimer: null as number | null };
    g.holdTimer = window.setTimeout(() => {
      g.holdTimer = null;
      if (g.moved) return;
      g.holding = true;
      pool.setRate(2);
      setFastForward(true);
    }, HOLD_MS);
    gestureRef.current = g;
  }, [pool]);

  const onGesturePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.moved) return;
    if (Math.abs(e.clientX - g.x) > 12 || Math.abs(e.clientY - g.y) > 12) {
      g.moved = true;
      if (g.holdTimer) { window.clearTimeout(g.holdTimer); g.holdTimer = null; }
    }
  }, []);

  const onGesturePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>, it: OPItem) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.holdTimer) { window.clearTimeout(g.holdTimer); g.holdTimer = null; }
    if (g.holding) {
      pool.setRate(1);
      setFastForward(false);
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    // Arrastar para a esquerda → perfil do criador.
    if (dx < -70 && Math.abs(dy) < 50) { openAuthor(it); return; }
    if (g.moved || performance.now() - g.t > 350) return;

    const now = performance.now();
    const last = lastTapRef.current;
    if (now - last.t < DOUBLE_TAP_MS) {
      // Dois toques → curtir (sem descurtir, como no TikTok) + coração.
      if (last.timer) { window.clearTimeout(last.timer); last.timer = null; }
      last.t = 0;
      if (!it.liked_by_me) handleLike(it);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const key = now;
      setHearts((h) => [...h, { key, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
      window.setTimeout(() => setHearts((h) => h.filter((x) => x.key !== key)), 800);
      return;
    }
    last.t = now;
    last.timer = window.setTimeout(() => {
      last.timer = null;
      togglePause();
    }, DOUBLE_TAP_MS);
  }, [pool, openAuthor, handleLike, togglePause]);

  const setSlideRef = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) { slideRefs.current.delete(id); return; }
    slideRefs.current.set(id, el);
  }, []);

  const setPlayerSlotRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) { playerSlotRefs.current.delete(id); return; }
    playerSlotRefs.current.set(id, el);
  }, []);

  if (!orderedItems.length) return null;

  const showSoundPrompt = globalMuted && !userChoseMute;

  return (
    <div className={cn('relative w-full h-full bg-black', (leanMobile || isEconomic) && 'oculto-play-lean')}>
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

      <div
        className="absolute left-3 z-[60]"
        style={{ top: 'calc(max(0.75rem, env(safe-area-inset-top)) + 3.25rem)' }}
      >
        <OcultoPlaySessionScoreHUD />
      </div>

      {/* Som + ECO no topo, entre o X e a coluna de ações. */}
      <div
        className="absolute z-[70] flex flex-row items-center justify-center gap-2 left-1/2 -translate-x-1/2 max-[360px]:gap-1.5"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))', maxWidth: 'calc(100% - 8rem)' }}
        role="toolbar"
        aria-label="Controles de áudio e qualidade"
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          aria-label={globalMuted ? 'Ativar som do vídeo' : 'Silenciar vídeo'}
          aria-pressed={globalMuted}
          title={globalMuted ? 'Ativar som (M)' : 'Silenciar (M)'}
          className="h-11 w-11 min-h-11 min-w-11 grid place-items-center rounded-full bg-black/70 backdrop-blur ring-2 ring-white/30 text-white shadow-xl hover:bg-black/90 active:scale-95 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80"
        >
          {globalMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleDataSaver(); }}
          aria-label={isEconomic ? `Desativar Modo Econômico (atual: ${qualityLabel})` : 'Ativar Modo Econômico'}
          title={
            isEconomic
              ? `Modo Econômico ativo • ${qualityLabel}${ecoSource === 'auto' ? ` (auto · ${connectionKind === 'cellular' ? 'rede móvel' : 'conexão lenta'})` : ' (manual)'} — toque para desligar`
              : 'Ativar Modo Econômico (carrega menos vídeos à frente)'
          }
          aria-pressed={isEconomic}
          className={cn(
            'h-11 min-h-11 px-3 grid grid-flow-col items-center gap-1.5 rounded-full backdrop-blur ring-2 text-white shadow-xl active:scale-95 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/80',
            isEconomic ? 'bg-emerald-500/90 ring-emerald-300/60 hover:bg-emerald-500' : 'bg-black/70 ring-white/30 hover:bg-black/90',
          )}
        >
          <Leaf className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          <span className="text-[11px] font-bold leading-none">ECO</span>
        </button>
      </div>

      {/* Navegação desktop (md+) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); goPrev(); }}
        aria-label="Vídeo anterior (↑)"
        title="Anterior (↑ / K)"
        className="hidden md:grid absolute right-3 top-1/2 -translate-y-[3.25rem] z-[55] h-11 w-11 place-items-center rounded-full bg-black/55 backdrop-blur ring-1 ring-white/20 text-white hover:bg-black/80 active:scale-95 transition"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); goNext(); }}
        aria-label="Próximo vídeo (↓)"
        title="Próximo (↓ / J)"
        className="hidden md:grid absolute right-3 top-1/2 translate-y-2 z-[55] h-11 w-11 place-items-center rounded-full bg-black/55 backdrop-blur ring-1 ring-white/20 text-white hover:bg-black/80 active:scale-95 transition"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {/* Aviso grande de som */}
      {showSoundPrompt && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); enableSound(); }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[65] flex items-center gap-2.5 rounded-full bg-black/75 px-5 py-3.5 text-white text-base font-bold shadow-2xl ring-2 ring-white/40 backdrop-blur active:scale-95 transition animate-fade-in"
          aria-label="Toque para ativar o som"
        >
          <Volume2 className="h-6 w-6" />
          Toque para ativar o som
        </button>
      )}

      {/* Só o master: aviso de arquivo gravado com falhas (precisa reenviar). */}
      {isMaster === true && activeItem && gapItems.has(activeItem.id) && (
        <div
          role="status"
          className="absolute left-1/2 -translate-x-1/2 z-[66] w-[min(92%,22rem)] rounded-xl bg-amber-500/95 px-3 py-2 text-[12px] font-semibold leading-snug text-black shadow-xl"
          style={{ top: 'calc(max(0.75rem, env(safe-area-inset-top)) + 3.75rem)' }}
        >
          <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" /> Arquivo gravado com falhas</span>
          <span className="block font-normal">A imagem deste vídeo foi salva com quadros faltando. Reenvie o vídeo original para ele rodar liso. (só você vê este aviso)</span>
        </div>
      )}

      {/* Scroller vertical snap */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory overscroll-contain no-scrollbar"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as any }}
      >
        {orderedItems.map((it, idx) => {
          const isActive = idx === activeIdx;
          const distance = idx - activeIdx;
          // Capa só perto do ativo (economiza memória em filas longas).
          const showThumb = !!it.thumb_url && distance >= -2 && distance <= 3;
          return (
            <section
              key={it.id}
              data-item-id={it.id}
              ref={(el) => setSlideRef(it.id, el)}
              className="snap-start snap-always h-full w-full relative bg-black"
              style={{ height: '100%', contain: 'layout paint size' }}
            >
              {it.media_url ? (
                <div className="absolute inset-0 bg-black">
                  {showThumb && (
                    <img
                      src={it.thumb_url as string}
                      alt=""
                      loading={Math.abs(distance) <= 1 ? 'eager' : 'lazy'}
                      decoding="async"
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                    />
                  )}
                  {/* Slot do player: SEM fundo — a capa fica visível até o 1º quadro. */}
                  <div
                    ref={(el) => setPlayerSlotRef(it.id, el)}
                    className="absolute inset-0 z-[2]"
                    data-reusable-video-slot={it.id}
                  />
                </div>
              ) : (
                <div className="grid place-items-center h-full w-full text-white/60 text-sm">
                  Vídeo indisponível
                </div>
              )}

              {isActive && (
                <>
                  {/* Camada de gestos (toque, 2 toques, segurar, arrastar) */}
                  <div
                    className="absolute inset-0 z-[20] select-none"
                    style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}
                    onPointerDown={onGesturePointerDown}
                    onPointerMove={onGesturePointerMove}
                    onPointerUp={(e) => onGesturePointerUp(e, it)}
                    onPointerCancel={() => { endHold(); gestureRef.current = null; }}
                    onPointerLeave={() => endHold()}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-hidden="true"
                  >
                    {hearts.map((h) => (
                      <Heart
                        key={h.key}
                        className="absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 fill-rose-500 text-rose-500 drop-shadow-2xl pointer-events-none animate-[ping_0.8s_ease-out_1]"
                        style={{ left: h.x, top: h.y }}
                      />
                    ))}
                    {isPaused && (
                      <div className="absolute inset-0 grid place-items-center pointer-events-none">
                        <div className="h-20 w-20 rounded-full bg-black/45 grid place-items-center">
                          <Play className="h-10 w-10 text-white fill-white translate-x-0.5" />
                        </div>
                      </div>
                    )}
                    {buffering && !isPaused && (
                      <div className="absolute inset-0 grid place-items-center pointer-events-none">
                        <Loader2 className="h-10 w-10 text-white/90 animate-spin drop-shadow-lg" />
                      </div>
                    )}
                    {fastForward && (
                      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-white text-sm font-bold pointer-events-none">
                        2x ▶▶
                      </div>
                    )}
                  </div>

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
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openAuthor(it); }}
                      className="flex items-center gap-2 pointer-events-auto"
                    >
                      <Avatar className="h-7 w-7 ring-2 ring-fuchsia-400/60">
                        {it.author_avatar_url && <AvatarImage src={it.author_avatar_url} />}
                        <AvatarFallback className="text-[10px]">
                          {(it.author_username ?? '?').slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-bold drop-shadow-md truncate">
                        @{it.author_username ?? 'usuario'}
                      </span>
                    </button>
                    {(it.title || it.caption) && (
                      <p className="mt-1 text-sm font-semibold line-clamp-2 break-words drop-shadow-md">
                        {it.title || it.caption}
                      </p>
                    )}
                  </div>

                  {/* Barra de progresso */}
                  <div className="absolute left-0 right-0 bottom-0 z-30 h-[3px] bg-white/20 pointer-events-none">
                    <div
                      ref={progressBarRef}
                      className="h-full w-full origin-left bg-white/90"
                      style={{ transform: 'scaleX(0)' }}
                    />
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {/* Mantém referência para o item ativo (acessibilidade / leitores de tela) */}
      <span className="sr-only" aria-live="polite">
        {activeItem ? `Vídeo ${activeIdx + 1} de ${orderedItems.length}${activeItem.title ? `: ${activeItem.title}` : ''}` : ''}
      </span>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .oculto-play-lean .backdrop-blur,
        .oculto-play-lean .backdrop-blur-sm,
        .oculto-play-lean .backdrop-blur-md,
        .oculto-play-lean .backdrop-blur-lg {
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
      `}</style>
    </div>
  );
}
