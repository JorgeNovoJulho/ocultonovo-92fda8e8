interface HeroBackgroundProps {
  type?: 'gradient' | 'image' | 'video';
  imageUrl?: string | null;
  videoUrl?: string | null;
}

/**
 * HeroBackground — Performance-optimized
 * Mobile: Static gradient only, no animated cloud layers
 * Desktop: Full animated clouds with framer-motion
 */
export function HeroBackground({ type = 'gradient', imageUrl, videoUrl }: HeroBackgroundProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {/* Main gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            180deg,
            #0d0619 0%,
            #150a24 10%,
            #1a0a2e 20%,
            #2d1245 32%,
            #4a1a5c 42%,
            #6b1a5c 52%,
            #9c3d7a 62%,
            #c94b8c 72%,
            #e8a4c4 82%,
            #f5d0e0 92%,
            #fce4ec 100%
          )`
        }}
      />
      
      {/* Optional background image (desktop only) */}
      {!isMobile && type === 'image' && imageUrl && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      
      {/* Optional background video (desktop only) */}
      {!isMobile && type === 'video' && videoUrl && (
        <video preload="none"
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      )}
      
      {/* Atmospheric clouds - desktop only */}
      {!isMobile && (
        <>
          <div
            className="absolute bottom-[15%] left-0 right-0 h-[40%] opacity-20"
            style={{
              background: `linear-gradient(180deg, transparent 0%, rgba(255,200,220,0.3) 40%, rgba(255,150,180,0.5) 70%, rgba(255,200,220,0.4) 100%)`,
              filter: 'blur(40px)',
              animation: 'cloud-drift 60s linear infinite',
            }}
          />
        </>
      )}

      {/* Horizon glow */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-[45%] opacity-60"
        style={{
          background: `linear-gradient(180deg, transparent 0%, rgba(255,150,200,0.15) 50%, rgba(255,200,220,0.25) 80%, rgba(255,220,235,0.35) 100%)`,
        }}
      />

      {/* Vignette */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% 40%, transparent 0%, transparent 50%, rgba(13,6,25,0.4) 100%)`
        }}
      />
    </div>
  );
}
