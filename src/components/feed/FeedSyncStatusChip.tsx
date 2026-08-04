import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Database } from "lucide-react";
import { useFeedCacheStore } from "@/store/useFeedCacheStore";
import { useFeedDebugStore } from "@/store/useFeedDebugStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

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
  const { isDebugEnabled, logs, toggleDebug, clearLogs } = useFeedDebugStore();
  const addDebugLog = useFeedDebugStore(s => s.addLog);

  useEffect(() => {
    if (fetching > 0) {
      setPhase("syncing");
      return;
    }
    if (phase === "syncing") {
      setPhase("fresh");
      addDebugLog('fresh', 'Feed sincronizado com sucesso');
      const t = window.setTimeout(() => setPhase("idle"), 2500);
      return () => window.clearTimeout(t);
    }
  }, [fetching, phase]);

  if (phase === "idle" && !isDebugEnabled) return null;

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

  const s = phase !== "idle" ? styles[phase] : null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {s && (
        <div
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity ${s.cls}`}
        >
          {s.icon}
          <span>{s.label}</span>
        </div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleDebug}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
                isDebugEnabled
                  ? "bg-red-500/10 text-red-500 border-red-500/30"
                  : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
              )}
            >
              <Database className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="w-64 p-0">
            <div className="flex items-center justify-between border-b p-2">
              <span className="text-xs font-bold">Debug do Feed</span>
              <button 
                onClick={(e) => { e.stopPropagation(); clearLogs(); }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Limpar
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {logs.length === 0 ? (
                <div className="py-4 text-center text-[10px] text-muted-foreground">Sem logs</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="mb-1 rounded bg-muted/30 p-1 text-[9px] leading-tight">
                    <div className="flex items-center justify-between opacity-70">
                      <span className="font-mono">{format(log.timestamp, 'HH:mm:ss.SSS')}</span>
                      <span className={cn(
                        "rounded px-1 text-[8px] uppercase",
                        log.type === 'query' ? "bg-blue-500/20 text-blue-400" :
                        log.type === 'fresh' ? "bg-emerald-500/20 text-emerald-400" :
                        "bg-amber-500/20 text-amber-400"
                      )}>
                        {log.type}
                      </span>
                    </div>
                    <div className="mt-0.5 break-words font-medium">{log.message}</div>
                  </div>
                ))
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
