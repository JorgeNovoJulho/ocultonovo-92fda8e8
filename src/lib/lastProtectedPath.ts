/**
 * Memória curta do último caminho protegido visitado pelo usuário
 * autenticado. Usada pelo ErrorBoundary para restaurar o contexto
 * após falhas de chunk (deploy novo, cache stale, rede flaky) —
 * evita que o usuário seja jogado de volta para a Landing por engano.
 */

const KEY = "oculto:lastProtectedPath";
const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot", "/reset", "/auth/callback"];

function isPublicPath(path: string): boolean {
  if (!path || path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

export function rememberLastProtectedPath(path: string): void {
  if (typeof window === "undefined") return;
  if (isPublicPath(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* ignore */
  }
}

export function getLastProtectedPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(KEY);
    if (v && !isPublicPath(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Retorna o caminho seguro para restaurar após uma recuperação de erro:
 * o caminho atual se ele for protegido, ou o último protegido conhecido,
 * ou `/feed` como fallback final.
 */
export function resolveSafeRecoveryPath(currentPath?: string): string {
  const cur = currentPath ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (cur && !isPublicPath(cur)) return cur;
  return getLastProtectedPath() ?? "/feed";
}
