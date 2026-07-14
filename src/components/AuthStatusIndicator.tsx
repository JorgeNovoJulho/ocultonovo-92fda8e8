import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { authDiagnostics, type AuthEvent } from "@/lib/authDiagnostics";

type Status = "checking" | "ok" | "down";

interface Props {
  status: Status;
  checking: boolean;
  onRecover?: () => void;
}

const formatRelative = (ts: number | null) => {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 5_000) return "agora";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s atrás`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}min atrás`;
  return new Date(ts).toLocaleTimeString();
};

const labelForEvent = (type: AuthEvent["type"]) => {
  switch (type) {
    case "refresh_attempt": return "Tentativa de refresh";
    case "refresh_ok": return "Refresh OK";
    case "refresh_fail": return "Falha no refresh";
    case "refresh_error": return "Erro de rede";
    case "session_purged": return "Sessão local limpa";
    case "auto_recovery": return "Recuperação automática";
  }
};

export function AuthStatusIndicator({ status, checking, onRecover }: Props) {
  const [diag, setDiag] = useState(() => authDiagnostics.getState());
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => authDiagnostics.subscribe(setDiag), []);

  // re-renderiza a cada 60s só para atualizar "agora / Xs atrás" (era 15s)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { lastRefreshAt, lastRefreshStatus, refreshFailureCount, refreshSuccessCount, purgedTokens, events } = diag;

  const pill = useMemo(() => {
    if (checking || status === "checking") {
      return { Icon: Activity, label: "Verificando…", cls: "text-yellow-300 border-yellow-500/40 bg-yellow-500/10" };
    }
    if (status === "down") {
      return { Icon: WifiOff, label: "Auth offline", cls: "text-red-300 border-red-500/40 bg-red-500/10" };
    }
    return { Icon: Wifi, label: "Auth online", cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" };
  }, [status, checking]);

  const recentFails = events.filter((e) => e.type === "refresh_fail" || e.type === "refresh_error").length;

  return (
    <div className="mb-4 rounded-lg border border-border/50 bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        aria-controls="auth-status-panel"
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${pill.cls}`}>
            <pill.Icon className="h-3 w-3" />
            {pill.label}
          </span>
          <span className="text-muted-foreground truncate">
            Último refresh: <strong className="text-foreground">{formatRelative(lastRefreshAt)}</strong>
            {lastRefreshStatus ? ` · HTTP ${lastRefreshStatus}` : ""}
          </span>
          {refreshFailureCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-red-300">
              <AlertTriangle className="h-3 w-3" />
              {refreshFailureCount} falha{refreshFailureCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {open && (
        <div id="auth-status-panel" className="border-t border-border/40 px-3 py-2 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded border border-border/40 bg-background/40 p-2">
              <p className="text-muted-foreground">Refreshes OK</p>
              <p className="font-semibold text-emerald-300">{refreshSuccessCount}</p>
            </div>
            <div className="rounded border border-border/40 bg-background/40 p-2">
              <p className="text-muted-foreground">Refreshes com falha</p>
              <p className="font-semibold text-red-300">{refreshFailureCount}</p>
            </div>
            <div className="rounded border border-border/40 bg-background/40 p-2 col-span-2">
              <p className="text-muted-foreground">Tokens removidos</p>
              <p className="font-mono text-[10px] text-foreground break-all">
                {purgedTokens.length ? purgedTokens.slice(0, 4).join(", ") : "nenhum"}
                {purgedTokens.length > 4 ? ` (+${purgedTokens.length - 4})` : ""}
              </p>
            </div>
          </div>

          <div className="rounded border border-border/40 bg-background/40 p-2">
            <p className="text-muted-foreground mb-1">Últimos eventos ({events.length})</p>
            <ul className="max-h-32 overflow-auto space-y-1 text-[10.5px]">
              {events.length === 0 && <li className="text-muted-foreground">Nenhum evento registrado ainda.</li>}
              {events.slice(0, 10).map((e, i) => {
                const isFail = e.type === "refresh_fail" || e.type === "refresh_error";
                const isOk = e.type === "refresh_ok";
                return (
                  <li key={`${e.ts}-${i}`} className="flex items-start gap-1.5">
                    {isFail ? (
                      <AlertTriangle className="h-3 w-3 mt-0.5 text-red-400 shrink-0" />
                    ) : isOk ? (
                      <CheckCircle2 className="h-3 w-3 mt-0.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Activity className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
                    <span className="text-foreground">{labelForEvent(e.type)}</span>
                    {e.status ? <span className="text-muted-foreground">· {e.status}</span> : null}
                    {e.detail ? <span className="text-muted-foreground truncate">· {e.detail}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onRecover && (recentFails > 0 || status === "down") && (
              <button
                type="button"
                onClick={onRecover}
                className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20"
              >
                <RotateCcw className="h-3 w-3" />
                Limpar sessão e tentar novamente
              </button>
            )}
            <button
              type="button"
              onClick={() => authDiagnostics.reset()}
              className="inline-flex items-center gap-1 rounded border border-border/50 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Resetar contadores
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
