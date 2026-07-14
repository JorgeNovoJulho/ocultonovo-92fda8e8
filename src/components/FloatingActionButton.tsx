import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

interface FloatingActionButtonProps {
  onClick: () => void;
  className?: string;
}

const POS_KEY = "oculto-fab-pos-v1";
const SIZE = 56; // 14 * 4 = 56px (w-14 h-14)
const MARGIN = 12;
const BOTTOM_NAV_SAFE = 88; // espaço para barra de navegação inferior

interface Pos { x: number; y: number; }

function loadPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === "number" && typeof p?.y === "number") return p;
  } catch {}
  return null;
}

function savePos(p: Pos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
}

function clampToViewport(p: Pos): Pos {
  if (typeof window === "undefined") return p;
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - BOTTOM_NAV_SAFE);
  return {
    x: Math.min(Math.max(MARGIN, p.x), maxX),
    y: Math.min(Math.max(MARGIN, p.y), maxY),
  };
}

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 16, y: 400 };
  return clampToViewport({
    x: window.innerWidth - SIZE - 16,
    y: window.innerHeight - SIZE - BOTTOM_NAV_SAFE - 16,
  });
}

export function FloatingActionButton({ onClick, className }: FloatingActionButtonProps) {
  const [pos, setPos] = useState<Pos>(() => clampToViewport(loadPos() ?? defaultPos()));
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef<{ px: number; py: number; ox: number; oy: number }>({ px: 0, py: 0, ox: 0, oy: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Reclamp on mount + resize (handles stale localStorage / orientation changes)
  useEffect(() => {
    const onResize = () => setPos((p) => clampToViewport(p));
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    draggingRef.current = true;
    movedRef.current = false;
    startRef.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    try { btnRef.current?.setPointerCapture(e.pointerId); } catch {}
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startRef.current.px;
    const dy = e.clientY - startRef.current.py;
    if (!movedRef.current && Math.hypot(dx, dy) > 6) movedRef.current = true;
    if (movedRef.current) {
      const next = clampToViewport({ x: startRef.current.ox + dx, y: startRef.current.oy + dy });
      setPos(next);
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const wasDragging = draggingRef.current;
    const moved = movedRef.current;
    draggingRef.current = false;
    try { btnRef.current?.releasePointerCapture(e.pointerId); } catch {}
    if (wasDragging && moved) {
      savePos(pos);
      // Evita disparar onClick depois do drag
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (wasDragging && !moved) {
      onClick();
    }
  }, [onClick, pos]);

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label="Criar publicação"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { draggingRef.current = false; movedRef.current = false; }}
      onClick={(e) => {
        // Click nativo: só dispara se não houve drag (pointerup já chamou onClick)
        if (movedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          movedRef.current = false;
        }
      }}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        touchAction: "none",
      }}
      className={cn(
        "md:hidden w-14 h-14 rounded-full p-0 z-[80] flex items-center justify-center",
        "bg-gradient-to-r from-primary to-secondary",
        "shadow-2xl glow-primary",
        "transition-transform duration-150 active:scale-95",
        "cursor-grab active:cursor-grabbing select-none",
        className
      )}
    >
      <Plus className="h-7 w-7 text-primary-foreground pointer-events-none" />
    </button>
  );
}
