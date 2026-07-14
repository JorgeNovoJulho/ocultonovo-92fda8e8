import { useState, useRef, useEffect } from "react";
import { motion, useAnimation, PanInfo, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, GripHorizontal, X } from "lucide-react";
import { UserListSidebar } from "./UserListSidebar";
import { RadarMapUser } from "@/hooks/useRadarUsers";
import { Button } from "@/components/ui/button";

interface MobileUsersSheetProps {
  users: RadarMapUser[];
  selectedUserId?: string;
  onUserClick: (user: RadarMapUser) => void;
  onSendPing?: (userId: string) => void;
  isPingSending?: boolean;
  pingedByMeSet?: Set<string>;
}

type Snap = "collapsed" | "half" | "expanded";

/**
 * Bottom sheet expansível para a lista de usuários no Radar mobile.
 * - 3 snaps (collapsed/half/expanded), arraste a alça OU toque para alternar
 * - Botão visível de recolher/expandir + botão de fechar
 * - Backdrop tocável (apenas quando expandido) para fechar
 * - Respeita safe-area inset-bottom
 */
export function MobileUsersSheet(props: MobileUsersSheetProps) {
  const controls = useAnimation();
  const [snap, setSnap] = useState<Snap>("collapsed");
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const heights = {
    collapsed: 72,
    half: Math.round(viewportH * 0.5),
    expanded: Math.round(viewportH * 0.86),
  };

  useEffect(() => {
    controls.start({
      height: heights[snap],
      transition: { type: "spring", damping: 28, stiffness: 240 },
    });
  }, [snap, heights.collapsed, heights.half, heights.expanded, controls]);

  const onDragEnd = (_: any, info: PanInfo) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;
    if (velocity < -300 || offset < -80) {
      setSnap(snap === "collapsed" ? "half" : "expanded");
    } else if (velocity > 300 || offset > 80) {
      setSnap(snap === "expanded" ? "half" : "collapsed");
    } else {
      controls.start({
        height: heights[snap],
        transition: { type: "spring", damping: 28, stiffness: 240 },
      });
    }
  };

  const cycleUp = () => setSnap(snap === "collapsed" ? "half" : "expanded");
  const cycleDown = () => setSnap(snap === "expanded" ? "half" : "collapsed");

  return (
    <>
      {/* Backdrop sólido — cobre o radar quando o sheet está aberto (half ou expanded). */}
      <AnimatePresence>
        {snap !== "collapsed" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSnap("collapsed")}
            className="md:hidden fixed inset-0 z-20 bg-black"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={containerRef}
        className="md:hidden fixed left-0 right-0 z-30 bg-black border-t border-border/60 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          bottom: "calc(4rem + env(safe-area-inset-bottom))",
          touchAction: "none",
        }}
        initial={{ height: heights.half }}
        animate={controls}
        role="dialog"
        aria-label="Lista de usuários próximos"
      >
        {/* Header / drag handle */}
        <div className="flex-shrink-0 flex items-center gap-2 px-2 pt-1.5 pb-1 border-b border-border/40 bg-gradient-to-r from-primary/30 via-accent/20 to-primary/30 backdrop-blur-sm">
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={onDragEnd}
            onClick={cycleUp}
            className="flex-1 py-2 flex flex-col items-center cursor-grab active:cursor-grabbing select-none"
            role="button"
            aria-label={
              snap === "expanded"
                ? "Recolher lista"
                : snap === "half"
                ? "Expandir lista"
                : "Abrir lista"
            }
          >
            <div className="w-12 h-1.5 bg-muted-foreground/40 rounded-full" />
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
              <GripHorizontal className="h-3 w-3" />
              <span className="font-medium">
                {snap === "collapsed"
                  ? `${props.users.length} próximos — toque para abrir`
                  : snap === "half"
                  ? "Arraste para expandir ou recolher"
                  : "Arraste para baixo para ver o radar"}
              </span>
            </div>
          </motion.div>

          {/* Botões de controle visíveis */}
          <div className="flex items-center gap-1 pr-1">
            {snap !== "expanded" && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={cycleUp}
                className="h-8 w-8"
                aria-label="Expandir"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            )}
            {snap !== "collapsed" && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={cycleDown}
                className="h-8 w-8"
                aria-label="Recolher"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
            {snap === "expanded" && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setSnap("collapsed")}
                className="h-8 w-8"
                aria-label="Fechar lista"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Lista scrollável — touchAction auto para permitir scroll vertical do conteúdo */}
        <div
          className="flex-1 min-h-0 overflow-hidden"
          style={{ touchAction: "pan-y" }}
        >
          <UserListSidebar
            users={props.users}
            onUserClick={props.onUserClick}
            selectedUserId={props.selectedUserId}
            onSendPing={props.onSendPing}
            isPingSending={props.isPingSending}
            pingedByMeSet={props.pingedByMeSet}
            className="w-full h-full flex flex-col bg-transparent"
          />
        </div>
      </motion.div>
    </>
  );
}
