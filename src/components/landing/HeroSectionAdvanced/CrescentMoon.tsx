import { memo } from "react";

interface CrescentMoonProps {
  scrollOffset?: number;
  mouseOffset?: { x: number; y: number };
  glowIntensity?: number;
  size?: number;
  positionX?: number;
  positionY?: number;
}

/**
 * CrescentMoon — Performance-optimized
 * Mobile: Smaller size, no mouse parallax, no animated glow layers, CSS only
 * Desktop: Full animated glow with framer-motion
 */
export const CrescentMoon = memo(function CrescentMoon({ 
  scrollOffset = 0, 
  mouseOffset = { x: 0, y: 0 },
  glowIntensity = 1,
  size = 550,
  positionX = 50,
  positionY = 15
}: CrescentMoonProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const effectiveSize = isMobile ? Math.min(size, 280) : size;
  const tx = isMobile ? 0 : mouseOffset.x;
  const ty = isMobile ? 0 : mouseOffset.y;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ 
        left: `${positionX}%`,
        top: `${positionY}%`,
        transform: `translate(-50%, ${scrollOffset}px) translate(${tx}px, ${ty}px)`,
        width: `${effectiveSize}px`,
        height: `${effectiveSize}px`,
        zIndex: 5,
      }}
    >
      {/* Soft outer halo — cool moonlight */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 35% 35%, 
            rgba(245,235,255,${glowIntensity * 0.45}) 0%, 
            rgba(220,210,240,${glowIntensity * 0.18}) 40%, 
            transparent 72%
          )`,
          filter: isMobile ? 'blur(36px)' : 'blur(55px)',
          transform: 'scale(1.9)',
        }}
      />

      {/* Extra atmospheric halo — desktop only */}
      {!isMobile && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 35% 35%, 
              rgba(255,240,250,${glowIntensity * 0.35}) 0%, 
              rgba(200,160,210,${glowIntensity * 0.18}) 35%, 
              rgba(120,80,160,${glowIntensity * 0.08}) 55%,
              transparent 75%
            )`,
            filter: 'blur(100px)',
            transform: 'scale(2.8)',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
      )}

      {/* Moon SVG */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full relative"
        style={{ 
          filter: `drop-shadow(0 0 ${isMobile ? 24 : 50}px rgba(245,235,255,${glowIntensity * 0.9}))` 
        }}
      >
        <defs>
          <radialGradient id="moonGradientAdvNew" cx="32%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="35%" stopColor="#FBF6FF" />
            <stop offset="70%" stopColor="#ECE3F2" />
            <stop offset="100%" stopColor="#C9BBD8" />
          </radialGradient>
          <mask id="crescentMaskAdvNew">
            <circle cx="50" cy="50" r="42" fill="white" />
            <circle cx="72" cy="38" r="34" fill="black" />
          </mask>
        </defs>
        <g mask="url(#crescentMaskAdvNew)">
          <circle cx="50" cy="50" r="42" fill="url(#moonGradientAdvNew)" />
        </g>
      </svg>
    </div>
  );
});
