/**
 * useDraggableFab — torna um elemento "fixed" arrastável pela tela
 * com posição persistida em localStorage (efeito memória).
 *
 * - Suporta mouse + touch via Pointer Events
 * - Distingue clique de arrasto (threshold de 5px)
 * - Mantém o elemento dentro do viewport
 * - Reposiciona ao redimensionar a janela
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Pos { x: number; y: number }

const DRAG_THRESHOLD = 5;

export function useDraggableFab(storageKey: string, defaultPos?: Pos) {
  const elRef = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as Pos;
    } catch {}
    return defaultPos ?? null;
  });
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef<{ px: number; py: number; ex: number; ey: number } | null>(null);

  const clamp = useCallback((p: Pos): Pos => {
    const el = elRef.current;
    const w = el?.offsetWidth ?? 40;
    const h = el?.offsetHeight ?? 40;
    const maxX = window.innerWidth - w - 4;
    const maxY = window.innerHeight - h - 4;
    return {
      x: Math.max(4, Math.min(p.x, maxX)),
      y: Math.max(4, Math.min(p.y, maxY)),
    };
  }, []);

  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos, clamp]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    draggingRef.current = true;
    movedRef.current = false;
    startRef.current = { px: e.clientX, py: e.clientY, ex: rect.left, ey: rect.top };
    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !startRef.current) return;
    const dx = e.clientX - startRef.current.px;
    const dy = e.clientY - startRef.current.py;
    if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    movedRef.current = true;
    e.preventDefault();
    setPos(clamp({ x: startRef.current.ex + dx, y: startRef.current.ey + dy }));
  }, [clamp]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { elRef.current?.releasePointerCapture(e.pointerId); } catch {}
    if (movedRef.current) {
      try {
        const cur = elRef.current?.getBoundingClientRect();
        if (cur) localStorage.setItem(storageKey, JSON.stringify({ x: cur.left, y: cur.top }));
      } catch {}
    }
  }, [storageKey]);

  // Suppress click after drag
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      movedRef.current = false;
    }
  }, []);

  const style: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', touchAction: 'none' }
    : { touchAction: 'none' };

  return {
    ref: elRef as React.MutableRefObject<any>,
    style,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
