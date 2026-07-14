import { memo, useMemo, useCallback, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RadarMapUser } from "@/hooks/useRadarUsers";
import { RadarUserDot } from "./RadarUserDot";
import { RadarUserSheet } from "./RadarUserSheet";
import { PingWaveAnimation } from "./PingWaveAnimation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MAX_RENDERED_USERS = 50;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;
// Approx ±5km of "fuzz" so dots are near (but not exactly on) the user's real position
const POSITION_JITTER_KM = 5;

export type RadarLocationHistoryEntry = {
  ts: number;
  lat: number;
  lng: number;
  source: "gps" | "profile" | "none";
  city?: string | null;
  distanceFromHomeKm?: number | null;
};

interface AbstractRadarProps {
  users: RadarMapUser[];
  onUserClick?: (user: RadarMapUser) => void;
  pingersSet?: Set<string>;
  onSendPing?: (userId: string) => void;
  pingAnimation?: { targetId: string; timestamp: number } | null;
  isPingSending?: boolean;
  pingedByMeSet?: Set<string>;
  /** Max radius (km) the radar represents. Default 50. */
  maxRadiusKm?: number;
  /** Últimas localizações detectadas (sessão atual) — exibidas no drawer do usuário. */
  recentLocationHistory?: RadarLocationHistoryEntry[];
  /** Usuário logado — exibido fixo no centro do radar. */
  currentUser?: { id: string; name: string; avatar_url: string | null } | null;
}

function formatBand(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1).replace(/\.0$/, "")}km`;
  return `${Math.round(km)}km`;
}

/** Build 4 concentric bands LINEARLY scaled to the chosen max radius
 *  so the ring labels match the actual position of the dots (which are also linear). */
function buildBands(maxKm: number): { value: number; label: string }[] {
  const fractions = [0.25, 0.5, 0.75, 1]; // 25%, 50%, 75%, 100% of max
  return fractions.map((f) => {
    const v = Math.max(0.1, maxKm * f);
    return { value: v, label: formatBand(v) };
  });
}

/** Linear mapping: distance 0 -> radius 0.05, distance maxKm -> radius 0.95. */
function distanceToRadius(distanceKm: number, maxKm: number): number {
  const clamped = Math.max(0, Math.min(maxKm, distanceKm));
  return 0.05 + (clamped / maxKm) * 0.9;
}

/** Deterministic ±jitterKm offset based on user id, clamped to [0, maxKm] so dots never escape the radar. */
function jitteredDistance(distanceKm: number, id: string, jitterKm: number, maxKm: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  // Map to [-1, 1)
  const norm = ((h % 2000) / 1000) - 1;
  const jittered = distanceKm + norm * jitterKm;
  return Math.max(0, Math.min(maxKm, jittered));
}

export const AbstractRadar = memo(function AbstractRadar({
  users,
  onUserClick,
  pingersSet,
  onSendPing,
  pingAnimation,
  isPingSending,
  pingedByMeSet,
  maxRadiusKm = 50,
  recentLocationHistory,
  currentUser,
}: AbstractRadarProps) {
  const [selectedUser, setSelectedUser] = useState<RadarMapUser | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const lastTouchDistRef = useRef<number | null>(null);
  const lastPanPosRef = useRef({ x: 0, y: 0 });

  const handleUserClick = useCallback((user: RadarMapUser) => {
    setSelectedUser(user);
    onUserClick?.(user);
  }, [onUserClick]);

  // Mouse wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Touch pinch-to-zoom + free pan (sem exigir zoom > 1)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getTouchDist = (t: TouchList) => {
      if (t.length < 2) return null;
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastTouchDistRef.current = getTouchDist(e.touches);
      } else if (e.touches.length === 1) {
        isPanningRef.current = true;
        lastPanPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        if (dist && lastTouchDistRef.current) {
          const scale = dist / lastTouchDistRef.current;
          setZoom(prev => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * scale)));
          lastTouchDistRef.current = dist;
        }
      } else if (e.touches.length === 1 && isPanningRef.current) {
        const dx = e.touches[0].clientX - lastPanPosRef.current.x;
        const dy = e.touches[0].clientY - lastPanPosRef.current.y;
        lastPanPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        setPan(prev => ({
          x: Math.max(-600, Math.min(600, prev.x + dx)),
          y: Math.max(-600, Math.min(600, prev.y + dy)),
        }));
      }
    };

    const onTouchEnd = () => {
      lastTouchDistRef.current = null;
      isPanningRef.current = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Mouse drag pan (desktop) — funciona em qualquer zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      // Ignora clique em dots/botões interativos
      const target = e.target as HTMLElement;
      if (target.closest('[data-radar-dot]') || target.closest('button')) return;
      isPanningRef.current = true;
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      el.style.cursor = "grabbing";
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - lastPanPosRef.current.x;
      const dy = e.clientY - lastPanPosRef.current.y;
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      setPan(prev => ({
        x: Math.max(-600, Math.min(600, prev.x + dx)),
        y: Math.max(-600, Math.min(600, prev.y + dy)),
      }));
    };
    const onMouseUp = () => {
      isPanningRef.current = false;
      el.style.cursor = "";
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Mantém pan livre mesmo em zoom 1 (não auto-reseta)

  const cappedUsers = useMemo(() => users.slice(0, MAX_RENDERED_USERS), [users]);

  const bands = useMemo(() => buildBands(maxRadiusKm), [maxRadiusKm]);

  const positionedUsers = useMemo(() => {
    return cappedUsers.map(user => {
      // Posicionamento visual usa o ENDEREÇO DE CADASTRO do alvo como referência (displayDistanceKm),
      // mantendo a bolha estável mesmo quando o usuário logado se move. Os filtros continuam usando distanceKm (GPS).
      const realDist = user.displayDistanceKm ?? user.distanceKm ?? maxRadiusKm;
      // Apply ±5km jitter (clamped to maxRadiusKm) so the dot lands close to (but not exactly on) the real spot
      // and never visually escapes the outer ring.
      const jitter = Math.min(POSITION_JITTER_KM, maxRadiusKm * 0.1);
      const dist = jitteredDistance(realDist, user.id, jitter, maxRadiusKm);
      const radius = distanceToRadius(dist, maxRadiusKm);
      const angle = user.random_angle ??
        ((user.id.charCodeAt(0) + user.id.charCodeAt(1) * 7 + user.id.charCodeAt(2) * 13) % 360);
      const angleRad = (angle * Math.PI) / 180;
      const x = 50 + radius * 50 * Math.cos(angleRad);
      const y = 50 + radius * 50 * Math.sin(angleRad);
      return { user, x, y, dist: realDist };
    });
  }, [cappedUsers, maxRadiusKm]);

  const pingTarget = useMemo(() => {
    if (!pingAnimation) return null;
    return positionedUsers.find((p) => p.user.id === pingAnimation.targetId) ?? null;
  }, [pingAnimation, positionedUsers]);

  return (
    <TooltipProvider delayDuration={150}>
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden bg-background touch-none cursor-grab"
    >
      {/* Zoomable + pannable radar */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transformOrigin: "center center",
          willChange: "transform",
          transition: isPanningRef.current ? "none" : "transform 0.15s ease-out",
        }}
      >
        {/* Radar circle — fills available space responsively */}
        <div
          className="relative aspect-square"
          style={{
            width: "min(100%, 100vh - 10rem)",
            maxWidth: "100%",
          }}
        >
          {/* Scanning sweep */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary) / 0.08) 30deg, transparent 60deg)",
              animation: "radar-sweep 4s linear infinite",
            }}
          />

          {/* Concentric rings */}
          {bands.map((band, i) => {
            const size = ((i + 1) / bands.length) * 100;
            return (
              <div
                key={i}
                className="absolute rounded-full border border-primary/10"
                style={{
                  width: `${size}%`,
                  height: `${size}%`,
                  top: `${(100 - size) / 2}%`,
                  left: `${(100 - size) / 2}%`,
                }}
              >
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground/50 font-mono">
                  {band.label}
                </span>
              </div>
            );
          })}

          {/* Center dot (YOU) — avatar do usuário logado fixo no centro */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="relative">
              {currentUser?.avatar_url ? (
                <>
                  <div
                    className="absolute inset-0 -m-2 rounded-full bg-primary/30"
                    style={{ animation: "radar-center-pulse 2s ease-in-out infinite" }}
                  />
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.name}
                    className="relative w-10 h-10 rounded-full object-cover ring-2 ring-primary shadow-[0_0_16px_hsl(var(--primary)/0.7)]"
                    loading="eager"
                    decoding="async"
                  />
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-primary bg-background/80 px-1.5 py-0.5 rounded-full border border-primary/30 whitespace-nowrap">
                    Você
                  </span>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
                  <div
                    className="absolute inset-0 rounded-full bg-primary/30"
                    style={{ animation: "radar-center-pulse 2s ease-in-out infinite" }}
                  />
                </>
              )}
            </div>
          </div>

          {/* Cross-hair lines */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-primary/5" />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-primary/5" />

          {/* Ping wave animation + badge de confirmação */}
          <AnimatePresence>
            {pingTarget && (
              <>
                <PingWaveAnimation originX={50} originY={50} active={true} />
                <motion.div
                  key={`ping-confirm-${pingAnimation?.timestamp}`}
                  initial={{ opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -12 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-[140%] rounded-full border border-primary/40 bg-primary/15 backdrop-blur-md px-3 py-1 text-[11px] font-semibold text-primary shadow-[0_0_24px_-6px_hsl(var(--primary))]"
                  role="status"
                  aria-live="polite"
                >
                  👋 Aceno enviado!
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* User dots */}
          <AnimatePresence>
            {positionedUsers.map(({ user, x, y, dist }) => (
              <RadarUserDot
                key={user.id}
                user={user}
                x={x}
                y={y}
                distance={dist}
                onClick={() => handleUserClick(user)}
                hasPingedMe={pingersSet?.has(user.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Zoom indicator (fades out) */}
      {zoom !== 1 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <span className="text-xs font-mono text-muted-foreground bg-card/80 px-2 py-1 rounded-full border border-border/30">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}

      {/* Reset zoom + pan button */}
      {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="absolute top-3 right-3 z-30 text-xs text-muted-foreground bg-card/80 px-2 py-1 rounded-full border border-border/30 hover:bg-card transition-colors"
        >
          Reset
        </button>
      )}

      {/* User detail sheet */}
      <RadarUserSheet
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSendPing={onSendPing}
        isPingSending={isPingSending}
        hasPingedMe={selectedUser ? pingersSet?.has(selectedUser.id) : false}
        alreadyPinged={selectedUser ? pingedByMeSet?.has(selectedUser.id) : false}
        recentLocationHistory={recentLocationHistory}
      />
    </div>
    </TooltipProvider>
  );
});
