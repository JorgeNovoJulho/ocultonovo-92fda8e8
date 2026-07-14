import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PostImageCarouselProps {
  urls: string[];
  altPrefix?: string;
  /** Disparado quando o usuário clica numa imagem (abrir lightbox/modal). */
  onImageClick?: (index: number) => void;
  /** Intervalo de autoplay em ms. Default 5000. Use 0 para desativar. */
  autoplayMs?: number;
  className?: string;
}

/**
 * Carrossel de imagens do post no feed.
 * - Mobile: swipe horizontal nativo (scroll-snap), sem peso de framework.
 * - Desktop: setas prev/next sobrepostas.
 * - Autoplay a cada 5s, pausa enquanto o usuário interage e quando a aba fica oculta.
 * - Click → onImageClick(index) para abrir o lightbox.
 */
export function PostImageCarousel({
  urls,
  altPrefix = "Imagem",
  onImageClick,
  autoplayMs = 5000,
  className,
}: PostImageCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const total = urls.length;
  const hasMany = total > 1;

  const goTo = useCallback((index: number, smooth = true) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const clamped = ((index % total) + total) % total;
    const target = scroller.clientWidth * clamped;
    scroller.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
    setActiveIndex(clamped);
  }, [total]);

  // Atualiza activeIndex enquanto o usuário arrasta/swipa
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = scroller.clientWidth || 1;
        const idx = Math.round(scroller.scrollLeft / w);
        setActiveIndex(idx);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Autoplay 5s — pausa em hover/touch e em aba oculta
  useEffect(() => {
    if (!hasMany || autoplayMs <= 0 || paused) return;
    const id = window.setInterval(() => {
      const scroller = scrollerRef.current;
      if (!scroller || document.hidden) return;
      const w = scroller.clientWidth || 1;
      const current = Math.round(scroller.scrollLeft / w);
      const next = (current + 1) % total;
      scroller.scrollTo({ left: w * next, behavior: "smooth" });
    }, autoplayMs);
    return () => window.clearInterval(id);
  }, [hasMany, autoplayMs, paused, total]);

  // Pausa autoplay enquanto aba oculta
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (total === 0) return null;

  return (
    <div
      className={cn("relative w-full bg-black/20 rounded-lg overflow-hidden select-none", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div
        ref={scrollerRef}
        className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-none [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
      >
        {urls.map((u, i) => (
          <div
            key={`${u}-${i}`}
            className="relative shrink-0 w-full snap-center flex items-center justify-center"
            style={{ scrollSnapAlign: "center" }}
          >
            <img
              src={u}
              alt={`${altPrefix} ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              onClick={() => onImageClick?.(i)}
              onContextMenu={(e) => e.preventDefault()}
              className="block w-full max-h-[600px] object-contain cursor-zoom-in pointer-events-auto"
            />
          </div>
        ))}
      </div>

      {hasMany && (
        <>
          {/* Setas — visíveis em desktop, ocultas em telas muito pequenas */}
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(e) => { e.stopPropagation(); goTo(activeIndex - 1); }}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={(e) => { e.stopPropagation(); goTo(activeIndex + 1); }}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm transition-opacity opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Contador */}
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-medium tabular-nums">
            {activeIndex + 1}/{total}
          </div>

          {/* Bolinhas */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para foto ${i + 1}`}
                onClick={(e) => { e.stopPropagation(); goTo(i); }}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
