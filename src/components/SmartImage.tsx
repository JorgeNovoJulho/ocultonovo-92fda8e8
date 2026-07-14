import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ImageOff, Download } from 'lucide-react';
import { usePerformance } from '@/contexts/PerformanceContext';
import { isImageCached, markImageCached } from '@/lib/imageLoadCache';

export interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string; // e.g. "4/5", "16/9", "1/1", "auto"
  onClick?: () => void;
  fallbackSrc?: string;
  priority?: boolean;
  containerClassName?: string;
  onError?: () => void;
}

export const SmartImage = memo(function SmartImage({
  src,
  alt,
  className,
  aspectRatio = '4/5',
  onClick,
  fallbackSrc,
  priority = false,
  containerClassName,
  onError: onErrorProp,
}: SmartImageProps) {
  const { profile } = usePerformance();
  const containerRef = useRef<HTMLDivElement>(null);
  const initiallyCached = isImageCached(src);
  
  const [phase, setPhase] = useState<'idle' | 'visible' | 'loading' | 'loaded' | 'error' | 'unloaded'>(
    initiallyCached ? 'loaded' : priority ? 'loading' : 'idle'
  );
  const [manualLoad, setManualLoad] = useState(false);
  // Store natural dimensions to prevent layout shift with auto aspect ratio
  const [naturalRatio, setNaturalRatio] = useState<string | null>(null);

  const prefetchDisabled = !profile.prefetchMedia;
  const isAutoAspect = aspectRatio === 'auto';

  useEffect(() => {
    setNaturalRatio(null);
    setPhase(isImageCached(src) ? 'loaded' : priority ? 'loading' : 'idle');
  }, [src, priority]);

  useEffect(() => {
    if (priority) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase((prev) => {
            if (prev === 'idle' || prev === 'unloaded') return 'visible';
            return prev;
          });
        }
        // Removed: no longer unload on scroll-away to prevent layout collapse/jitter
      },
      {
        rootMargin: '300px 0px 300px 0px',
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (phase === 'visible' && (!prefetchDisabled || manualLoad)) {
      setPhase('loading');
    }
  }, [phase, prefetchDisabled, manualLoad]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    markImageCached(src);
    if (isAutoAspect && img.naturalWidth && img.naturalHeight) {
      setNaturalRatio(`${img.naturalWidth}/${img.naturalHeight}`);
    }
    setPhase('loaded');
  }, [isAutoAspect, src]);

  const handleError = useCallback(() => { setPhase('error'); onErrorProp?.(); }, [onErrorProp]);
  const handleManualLoad = useCallback(() => {
    setManualLoad(true);
    setPhase('loading');
  }, []);

  // Compute the effective aspect ratio for the container
  const effectiveRatio = isAutoAspect
    ? (naturalRatio || '4/5') // fallback to 4/5 until image loads
    : aspectRatio;

  if (phase === 'error') {
    if (fallbackSrc) {
      return (
        <div
          ref={containerRef}
          className={cn('overflow-hidden bg-muted/30', containerClassName)}
          style={{ aspectRatio: effectiveRatio }}
        >
          <img loading="lazy"
            src={fallbackSrc}
            alt={alt}
            className={cn('w-full h-full object-cover', className)}
            decoding="async"
            onClick={onClick}
          />
        </div>
      );
    }
    return (
      <div
        ref={containerRef}
        className={cn('flex items-center justify-center bg-muted/50', containerClassName)}
        style={{ aspectRatio: effectiveRatio }}
        onClick={onClick}
      >
        <ImageOff className="h-8 w-8 text-muted-foreground/50" />
      </div>
    );
  }

  if (phase === 'visible' && prefetchDisabled && !manualLoad) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'flex flex-col items-center justify-center bg-muted/30 cursor-pointer',
          containerClassName
        )}
        style={{ aspectRatio: effectiveRatio }}
        onClick={handleManualLoad}
      >
        <Download className="h-6 w-6 text-muted-foreground mb-1" />
        <span className="text-xs text-muted-foreground">Toque para carregar</span>
      </div>
    );
  }

  const showImage = phase === 'loading' || phase === 'loaded';

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-muted/30',
        containerClassName
      )}
      style={{ aspectRatio: effectiveRatio, contain: 'layout style' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Skeleton placeholder */}
      {phase !== 'loaded' && (
        <div className="absolute inset-0 bg-muted/40 backdrop-blur-md animate-pulse" />
      )}

      {/* Actual image */}
      {showImage && (
        <img loading="lazy"
          src={src}
          alt={alt}
          className={cn(
            'w-full h-full transition-opacity duration-200 select-none',
            isAutoAspect ? 'object-contain' : 'object-cover',
            phase === 'loaded' ? 'opacity-100' : 'opacity-0',
            className
          )}
          style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
          decoding="async"
          draggable={false}
          onLoad={handleLoad}
          onError={handleError}
          onClick={onClick}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
});