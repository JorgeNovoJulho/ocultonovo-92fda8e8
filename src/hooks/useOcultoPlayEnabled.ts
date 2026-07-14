/**
 * useOcultoPlayEnabled — hook central da feature flag do OCULTO PLAY (Etapa 4).
 *
 * Combina:
 *   - RPC `can_access_oculto_play` (gate oficial — leve, idempotente)
 *   - `oculto_play_config` (settings)
 *   - useIsMasterAdmin (preview interno do Master)
 *
 * Regras:
 *   - public_enabled = config.visible_to_users && config.enabled
 *   - internal_enabled = config.beta_open || config.enabled
 *   - isMasterPreview = master logado E internal_enabled
 *   - isEnabledForCurrentUser = canAccess (do RPC) — fonte da verdade final
 *
 * Quando desativado para o usuário atual NÃO carrega nada pesado;
 * o useOcultoPlayAccess já é leve e cacheado por 60s.
 */
import { useOcultoPlayAccess, useOcultoPlayConfig } from '@/hooks/useOcultoPlayAccess';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';

export function useOcultoPlayEnabled() {
  const { canAccess, loading: accessLoading } = useOcultoPlayAccess();
  const { data: settings, isLoading: settingsLoading } = useOcultoPlayConfig();
  const { data: isMasterAdmin } = useIsMasterAdmin();

  const isPublicEnabled = !!(settings?.enabled && settings?.visible_to_users);
  const isInternalEnabled = !!(settings?.beta_open || settings?.enabled);
  const isMasterPreview = !!isMasterAdmin && isInternalEnabled;

  return {
    /** Use sempre este para decisões de UI/montagem. */
    isEnabledForCurrentUser: canAccess === true,
    isPublicEnabled,
    isInternalEnabled,
    isMasterPreview,
    settings: settings ?? null,
    isLoading: accessLoading || settingsLoading,
  };
}
