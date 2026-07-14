import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Database } from "lucide-react";
import { useFeedCacheStore } from "@/store/useFeedCacheStore";

/**
 * Chip discreto mostrando o estado de sincronização do feed:
 * - "Cache carregado": posts vieram do cache local (sem rede ainda).
 * - "Sincronizando…": react-query está fazendo fetch/refetch.
 * - "Atualizado": última sincronização OK (some após alguns segundos).
 *
 * Consome apenas estado global — não recebe props para poder ser plugado
 * em qualquer lugar do RealFeed sem alterar suas props.
 */
export function FeedSyncStatusChip({ className = "" }: { className?: string }) {
  const fetching = useIsFetching({
    predicate: (q) => {
      const k = q.queryKey?.[0];
      return k === "posts" || k === "posts-infinite";
    },
  });
  const cachedPosts = useFeedCacheStore((s) => s.posts?.length ?? 0);
  const [phase, setPhase] = useState<"cache" | "syncing" | "fresh" | "idle">(
    cachedPosts > 0 ? "cache" : "idle",
  );

  useEffect(() => {
    if (fetching > 0) {
      setPhase("syncing");
      return;
    }
    if (phase === "syncing") {
      setPhase("fresh");
      const t = window.setTimeout(() => setPhase("idle"), 2500);
      return () => window.clearTimeout(t);
    }
  }, [fetching, phase]);

  if (phase === "idle") return null;

  const styles: Record<
    Exclude<typeof phase, "idle">,
    { icon: JSX.Element; label: string; cls: string }
  > = {
    cache: {
      icon: <Database className="h-3 w-3" />,
      label: "Cache carregado",
      cls: "bg-muted/60 text-muted-foreground border-muted",
    },
    syncing: {
      icon: <RefreshCw className="h-3 w-3 animate-spin" />,
      label: "Sincronizando…",
      cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    },
    fresh: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Atualizado",
      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    },
  };

  const s = styles[phase];
  return (
    <div
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity ${s.cls} ${className}`}
    >
      {s.icon}
      <span>{s.label}</span>
    </div>
  );
}
