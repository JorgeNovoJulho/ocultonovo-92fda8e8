import { useMemo } from "react";

interface CitySkylineProps {
  parallaxOffset?: number;
}

interface Building {
  id: number;
  x: number;
  width: number;
  height: number;
  windows: { x: number; y: number; lit: boolean }[];
}

/**
 * CitySkyline — Performance-optimized
 * Mobile: 15 buildings, static windows (no framer-motion), no SVG filters
 * Desktop: Full animated windows with glow filters
 */
export function CitySkyline({ parallaxOffset = 0 }: CitySkylineProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const buildingCount = isMobile ? 15 : 30;

  const buildings = useMemo<Building[]>(() => {
    return Array.from({ length: buildingCount }, (_, i) => {
      const width = 25 + Math.random() * 45;
      const height = 100 + Math.random() * 200;
      const windowRows = Math.floor(height / 18);
      const windowCols = Math.floor(width / 11);
      
      const windows: { x: number; y: number; lit: boolean }[] = [];
      // On mobile, fewer windows
      const maxWindows = isMobile ? 8 : windowRows * windowCols;
      let count = 0;
      for (let row = 0; row < windowRows && count < maxWindows; row++) {
        for (let col = 0; col < windowCols && count < maxWindows; col++) {
          windows.push({
            x: 5 + col * 11,
            y: 8 + row * 18,
            lit: Math.random() > 0.45,
          });
          count++;
        }
      }
      
      return { id: i, x: (i / buildingCount) * 115 - 7, width, height, windows };
    });
  }, [buildingCount, isMobile]);

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 pointer-events-none"
      style={{ 
        transform: `translateY(${parallaxOffset}px)`,
        height: '42%',
        zIndex: 20,
      }}
    >
      <svg
        viewBox="0 0 1200 450"
        preserveAspectRatio="xMidYMax slice"
        className="absolute bottom-0 w-full h-full"
      >
        <defs>
          <linearGradient id="buildingGradientAdv" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a0a1f" />
            <stop offset="40%" stopColor="#0f0614" />
            <stop offset="100%" stopColor="#08030a" />
          </linearGradient>
          {!isMobile && (
            <>
              <filter id="windowGlowAdv" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <linearGradient id="horizonGlowAdv" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,182,193,0.25)" />
                <stop offset="20%" stopColor="rgba(255,105,180,0.15)" />
                <stop offset="50%" stopColor="rgba(199,21,133,0.05)" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </>
          )}
        </defs>
        
        {!isMobile && <rect x="0" y="150" width="1200" height="300" fill="url(#horizonGlowAdv)" />}
        
        {buildings.map((building) => (
          <g key={building.id}>
            <rect
              x={building.x * 10}
              y={450 - building.height}
              width={building.width}
              height={building.height}
              fill="url(#buildingGradientAdv)"
              rx="1"
            />
            {building.windows.map((window, j) => (
              <rect
                key={j}
                x={building.x * 10 + window.x}
                y={450 - building.height + window.y}
                width="5"
                height="7"
                fill={window.lit ? "#FFE4B5" : "#0a0510"}
                opacity={window.lit ? 0.85 : 0.2}
                filter={!isMobile && window.lit ? "url(#windowGlowAdv)" : undefined}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
