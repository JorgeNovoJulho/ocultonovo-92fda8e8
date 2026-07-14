/**
 * Hook centralizado para controlar visibilidade de painéis de debug.
 * Regra estrita: visível APENAS para o Admin Master (ocultomaster) E quando
 * NÃO está impersonando outro usuário. Usa a checagem canônica
 * `useIsMasterAdmin` (RPC has_role + fallback de email/username).
 */
import { useIsMasterAdmin } from "./useUserRoles";
import { useImpersonationStore } from "@/store/useImpersonationStore";

export function useShowDebugPanels(): boolean {
  const { data: isMaster } = useIsMasterAdmin();
  const isImpersonating = useImpersonationStore((s) => s.isImpersonating);
  return isMaster === true && !isImpersonating;
}
