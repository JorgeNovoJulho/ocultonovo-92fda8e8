/**
 * forceUpdateFromServer — empurra atualização do WebApp quando o admin
 * sinaliza isso via platform_runtime_settings:
 *
 *   - pwa_force_update = true  → força uma atualização (uma vez por
 *     versão local; não loopa se o usuário já está na versão alvo).
 *   - pwa_min_version  = "<id>" → se a versão local for diferente da
 *     mínima exigida, força atualização (também idempotente por versão).
 *
 * Quebra o "acceptedVersion" de appVersion.ts para resgatar usuários
 * presos em bundles antigos que aceitaram uma versão defasada.
 *
 * Executa apenas em produção (fora de iframe/preview), 1x por boot.
 */
import { supabase } from "@/lib/supabaseExternal";
import {
  getCurrentAppVersion,
  markWebAppVersionAccepted,
} from "@/lib/appVersion";
import { forceWebAppUpdate } from "@/utils/appUpdateRecovery";

const APPLIED_KEY = "oculto:forced-update-applied";
const SESSION_GUARD_KEY = "oculto:forced-update-checked";

interface AppliedState {
  // versão local que rodou o force update (evita reaplicar na mesma versão)
  local: string;
  // alvo aplicado (pwa_min_version ou "force")
  target: string;
  at: number;
}

function readApplied(): AppliedState | null {
  try {
    const raw = localStorage.getItem(APPLIED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as AppliedState;
  } catch {
    /* noop */
  }
  return null;
}

function writeApplied(state: AppliedState) {
  try {
    localStorage.setItem(APPLIED_KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
}

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

function isUpdateRoute() {
  if (typeof window === "undefined") return false;
  return /^\/update(?:\.html)?$/i.test(window.location.pathname);
}

function isPublicShareRoute() {
  if (typeof window === "undefined") return false;
  return /^\/play\/(p|share)\//i.test(window.location.pathname) || /^\/c\//i.test(window.location.pathname);
}

/**
 * Limpa estado que poderia bloquear o force update (versão aceita +
 * tentativas auto-update consumidas). Sem isso, usuário que clicou
 * "depois" num modal antigo ficaria preso até 12h.
 */
function clearAcceptanceBlockers() {
  try {
    localStorage.removeItem("oculto:accepted-version");
    localStorage.removeItem("oculto:accepted-version-at");
    localStorage.removeItem("oculto:auto-update-state");
    localStorage.removeItem("oculto:webapp-update-modal:pending");
  } catch {
    /* noop */
  }
}

export async function runForceUpdateFromServer() {
  if (typeof window === "undefined") return;
  if (isPreviewHost() || inIframe() || isUpdateRoute() || isPublicShareRoute()) return;

  // Uma checagem por carregamento de página é suficiente.
  try {
    if (sessionStorage.getItem(SESSION_GUARD_KEY) === "1") return;
    sessionStorage.setItem(SESSION_GUARD_KEY, "1");
  } catch {
    /* sem sessionStorage segue mesmo assim */
  }

  let force = false;
  let minVersion: string | null = null;
  try {
    const { data, error } = await supabase
      .from("platform_runtime_settings")
      .select("pwa_force_update, pwa_min_version")
      .limit(1)
      .maybeSingle();
    if (error) return;
    force = !!(data as any)?.pwa_force_update;
    minVersion =
      typeof (data as any)?.pwa_min_version === "string" &&
      (data as any).pwa_min_version.trim().length > 0
        ? (data as any).pwa_min_version.trim()
        : null;
  } catch {
    return;
  }

  const local = getCurrentAppVersion();

  // Decide alvo. pwa_min_version tem prioridade — se já estamos nela, nada a fazer.
  let target: string | null = null;
  if (minVersion && minVersion !== local) {
    target = minVersion;
  } else if (force && !minVersion) {
    // force sem min_version: usa "force:<local>" como assinatura para
    // garantir que só rodamos uma vez por bundle local.
    target = `force:${local}`;
  }

  if (!target) return;

  const applied = readApplied();
  if (applied && applied.local === local && applied.target === target) {
    // Já tentamos nesta versão local — não bate de novo (evita loop se o
    // bundle não trocar por causa de cache do CDN/SW).
    return;
  }

  // Marca ANTES do redirect: se algo der errado, não fica em loop.
  writeApplied({ local, target, at: Date.now() });
  if (minVersion) markWebAppVersionAccepted(minVersion);
  clearAcceptanceBlockers();

  // eslint-disable-next-line no-console
  console.warn(
    `[ForceUpdate] Empurrando atualização — local=${local} target=${target}`,
  );

  try {
    await forceWebAppUpdate("manual", minVersion);
  } catch {
    /* /update.html cuida do fallback */
  }
}
