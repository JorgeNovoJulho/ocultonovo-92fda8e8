/**
 * attentionPing — som + vibração reforçados para "Chamar Atenção".
 *
 * Som padrão: /sounds/attention-call.mp3
 * Fallback:   /sounds/icq-message.mp3
 *
 * Preferências (localStorage):
 *  - `oculto.attention.mute`   → "1" silencia o som de atenção
 *  - `oculto.attention.volume` → 0..1 (default 1.0)
 */

import { isVibrationSupported } from "@/lib/messageSound";

const PRIMARY_URL = "/sounds/attention-call.mp3";
const FALLBACK_URL = "/sounds/icq-message.mp3";

const LS_MUTE = "oculto.attention.mute";
const LS_VOLUME = "oculto.attention.volume";

export const ATTENTION_DEFAULT_VOLUME = 1.0;

// Padrão de vibração FIXO (definido pelo admin master)
const ATTENTION_VIBRATION_PATTERN: number[] = [120, 60, 120, 60, 200];

let cachedNode: HTMLAudioElement | null = null;
let resolvedUrl: string | null = null;
let lastPlayedAt = 0;

// ── Preferências ───────────────────────────────────────────────
export function isAttentionMuted(): boolean {
  try { return localStorage.getItem(LS_MUTE) === "1"; } catch { return false; }
}
export function setAttentionMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(LS_MUTE, "1");
    else localStorage.removeItem(LS_MUTE);
  } catch { /* noop */ }
}
export function getAttentionVolume(): number {
  try {
    const raw = localStorage.getItem(LS_VOLUME);
    if (raw == null) return ATTENTION_DEFAULT_VOLUME;
    const v = Number(raw);
    if (!Number.isFinite(v)) return ATTENTION_DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, v));
  } catch { return ATTENTION_DEFAULT_VOLUME; }
}
export function setAttentionVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  try { localStorage.setItem(LS_VOLUME, String(v)); } catch { /* noop */ }
}

// ── Áudio ──────────────────────────────────────────────────────
async function resolveUrl(): Promise<string> {
  if (resolvedUrl) return resolvedUrl;
  try {
    const r = await fetch(PRIMARY_URL, { method: "HEAD" });
    resolvedUrl = r.ok ? PRIMARY_URL : FALLBACK_URL;
  } catch {
    resolvedUrl = FALLBACK_URL;
  }
  return resolvedUrl;
}

async function getNode(): Promise<HTMLAudioElement | null> {
  try {
    if (cachedNode) return cachedNode;
    const url = await resolveUrl();
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.setAttribute?.("playsinline", "true");
    cachedNode = audio;
    return audio;
  } catch {
    return null;
  }
}

/**
 * Reproduz o alerta de chamada de atenção (som + vibração).
 * @param opts.force ignora o mute (usado pelo botão Testar)
 * @param opts.silent não toca som, apenas vibra (uso interno)
 */
export async function playAttentionAlert(opts?: { force?: boolean; silent?: boolean }) {
  const now = Date.now();
  if (!opts?.force && now - lastPlayedAt < 400) return;
  lastPlayedAt = now;

  if (!opts?.silent && (opts?.force || !isAttentionMuted())) {
    try {
      const node = await getNode();
      if (node) {
        node.pause();
        node.currentTime = 0;
        node.volume = Math.min(1, Math.max(0, getAttentionVolume()));
        void node.play().catch(() => { /* autoplay block — silencioso */ });
      }
    } catch { /* noop */ }
  }

  try {
    if (isVibrationSupported()) {
      (navigator as any).vibrate?.(ATTENTION_VIBRATION_PATTERN);
    }
  } catch { /* noop */ }
}
