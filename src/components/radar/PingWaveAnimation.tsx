import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PingWaveAnimationProps {
  /** Center X as percentage (0-100) */
  originX: number;
  /** Center Y as percentage (0-100) */
  originY: number;
  /** Whether to show the animation */
  active: boolean;
}

/**
 * Expanding ring animation that radiates from a point on the radar.
 * Uses CSS will-change + transform for 60 FPS on low-end devices.
 */
export const PingWaveAnimation = memo(function PingWaveAnimation({
  originX,
  originY,
  active,
}: PingWaveAnimationProps) {
  return (
    <AnimatePresence>
      {active && (
        <>
          {[0, 0.3, 0.6].map((delay) => (
            <motion.div
              key={delay}
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.2,
                delay,
                ease: "easeOut",
              }}
              className="absolute z-30 pointer-events-none rounded-full border-2 border-primary/60"
              style={{
                left: `${originX}%`,
                top: `${originY}%`,
                width: 24,
                height: 24,
                marginLeft: -12,
                marginTop: -12,
                willChange: "transform, opacity",
              }}
            />
          ))}
        </>
      )}
    </AnimatePresence>
  );
});
