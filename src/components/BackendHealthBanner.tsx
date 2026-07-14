import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import {
  EXTERNAL_SUPABASE_URL as SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY as ANON_KEY,
} from "@/lib/appConfig";

type Status = "checking" | "ok" | "down";

async function pingAuth(): Promise<Status> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    // 200 ok; 401 também indica que o serviço respondeu (apenas falta auth)
    if (res.ok || res.status === 401) return "ok";
    return "down";
  } catch {
    return "down";
  }
}

/**
 * Banner exibido no Login quando o serviço de autenticação do backend
 * externo está intermitente (504/522/timeout). Re-checa a cada 20s.
 */
interface BackendHealthBannerProps {
  status?: Status;
  checking?: boolean;
  check?: () => void | Promise<unknown>;
}

export function BackendHealthBanner({
  status: controlledStatus,
  checking: controlledChecking,
  check: controlledCheck,
}: BackendHealthBannerProps = {}) {
  const shouldUseInternal = !controlledStatus || !controlledCheck || typeof controlledChecking === "undefined";
  const internal = useBackendHealthStatus({ enabled: shouldUseInternal });
  const status = controlledStatus ?? internal.status;
  const checking = controlledChecking ?? internal.checking;
  const check = controlledCheck ?? internal.check;

  if (status !== "down") return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200 flex items-start gap-3"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-400" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-yellow-300">
          Serviço de login temporariamente indisponível
        </p>
        <p className="text-yellow-200/90 mt-0.5 text-xs leading-relaxed">
          Nosso servidor de autenticação está intermitente neste momento.
          Seus dados estão seguros — tente novamente em alguns instantes.
        </p>
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-yellow-300 hover:text-yellow-100 transition-colors disabled:opacity-60"
        >
          {checking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Verificar novamente
        </button>
      </div>
    </div>
  );
}

export function useBackendHealthStatus(options?: { enabled?: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [checking, setChecking] = useState(false);
  const enabled = options?.enabled ?? true;

  const check = useCallback(async () => {
    setChecking(true);
    const s = await pingAuth();
    setStatus(s);
    setChecking(false);
    return s;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    check();
    // 60s + pausa em background — alivia low-end mobile.
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      check();
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [check, enabled]);

  return {
    status,
    checking,
    check,
  };
}
