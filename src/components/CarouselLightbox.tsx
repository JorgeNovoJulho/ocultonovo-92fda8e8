import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CarouselLightboxProps {
  open: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Lightbox fullscreen para revisar fotos do carrossel antes de postar.
 * - Setas e ESC no teclado
 * - Swipe touch / scroll horizontal com snap
 * - Botões prev/next no desktop
 */
export function CarouselLightbox({
  open,
  images,
  initialIndex = 0,
  onClose,
}: CarouselLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight")
        setIndex((i) => Math.min(i + 1, images.length - 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, images.length, onClose]);

  if (!open || images.length === 0) return null;

  const go = (delta: number) =>
    setIndex((i) => Math.max(0, Math.min(images.length - 1, i + delta)));

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar fotos do carrossel"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <span className="text-sm font-medium text-foreground">
          {index + 1} / {images.length}
        </span>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-muted text-foreground"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main viewport */}
      <div
        className="relative flex-1 overflow-hidden flex items-center justify-center"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchStartX.current = null;
        }}
      >
        <img
          src={images[index]}
          alt={`Foto ${index + 1}`}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />

        {/* Prev/Next — desktop */}
        {images.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              disabled={index === 0}
              className={cn(
                "hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-background/70 hover:bg-background text-foreground shadow-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
              )}
              aria-label="Anterior"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={() => go(1)}
              disabled={index === images.length - 1}
              className={cn(
                "hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-background/70 hover:bg-background text-foreground shadow-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
              )}
              aria-label="Próxima"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails strip */}
      {images.length > 1 && (
        <div className="border-t border-border/40 p-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
            {images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-14 w-14 shrink-0 rounded-md overflow-hidden border-2 transition",
                  i === index ? "border-primary" : "border-border/40 opacity-70"
                )}
                aria-label={`Foto ${i + 1}`}
              >
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
