/**
 * useAccountStatus — Lógica central de bloqueio por 30 dias + KYC.
 *
 * Regras:
 * - Se is_oculto_verified = true → conta liberada (ignora data)
 * - Se (agora - created_at) > 30 dias E is_oculto_verified = false → conta bloqueada
 * - Bloqueio afeta: curtir, comentar, seguir, chat, perfect pair, conteúdo pago
 */
import { useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { useProfile } from './useProfile';

export const KYC_DEADLINE_DAYS = 30;

export interface AccountStatus {
  /** Conta verificada pelo Selo Oculto — acesso total */
  isVerified: boolean;
  /** Conta bloqueada por prazo expirado */
  isBlocked: boolean;
  /** KYC enviado mas aguardando aprovação */
  kycPending: boolean;
  /** Dias desde a criação da conta */
  daysSinceCreation: number;
  /** Dias restantes até o bloqueio (negativo = já bloqueado) */
  daysRemaining: number;
  /** % de progresso para o prazo (0–100) */
  deadlineProgress: number;
  /** Tipo de KYC que o usuário escolheu */
  kycType: string | null;
  isLoading: boolean;
}

export function useAccountStatus(): AccountStatus {
  const { profile, isLoading } = useProfile();

  return useMemo<AccountStatus>(() => {
    if (!profile) {
      return {
        isVerified: false,
        isBlocked: false,
        kycPending: false,
        daysSinceCreation: 0,
        daysRemaining: KYC_DEADLINE_DAYS,
        deadlineProgress: 0,
        kycType: null,
        isLoading: isLoading,
      };
    }

    // Contas com Selo Oculto/identidade aprovada — liberadas incondicionalmente
    const isVerified = (profile as any).is_oculto_verified === true || (profile as any).is_verified === true;

    const daysSinceCreation = differenceInDays(
      new Date(),
      new Date(profile.created_at)
    );

    const daysRemaining = KYC_DEADLINE_DAYS - daysSinceCreation;

    // Bloqueio ativo somente se: prazo expirado E não verificado
    const isBlocked = !isVerified && daysSinceCreation > KYC_DEADLINE_DAYS;

    const kycPending =
      !isVerified &&
      !!((profile as any).kyc_submitted_at);

    const deadlineProgress = Math.min(
      100,
      Math.round((daysSinceCreation / KYC_DEADLINE_DAYS) * 100)
    );

    return {
      isVerified,
      isBlocked,
      kycPending,
      daysSinceCreation,
      daysRemaining,
      deadlineProgress,
      kycType: (profile as any).kyc_type ?? null,
      isLoading,
    };
  }, [profile, isLoading]);
}
