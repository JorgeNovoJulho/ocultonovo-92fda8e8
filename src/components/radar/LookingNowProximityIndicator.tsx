import { motion } from "framer-motion";
import { Flame, Sparkles } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { cn } from "@/lib/utils";

interface LookingNowProximityIndicatorProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

export function LookingNowProximityIndicator({
  count,
  onClick,
  className,
}: LookingNowProximityIndicatorProps) {
  if (count === 0) return null;

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2 rounded-full",
        "bg-gradient-to-r from-orange-500/20 via-red-500/20 to-yellow-500/20",
        "border border-orange-500/50 backdrop-blur-md",
        "shadow-[0_0_20px_rgba(249,115,22,0.3)]",
        "hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]",
        "transition-shadow duration-300 cursor-pointer",
        className
      )}
    >
      {/* Animated glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.2, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Fire icon with pulse */}
      <motion.div
        className="relative z-10"
        animate={{
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <Flame className="h-5 w-5 text-orange-500" />
        <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400" />
      </motion.div>

      {/* Counter */}
      <span className="relative z-10 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <AnimatedCounter value={count} className="text-orange-400" />
        <span className="text-muted-foreground">
          {count === 1 ? "buscando perto" : "buscando perto"}
        </span>
      </span>

      {/* Sparkle particles */}
      <motion.div
        className="absolute top-0 right-2"
        animate={{
          y: [0, -5, 0],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          delay: 0.5,
        }}
      >
        <Sparkles className="h-2 w-2 text-yellow-400/70" />
      </motion.div>
    </motion.button>
  );
}
