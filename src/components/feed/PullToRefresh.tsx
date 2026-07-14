import { useState, useRef, useEffect, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

const THRESHOLD = 80;

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use refs for all mutable state to avoid stale closures in event listeners
  const startY = useRef(0);
  const pulling = useRef(false);
  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  // Keep ref in sync
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling.current || isRefreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        const dist = Math.min(delta * 0.4, THRESHOLD * 1.5);
        pullDistanceRef.current = dist;
        setPullDistance(dist);
      }
    };

    const handleTouchEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;

      const dist = pullDistanceRef.current;
      if (dist >= THRESHOLD && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        pullDistanceRef.current = THRESHOLD * 0.6;
        setPullDistance(THRESHOLD * 0.6);
        try {
          await onRefreshRef.current();
        } finally {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    // passive: true — nunca bloqueia o scroll nativo
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Roda apenas uma vez — sem re-registros que causam conflitos

  return (
    <div
      className={cn("feed-content-wrapper block w-full", className)}
      style={{ position: 'relative', height: 'auto', minHeight: '101dvh', overflow: 'visible' }}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: pullDistance > 0 ? `${pullDistance}px` : '0px',
          transition: pullDistance === 0 ? 'height 0.2s ease-out' : 'none',
        }}
      >
        <RefreshCw
          className={cn(
            "h-5 w-5 text-primary",
            isRefreshing && "animate-spin",
            pullDistance >= THRESHOLD && !isRefreshing && "scale-110"
          )}
          style={{
            transform: isRefreshing ? undefined : `rotate(${pullDistance * 3}deg)`,
            opacity: Math.min(pullDistance / THRESHOLD, 1),
          }}
        />
      </div>
      {children}
    </div>
  );
}
