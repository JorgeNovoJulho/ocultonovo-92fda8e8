import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

interface LikeAnimationProps {
  trigger: boolean;
  onComplete?: () => void;
}

interface FloatingHeart {
  id: number;
  x: number;
  delay: number;
  emoji: string;
}

const HEART_EMOJIS = ['💖', '💗', '💕', '❤️', '💘', '💝'];

export function LikeAnimation({ trigger, onComplete }: LikeAnimationProps) {
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<confetti.CreateTypes | null>(null);

  // Create a bound confetti instance tied to our canvas
  useEffect(() => {
    if (canvasRef.current) {
      confettiRef.current = confetti.create(canvasRef.current, {
        resize: true,
        useWorker: false,
      });
    }
    return () => {
      confettiRef.current?.reset?.();
    };
  }, []);

  useEffect(() => {
    if (trigger) {
      // Fire confetti ONLY on our scoped canvas
      confettiRef.current?.({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.7, x: 0.5 },
        colors: ['#FF007F', '#FF69B4', '#FF1493', '#FF6B6B', '#FFB6C1'],
        shapes: ['circle'],
        ticks: 100,
        gravity: 0.8,
        scalar: 1.2,
        drift: 0,
      });

      // Create floating hearts
      const newHearts: FloatingHeart[] = Array.from({ length: 12 }, (_, i) => ({
        id: Date.now() + i,
        x: (Math.random() - 0.5) * 200,
        delay: i * 0.05,
        emoji: HEART_EMOJIS[Math.floor(Math.random() * HEART_EMOJIS.length)],
      }));

      setHearts(newHearts);

      // Clear hearts after animation
      const timer = setTimeout(() => {
        setHearts([]);
        onComplete?.();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [trigger, onComplete]);

  return (
    <>
      {/* Scoped canvas — covers only the story viewer container */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-40"
        style={{ willChange: 'transform' }}
      />

      <AnimatePresence>
        {hearts.map((heart) => (
          <motion.div
            key={heart.id}
            initial={{
              opacity: 1,
              y: 0,
              x: heart.x,
              scale: 0.5,
              rotate: 0,
            }}
            animate={{
              opacity: [1, 1, 0],
              y: -200,
              scale: [0.5, 1.2, 0.8],
              rotate: (Math.random() - 0.5) * 30,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.5,
              delay: heart.delay,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="absolute left-1/2 bottom-1/3 text-3xl pointer-events-none z-50"
            style={{ willChange: 'transform, opacity' }}
          >
            {heart.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}
