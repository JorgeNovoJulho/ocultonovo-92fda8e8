import { useState, useEffect, forwardRef } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface ScrollIndicatorProps {
  show?: boolean;
  delay?: number;
  onScroll?: () => void;
}

export const ScrollIndicator = forwardRef<HTMLDivElement, ScrollIndicatorProps>(function ScrollIndicator({ show = true, delay = 5000, onScroll }, ref) {
  const [isVisible, setIsVisible] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Show indicator after inactivity
  useEffect(() => {
    if (!show) return;

    const checkInactivity = () => {
      const timeSinceActivity = Date.now() - lastActivity;
      if (timeSinceActivity >= delay && window.scrollY < 100) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    const interval = setInterval(checkInactivity, 1000);
    return () => clearInterval(interval);
  }, [delay, lastActivity, show]);

  // Track user activity
  useEffect(() => {
    const handleActivity = () => {
      setLastActivity(Date.now());
      setIsVisible(false);
    };

    const handleScroll = () => {
      handleActivity();
      if (window.scrollY > 100) {
        setIsVisible(false);
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchstart', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, []);

  const handleClick = () => {
    setIsVisible(false);
    
    // Smooth scroll to next section
    const heroSection = document.querySelector('section');
    if (heroSection) {
      const nextSection = heroSection.nextElementSibling;
      if (nextSection) {
        nextSection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: window.innerHeight * 0.8, behavior: 'smooth' });
    }
    
    onScroll?.();
  };

  if (!isVisible) return null;

  return (
    <motion.button
      key="scroll-indicator"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.4 }}
      onClick={handleClick}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer group z-[35]"
      aria-label="Scroll para baixo"
    >
      <motion.span 
        className="text-sm text-white/60 group-hover:text-white/90 transition-colors font-medium"
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      >
        Role para explorar
      </motion.span>
      
      <motion.div
        className="flex flex-col items-center"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <ChevronDown className="w-7 h-7 text-pink-400/70 group-hover:text-pink-400 transition-colors drop-shadow-[0_0_10px_rgba(236,72,153,0.4)]" />
        <ChevronDown className="w-7 h-7 -mt-4 text-pink-400/40 group-hover:text-pink-400/70 transition-colors" />
      </motion.div>
    </motion.button>
  );
});
