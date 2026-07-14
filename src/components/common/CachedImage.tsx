import { memo, useEffect, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { ImageIcon } from "lucide-react";
import { isImageCached, markImageCached } from "@/lib/imageLoadCache";

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onLoad" | "onError"> {
  src: string | null | undefined;
  /** Fallback URL alternativa, tentada se `src` falhar. */
  fallbackSrc?: string | null;
  /** className aplicada à <img> quando carregada. */
  className?: string;
  /** className do wrapper (skeleton/placeholder). */
  wrapperClassName?: string;
  /** Estilo aplicado à <img> (ex: blur). */
  imgStyle?: CSSProperties;
  /** Ícone placeholder quando não há src. */
  showPlaceholderIcon?: boolean;
}

/**
 * CachedImage — renderiza imagem com:
 *  • cache de URL já carregada (sessão) → sem flicker em re-render
 *  • fallback automático se o primeiro src falhar
 *  • placeholder visual enquanto carrega
 *  • loading="lazy" + decoding="async"
 */
function CachedImageImpl({
  src,
  fallbackSrc,
  alt,
  className,
  wrapperClassName,
  imgStyle,
  showPlaceholderIcon = true,
  ...rest
}: Props) {
  const initial = src || fallbackSrc || null;
  const [current, setCurrent] = useState<string | null>(initial);
  const [loaded, setLoaded] = useState<boolean>(() => !!initial && isImageCached(initial));
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const next = src || fallbackSrc || null;
    setCurrent(next);
    setErrored(false);
    setLoaded(!!next && isImageCached(next));
  }, [src, fallbackSrc]);

  if (!current || errored) {
    return (
      <div
        className={
          wrapperClassName ||
          "w-full h-full flex items-center justify-center text-muted-foreground bg-muted"
        }
      >
        {showPlaceholderIcon && <ImageIcon className="h-8 w-8" />}
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div
          className={
            wrapperClassName ||
            "absolute inset-0 flex items-center justify-center text-muted-foreground bg-muted/70 backdrop-blur-md animate-pulse"
          }
        >
          {showPlaceholderIcon && <ImageIcon className="h-8 w-8 opacity-40" />}
        </div>
      )}
      <img
        {...rest}
        src={current}
        alt={alt || ""}
        loading="lazy"
        decoding="async"
        className={className}
        style={imgStyle}
        onLoad={() => {
          markImageCached(current);
          setLoaded(true);
        }}
        onError={() => {
          // tenta fallback uma vez
          if (fallbackSrc && current !== fallbackSrc) {
            setCurrent(fallbackSrc);
            setLoaded(isImageCached(fallbackSrc));
            return;
          }
          setErrored(true);
        }}
      />
    </>
  );
}

export const CachedImage = memo(CachedImageImpl);

export default CachedImage;
