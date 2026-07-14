import { memo, useState } from "react";
import { motion } from "framer-motion";
import { RadarMapUser } from "@/hooks/useRadarUsers";
import { Crown, Flame } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPublicHandle, getHandleInitial } from "@/lib/userHandle";

interface RadarUserDotProps {
  user: RadarMapUser;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  distance: number;
  onClick: () => void;
  hasPingedMe?: boolean; // show aura if this user pinged me
}

export const RadarUserDot = memo(function RadarUserDot({ user, x, y, distance, onClick, hasPingedMe }: RadarUserDotProps) {
  const isVip = user.plan_type === "vip";
  const isLookingNow = user.is_looking_now;
  const [imgError, setImgError] = useState(false);

  // Sempre exibir apenas o @username (nunca o nome real)
  const handle = getPublicHandle(user);
  const initial = getHandleInitial(user);

  const distanceLabel = distance < 1
    ? `${Math.round(distance * 1000)}m`
    : `${distance.toFixed(1)}km`;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          onClick={onClick}
          data-radar-dot
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 group focus:outline-none touch-manipulation cursor-pointer"
          style={{
            left: `${x}%`,
            top: `${y}%`,
          }}
          aria-label={`${handle} — ${distanceLabel}`}
        >
          {/* Ping aura — pulsing ring for users who pinged me */}
          {hasPingedMe && (
            <div
              className="absolute inset-[-6px] rounded-full border-2 border-primary"
              style={{
                animation: "radar-ping-aura 1.2s ease-in-out infinite",
                boxShadow: "0 0 12px hsl(var(--primary) / 0.5)",
              }}
            />
          )}

          {/* Glow ring */}
          {(isLookingNow || isVip) && (
            <div
              className="absolute inset-[-4px] rounded-full"
              style={{
                background: isLookingNow
                  ? "radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 70%)"
                  : "radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)",
                animation: isLookingNow ? "radar-dot-pulse 1.5s ease-in-out infinite" : undefined,
              }}
            />
          )}

          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-full border-2 overflow-hidden bg-muted transition-transform group-hover:scale-110 flex items-center justify-center"
            style={{
              borderColor: hasPingedMe
                ? "hsl(var(--primary))"
                : isLookingNow
                  ? "#f97316"
                  : isVip
                    ? "hsl(var(--primary))"
                    : "hsl(var(--border))",
            }}
          >
            {!imgError && user.avatar_url ? (
              <img
                loading="lazy"
                src={user.avatar_url}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-sm font-bold text-muted-foreground select-none">
                {initial}
              </span>
            )}
          </div>

          {/* Status indicators */}
          {isLookingNow ? (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center border border-background">
              <Flame className="w-2.5 h-2.5 text-white" />
            </div>
          ) : isVip ? (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center border border-background">
              <Crown className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
          ) : user.is_online ? (
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
          ) : null}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="px-2 py-1">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-semibold leading-tight">{handle}</span>
          <span className="text-[10px] font-mono text-muted-foreground leading-tight">{distanceLabel}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
