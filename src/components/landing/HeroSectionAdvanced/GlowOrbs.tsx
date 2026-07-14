import { motion } from "framer-motion";

interface GlowOrbsProps {
  parallaxOffset?: number;
}

/**
 * GlowOrbs — Performance-optimized
 * Mobile: Static CSS gradients only, no framer-motion
 * Desktop: Animated orbs
 */
export function GlowOrbs({ parallaxOffset = 0 }: GlowOrbsProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Mobile: single static glow, no animation
  if (isMobile) {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          style={{
            position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: '300px', height: '200px',
            background: 'radial-gradient(ellipse at center, rgba(255,105,180,0.2) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
            background: 'linear-gradient(to top, rgba(255,182,193,0.15) 0%, transparent 70%)',
            filter: 'blur(30px)',
          }}
        />
      </div>
    );
  }

  // Desktop: animated orbs
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ transform: `translateY(${parallaxOffset * 0.3}px)` }}
    >
      <motion.div
        className="absolute"
        style={{
          top: '15%', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '400px',
          background: 'radial-gradient(ellipse at center, rgba(255,105,180,0.25) 0%, rgba(199,21,133,0.1) 40%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.8, 0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute"
        style={{
          top: '20%', left: '10%', width: '350px', height: '350px',
          background: 'radial-gradient(circle at center, rgba(255,182,193,0.3) 0%, rgba(255,105,180,0.1) 50%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.15, 1], x: [0, 20, 0], opacity: [0.5, 0.7, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: '40%',
          background: 'linear-gradient(to top, rgba(255,182,193,0.2) 0%, rgba(255,105,180,0.1) 30%, transparent 70%)',
          filter: 'blur(40px)',
        }}
        animate={{ opacity: [0.6, 0.8, 0.6] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
