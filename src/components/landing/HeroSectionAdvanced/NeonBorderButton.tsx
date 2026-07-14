import { memo, forwardRef, ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NeonBorderButtonProps {
  children: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  isPulsing?: boolean;
  beatIntensity?: number;
  className?: string;
  disabled?: boolean;
}

export const NeonBorderButton = memo(forwardRef<HTMLDivElement, NeonBorderButtonProps>(
  function NeonBorderButton({
    children,
    onClick,
    onMouseEnter,
    isPulsing = false,
    beatIntensity = 0,
    className = "",
    disabled = false
  }, ref) {
    const baseShadow = `
      0 0 25px rgba(147, 51, 234, 0.7),
      0 0 50px rgba(236, 72, 153, 0.5),
      0 0 80px rgba(6, 182, 212, 0.4)
    `;
    const intenseShadow = `
      0 0 ${35 + beatIntensity * 40}px rgba(147, 51, 234, ${0.8 + beatIntensity * 0.2}),
      0 0 ${70 + beatIntensity * 50}px rgba(236, 72, 153, ${0.6 + beatIntensity * 0.3}),
      0 0 ${100 + beatIntensity * 60}px rgba(6, 182, 212, ${0.5 + beatIntensity * 0.2})
    `;

    return (
      <motion.div
        ref={ref}
        className="relative"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.98 }}
      >
        <Button
          variant="outline"
          size="lg"
          onClick={onClick}
          onMouseEnter={onMouseEnter}
          disabled={disabled}
          className={cn(
            "relative z-10",
            "border-2 text-white font-bold text-base",
            "bg-gradient-to-r from-purple-600/40 via-pink-500/40 to-cyan-400/40",
            "hover:from-purple-500/50 hover:via-pink-400/50 hover:to-cyan-300/50",
            "border-purple-400/80 hover:border-cyan-300",
            "backdrop-blur-md",
            "transition-all duration-300",
            isPulsing && "animate-pulse",
            className
          )}
          style={{
            boxShadow: beatIntensity > 0 ? intenseShadow : baseShadow,
          }}
        >
          {children}
        </Button>
        
        {/* Holographic outer glow ring */}
        <motion.div
          className="absolute inset-0 rounded-md pointer-events-none"
          style={{
            background: 'transparent',
            boxShadow: beatIntensity > 0 
              ? `0 0 ${80 + beatIntensity * 50}px rgba(147, 51, 234, 0.4), 0 0 ${120 + beatIntensity * 60}px rgba(6, 182, 212, 0.3)`
              : '0 0 60px rgba(147, 51, 234, 0.3), 0 0 100px rgba(6, 182, 212, 0.2)',
          }}
          animate={isPulsing ? {
            opacity: [0.7, 1, 0.7],
            scale: [1, 1.1, 1]
          } : {}}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        
        {/* Holographic shimmer effect */}
        <motion.div
          className="absolute -inset-2 rounded-lg pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.15) 50%, rgba(6, 182, 212, 0.2) 100%)',
          }}
          animate={{
            opacity: [0.3, 0.7, 0.3],
            rotate: [0, 5, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </motion.div>
    );
  }
));
