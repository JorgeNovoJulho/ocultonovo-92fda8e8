import { useState, useEffect, useCallback } from "react";

interface MouseOffset {
  x: number;
  y: number;
}

interface UseMouseParallaxOptions {
  intensity?: number;
  smoothing?: number;
  enabled?: boolean;
}

export function useMouseParallax({
  intensity = 1,
  smoothing = 0.1,
  enabled = true
}: UseMouseParallaxOptions = {}): MouseOffset {
  const [offset, setOffset] = useState<MouseOffset>({ x: 0, y: 0 });
  const [targetOffset, setTargetOffset] = useState<MouseOffset>({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!enabled) return;
    
    // Calculate offset from center of screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Normalize to -1 to 1 range
    const normalizedX = (e.clientX - centerX) / centerX;
    const normalizedY = (e.clientY - centerY) / centerY;
    
    // Apply intensity and reverse direction for parallax effect
    const x = normalizedX * intensity * -30;
    const y = normalizedY * intensity * -20;
    
    setTargetOffset({ x, y });
  }, [intensity, enabled]);

  // Smooth animation loop
  useEffect(() => {
    if (!enabled) {
      setOffset({ x: 0, y: 0 });
      return;
    }

    let animationFrameId: number;
    
    const animate = () => {
      setOffset(prev => ({
        x: prev.x + (targetOffset.x - prev.x) * smoothing,
        y: prev.y + (targetOffset.y - prev.y) * smoothing
      }));
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animationFrameId = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [targetOffset, smoothing, enabled]);

  // Add mouse move listener
  useEffect(() => {
    if (!enabled) return;
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove, enabled]);

  return offset;
}
