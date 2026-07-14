import { useCurrentUserFreezeStatus } from './useDiscipline';

/**
 * Hook que verifica se o usuário atual pode realizar ações na plataforma.
 * Usuários congelados (frozen) têm ações bloqueadas.
 */
export function useCanPerformActions() {
  const { data: freezeStatus, isLoading } = useCurrentUserFreezeStatus();

  const isFrozen = freezeStatus?.account_status === 'frozen';
  const isBanned = freezeStatus?.account_status === 'banned';
  const frozenUntil = freezeStatus?.frozen_until ? new Date(freezeStatus.frozen_until) : null;
  const warningCount = freezeStatus?.warning_count || 0;

  // Verifica se o freeze ainda está ativo
  const isFreezeActive = isFrozen && frozenUntil && frozenUntil > new Date();

  // Usuário pode agir se não está congelado e não está banido
  const canAct = !isFreezeActive && !isBanned;

  return {
    canAct,
    isFrozen: isFreezeActive,
    isBanned,
    frozenUntil,
    warningCount,
    isLoading,
  };
}
