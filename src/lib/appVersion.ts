import { logger } from '@/lib/logger';
/**
 * Sistema de invalidação automática de cache + hard refresh controlado.
 *
 * Como funciona:
 *  - A cada build, `vite.config.ts` injeta `__APP_VERSION__` (constante) e
 *    o plugin grava `public/version.json` (também é regenerado em runtime
 *    para o build de produção via `dist/version.json`).
 *  - Em runtime, consultamos `/version.json` (sempre no-store) em intervalos
 *    e ao recuperar foco da aba.
 *  - Se a versão remota diferir da versão embutida no bundle:
 *      1. mostramos um toast discreto "🌙 O Oculto foi atualizado..."
 *      2. limpamos somente Cache Storage (CacheStorage API) — NUNCA
 *         localStorage / sessionStorage / cookies (preserva login,
 *         preferências, tokens Supabase, onboarding, etc.).
 *      3. pedimos ao Service Worker para atualizar (skipWaiting já está
 *         configurado em /sw.js).
 *      4. recarregamos a página UMA vez (guard por sessionStorage para
 *         evitar loop infinito).
 *
 *  - Handler global para ChunkLoadError / "Failed to fetch dynamically
 *    imported module" — quando um chunk antigo some após deploy, limpamos
 *    cache e recarregamos (com guard de 1 tentativa por sessão).
 *
 * NÃO altera: auth, sessão, localStorage, preferências do usuário.
 */

// Injetado pelo vite.config.ts (define) em build-time
declare const __APP_VERSION__: string;

const LOCAL_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const VERSION_URL = "/version.json";
// Atualização precisa ser rápida: usuários em PWA/mobile não podem ficar
// presos em bundles antigos. Toda checagem passa por `canCheckAppVersion`.
const POLL_INTERVAL_MS = 60 * 1000; // 1 min
// Intervalo mínimo entre checagens de /version.json (visibilitychange,
// polling e chamadas manuais). Compartilhado entre abas via localStorage.
const VERSION_CHECK_THROTTLE_MS = 60 * 1000; // 1 min
const VERSION_CHECK_KEY = "oculto:last-version-check";
const RELOAD_GUARD_KEY = "oculto:version-reload-at";
const CHUNK_GUARD_KEY = "oculto:chunk-reload-at";
const ACCEPTED_VERSION_KEY = "oculto:accepted-version";
const ACCEPTED_AT_KEY = "oculto:accepted-version-at";
const UPDATE_MODAL_PENDING_KEY = "oculto:webapp-update-modal:pending";
const OPEN_UPDATE_MODAL_EVENT = "oculto:open-webapp-update-modal";
const AUTO_UPDATE_STATE_KEY = "oculto:auto-update-state";
const GUARD_WINDOW_MS = 30 * 1000; // não recarrega 2x em <30s
// Janela de "trégua" pós-update: por 10 min após /update.html ter rodado,
// nem o watcher nem o chunk-handler podem disparar outro redirect — quebra
// qualquer loop residual mesmo se um chunk antigo ainda explodir.
const POST_UPDATE_GRACE_MS = 10 * 60 * 1000;
const ACCEPTED_VERSION_SUPPRESS_MS = 12 * 60 * 60 * 1000;
const AUTO_UPDATE_WINDOW_MS = 12 * 60 * 60 * 1000;
const AUTO_UPDATE_MAX_ATTEMPTS = 1;
const AUTO_UPDATE_DELAY_MS = 1200;

/**
 * Throttle global de checagem de /version.json. Compartilha o "último
 * check" entre abas/SPA via localStorage para evitar que múltiplos
 * componentes/abas explodam Edge Requests na Vercel.
 *
 * `force` (ex.: botão "Verificar agora" do admin) ignora o throttle e
 * já marca o timestamp para reiniciar a janela.
 */
export function canCheckAppVersion(force = false): boolean {
  try {
    const now = Date.now();
    if (!force) {
      const last = Number(localStorage.getItem(VERSION_CHECK_KEY) || "0");
      if (last && now - last < VERSION_CHECK_THROTTLE_MS) return false;
    }
    localStorage.setItem(VERSION_CHECK_KEY, String(now));
    return true;
  } catch {
    // Sem localStorage (modo restrito/SSR): permite, mas não há throttle.
    return true;
  }
}

/**
 * Versão "aceita" pelo usuário. Quando o /update.html roda, ele grava
 * aqui a versão remota que acabou de ser baixada. A partir desse momento,
 * a comparação do watcher passa a ser:
 *   remoteAtual === acceptedVersion  →  está em dia (não dispara update)
 * em vez de comparar contra `__APP_VERSION__` (que pode estar defasado
 * porque o bundle JS desta aba foi carregado antes do último deploy).
 *
 * Só voltaremos a atualizar quando o servidor publicar uma versão
 * DIFERENTE da que o usuário já aceitou.
 */
function getAcceptedVersion(): string | null {
  try {
    const v = localStorage.getItem(ACCEPTED_VERSION_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
function getAcceptedAt(): number {
  try {
    return Number(localStorage.getItem(ACCEPTED_AT_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}
function clearAcceptedVersionStore() {
  try {
    localStorage.removeItem(ACCEPTED_VERSION_KEY);
    localStorage.removeItem(ACCEPTED_AT_KEY);
    localStorage.removeItem(UPDATE_MODAL_PENDING_KEY);
  } catch { /* noop */ }
}
function effectiveLocalVersion(): string {
  const accepted = getAcceptedVersion();
  const acceptedAt = getAcceptedAt();
  // Se o acceptedVersion estiver divergente do bundle realmente carregado,
  // ele está OBSOLETO (sobra de um deploy anterior). Limpa e usa LOCAL_VERSION
  // — caso contrário o comparador acusa "nova versão" mesmo quando o servidor
  // já está servindo exatamente o bundle desta aba, abrindo o modal em loop.
  if (accepted && LOCAL_VERSION !== "dev" && accepted !== LOCAL_VERSION) {
    clearAcceptedVersionStore();
    return LOCAL_VERSION;
  }
  if (accepted && acceptedAt && Date.now() - acceptedAt < ACCEPTED_VERSION_SUPPRESS_MS) {
    return accepted;
  }
  return LOCAL_VERSION;
}
function isInPostUpdateGrace(): boolean {
  const at = getAcceptedAt();
  return !!at && Date.now() - at < POST_UPDATE_GRACE_MS;
}


export function markWebAppVersionAccepted(remote: string | null, at = Date.now()): boolean {
  if (!remote) return false;
  try {
    localStorage.setItem(ACCEPTED_VERSION_KEY, remote);
    localStorage.setItem(ACCEPTED_AT_KEY, String(at));
    localStorage.removeItem(UPDATE_MODAL_PENDING_KEY);
    localStorage.removeItem(VERSION_CHECK_KEY);
    return true;
  } catch {
    return false;
  }
}

let updating = false;
let toastShown = false;

function isPreviewHost() {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function readAutoUpdateState(remote: string): { count: number; firstAt: number } {
  try {
    const raw = localStorage.getItem(AUTO_UPDATE_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const now = Date.now();
    if (
      parsed?.remote === remote &&
      typeof parsed.firstAt === "number" &&
      typeof parsed.count === "number" &&
      now - parsed.firstAt < AUTO_UPDATE_WINDOW_MS
    ) {
      return { count: parsed.count, firstAt: parsed.firstAt };
    }
    return { count: 0, firstAt: now };
  } catch {
    return { count: 0, firstAt: Date.now() };
  }
}

function rememberAutoUpdateAttempt(remote: string, state: { count: number; firstAt: number }) {
  try {
    localStorage.setItem(
      AUTO_UPDATE_STATE_KEY,
      JSON.stringify({ remote, count: state.count + 1, firstAt: state.firstAt, at: Date.now() }),
    );
  } catch {
    /* noop */
  }
}

function clearAutoUpdateState(remote?: string | null) {
  try {
    if (!remote) {
      localStorage.removeItem(AUTO_UPDATE_STATE_KEY);
      return;
    }
    const raw = localStorage.getItem(AUTO_UPDATE_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.remote || parsed.remote === remote) localStorage.removeItem(AUTO_UPDATE_STATE_KEY);
  } catch {
    /* noop */
  }
}

function scheduleAutomaticUpdate(remote: string) {
  if (isInPostUpdateGrace() || isUpdateRecoveryPath(window.location.pathname)) return;
  if (isOnPublicShareRoute()) return;
  const state = readAutoUpdateState(remote);
  if (state.count >= AUTO_UPDATE_MAX_ATTEMPTS) return;
  rememberAutoUpdateAttempt(remote, state);
  window.setTimeout(() => {
    if (isInPostUpdateGrace() || isUpdateRecoveryPath(window.location.pathname)) return;
    if (isOnPublicShareRoute()) return;
    redirectToUpdateRoute("version");
  }, AUTO_UPDATE_DELAY_MS);
}

function requestUpdateModal(remote: string) {
  // Guarda dupla: mesmo que tenha vazado um caminho, NUNCA abre o modal
  // quando o remoto bate com o bundle atualmente carregado.
  if (remote === LOCAL_VERSION) return;
  if (remote === effectiveLocalVersion() || isInPostUpdateGrace()) return;
  if (isOnPublicShareRoute()) return;
  try {
    localStorage.setItem(UPDATE_MODAL_PENDING_KEY, JSON.stringify({ remote, at: Date.now() }));
  } catch {
    /* noop */
  }
  try {
    window.dispatchEvent(new CustomEvent(OPEN_UPDATE_MODAL_EVENT, { detail: { remote } }));
  } catch {
    /* noop */
  }
  scheduleAutomaticUpdate(remote);
}


// ============================================================
// TELEMETRIA DE /version.json — debug local + backoff exponencial
// (visível apenas em /admin/version-debug — MasterAdminRoute)
// ============================================================
const STATS_KEY = "oculto:version-check-stats";
const STATS_MAX = 50;
const BACKOFF_BASE_MS = 30 * 1000;   // 30s
const BACKOFF_MAX_MS = 30 * 60_000;  // 30 min

export type VersionFetchOutcome = "ok" | "stale" | "error";

export interface VersionFetchAttempt {
  t: number;
  iso: string;
  outcome: VersionFetchOutcome;
  remote: string | null;
  baseline: string;
  errorMessage?: string;
  source: "boot" | "interval" | "visibility" | "manual";
}

interface VersionStats {
  attempts: VersionFetchAttempt[];
  totalCount: number;
  errorCount: number;
  consecutiveErrors: number;
  /** Próxima janela "permitida" pelo backoff; 0 = sem backoff ativo. */
  backoffUntil: number;
}

function readStats(): VersionStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          attempts: Array.isArray(parsed.attempts) ? parsed.attempts.slice(-STATS_MAX) : [],
          totalCount: Number(parsed.totalCount) || 0,
          errorCount: Number(parsed.errorCount) || 0,
          consecutiveErrors: Number(parsed.consecutiveErrors) || 0,
          backoffUntil: Number(parsed.backoffUntil) || 0,
        };
      }
    }
  } catch { /* noop */ }
  return { attempts: [], totalCount: 0, errorCount: 0, consecutiveErrors: 0, backoffUntil: 0 };
}

function writeStats(stats: VersionStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch { /* noop */ }
}

function recordAttempt(attempt: Omit<VersionFetchAttempt, "t" | "iso">) {
  const stats = readStats();
  const t = Date.now();
  const entry: VersionFetchAttempt = { ...attempt, t, iso: new Date(t).toISOString() };
  stats.attempts.push(entry);
  if (stats.attempts.length > STATS_MAX) stats.attempts = stats.attempts.slice(-STATS_MAX);
  stats.totalCount += 1;

  if (attempt.outcome === "error") {
    stats.errorCount += 1;
    stats.consecutiveErrors += 1;
    // Backoff exponencial: 30s, 1m, 2m, 4m, ... cap 30m
    const factor = Math.pow(2, Math.min(stats.consecutiveErrors - 1, 6));
    stats.backoffUntil = t + Math.min(BACKOFF_BASE_MS * factor, BACKOFF_MAX_MS);
  } else {
    stats.consecutiveErrors = 0;
    stats.backoffUntil = 0;
  }

  writeStats(stats);

  if (typeof window !== "undefined" && (window as any).__OCULTO_VERSION_DEBUG__) {
    // eslint-disable-next-line no-console
    logger.info("[AppVersion][debug]", entry, {
      totalCount: stats.totalCount,
      errorCount: stats.errorCount,
      consecutiveErrors: stats.consecutiveErrors,
      backoffUntil: stats.backoffUntil,
    });
  }
}

export function getVersionDebugStats(): VersionStats {
  return readStats();
}

export function resetVersionDebugStats() {
  try { localStorage.removeItem(STATS_KEY); } catch { /* noop */ }
  try { localStorage.removeItem(VERSION_CHECK_KEY); } catch { /* noop */ }
}

export function getNextAllowedCheckAt(): number {
  const stats = readStats();
  let lastCheck = 0;
  try { lastCheck = Number(localStorage.getItem(VERSION_CHECK_KEY) || "0") || 0; } catch { /* noop */ }
  const throttleNext = lastCheck ? lastCheck + VERSION_CHECK_THROTTLE_MS : 0;
  return Math.max(throttleNext, stats.backoffUntil);
}

export function getLastCheckAt(): number {
  try { return Number(localStorage.getItem(VERSION_CHECK_KEY) || "0") || 0; }
  catch { return 0; }
}

/** Ativa logs verbose no console para esta aba (não persiste). */
export function enableVersionDebugLogging(enabled = true) {
  if (typeof window === "undefined") return;
  (window as any).__OCULTO_VERSION_DEBUG__ = !!enabled;
  // eslint-disable-next-line no-console
  logger.info(`[AppVersion] debug logging ${enabled ? "ON" : "OFF"}`);
}

let currentFetchSource: VersionFetchAttempt["source"] = "manual";

function buildVersionRequestUrl(): string {
  if (typeof window === "undefined") return `${VERSION_URL}?t=${Date.now()}`;
  const url = new URL(VERSION_URL, window.location.origin);
  url.searchParams.set("t", String(Date.now()));

  // No preview mobile do Lovable, arquivos públicos podem exigir o token da URL
  // atual. Sem repassar isso, /version.json pode falhar e parecer "sem servidor".
  const previewToken = new URLSearchParams(window.location.search).get("__lovable_token");
  if (previewToken) url.searchParams.set("__lovable_token", previewToken);

  return url.toString();
}

async function fetchRemoteVersion(options: { bypassBackoff?: boolean } = {}): Promise<string | null> {
  // Respeita backoff exponencial gravado por erros anteriores.
  const stats = readStats();
  if (!options.bypassBackoff && stats.backoffUntil && Date.now() < stats.backoffUntil) {
    if (typeof window !== "undefined" && (window as any).__OCULTO_VERSION_DEBUG__) {
      // eslint-disable-next-line no-console
      logger.info("[AppVersion][debug] fetch suprimido pelo backoff até", new Date(stats.backoffUntil).toISOString());
    }
    return null;
  }
  const baseline = effectiveLocalVersion();
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? globalThis.setTimeout(() => controller.abort(), 8000) : 0;
    const res = await fetch(buildVersionRequestUrl(), {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: controller?.signal,
    }).finally(() => {
      if (timeout) globalThis.clearTimeout(timeout);
    });
    if (!res.ok) {
      recordAttempt({ outcome: "error", remote: null, baseline, errorMessage: `HTTP ${res.status}`, source: currentFetchSource });
      return null;
    }
    const data = await res.json();
    const remote = typeof data?.version === "string" ? data.version : null;
    recordAttempt({
      outcome: remote && remote !== baseline ? "stale" : "ok",
      remote,
      baseline,
      source: currentFetchSource,
    });
    return remote;
  } catch (err) {
    recordAttempt({
      outcome: "error",
      remote: null,
      baseline,
      errorMessage: err instanceof Error ? err.message : String(err),
      source: currentFetchSource,
    });
    return null;
  }
}


async function clearAppCachesOnly() {
  // Apenas Cache Storage (assets/chunks antigos). NÃO toca em
  // localStorage/sessionStorage/cookies — preserva login e preferências.
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    /* noop */
  }

  // Pede para o SW pular waiting e assumir controle
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (r) => {
          try {
            await r.update();
            r.waiting?.postMessage({ type: "SKIP_WAITING" });
          } catch {
            /* noop */
          }
        }),
      );
    }
  } catch {
    /* noop */
  }
}

function shouldReload(guardKey: string) {
  try {
    const last = Number(sessionStorage.getItem(guardKey) || 0);
    if (last && Date.now() - last < GUARD_WINDOW_MS) return false;
    sessionStorage.setItem(guardKey, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

function showUpdateToast() {
  if (toastShown) return;
  toastShown = true;
  // Toast discreto via Sonner se disponível, senão fallback silencioso
  import("sonner")
    .then(({ toast }) => {
      toast("🌙 O Oculto foi atualizado", {
        description: "Atualizando sua experiência...",
        duration: 2500,
      });
    })
    .catch(() => {
      /* sem toast — segue o refresh igual */
    });
}

async function applyUpdate(reason: "version" | "chunk") {
  if (updating) return;
  updating = true;

  const guardKey = reason === "version" ? RELOAD_GUARD_KEY : CHUNK_GUARD_KEY;
  if (!shouldReload(guardKey)) {
    updating = false;
    return;
  }

  showUpdateToast();
  await clearAppCachesOnly();

  // Pequeno delay para o toast aparecer antes do reload
  setTimeout(() => {
    try {
      window.location.reload();
    } catch {
      window.location.href = window.location.href;
    }
  }, reason === "version" ? 900 : 250);
}

async function checkForUpdate(source: VersionFetchAttempt["source"] = "interval") {
  if (updating) return;
  if (isOnPublicShareRoute()) return;
  if (!canCheckAppVersion()) return;
  currentFetchSource = source;
  const baseline = effectiveLocalVersion();
  const remote = await fetchRemoteVersion();
  if (!remote) return;
  // "Em dia" se o remoto bate com o baseline OU com o bundle realmente
  // carregado nesta aba. Isso evita modal/redirect quando o acceptedVersion
  // gravado está obsoleto e o servidor já está servindo este mesmo bundle.
  if (remote === baseline || remote === LOCAL_VERSION) {
    clearAutoUpdateState(remote);
    try { localStorage.removeItem(UPDATE_MODAL_PENDING_KEY); } catch { /* noop */ }
    return;
  }

  // eslint-disable-next-line no-console
  logger.info(`[AppVersion] Nova versão detectada: ${baseline} → ${remote}. Abrindo modal de atualização…`);
  requestUpdateModal(remote);
}

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === "string"
        ? err
        : "";
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \S+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

// ============================================================
// LOG LOCAL DE REDIRECTS PARA /update — debug de loop
// ============================================================
const REDIRECT_LOG_KEY = "oculto:update-redirect-log";
const REDIRECT_LOG_MAX = 50;

export type UpdateRedirectReason = "version_mismatch" | "chunk_error";

export interface UpdateRedirectLogEntry {
  t: number;
  iso: string;
  reason: UpdateRedirectReason;
  from: string;
  local: string;
  accepted: string | null;
  acceptedAt: number;
  inGrace: boolean;
  skipped?: "post_update_grace" | "guard_window";
}

function isUpdateRecoveryPath(pathname: string): boolean {
  return /^\/update(?:\.html)?$/i.test(pathname);
}

/**
 * Rotas públicas de compartilhamento do OCULTO PLAY (e cards /c/).
 * NUNCA podemos disparar modal de atualização, redirect para /update.html
 * nem reload nessas rotas — qualquer piscada interrompe o áudio que está
 * tocando para um visitante que ainda nem criou conta.
 */
function isPublicShareRoutePathname(pathname: string): boolean {
  return /^\/play\/(p|share)\//i.test(pathname) || /^\/c\//i.test(pathname);
}
function isOnPublicShareRoute(): boolean {
  if (typeof window === "undefined") return false;
  return isPublicShareRoutePathname(window.location.pathname);
}

function getSafeReturnToPath(): string {
  if (typeof window === "undefined") return "/feed";
  if (isUpdateRecoveryPath(window.location.pathname)) return "/feed";
  try {
    const url = new URL(window.location.href);
    if (isPlayLoopPronePath(url.pathname)) return "/feed";
    url.searchParams.delete("_u");
    url.searchParams.delete("r");
    url.searchParams.delete("t");
    url.searchParams.delete("_ucv");
    url.searchParams.delete("_uct");
    url.searchParams.delete("_swv");
    url.searchParams.delete("_reload");
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path || "/";
  } catch {
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return path || "/";
  }
}

function isPlayLoopPronePath(pathname: string): boolean {
  return /^\/(?:oculto-play|play(?:\/|$))/i.test(pathname);
}

export function buildUpdateRouteUrl(reason: "chunk" | "version"): string {
  const logReason: UpdateRedirectReason =
    reason === "chunk" ? "chunk_error" : "version_mismatch";
  const params = new URLSearchParams({
    reason: logReason,
    t: String(Date.now()),
  });
  const returnTo = getSafeReturnToPath();
  if (returnTo !== "/") params.set("returnTo", returnTo);
  try {
    const token = new URLSearchParams(window.location.search).get("__lovable_token");
    if (token) params.set("__lovable_token", token);
  } catch {
    /* noop */
  }
  return `/update.html?${params.toString()}`;
}

function cleanupRecoveryQueryParams() {
  if (typeof window === "undefined") return;
  if (isUpdateRecoveryPath(window.location.pathname)) return;

  try {
    const url = new URL(window.location.href);
    const hasRecoveryMarker = ["_u", "_ucv", "_uct", "_swv"].some((key) =>
      url.searchParams.has(key),
    );
    if (!hasRecoveryMarker) return;

    url.searchParams.delete("_u");
    url.searchParams.delete("r");
    url.searchParams.delete("t");
    url.searchParams.delete("_ucv");
    url.searchParams.delete("_uct");
    url.searchParams.delete("_swv");
    url.searchParams.delete("_reload");

    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(window.history.state, "", next);
    }
  } catch {
    /* noop */
  }
}

function hydrateRecoveryStateFromUrl() {
  if (typeof window === "undefined") return;
  if (isUpdateRecoveryPath(window.location.pathname)) return;

  try {
    const url = new URL(window.location.href);
    const acceptedVersion = url.searchParams.get("_ucv");
    const acceptedAt = url.searchParams.get("_uct");
    if (acceptedVersion) {
      const parsedAt = Number(acceptedAt);
      markWebAppVersionAccepted(
        acceptedVersion,
        Number.isFinite(parsedAt) && parsedAt > 0 ? parsedAt : Date.now(),
      );
    }
  } catch {
    /* noop */
  }
}

export function appendUpdateRedirectLog(entry: UpdateRedirectLogEntry): void {
  try {
    const raw = localStorage.getItem(REDIRECT_LOG_KEY);
    const arr: UpdateRedirectLogEntry[] = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr : [];
    list.push(entry);
    const trimmed = list.length > REDIRECT_LOG_MAX ? list.slice(-REDIRECT_LOG_MAX) : list;
    localStorage.setItem(REDIRECT_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    /* noop */
  }
}

export function getUpdateRedirectLog(): UpdateRedirectLogEntry[] {
  try {
    const raw = localStorage.getItem(REDIRECT_LOG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function clearUpdateRedirectLog(): void {
  try {
    localStorage.removeItem(REDIRECT_LOG_KEY);
  } catch {
    /* noop */
  }
}

function buildLogEntry(
  reason: UpdateRedirectReason,
  extras: Partial<UpdateRedirectLogEntry> = {},
): UpdateRedirectLogEntry {
  return {
    t: Date.now(),
    iso: new Date().toISOString(),
    reason,
    from: typeof window !== "undefined" ? window.location.href : "",
    local: LOCAL_VERSION,
    accepted: getAcceptedVersion(),
    acceptedAt: getAcceptedAt(),
    inGrace: isInPostUpdateGrace(),
    ...extras,
  };
}

function redirectToUpdateRoute(reason: "chunk" | "version") {
  const logReason: UpdateRedirectReason =
    reason === "chunk" ? "chunk_error" : "version_mismatch";

  // NUNCA redirecionar quando o visitante está em rota pública de share —
  // interromperia a reprodução do áudio/vídeo no link compartilhado.
  if (isOnPublicShareRoute()) {
    appendUpdateRedirectLog(buildLogEntry(logReason, { skipped: "post_update_grace" }));
    return;
  }
  // Trégua pós-update: se o /update.html acabou de rodar (≤10 min), NÃO
  // redirecionamos de novo — isso quebra qualquer loop residual mesmo
  // quando um chunk antigo já carregado em memória explode tardiamente.
  if (isInPostUpdateGrace()) {
    appendUpdateRedirectLog(buildLogEntry(logReason, { skipped: "post_update_grace" }));
    // eslint-disable-next-line no-console
    logger.info("[AppVersion] Pulei redirect /update — usuário acabou de atualizar.");
    return;
  }
  if (!shouldReload(reason === "chunk" ? CHUNK_GUARD_KEY : RELOAD_GUARD_KEY)) {
    appendUpdateRedirectLog(buildLogEntry(logReason, { skipped: "guard_window" }));
    return;
  }
  appendUpdateRedirectLog(buildLogEntry(logReason));
  try {
    const url = buildUpdateRouteUrl(reason);
    window.location.replace(url);
  } catch {
    window.location.href = "/update.html";
  }
}

// Exports for tests (não usar em código de produção)
export const __test = {
  isChunkLoadError,
  shouldReload,
  effectiveLocalVersion,
  isInPostUpdateGrace,
  buildLogEntry,
  buildUpdateRouteUrl,
  isUpdateRecoveryPath,
  hydrateRecoveryStateFromUrl,
  cleanupRecoveryQueryParams,
  RELOAD_GUARD_KEY,
  CHUNK_GUARD_KEY,
  ACCEPTED_VERSION_KEY,
  ACCEPTED_AT_KEY,
  GUARD_WINDOW_MS,
  POST_UPDATE_GRACE_MS,
};

function installChunkErrorHandler() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    if (isUpdateRecoveryPath(window.location.pathname)) return;
    if (isChunkLoadError(event?.error) || isChunkLoadError(event?.message)) {
      // eslint-disable-next-line no-console
      console.warn("[AppVersion] Chunk antigo detectado, indo para /update…");
      redirectToUpdateRoute("chunk");
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isUpdateRecoveryPath(window.location.pathname)) return;
    if (isChunkLoadError(event?.reason)) {
      // eslint-disable-next-line no-console
      console.warn("[AppVersion] Chunk antigo (promise) detectado, indo para /update…");
      redirectToUpdateRoute("chunk");
    }
  });
}

function installSWControllerWatcher() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  // Não força reload no controllerchange: o fluxo /update.html já faz a troca
  // controlada. Recarregar aqui causava piscadas/loops em mobile/PWA.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    try { logger.info("[AppVersion] Service Worker atualizado sem reload forçado."); } catch { /* noop */ }
  });
}

let started = false;

export function getCurrentAppVersion(): string {
  return LOCAL_VERSION;
}

export async function forceCheckUpdate(): Promise<{
  current: string;
  remote: string | null;
  upToDate: boolean;
}> {
  // Botão "Verificar agora" do admin/usuário — ignora throttle, mas
  // reinicia a janela para evitar refetch imediato logo em seguida.
  canCheckAppVersion(true);
  currentFetchSource = "manual";
  const remote = await fetchRemoteVersion({ bypassBackoff: true });
  const baseline = effectiveLocalVersion();
  const upToDate = remote ? (remote === baseline || remote === LOCAL_VERSION) : true;
  // Se o remoto bate com o bundle carregado, limpa qualquer pending antigo
  // para que o modal não reabra na próxima checagem.
  if (upToDate) {
    try { localStorage.removeItem(UPDATE_MODAL_PENDING_KEY); } catch { /* noop */ }
  }
  return {
    current: LOCAL_VERSION,
    remote,
    upToDate,
  };
}


export async function forceHardRefresh() {
  await applyUpdate("version");
}

export async function clearAppCachesAndUnregisterSW() {
  await clearAppCachesOnly();
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* noop */
  }
}

export function startAppVersionWatcher() {
  if (started) return;
  started = true;

  hydrateRecoveryStateFromUrl();
  cleanupRecoveryQueryParams();

  if (isPreviewHost() || inIframe()) return;
  // Rotas públicas de share: NÃO iniciamos polling, listeners de chunk ou
  // visibilitychange — qualquer redirect/reload interromperia a reprodução.
  if (isOnPublicShareRoute()) {
    logger.info("[AppVersion] watcher suprimido em rota pública de share.");
    return;
  }

  installChunkErrorHandler();
  installSWControllerWatcher();

  setTimeout(() => { void checkForUpdate("boot"); }, 3000);
  setInterval(() => { void checkForUpdate("interval"); }, POLL_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkForUpdate("visibility");
    }
  });

  // eslint-disable-next-line no-console
  logger.info(`[AppVersion] watcher ativo (versão local: ${LOCAL_VERSION})`);
}
