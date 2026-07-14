import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export type LandingPublicMetricAction = "view" | "login_click" | "signup_click";

type LandingPublicMetricsSummary = {
  viewTotal: number;
  loginTotal: number;
  signupTotal: number;
  viewToday: number;
  loginToday: number;
  signupToday: number;
};

const SESSION_STORAGE_KEY = "oculto:landing-public-session";

let memorySessionId: string | null = null;

function createSessionId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `landing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
  if (memorySessionId) return memorySessionId;

  const generated = createSessionId();

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existing) {
        memorySessionId = existing;
        return existing;
      }

      window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    }
  } catch {
    // noop
  }

  memorySessionId = generated;
  return generated;
}

export function trackLandingPublicAction(action: LandingPublicMetricAction, path?: string) {
  try {
    const currentPath = path || (typeof window !== "undefined" ? window.location.pathname : "/");
    void supabase.rpc("landing_public_metric_increment", {
      p_action: action,
      p_path: currentPath,
      p_session_key: getSessionId(),
    });
  } catch {
    // telemetria mock nunca quebra a UX
  }
}

async function fetchMetricCount(action: LandingPublicMetricAction, fromIso?: string) {
  let query: any = supabase
    .from("oculto_landing_public_metrics")
    .select("id", { count: "exact", head: true })
    .eq("action", action);

  if (fromIso) {
    query = query.gte("created_at", fromIso);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export function useLandingPublicMetricsSummary(enabled: boolean = true) {
  return useQuery<LandingPublicMetricsSummary>({
    queryKey: ["landing-public-metrics-summary"],
    enabled,
    queryFn: async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIso = today.toISOString();

        const [viewTotal, loginTotal, signupTotal, viewToday, loginToday, signupToday] = await Promise.all([
          fetchMetricCount("view"),
          fetchMetricCount("login_click"),
          fetchMetricCount("signup_click"),
          fetchMetricCount("view", todayIso),
          fetchMetricCount("login_click", todayIso),
          fetchMetricCount("signup_click", todayIso),
        ]);

        return {
          viewTotal,
          loginTotal,
          signupTotal,
          viewToday,
          loginToday,
          signupToday,
        };
      } catch {
        return {
          viewTotal: 0,
          loginTotal: 0,
          signupTotal: 0,
          viewToday: 0,
          loginToday: 0,
          signupToday: 0,
        };
      }
    },
    staleTime: 1000 * 60 * 2,
  });
}