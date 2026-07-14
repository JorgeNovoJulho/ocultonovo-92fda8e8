/**
 * useOcultoPlayGestures — Etapa 43
 *
 * Gestos de toque para o PlayUpNextPlayer:
 * - Single tap         → toggle controles (overlay header + footer).
 * - Double tap esquerda → seek -10s.
 * - Double tap direita  → seek +10s.
 * - Swipe vertical ↑    → próximo item.
 * - Swipe vertical ↓    → item anterior.
 *
 * Usa Pointer Events para funcionar em mobile e desktop.
 * Ignora gestos vindos de botões/inputs (alvo dentro de [data-no-gesture]).
 */
import { useCallback, useRef } from 'react';

interface Options {
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  onNext: () => void;
  onPrev: () => void;
  onToggleControls: () => void;
  onDoubleTapSeek?: (deltaSeconds: number, side: 'left' | 'right') => void;
}

const DOUBLE_TAP_MS = 280;
const TAP_TOLERANCE_PX = 12;
const SWIPE_THRESHOLD_PX = 70;
const SWIPE_MAX_HORIZONTAL_PX = 50;
const SEEK_STEP = 10;

export function useOcultoPlayGestures({
  mediaRef,
  onNext,
  onPrev,
  onToggleControls,
  onDoubleTapSeek,
}: Options) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);

  const clearSingleTapTimer = () => {
    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  };

  const handleDoubleTap = useCallback((side: 'left' | 'right') => {
    const el = mediaRef.current;
    if (!el) return;
    const delta = side === 'left' ? -SEEK_STEP : SEEK_STEP;
    try {
      const next = Math.max(0, Math.min((el.duration || 1e9), (el.currentTime || 0) + delta));
      el.currentTime = next;
    } catch { /* ignore */ }
    onDoubleTapSeek?.(delta, side);
  }, [mediaRef, onDoubleTapSeek]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement | null)?.closest('[data-no-gesture],button,input,a,select,textarea,[role="button"]')) {
      startRef.current = null;
      return;
    }
    startRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const dt = performance.now() - start.t;

    // Swipe vertical
    if (absY > SWIPE_THRESHOLD_PX && absX < SWIPE_MAX_HORIZONTAL_PX) {
      clearSingleTapTimer();
      lastTapRef.current = null;
      if (dy < 0) onNext();
      else onPrev();
      return;
    }

    // Apenas considera tap se movimento pequeno e curto
    if (absX > TAP_TOLERANCE_PX || absY > TAP_TOLERANCE_PX || dt > 400) {
      lastTapRef.current = null;
      return;
    }

    const now = performance.now();
    const last = lastTapRef.current;
    if (
      last &&
      now - last.t < DOUBLE_TAP_MS &&
      Math.abs(e.clientX - last.x) < 60 &&
      Math.abs(e.clientY - last.y) < 60
    ) {
      // Double tap confirmado
      clearSingleTapTimer();
      lastTapRef.current = null;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const relX = e.clientX - rect.left;
      handleDoubleTap(relX < rect.width / 2 ? 'left' : 'right');
      return;
    }

    lastTapRef.current = { x: e.clientX, y: e.clientY, t: now };
    clearSingleTapTimer();
    singleTapTimerRef.current = window.setTimeout(() => {
      onToggleControls();
      lastTapRef.current = null;
      singleTapTimerRef.current = null;
    }, DOUBLE_TAP_MS + 20);
  }, [handleDoubleTap, onNext, onPrev, onToggleControls]);

  return {
    bindGestures: {
      onPointerDown,
      onPointerUp,
      onPointerCancel: () => { startRef.current = null; },
    },
  };
}
