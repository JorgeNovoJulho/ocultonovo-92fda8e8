import { useImpersonationStore } from '@/store/useImpersonationStore';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';

export type PaymentStatus = 'active' | 'overdue' | 'suspended';

interface PaymentStatusResult {
  effectiveStatus: PaymentStatus;
  isOverdue: boolean;
  isSuspended: boolean;
  shouldBlockAccess: boolean;
  shouldShowBanner: boolean;
  isSimulated: boolean;
  isLoading: boolean;
}

/**
 * Hook que combina status real de pagamento com status simulado durante impersonação.
 * REGRAS:
 * - Usuários com plano FREE nunca são bloqueados (não têm assinatura paga)
 * - shouldBlockAccess é false enquanto auth/perfil carregam (evita redirect prematuro)
 * - Simulatedstatus tem precedência durante impersonação
 */
export function usePaymentStatus(): PaymentStatusResult {
  const { isImpersonating, simulatedStatus } = useImpersonationStore();
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();

  // Ainda carregando — não bloquear
  const isLoading = authLoading || (!!user && profileLoading);

  const realStatus = ((profile as any)?.payment_status as PaymentStatus) || 'active';
  const planType = (profile as any)?.plan_type as string | undefined;

  // Plano free nunca tem cobrança — nunca deve ser bloqueado
  const isFreeUser = planType === 'free' || planType === undefined;

  // Simulated status tem precedência durante impersonação
  const isSimulated = isImpersonating && simulatedStatus !== null && simulatedStatus !== 'active';
  const effectiveStatus: PaymentStatus = (isImpersonating && simulatedStatus)
    ? simulatedStatus
    : realStatus;

  // Bloquear apenas usuários pagantes com status inativo — jamais usuários free
  const shouldBlockAccess = !isLoading && !isFreeUser && effectiveStatus !== 'active';
  const shouldShowBanner = !isLoading && !isFreeUser && effectiveStatus === 'overdue';

  return {
    effectiveStatus: isFreeUser ? 'active' : effectiveStatus,
    isOverdue: shouldShowBanner,
    isSuspended: !isLoading && !isFreeUser && effectiveStatus === 'suspended',
    shouldBlockAccess,
    shouldShowBanner,
    isSimulated,
    isLoading,
  };
}

