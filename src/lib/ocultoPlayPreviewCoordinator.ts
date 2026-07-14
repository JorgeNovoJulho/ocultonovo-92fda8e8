/**
 * ocultoPlayPreviewCoordinator — garante que apenas UM preview de áudio toque
 * por vez no feed do Oculto Play (tanto em cards grandes quanto na strip
 * "Top da semana"), e fornece um cache simples de capas (thumbs) já carregadas
 * para evitar flicker entre re-renders.
 */
import { useEffect, useState } from 'react';

let __currentPreviewAudio: HTMLAudioElement | null = null;

export function claimPreviewSlot(audio: HTMLAudioElement) {
  if (__currentPreviewAudio && __currentPreviewAudio !== audio) {
    try { __currentPreviewAudio.pause(); } catch { /* noop */ }
  }
  __currentPreviewAudio = audio;
}

export function releasePreviewSlot(audio: HTMLAudioElement | null) {
  if (audio && __currentPreviewAudio === audio) __currentPreviewAudio = null;
}

export function pauseAllPreviews() {
  if (__currentPreviewAudio) {
    try { __currentPreviewAudio.pause(); } catch { /* noop */ }
    __currentPreviewAudio = null;
  }
}

// ─────────── Cache de capas ───────────
const loadedThumbs = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export function preloadThumb(url: string | null | undefined): Promise<void> {
  if (!url) return Promise.resolve();
  if (loadedThumbs.has(url)) return Promise.resolve();
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.onload = () => { loadedThumbs.add(url); inflight.delete(url); resolve(); };
    img.onerror = () => { inflight.delete(url); resolve(); };
    img.src = url;
  });
  inflight.set(url, p);
  return p;
}

export function isThumbCached(url: string | null | undefined): boolean {
  return !!url && loadedThumbs.has(url);
}

/** Hook: retorna `loaded` para a capa (true imediato se já cacheada). */
export function useCachedThumb(url: string | null | undefined): boolean {
  const [loaded, setLoaded] = useState(() => isThumbCached(url));
  useEffect(() => {
    if (!url) { setLoaded(false); return; }
    if (isThumbCached(url)) { setLoaded(true); return; }
    let cancel = false;
    setLoaded(false);
    preloadThumb(url).then(() => { if (!cancel) setLoaded(true); });
    return () => { cancel = true; };
  }, [url]);
  return loaded;
}
