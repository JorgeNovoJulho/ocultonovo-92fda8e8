/**
 * ocultoPlayAudioSession — sessão compartilhada por item de áudio do Play.
 *
 * Um único HTMLAudioElement por `itemId`, mantido em memória, permite que
 * múltiplos componentes (player recolhido, modal expandido, drawer etc.)
 * reflitam a mesma reprodução sem reinicializar o áudio.
 */
import { attachAudioFxTracked, resumeAudioFxNow } from './ocultoPlayAudioFx';
import { enableOcultoPlayMiniPlayer } from './ocultoPlayMiniPlayerState';
import { pauseAllPreviews } from './ocultoPlayPreviewCoordinator';
import { abortInactivePreviewDownloads } from './ocultoPlayPreviewCache';

type State = { currentTime: number; duration: number; playing: boolean };
export type ActiveAudioState = State & { id: string; meta?: SharedAudioMeta | null };
type Listener = (s: State) => void;
type ActiveListener = (s: ActiveAudioState | null) => void;
const PLAY_TIMEOUT_MS = 6000;
export type SharedAudioQueueItem = {
  id: string;
  src: string;
  meta?: SharedAudioMeta;
  item?: unknown;
};

const audios = new Map<string, HTMLAudioElement>();
const listeners = new Map<string, Set<Listener>>();
const activeListeners = new Set<ActiveListener>();
const sourceById = new Map<string, string>();
const optimisticPlaying = new Set<string>();
const lastPlayStartedAt = new Map<string, number>();
const lastAudioUseAt = new Map<string, number>();
let activeAudioId: string | null = null;
let activeAudioMeta: SharedAudioMeta | null = null;
let audioQueue: SharedAudioQueueItem[] = [];
let queueShuffle = false;
let queueRepeatOne = false;
let queueRepeatAll = true;
let queueOnTrackChange: ((item: SharedAudioQueueItem) => void) | null = null;
let lastTrackChangeId: string | null = null;
let queueTransitioning = false;

function emit(id: string) {
  const a = audios.get(id);
  if (!a) return;
  const s: State = {
    currentTime: a.currentTime || 0,
    duration: isFinite(a.duration) ? a.duration : 0,
    playing: optimisticPlaying.has(id) || (!a.paused && !a.ended),
  };
  listeners.get(id)?.forEach((l) => l(s));
  if (activeAudioId === id) emitActive();
}

function emitActive() {
  if (!activeAudioId) {
    try { if ('mediaSession' in navigator) (navigator as any).mediaSession.playbackState = 'none'; } catch { /* noop */ }
    activeListeners.forEach((l) => l(null));
    return;
  }
  const a = audios.get(activeAudioId);
  if (!a) {
    activeListeners.forEach((l) => l(null));
    return;
  }
  const s: ActiveAudioState = {
    id: activeAudioId,
    currentTime: a.currentTime || 0,
    duration: isFinite(a.duration) ? a.duration : 0,
    playing: optimisticPlaying.has(activeAudioId) || (!a.paused && !a.ended),
    meta: activeAudioMeta,
  };
  try { if ('mediaSession' in navigator) (navigator as any).mediaSession.playbackState = s.playing ? 'playing' : 'paused'; } catch { /* noop */ }
  activeListeners.forEach((l) => l(s));
}

function installMediaSessionHandlers() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try { (navigator as any).mediaSession.setActionHandler('nexttrack', () => { void playNextSharedAudio(); }); } catch { /* noop */ }
  try { (navigator as any).mediaSession.setActionHandler('previoustrack', () => { void playPrevSharedAudio(); }); } catch { /* noop */ }
  try { (navigator as any).mediaSession.setActionHandler('pause', () => { if (activeAudioId) pauseSharedAudio(activeAudioId); }); } catch { /* noop */ }
  try {
    (navigator as any).mediaSession.setActionHandler('play', () => {
      const active = activeAudioId ? audioQueue.find((it) => it.id === activeAudioId) : audioQueue[0];
      if (active) void playQueuedAudio(active);
    });
  } catch { /* noop */ }
}

function stripHash(src: string): string {
  return String(src || '').split('#')[0];
}

function normalizeAudioSrc(src: string): string {
  try { return new URL(stripHash(src), window.location.href).href; }
  catch { return stripHash(src); }
}

function isMobileAudioRuntime(): boolean {
  try {
    const nav = navigator as NavigatorWithConnection;
    if ((nav as any).maxTouchPoints > 1) return true;
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    return window.innerWidth <= 768;
  } catch { return false; }
}

function maxAudioElements(): number {
  try {
    const nav = navigator as NavigatorWithConnection & { deviceMemory?: number; hardwareConcurrency?: number };
    if (nav.connection?.saveData) return 1;
    if (isMobileAudioRuntime()) return 2;
    if ((nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4) return 4;
  } catch { /* noop */ }
  return 8;
}

function disposeAudioElement(id: string, audio: HTMLAudioElement) {
  try { audio.pause(); } catch { /* noop */ }
  try { audio.removeAttribute('src'); audio.load(); } catch { /* noop */ }
  audios.delete(id);
  optimisticPlaying.delete(id);
  lastAudioUseAt.delete(id);
}

function enforceAudioBudget(keepIds: string[] = []) {
  const max = maxAudioElements();
  if (audios.size <= max) return;
  const keep = new Set(keepIds.filter(Boolean));
  if (activeAudioId) keep.add(activeAudioId);
  const candidates = Array.from(audios.entries())
    .filter(([id, audio]) => !keep.has(id) && audio.paused)
    .sort(([a], [b]) => (lastAudioUseAt.get(a) ?? 0) - (lastAudioUseAt.get(b) ?? 0));
  for (const [id, audio] of candidates) {
    if (audios.size <= max) break;
    disposeAudioElement(id, audio);
  }
}

function audioRuntimeId(audio: HTMLAudioElement, fallback: string): string {
  return ((audio as HTMLAudioElement & { __opAudioId?: string }).__opAudioId) || fallback;
}

function attachSharedAudioHandlers(audio: HTMLAudioElement, id: string) {
  const marked = audio as HTMLAudioElement & { __opHandlersAttached?: boolean; __opAudioId?: string };
  marked.__opAudioId = id;
  if (marked.__opHandlersAttached) return;
  marked.__opHandlersAttached = true;
  ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended', 'seeked'].forEach((ev) =>
    audio.addEventListener(ev, () => emit(audioRuntimeId(audio, id))),
  );
  audio.addEventListener('playing', () => {
    const currentId = audioRuntimeId(audio, id);
    optimisticPlaying.delete(currentId);
    try {
      const startedAt = lastPlayStartedAt.get(currentId);
      if (startedAt && performance.now() - startedAt > 1200) {
        console.warn('[oculto-play-audio] início lento', {
          id: currentId,
          ms: Math.round(performance.now() - startedAt),
          readyState: audio.readyState,
          networkState: audio.networkState,
          src: audio.currentSrc || audio.src,
        });
      }
    } catch { /* noop */ }
    emit(currentId);
  });
  audio.addEventListener('ended', () => {
    const currentId = audioRuntimeId(audio, id);
    optimisticPlaying.delete(currentId);
    if (activeAudioId === currentId && audioQueue.length > 0 && (queueRepeatOne || queueRepeatAll)) {
      void playNextSharedAudio('ended');
    }
  });
  audio.addEventListener('stalled', () => {
    const currentId = audioRuntimeId(audio, id);
    if (activeAudioId !== currentId || audio.paused || audio.ended) return;
    try {
      audio.preload = 'auto';
      if (audio.networkState === 3) audio.load();
      audio.play().catch(() => { /* noop */ });
    } catch { /* noop */ }
  });
  audio.addEventListener('waiting', () => {
    const currentId = audioRuntimeId(audio, id);
    if (activeAudioId !== currentId || audio.paused || audio.ended) return;
    try {
      audio.preload = 'auto';
      if (audio.networkState === 3) {
        const src = sourceById.get(currentId) || stripHash(audio.currentSrc || audio.src);
        const t = audio.currentTime || 0;
        if (src) {
          audio.src = src;
          audio.currentTime = t;
          audio.play().catch(() => { /* noop */ });
        }
      }
    } catch { /* noop */ }
  });
}

type AudioPreloadMode = 'none' | 'metadata' | 'auto';

function claimMobileAudioElement(id: string, normalizedSrc: string, preload: AudioPreloadMode): HTMLAudioElement | null {
  if (!isMobileAudioRuntime() || activeAudioId === id || !activeAudioId) return null;
  // CRÍTICO: só "rouba" o elemento <audio> ativo quando estivermos no caminho
  // real de play (preload='auto' em playQueuedAudio). Durante prewarm
  // (preload='metadata' ou 'none'), roubar o elemento pausaria a música que
  // está tocando — bug que cortava o áudio aos ~4-5s em mobile quando o
  // prewarmAround disparava para a próxima faixa.
  if (preload !== 'auto') return null;
  const active = audios.get(activeAudioId);
  if (!active) return null;
  // Se o áudio ativo ainda está tocando, NÃO rouba seu elemento.
  if (!active.paused && !active.ended) return null;
  const oldId = activeAudioId;
  try { active.pause(); } catch { /* noop */ }
  optimisticPlaying.delete(oldId);
  emit(oldId);
  audios.delete(oldId);
  sourceById.delete(oldId);
  (active as HTMLAudioElement & { __opAudioId?: string }).__opAudioId = id;
  try {
    active.preload = preload;
    active.src = normalizedSrc;
    active.currentTime = 0;
  } catch { /* noop */ }
  audios.set(id, active);
  sourceById.set(id, normalizedSrc);
  attachSharedAudioHandlers(active, id);
  return active;
}

type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
function cancelAudioPrimeQueue(keepUrl?: string | null) {
  // Priming HTTP removido: fetch paralelo duplicava o download do <audio>.
}

function deprioritizeInactiveAudioDownloads(exceptId: string) {
  audios.forEach((other, otherId) => {
    if (otherId === exceptId || !other.paused) return;
    try {
      const mobile = isMobileAudioRuntime();
      if (!mobile && (other.networkState !== 2 || other.readyState >= 2)) return;
      const src = sourceById.get(otherId) || stripHash(other.currentSrc || other.src);
      if (!src) return;
      other.preload = 'none';
      other.removeAttribute('src');
      other.load();
      sourceById.set(otherId, src);
      if (mobile) disposeAudioElement(otherId, other);
    } catch { /* noop */ }
  });
}

function waitForMediaReady(a: HTMLAudioElement): Promise<void> {
  if (!a.paused || a.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => cleanup(resolve), PLAY_TIMEOUT_MS);
    const cleanup = (done: (value?: any) => void) => {
      window.clearTimeout(timeout);
      a.removeEventListener('playing', onReady);
      a.removeEventListener('canplay', onReady);
      a.removeEventListener('loadeddata', onReady);
      a.removeEventListener('error', onError);
      done();
    };
    const onReady = () => cleanup(resolve);
    const onError = () => cleanup(reject);
    a.addEventListener('playing', onReady, { once: true });
    a.addEventListener('canplay', onReady, { once: true });
    a.addEventListener('loadeddata', onReady, { once: true });
    a.addEventListener('error', onError, { once: true });
  });
}

function getBufferedAhead(audio: HTMLAudioElement): number {
  try {
    const current = audio.currentTime || 0;
    for (let i = 0; i < audio.buffered.length; i += 1) {
      const start = audio.buffered.start(i);
      const end = audio.buffered.end(i);
      if (current >= start && current <= end) return Math.max(0, end - current);
    }
  } catch { /* noop */ }
  return 0;
}

function canUseBandwidthForBackgroundWarm(exceptId?: string): boolean {
  if (!activeAudioId || activeAudioId === exceptId) return true;
  const active = audios.get(activeAudioId);
  if (!active || active.paused) return true;
  return active.readyState >= 4 || getBufferedAhead(active) >= (isMobileAudioRuntime() ? 18 : 28);
}

function getAdjacentQueueItem(dir: 1 | -1, fromId = activeAudioId): SharedAudioQueueItem | null {
  const pool = audioQueue.filter((it) => it.id && it.src);
  if (!pool.length) return null;
  if (queueShuffle && pool.length > 1) {
    const others = pool.filter((it) => it.id !== fromId);
    const ready = others.filter((it) => {
      const a = audios.get(it.id);
      if (!a) return false;
      if (a.readyState >= 2) return true;
      try {
        for (let i = 0; i < a.buffered.length; i += 1) {
          if (a.buffered.end(i) - a.buffered.start(i) >= 0.8) return true;
        }
      } catch { /* noop */ }
      return false;
    });
    const candidates = ready.length ? ready : others;
    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  }
  const idx = fromId ? pool.findIndex((it) => it.id === fromId) : -1;
  return pool[idx >= 0 ? (idx + dir + pool.length) % pool.length : 0] ?? null;
}

function prewarmAround(id: string) {
  if (isMobileAudioRuntime()) return;
  const idx = audioQueue.findIndex((it) => it.id === id);
  if (idx < 0 || audioQueue.length < 2) return;
  const next = audioQueue[(idx + 1) % audioQueue.length];
  if (!next?.src || !canUseBandwidthForBackgroundWarm(next.id)) return;
  try { prewarmAudio(next.id, next.src, true); } catch { /* noop */ }
}

export function getOrCreateAudio(id: string, src: string | undefined, preload: AudioPreloadMode = 'none'): HTMLAudioElement | null {
  if (!src) return audios.get(id) ?? null;
  const normalizedSrc = normalizeAudioSrc(src);
  let a = audios.get(id);
  lastAudioUseAt.set(id, performance.now());
  if (!a) {
    const claimed = claimMobileAudioElement(id, normalizedSrc, preload);
    if (claimed) {
      lastAudioUseAt.set(id, performance.now());
      return claimed;
    }
    // Cria sem `src`, configura preload primeiro e só então aponta a URL.
    // Essa ordem evita que alguns browsers iniciem em modo metadata antes do
    // preload=auto, reduzindo a latência do primeiro play em mobile.
    a = new Audio();
    // Mantém reprodução nativa: crossOrigin em mídia externa pode bloquear
    // o áudio quando o storage/CDN não expõe CORS perfeito. WebAudio/EQ entra
    // apenas quando seguro; o caminho crítico é clicar e tocar imediatamente.
    // Por padrão usamos metadata para NÃO baixar várias músicas completas no
    // feed. No clique real, playQueuedAudio promove para preload='auto'.
    a.preload = preload;
    a.autoplay = false;
    a.src = normalizedSrc;
    sourceById.set(id, normalizedSrc);
    attachSharedAudioHandlers(a, id);
    audios.set(id, a);
    enforceAudioBudget([id]);
    // FX é anexado de forma assíncrona (idle) para não bloquear o caminho
    // crítico do primeiro play. AudioContext suspended por política do
    // browser é resumido no evento 'play' (ver attachAudioFx).
    const attach = () => { try { attachAudioFxTracked(a!); } catch { /* noop */ } };
    if (typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(attach, { timeout: 500 });
    } else {
      setTimeout(attach, 0);
    }
  } else if (src) {
    const previous = sourceById.get(id) ?? stripHash(a.currentSrc || a.src);
    const actual = stripHash(a.currentSrc || a.src);
    if (previous !== normalizedSrc || actual !== normalizedSrc) {
      a.preload = preload;
      a.src = normalizedSrc;
      sourceById.set(id, normalizedSrc);
    } else if (preload === 'auto' && a.preload !== 'auto') {
      a.preload = 'auto';
    }
  }
  lastAudioUseAt.set(id, performance.now());
  return a;
}

/** Pré-aquece um áudio (warm-up) sem reproduzir. Chame só para a faixa provável. */
export function prewarmAudio(id: string, src: string | undefined, force = false): void {
  if (!src) return;
  if (!force && !canUseBandwidthForBackgroundWarm(id)) return;
  if (isMobileAudioRuntime() && activeAudioId && activeAudioId !== id && audios.size >= maxAudioElements() && !audios.has(id)) {
    // Em mobile saturado: NÃO faz prime HTTP paralelo. O <audio> nativo
    // dará conta sozinho quando o usuário clicar.
    return;
  }
  const a = getOrCreateAudio(id, src, 'metadata');
  if (!a) return;
  try {
    if (a.preload !== 'metadata') a.preload = 'metadata';
    if (a.readyState === 0 && a.networkState !== 2) a.load();
    // REMOVIDO: primeAudioHttpCache paralelo. Duplicava conexões com o próprio
    // <audio preload=auto>, atrasando o primeiro byte audível em 2-10s.
  } catch { /* noop */ }
}

export function subscribeAudio(id: string, l: Listener): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(l);
  // entrega estado atual imediatamente
  queueMicrotask(() => emit(id));
  return () => {
    set!.delete(l);
  };
}

export function getAudioState(id: string): State {
  const a = audios.get(id);
  return {
    currentTime: a?.currentTime ?? 0,
    duration: a && isFinite(a.duration) ? a.duration : 0,
    playing: optimisticPlaying.has(id) || (!!a && !a.paused && !a.ended),
  };
}

export function getActiveAudioState(): ActiveAudioState | null {
  if (!activeAudioId) return null;
  const a = audios.get(activeAudioId);
  if (!a) return null;
  return {
    id: activeAudioId,
    currentTime: a.currentTime || 0,
    duration: isFinite(a.duration) ? a.duration : 0,
    playing: optimisticPlaying.has(activeAudioId) || (!a.paused && !a.ended),
    meta: activeAudioMeta,
  };
}

export function subscribeActiveAudio(l: ActiveListener): () => void {
  activeListeners.add(l);
  queueMicrotask(() => l(getActiveAudioState()));
  return () => { activeListeners.delete(l); };
}

export type SharedAudioMeta = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  artwork?: string | null;
};

export function setMediaSessionMeta(meta: SharedAudioMeta | null | undefined): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (!meta) {
      (navigator as any).mediaSession.metadata = null;
      return;
    }
    const art = meta.artwork
      ? [
          { src: meta.artwork, sizes: '96x96',  type: 'image/png' },
          { src: meta.artwork, sizes: '256x256', type: 'image/png' },
          { src: meta.artwork, sizes: '512x512', type: 'image/png' },
        ]
      : [];
    (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
      title:  meta.title  ?? 'Oculto Play',
      artist: meta.artist ?? 'Oculto',
      album:  meta.album  ?? 'Oculto Play',
      artwork: art,
    });
  } catch { /* noop */ }
}

export function configureSharedAudioQueue(
  items: SharedAudioQueueItem[],
  options: { shuffle?: boolean; repeatOne?: boolean; repeatAll?: boolean; onTrackChange?: (item: SharedAudioQueueItem) => void } = {},
): void {
  audioQueue = items.filter((it) => !!it.id && !!it.src);
  queueShuffle = !!options.shuffle;
  queueRepeatOne = !!options.repeatOne;
  if (typeof options.repeatAll === 'boolean') queueRepeatAll = options.repeatAll;
  queueOnTrackChange = options.onTrackChange ?? queueOnTrackChange;
  installMediaSessionHandlers();
  const anchor = activeAudioId && audioQueue.some((it) => it.id === activeAudioId)
    ? activeAudioId
    : audioQueue[0]?.id;
  enforceAudioBudget(anchor ? [anchor] : []);
  // Não faz aquecimento automático em massa ao carregar/configurar a fila.
  // Baixar várias músicas completas em paralelo saturava as conexões HTTP e
  // causava delay/travamentos no áudio clicado pelo usuário.
}

export async function playQueuedAudio(item: SharedAudioQueueItem): Promise<void> {
  cancelAudioPrimeQueue(item.src);
  const a = getOrCreateAudio(item.id, item.src, 'auto');
  if (!a) return;
  // Pausa somente outros players compartilhados antes do play. Operações mais
  // caras (previews/cache/media session/UI extra) são adiadas para depois de
  // chamar play(), preservando o gesto do usuário e iniciando a rede agora.
  audios.forEach((other, otherId) => {
    if (otherId !== item.id && !other.paused) {
      try { other.pause(); } catch { /* noop */ }
    }
    if (otherId !== item.id) optimisticPlaying.delete(otherId);
  });
  enforceAudioBudget([item.id]);
  activeAudioId = item.id;
  activeAudioMeta = item.meta ?? activeAudioMeta;
  try {
    if (a.preload !== 'auto') a.preload = 'auto';
    if (!a.src && item.src) {
      a.src = normalizeAudioSrc(item.src);
      sourceById.set(item.id, normalizeAudioSrc(item.src));
    }
    if (a.networkState === 3) {
      a.src = normalizeAudioSrc(item.src);
      sourceById.set(item.id, normalizeAudioSrc(item.src));
    }
    if (a.readyState === 0 && a.networkState !== 2) a.load();
    if ((a.ended || (isFinite(a.duration) && a.duration > 0 && a.currentTime >= a.duration - 0.12))) a.currentTime = 0;
    // NÃO chamamos a.load() aqui — o prewarm/preload='auto' já iniciou o
    // download. Chamar load() de novo cancela o buffer atual e adiciona
    // 1-3s de latência ao primeiro play.
  } catch { /* noop */ }
  // Evita prewarm/fetch no caminho crítico do clique: em conexões lentas ele
  // compete com a request real do <audio>. Se não há buffer, o play() inicia o
  // download imediatamente; se já há buffer, não tocamos nele.
  optimisticPlaying.add(item.id);
  // Emite estado otimista (playing=true) ANTES da promise de play resolver,
  // para que a UI responda instantaneamente ao toque.
  emit(item.id);
  emitActive();
  // Dispara play() imediatamente — manter síncrono com o gesto do usuário
  // é essencial para que o navegador autorize a reprodução.
  try { lastPlayStartedAt.set(item.id, performance.now()); } catch { /* noop */ }
  const playPromise = a.play();
  // Tudo abaixo é pós-play: não pode atrasar a chamada real de reprodução.
  try { resumeAudioFxNow(); } catch { /* noop */ }
  try { deprioritizeInactiveAudioDownloads(item.id); } catch { /* noop */ }
  // REMOVIDO: primeAudioHttpCache pós-play — duplicava o request do <audio>.
  try {
    if (lastTrackChangeId !== item.id) {
      lastTrackChangeId = item.id;
      queueMicrotask(() => { try { queueOnTrackChange?.(item); } catch { /* noop */ } });
    }
  } catch { /* noop */ }
  try { window.setTimeout(() => { try { pauseAllPreviews(); } catch { /* noop */ } }, 0); } catch { /* noop */ }
  try { window.setTimeout(() => { try { abortInactivePreviewDownloads({ url: item.src }); } catch { /* noop */ } }, 0); } catch { /* noop */ }
  try { window.setTimeout(() => { try { enableOcultoPlayMiniPlayer(); } catch { /* noop */ } }, 0); } catch { /* noop */ }
  window.setTimeout(() => {
    if (optimisticPlaying.has(item.id) && a.paused) {
      optimisticPlaying.delete(item.id);
      emit(item.id);
      emitActive();
    }
  }, PLAY_TIMEOUT_MS + 900);
  playPromise.catch(() => {
    if (a.paused) {
      optimisticPlaying.delete(item.id);
      emit(item.id);
      emitActive();
    }
  });
  // Meta + prewarm vizinhos podem rodar em paralelo, sem bloquear.
  if (item.meta) { try { setMediaSessionMeta(item.meta); } catch { /* noop */ } }
  try { window.setTimeout(() => prewarmAround(item.id), isMobileAudioRuntime() ? 4500 : 2500); } catch { /* noop */ }
  try {
    await Promise.race([playPromise, waitForMediaReady(a)]);
  } catch (err) {
    optimisticPlaying.delete(item.id);
    emit(item.id);
    emitActive();
    throw err;
  }
}

export async function playNextSharedAudio(reason: 'manual' | 'ended' = 'manual'): Promise<void> {
  if (queueTransitioning) return;
  const currentId = activeAudioId;
  queueTransitioning = true;
  try {
    if (reason === 'ended' && queueRepeatOne && currentId) {
      const current = audioQueue.find((it) => it.id === currentId);
      if (current) {
        try { seekSharedAudio(current.id, 0); } catch { /* noop */ }
        await playQueuedAudio(current);
      }
      return;
    }
    const next = getAdjacentQueueItem(1, currentId);
    if (!next || next.id === currentId) return;
    await playQueuedAudio(next);
  }
  finally { queueTransitioning = false; }
}

export async function playPrevSharedAudio(): Promise<void> {
  if (queueTransitioning) return;
  const prev = getAdjacentQueueItem(-1, activeAudioId);
  if (!prev || prev.id === activeAudioId) return;
  queueTransitioning = true;
  try { await playQueuedAudio(prev); }
  finally { queueTransitioning = false; }
}

async function resolveOfflineAudioUrl(id: string): Promise<string | null> {
  try {
    const offline = await import('./ocultoPlayOfflineCache');
    const sb = await import('./supabaseExternal');
    const { data } = await (sb as any).supabase.auth.getSession();
    const uid = data?.session?.user?.id as string | undefined;
    if (!uid || !(await offline.isAudioOffline(id))) return null;
    const url = await offline.getOfflinePlaybackUrl(id, uid);
    if (!url) return null;
    // Revoga depois de ~10min para liberar memória.
    setTimeout(() => { try { offline.revokeOfflineUrl(url); } catch { /* noop */ } }, 10 * 60 * 1000);
    return url;
  } catch {
    return null;
  }
}

export function playSharedAudio(
  id: string,
  src: string | undefined,
  meta?: SharedAudioMeta,
): Promise<void> {
  const queued = audioQueue.find((it) => it.id === id);
  const resolvedMeta = meta ?? queued?.meta;
  const queuedItem = queued?.item;
  const immediateSrc = src ?? queued?.src ?? '';
  const playWith = (audioSrc: string) => playQueuedAudio({ id, src: audioSrc, meta: resolvedMeta, item: queuedItem });

  // Caminho crítico: chama play() sem awaits prévios para preservar o gesto do
  // usuário em mobile. O fallback offline só roda se não houver src ou se a
  // reprodução de rede falhar.
  if (!immediateSrc) {
    return resolveOfflineAudioUrl(id).then((offlineSrc) => {
      if (offlineSrc) return playWith(offlineSrc);
      throw new Error('audio source unavailable');
    });
  }

  return playWith(immediateSrc).catch(async (err) => {
    const offlineSrc = await resolveOfflineAudioUrl(id);
    if (offlineSrc && offlineSrc !== immediateSrc) return playWith(offlineSrc);
    throw err;
  });
}


export function pauseSharedAudio(id: string): void {
  const a = audios.get(id);
  if (a && !a.paused) {
    try { a.pause(); } catch { /* noop */ }
  }
  optimisticPlaying.delete(id);
  emit(id);
  if (activeAudioId === id) emitActive();
}

export function seekSharedAudio(id: string, seconds: number): void {
  const a = audios.get(id);
  if (a) {
    try { a.currentTime = Math.max(0, seconds); } catch { /* noop */ }
  }
}

export function pauseAllSharedAudio(): void {
  audios.forEach((a) => {
    if (!a.paused) { try { a.pause(); } catch { /* noop */ } }
  });
  optimisticPlaying.clear();
  if (activeAudioId) emit(activeAudioId);
  emitActive();
}

/**
 * Constrói SharedAudioMeta a partir de um item do Oculto Play
 * (campos resolvidos pela RPC oculto_play_feed).
 */
export function ocultoPlayMetaFromItem(item: any): SharedAudioMeta {
  if (!item) return {};
  return {
    title: item.title || item.caption || 'Oculto Play',
    artist: item.author_display_name || item.author_username || 'Oculto',
    album: 'Oculto Play',
    artwork: item.thumb_url || item.media_url || null,
  };
}
