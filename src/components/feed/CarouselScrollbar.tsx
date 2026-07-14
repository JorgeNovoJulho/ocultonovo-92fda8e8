import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

type CarouselVariant = 'fuchsia' | 'red' | 'blue' | 'amber' | 'gold';
type VariantStyle = { track: string; thumb: string };

interface CarouselScrollbarProps {
  /** Ref do container scrollável horizontal. */
  scrollRef: RefObject<HTMLElement | null>;
  /** Label acessível (descreve qual carrossel a barra controla). */
  ariaLabel?: string;
  /** id do elemento scrollável — usado em aria-controls. */
  controlsId?: string;
  /** Classe extra para o wrapper (padding/margin). */
  className?: string;
  /** Paleta visual da seção controlada. */
  variant?: CarouselVariant;
}

const VARIANT_STYLES: Record<CarouselVariant, VariantStyle> = {
  fuchsia: {
    track: 'bg-fuchsia-950/30 ring-fuchsia-300/20 focus-visible:ring-fuchsia-300',
    thumb: 'bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 shadow-[0_0_14px_rgba(244,114,182,0.55)]',
  },
  red: {
    track: 'bg-rose-950/35 ring-rose-200/25 focus-visible:ring-rose-200',
    thumb: 'bg-gradient-to-r from-rose-300 via-red-400 to-rose-100 shadow-[0_0_14px_rgba(248,113,113,0.65)]',
  },
  blue: {
    track: 'bg-sky-950/35 ring-sky-200/25 focus-visible:ring-sky-200',
    thumb: 'bg-gradient-to-r from-sky-200 via-blue-400 to-cyan-300 shadow-[0_0_14px_rgba(56,189,248,0.65)]',
  },
  amber: {
    track: 'bg-amber-950/35 ring-amber-200/25 focus-visible:ring-amber-200',
    thumb: 'bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-300 shadow-[0_0_14px_rgba(251,191,36,0.65)]',
  },
  gold: {
    track: 'bg-yellow-950/35 ring-yellow-200/25 focus-visible:ring-yellow-200',
    thumb: 'bg-gradient-to-r from-yellow-200 via-amber-300 to-yellow-500 shadow-[0_0_14px_rgba(250,204,21,0.65)]',
  },
};

/**
 * Barra de rolagem horizontal customizada e padronizada (fucsia → pink → âmbar).
 * - Visível apenas em desktop (md+); no mobile o scroll horizontal permanece invisível.
 * - Arrastável, clicável no track, com suporte completo a teclado (←/→/Home/End/PageUp/PageDown).
 * - role="scrollbar" + aria-orientation + aria-valuenow/min/max + aria-controls.
 */
export function CarouselScrollbar({
  scrollRef,
  ariaLabel = "Arraste para navegar",
  controlsId,
  className = "px-3 pb-3",
  variant = 'fuchsia',
}: CarouselScrollbarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0, visible: false });
  const [valueNow, setValueNow] = useState(0);
  const palette = VARIANT_STYLES[variant];

  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const trackWidth = track?.clientWidth ?? el.clientWidth;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4 || el.scrollWidth <= 0) {
        setThumb({ width: 0, left: 0, visible: false });
        setValueNow(0);
        return;
      }
      const ratio = el.clientWidth / el.scrollWidth;
      const w = Math.max(48, Math.floor(trackWidth * ratio));
      const left = Math.max(0, Math.min(trackWidth - w, (el.scrollLeft / max) * (trackWidth - w)));
      setThumb({ width: w, left, visible: true });
      setValueNow(Math.round((el.scrollLeft / max) * 100));
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    if (track) ro.observe(track);
    const timers = [60, 250, 700, 1500].map((ms) => window.setTimeout(update, ms));
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [scrollRef]);

  const beginThumbDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    e.preventDefault();
    const trackRect = track.getBoundingClientRect();
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const thumbW = thumb.width || 48;
    const usable = trackRect.width - thumbW;
    if (usable <= 0) return;
    const startX = e.clientX;
    const startLeft = thumb.left;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = ev.clientX - startX;
      const nextLeft = Math.max(0, Math.min(usable, startLeft + delta));
      el.scrollLeft = (nextLeft / usable) * max;
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleTrackClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.thumb === "true") return;
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackRect = track.getBoundingClientRect();
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const thumbW = thumb.width || 48;
    const usable = trackRect.width - thumbW;
    const x = e.clientX - trackRect.left - thumbW / 2;
    const nextLeft = Math.max(0, Math.min(usable, x));
    try {
      el.scrollTo({ left: (nextLeft / usable) * max, behavior: "smooth" });
    } catch {
      el.scrollLeft = (nextLeft / usable) * max;
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(120, Math.floor(el.clientWidth * 0.35));
    const page = el.clientWidth;
    const max = el.scrollWidth - el.clientWidth;
    let target: number | null = null;
    switch (e.key) {
      case "ArrowLeft": target = el.scrollLeft - step; break;
      case "ArrowRight": target = el.scrollLeft + step; break;
      case "PageUp": target = el.scrollLeft - page; break;
      case "PageDown": target = el.scrollLeft + page; break;
      case "Home": target = 0; break;
      case "End": target = max; break;
      default: return;
    }
    e.preventDefault();
    el.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: "smooth" });
  };

  return (
    <div className={`hidden md:block ${className}`}>
      <div
        ref={trackRef}
        onMouseDown={handleTrackClick}
        onKeyDown={handleKey}
        tabIndex={thumb.visible ? 0 : -1}
        className={`relative h-2.5 w-full rounded-full ring-1 outline-none transition-opacity focus-visible:ring-2 ${palette.track} ${thumb.visible ? "opacity-100" : "opacity-40"}`}
        role="scrollbar"
        aria-orientation="horizontal"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valueNow}
        aria-controls={controlsId}
      >
        <div
          data-thumb="true"
          onPointerDown={beginThumbDrag}
          className={`absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full cursor-grab active:cursor-grabbing hover:brightness-110 ${palette.thumb}`}
          style={{ width: `${thumb.width}px`, left: `${thumb.left}px`, touchAction: "none" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default CarouselScrollbar;
