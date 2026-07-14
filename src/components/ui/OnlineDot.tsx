import { useEffect, useState } from "react";
import { isReallyOnline } from "@/lib/onlineStatus";
import { cn } from "@/lib/utils";

type SizeKey = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<SizeKey, string> = {
  xs: "w-2 h-2",
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
  lg: "w-3.5 h-3.5",
  xl: "w-4 h-4",
};

// Tick global compartilhado — força TODOS os OnlineDot a recalcularem
// `isReallyOnline()` periodicamente sem depender do refetch do pai.
// Custo: 1 setInterval e 1 setState por dot a cada 30s.
let _tickSubscribers = 0;
let _tickHandle: number | null = null;
const _tickListeners = new Set<() => void>();

function startGlobalTick() {
  if (_tickHandle != null) return;
  _tickHandle = window.setInterval(() => {
    _tickListeners.forEach((fn) => {
      try { fn(); } catch { /* noop */ }
    });
  }, 30_000);
}
function stopGlobalTick() {
  if (_tickHandle == null) return;
  window.clearInterval(_tickHandle);
  _tickHandle = null;
}

function useOnlineTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => (t + 1) & 0xffff);
    _tickListeners.add(fn);
    _tickSubscribers++;
    startGlobalTick();
    return () => {
      _tickListeners.delete(fn);
      _tickSubscribers--;
      if (_tickSubscribers <= 0) stopGlobalTick();
    };
  }, []);
}

interface OnlineDotProps {
  user?: {
    is_online?: boolean | null;
    last_seen?: string | null;
    show_online_status?: boolean | null;
  } | null;
  size?: SizeKey;
  /** Tailwind classes for positioning (default: bottom-right of avatar). */
  positionClassName?: string;
  /** Tailwind class for the outer ring color. Defaults to border-background. */
  borderClassName?: string;
  className?: string;
}

/**
 * Padrão visual unificado de status:
 * - Verde (hsl(142 76% 46%)) quando o usuário está REALMENTE online
 *   (is_online=true && last_seen < 2min && show_online_status != false)
 * - Vermelho (hsl(0 84% 60%)) caso contrário.
 *
 * Reavalia a cada 30s via tick global — sem depender de refetch do pai.
 */
export function OnlineDot({
  user,
  size = "md",
  positionClassName = "absolute bottom-0 right-0",
  borderClassName = "border-background",
  className,
}: OnlineDotProps) {
  useOnlineTick();
  const online = isReallyOnline(user);
  return (
    <div
      className={cn(
        positionClassName,
        SIZE_MAP[size],
        "rounded-full border-2",
        borderClassName,
        online ? "bg-[hsl(142,76%,46%)]" : "bg-[hsl(0,84%,60%)]",
        className,
      )}
      aria-label={online ? "Online" : "Offline"}
      role="status"
    />
  );
}
