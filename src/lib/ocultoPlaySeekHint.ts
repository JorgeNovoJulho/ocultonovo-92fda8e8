/**
 * playSeekHint — Etapa 52
 *
 * Bridge entre a landing pública (/play/p/:id?t=NN) e o player real.
 * A landing armazena `oculto_play_seek_hint:<itemId> = <segundos>` no
 * sessionStorage, e o player consome ao iniciar (uma única vez).
 */
const KEY = (itemId: string) => `oculto_play_seek_hint:${itemId}`;

export function setPlaySeekHint(itemId: string, seconds: number) {
  try { sessionStorage.setItem(KEY(itemId), String(Math.max(0, Math.floor(seconds)))); } catch {}
}

export function consumePlaySeekHint(itemId: string): number | null {
  try {
    const v = sessionStorage.getItem(KEY(itemId));
    if (v == null) return null;
    sessionStorage.removeItem(KEY(itemId));
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}

import { ocultoPlayShareUrl } from './ocultoPlayShareUrl';

export function buildShareUrlWithTimestamp(itemId: string, seconds: number): string {
  const base = ocultoPlayShareUrl(itemId);
  const t = Math.max(0, Math.floor(seconds));
  return t > 0 ? `${base}?t=${t}` : base;
}
