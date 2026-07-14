import { useMemo, memo } from "react";

interface StarFieldProps {
  count?: number;
  scrollOffset?: number;
  mouseOffset?: { x: number; y: number };
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
}

/**
 * StarField — Performance-optimized
 * Mobile: CSS-only animations, reduced count, no mouse parallax
 * Desktop: Full framer-motion animations
 */
export const StarField = memo(function StarField({ 
  count = 120, 
  scrollOffset = 0,
  mouseOffset = { x: 0, y: 0 }
}: StarFieldProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const effectiveCount = isMobile ? 30 : count;

  const stars = useMemo(() => {
    return Array.from({ length: effectiveCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 70,
      size: 1 + Math.random() * 1.5,
      opacity: 0.5 + Math.random() * 0.4,
    }));
  }, [effectiveCount]);

  // No mouse parallax on mobile
  const tx = isMobile ? 0 : mouseOffset.x * 0.5;
  const ty = isMobile ? 0 : mouseOffset.y * 0.5;

  return (
    <div 
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ 
        transform: `translateY(${scrollOffset}px) translate(${tx}px, ${ty}px)`,
        willChange: isMobile ? 'auto' : 'transform',
      }}
    >
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDuration: `${3 + star.id % 4}s`,
          }}
        />
      ))}
    </div>
  );
});
