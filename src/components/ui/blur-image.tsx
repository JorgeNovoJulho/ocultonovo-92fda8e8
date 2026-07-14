import { memo, useState, useRef, useEffect, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BlurImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onLoad"> {
  /** Cor do placeholder (CSS color). Default: bg-muted token. */
  placeholderColor?: string;
  /** Classe extra para o wrapper (mantém o aspect ratio do pai). */
  wrapperClassName?: string;
  /** Renderiza um SVG mínimo de placeholder por trás (custo zero). */
  showShimmer?: boolean;
}

/**
 * <BlurImage /> — imagem com placeholder leve "blur-up".
 *
 * Otimizações para GPU/RAM baixa (alvo: Realme C55 e inferiores):
 *  - Sem filter: blur durante o fade (caro em GPU fraca).
 *    Usa um placeholder sólido + opacity transition (composited layer barata).
 *  - `loading="lazy"`, `decoding="async"`, `fetchpriority="low"` por padrão.
 *  - IntersectionObserver para só atribuir o `src` quando perto da viewport
 *    (degrada graciosamente para `loading=lazy` se IO indisponível).
 *  - Marca como carregada se a imagem já estiver no cache do browser.
 */
export const BlurImage = memo(function BlurImage({
  src,
  alt,
  className,
  wrapperClassName,
  placeholderColor,
  showShimmer = false,
  loading = "lazy",
  decoding = "async",
  draggable = false,
  sizes,
  ...rest
}: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  // IntersectionObserver: só atribui src quando perto da viewport
  useEffect(() => {
    if (!wrapperRef.current || shouldLoad) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, [shouldLoad]);

  // Cache hit: marca como loaded imediatamente
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, [shouldLoad]);

  return (
    <span
      ref={wrapperRef}
      className={cn("relative block w-full h-full overflow-hidden", wrapperClassName)}
      style={{
        backgroundColor: placeholderColor || "hsl(var(--muted))",
        contain: "content",
      }}
      aria-hidden={!alt ? true : undefined}
    >
      {showShimmer && !loaded && (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--muted-foreground) / 0.08) 50%, hsl(var(--muted)) 100%)",
            backgroundSize: "200% 100%",
            animation: "blurimg-shimmer 1.4s linear infinite",
          }}
        />
      )}
      <img
        ref={imgRef}
        // Só atribui src após entrar (ou ficar perto) da viewport
        src={shouldLoad ? (src as string) : undefined}
        alt={alt || ""}
        loading={loading}
        decoding={decoding}
        draggable={draggable}
        sizes={sizes}
        // @ts-ignore fetchpriority é HTML válido, ainda não tipado
        fetchpriority="low"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          // Mantém o placeholder; esconde o <img loading="lazy" decoding="async"> quebrado
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
        className={cn(
          "absolute inset-0 w-full h-full transition-opacity duration-300 ease-out",
          // Composited opacity é barato; evita filter:blur que custa GPU
          loaded ? "opacity-100" : "opacity-0",
          className
        )}
        {...rest}
      />
    </span>
  );
});

// Shimmer keyframes registradas globalmente (uma vez)
if (typeof document !== "undefined" && !document.getElementById("blurimg-shimmer-style")) {
  const style = document.createElement("style");
  style.id = "blurimg-shimmer-style";
  style.textContent = `
    @keyframes blurimg-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(style);
}
