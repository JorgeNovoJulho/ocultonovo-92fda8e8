import { useState, useEffect, useRef, useMemo, RefObject } from "react";
import { useAuth } from "@/hooks/useAuth";

interface SocialDrmOverlayProps {
  containerRef: RefObject<HTMLElement>;
  isActive?: boolean;
  /** Username do dono do conteúdo (sem @). Se passado, marca d'água vira "OCULTO @username". */
  ownerUsername?: string | null;
  /** Em vídeo, mantém a marca estática para não forçar recomposição do frame em mobile. */
  stable?: boolean;
}

export function SocialDrmOverlay({ containerRef, isActive = true, ownerUsername, stable = false }: SocialDrmOverlayProps) {
  const { user } = useAuth();
  const [position, setPosition] = useState({ top: 20, left: 20 });
  const overlayRef = useRef<HTMLDivElement>(null);

  // Watermark label: prioriza nome do dono ("OCULTO @user"); fallback para ID do espectador
  const viewerId = user?.id?.slice(0, 8) || "anon";
  const watermarkLabel = ownerUsername
    ? `OCULTO @${ownerUsername}`
    : `ID: ${viewerId}`;
  // Memoiza o timestamp p/ não recriar string a cada render do pai (pai re-renderiza 4–30×/s via onTimeUpdate).
  const timestamp = useMemo(() => new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }), []);

  // DVD Screensaver style - random position changes
  useEffect(() => {
    if (!isActive || stable) return;

    const moveWatermark = () => {
      const newTop = Math.floor(Math.random() * 70) + 10; // 10% to 80%
      const newLeft = Math.floor(Math.random() * 60) + 10; // 10% to 70%
      setPosition({ top: newTop, left: newLeft });
    };

    // Initial random position
    moveWatermark();

    // Change position every 4 seconds
    const interval = setInterval(moveWatermark, 4000);

    return () => clearInterval(interval);
  }, [isActive, stable]);

  if (!isActive) return null;

  return (
    <div
      ref={overlayRef}
      data-drm-watermark="true"
      className={stable
        ? "absolute z-50 pointer-events-none select-none"
        : "absolute z-50 pointer-events-none select-none transition-all [transition-duration:2000ms] ease-in-out"
      }
      style={{
        top: stable ? "18%" : `${position.top}%`,
        left: stable ? "50%" : `${position.left}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        className="text-[11px] font-mono whitespace-nowrap"
        style={{
          color: "rgba(255, 255, 255, 0.35)",
          textShadow: "0 0 3px rgba(0, 0, 0, 0.9), 0 0 1px rgba(0, 0, 0, 1)",
          letterSpacing: "0.5px",
        }}
      >
        {watermarkLabel} • {timestamp}
      </span>
    </div>
  );
}
