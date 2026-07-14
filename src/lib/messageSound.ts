/**
 * messageSound — aviso sonoro de novas mensagens + vibração.
 *
 * Preferências do usuário persistidas em localStorage:
 *  - `oculto.chat.mute`            → "1" silencia o som
 *  - `oculto.chat.volume`          → 0..1 (default 1.0)
 *  - `oculto.chat.vibrate`         → "1" ativa vibração (default ativo)
 *  - `oculto.chat.vibrate.pattern` → JSON [on, off, on, ...] em ms
 *
 * O som usa um pool de 3 nós `<audio>` "destravados" no primeiro gesto do
 * usuário (autoplay policy mobile). Vibração usa `navigator.vibrate` quando
 * suportado — em devices sem suporte, vira no-op seguro.
 */

const SOUND_URL = '/sounds/icq-message.mp3';
const MIN_INTERVAL_MS = 250;
const AUDIO_POOL_SIZE = 3;

const LS_MUTE = 'oculto.chat.mute';
const LS_VOLUME = 'oculto.chat.volume';
const LS_VIBRATE = 'oculto.chat.vibrate';
const LS_VIBRATE_PATTERN = 'oculto.chat.vibrate.pattern';
const LS_MUTE_CONV_PREFIX = 'oculto.chat.mute.conv:';

/** Mute por conversa (persistido por dispositivo via localStorage). */
export function isConversationMuted(conversationId?: string | null): boolean {
  if (!conversationId) return false;
  try { return localStorage.getItem(LS_MUTE_CONV_PREFIX + conversationId) === '1'; } catch { return false; }
}
export function setConversationMuted(conversationId: string, muted: boolean) {
  if (!conversationId) return;
  try {
    if (muted) localStorage.setItem(LS_MUTE_CONV_PREFIX + conversationId, '1');
    else localStorage.removeItem(LS_MUTE_CONV_PREFIX + conversationId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('oculto:chat-mute-changed', { detail: { conversationId, muted } }));
    }
  } catch { /* noop */ }
}
export function getConversationMuteStorageKey(conversationId: string) {
  return LS_MUTE_CONV_PREFIX + conversationId;
}

export const DEFAULT_VOLUME = 1.0;
export const DEFAULT_VIBRATION_PATTERN: number[] = [60, 40, 90];
export const VIBRATION_MIN_MS = 10;
export const VIBRATION_MAX_MS = 800;

let audioPool: HTMLAudioElement[] = [];
let audioIndex = 0;
let lastPlayedAt = 0;
let unlocked = false;
let unlockInFlight = false;
let unlockListenersAttached = false;
let pendingNotificationSound = false;
const recentlyPlayedEventKeys = new Map<string, number>();
let queuedSoundTimeouts: number[] = [];

// ──────────────────────────────────────────────────────────────────────
// Capability detection
// ──────────────────────────────────────────────────────────────────────

export function isVibrationSupported(): boolean {
  try {
    return typeof navigator !== 'undefined'
      && typeof (navigator as any).vibrate === 'function';
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Preferências — getters / setters
// ──────────────────────────────────────────────────────────────────────

export function isChatSoundMuted(): boolean {
  try {
    const raw = localStorage.getItem(LS_MUTE);
    // Default: ATIVADO para todos os usuários. Usuário silencia explicitamente.
    if (raw === null) return false;
    return raw === '1';
  } catch { return false; }
}
export function setChatSoundMuted(muted: boolean) {
  try {
    // Persiste explicitamente "0" ou "1" — para diferenciar
    // "ainda não escolheu" (default muted) de "ativou".
    localStorage.setItem(LS_MUTE, muted ? '1' : '0');
  } catch { /* noop */ }
}

export function getChatVolume(): number {
  try {
    const raw = localStorage.getItem(LS_VOLUME);
    if (raw == null) return DEFAULT_VOLUME;
    const v = Number(raw);
    if (!Number.isFinite(v)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, v));
  } catch { return DEFAULT_VOLUME; }
}
export function setChatVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  try { localStorage.setItem(LS_VOLUME, String(v)); } catch { /* noop */ }
}

export function isChatVibrationEnabled(): boolean {
  if (!isVibrationSupported()) return false; // fallback seguro
  try {
    const raw = localStorage.getItem(LS_VIBRATE);
    if (raw == null) return true; // default: on quando suportado
    return raw === '1';
  } catch { return true; }
}
export function setChatVibrationEnabled(enabled: boolean) {
  try { localStorage.setItem(LS_VIBRATE, enabled ? '1' : '0'); }
  catch { /* noop */ }
}

function sanitizePattern(pattern: number[]): number[] {
  if (!Array.isArray(pattern) || pattern.length === 0) {
    return [...DEFAULT_VIBRATION_PATTERN];
  }
  return pattern
    .slice(0, 7)
    .map((n) => {
      const v = Math.round(Number(n));
      if (!Number.isFinite(v)) return 0;
      return Math.min(VIBRATION_MAX_MS, Math.max(0, v));
    });
}

export function getChatVibrationPattern(): number[] {
  try {
    const raw = localStorage.getItem(LS_VIBRATE_PATTERN);
    if (!raw) return [...DEFAULT_VIBRATION_PATTERN];
    const parsed = JSON.parse(raw);
    return sanitizePattern(parsed);
  } catch { return [...DEFAULT_VIBRATION_PATTERN]; }
}
export function setChatVibrationPattern(pattern: number[]) {
  try {
    localStorage.setItem(LS_VIBRATE_PATTERN, JSON.stringify(sanitizePattern(pattern)));
  } catch { /* noop */ }
}

// ──────────────────────────────────────────────────────────────────────
// Áudio pool
// ──────────────────────────────────────────────────────────────────────

function createAudioNode(): HTMLAudioElement | null {
  try {
    const audio = new Audio(SOUND_URL);
    audio.preload = 'auto';
    audio.setAttribute?.('playsinline', 'true');
    audio.volume = getChatVolume();
    return audio;
  } catch {
    return null;
  }
}

function ensureAudioPool(forceRecreate = false): HTMLAudioElement[] {
  if (typeof window === 'undefined') return [];
  if (forceRecreate) {
    audioPool = [];
    audioIndex = 0;
  }
  while (audioPool.length < AUDIO_POOL_SIZE) {
    const node = createAudioNode();
    if (!node) break;
    audioPool.push(node);
  }
  return audioPool;
}

async function primeAudioNode(audio: HTMLAudioElement) {
  const prevMuted = audio.muted;
  const prevVolume = audio.volume;
  try {
    audio.muted = true;
    audio.volume = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    return true;
  } catch {
    return false;
  } finally {
    audio.muted = prevMuted;
    audio.volume = prevVolume;
  }
}

function removeUnlockListeners() {
  if (typeof window === 'undefined' || !unlockListenersAttached) return;
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
  window.removeEventListener('touchstart', unlockAudio);
  unlockListenersAttached = false;
}

function flushPendingNotificationSound() {
  if (!pendingNotificationSound) return;
  pendingNotificationSound = false;

  if (!isChatSoundMuted()) {
    playFromPool(getChatVolume(), false);
  }
  triggerChatVibration();
}

function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (unlockInFlight) return;
  unlockInFlight = true;
  removeUnlockListeners();

  const pool = ensureAudioPool(true);
  void Promise.allSettled(pool.map((audio) => primeAudioNode(audio))).then((results) => {
    unlocked = results.some((result) => result.status === 'fulfilled' && result.value === true);
    if (unlocked) {
      flushPendingNotificationSound();
      return;
    }
    attachUnlock();
  }).finally(() => {
    unlockInFlight = false;
  });
}

function attachUnlock() {
  if (typeof window === 'undefined' || unlocked || unlockListenersAttached) return;

  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
  unlockListenersAttached = true;
}

function shouldPlayEvent(eventKey?: string) {
  if (!eventKey) return true;

  const now = Date.now();
  for (const [key, timestamp] of recentlyPlayedEventKeys.entries()) {
    if (now - timestamp > 5000) {
      recentlyPlayedEventKeys.delete(key);
    }
  }

  const lastForKey = recentlyPlayedEventKeys.get(eventKey);
  if (lastForKey && now - lastForKey < 1500) {
    return false;
  }

  recentlyPlayedEventKeys.set(eventKey, now);
  return true;
}

if (typeof window !== 'undefined') {
  attachUnlock();
}

function playFromPool(volume: number, queueOnBlock = false) {
  const pool = ensureAudioPool();
  if (pool.length === 0) return;
  const node = pool[audioIndex % pool.length];
  audioIndex += 1;
  try {
    node.pause();
    node.currentTime = 0;
    node.volume = Math.min(1, Math.max(0, volume));
    const p = node.play();
    if (p && typeof p.catch === 'function') {
      void p.then(() => {
        unlocked = true;
        removeUnlockListeners();
      }).catch(() => {
        unlocked = false;
        if (queueOnBlock) {
          pendingNotificationSound = true;
          attachUnlock();
        }
      });
    } else {
      unlocked = true;
      removeUnlockListeners();
    }
  } catch { /* noop */ }
}

// ──────────────────────────────────────────────────────────────────────
// Vibração
// ──────────────────────────────────────────────────────────────────────

function vibrateSafe(pattern: number[] | number) {
  if (!isVibrationSupported()) return false;
  try {
    return (navigator as any).vibrate(pattern) === true;
  } catch {
    return false;
  }
}

/**
 * Quando o som está desativado, intensifica a vibração para compensar:
 * dobra a duração de cada pulso e adiciona um terceiro pulso adicional.
 */
function getEffectiveVibrationPattern(): number[] {
  const base = getChatVibrationPattern();
  if (!isChatSoundMuted()) return base;
  const boosted: number[] = [];
  for (let i = 0; i < base.length; i++) {
    const v = base[i] ?? 0;
    // Índices pares = pulso (on); ímpares = pausa (off)
    boosted.push(i % 2 === 0 ? Math.min(VIBRATION_MAX_MS, Math.round(v * 2.2)) : v);
  }
  // Adiciona pausa curta + pulso extra para sinalizar com mais força
  boosted.push(80, Math.min(VIBRATION_MAX_MS, Math.round((base[0] ?? 60) * 2.2)));
  return boosted;
}

export function triggerChatVibration(): boolean {
  if (!isChatVibrationEnabled()) return false;
  return vibrateSafe(getEffectiveVibrationPattern());
}

/** Testa um padrão arbitrário sem persistir nada. */
export function playTestVibration(pattern?: number[]): boolean {
  if (!isVibrationSupported()) return false;
  return vibrateSafe(sanitizePattern(pattern ?? getEffectiveVibrationPattern()));
}

// ──────────────────────────────────────────────────────────────────────
// API pública
// ──────────────────────────────────────────────────────────────────────

/**
 * Toca o aviso de nova mensagem. Respeita mute/volume e dispara vibração
 * configurada. Falhas são silenciosas e o throttle evita overlap em rajada.
 */
export function playNewMessageSound(eventKey?: string, conversationId?: string | null) {
  if (!shouldPlayEvent(eventKey)) return;

  const convMuted = isConversationMuted(conversationId);

  const playEffects = () => {
    if (!isChatSoundMuted() && !convMuted) {
      playFromPool(getChatVolume(), true);
    }

    if (!unlocked && !convMuted) {
      pendingNotificationSound = true;
      attachUnlock();
    }

    if (!convMuted) {
      triggerChatVibration();
    }
  };

  const now = Date.now();
  const waitMs = Math.max(0, lastPlayedAt + MIN_INTERVAL_MS - now);
  lastPlayedAt = now + waitMs;

  if (waitMs > 0) {
    const timeoutId = window.setTimeout(() => {
      queuedSoundTimeouts = queuedSoundTimeouts.filter((id) => id !== timeoutId);
      playEffects();
    }, waitMs);
    queuedSoundTimeouts.push(timeoutId);
    return;
  }

  playEffects();
}

/** Toca imediatamente, ignorando mute e throttle — para o botão "Testar". */
export function playTestSound(volume?: number) {
  playFromPool(volume ?? getChatVolume());
}
