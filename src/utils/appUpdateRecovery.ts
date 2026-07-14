/**
 * appUpdateRecovery — utilitário central para o botão "Atualizar WebApp"
 * disponível em Configurações > Sistema.
 *
 * Reaproveita o sistema existente em src/lib/appVersion.ts e a rota
 * estática /update.html (que já faz a limpeza completa de Cache Storage
 * + Service Worker + reload controlado com cache-busting).
 *
 * Garantias:
 *  - NUNCA chama localStorage.clear() / sessionStorage.clear()
 *  - Preserva sessão Supabase, tokens, preferências, onboarding, LGPD
 *  - Limpa apenas Cache Storage do domínio + atualiza Service Worker
 *  - Não cria loop: o /update.html já tem guardas próprias
 */
import {
  buildUpdateRouteUrl,
  clearAppCachesAndUnregisterSW,
  forceCheckUpdate,
  getCurrentAppVersion,
  markWebAppVersionAccepted,
} from "@/lib/appVersion";

export type WebAppUpdateStatus = "idle" | "checking" | "updating" | "error";

export interface WebAppUpdateInfo {
  current: string;
  remote: string | null;
  upToDate: boolean;
}

/**
 * Consulta /version.json e devolve o estado de atualização.
 * Reaproveita forceCheckUpdate() de appVersion.ts.
 */
export async function checkWebAppVersion(): Promise<WebAppUpdateInfo> {
  return forceCheckUpdate();
}

export function getInstalledAppVersion(): string {
  return getCurrentAppVersion();
}

/**
 * Dispara a atualização manual do WebApp.
 *
 * Fluxo:
 *   1. Limpa Cache Storage e desregistra Service Workers antigos.
 *   2. Redireciona para /update.html?source=settings&returnTo=<rota_atual>.
 *      O /update.html então:
 *        - força reload com cache-busting
 *        - grava accepted-version no localStorage (evita loop)
 *        - devolve o usuário para a rota original
 *
 * NÃO toca em localStorage / sessionStorage / cookies — login preservado.
 */
export async function forceWebAppUpdate(
  source: "settings" | "chunk_error" | "manual" = "settings",
  remoteVersion?: string | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  let acceptedRemote: string | null = remoteVersion || null;

  // Marca a versão como aceita ANTES do redirect. Assim, se o mobile voltar
  // com o mesmo bundle antigo por cache do WebView/PWA, o modal não reabre em loop.
  try {
    acceptedRemote = acceptedRemote || (await forceCheckUpdate()).remote;
    markWebAppVersionAccepted(acceptedRemote);
  } catch {
    /* /update.html tenta gravar novamente */
  }

  // Limpeza segura: apenas Cache Storage + SW. Login intacto.
  try {
    await clearAppCachesAndUnregisterSW();
  } catch {
    /* segue mesmo se falhar — /update.html refaz */
  }

  // Reaproveita o builder oficial (já adiciona returnTo, t e reason).
  let target: string;
  try {
    target = buildUpdateRouteUrl("version");
    // Injeta o source para telemetria/admin.
    target += `&source=${encodeURIComponent(source)}`;
    if (acceptedRemote) target += `&remote=${encodeURIComponent(acceptedRemote)}`;
  } catch {
    target = `/update.html?source=${encodeURIComponent(source)}&t=${Date.now()}${acceptedRemote ? `&remote=${encodeURIComponent(acceptedRemote)}` : ""}`;
  }

  // window.location.replace evita entry duplicada no histórico.
  try {
    window.location.replace(target);
  } catch {
    window.location.href = target;
  }
}
