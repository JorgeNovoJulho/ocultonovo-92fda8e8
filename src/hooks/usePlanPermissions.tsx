/**
 * Hook centralizado de permissões por plano.
 * Plano Free é bloqueado para recursos premium.
 * Plano Premium tem acesso parcial.
 * Plano VIP tem acesso total.
 */
import { useProfile } from './useProfile';
import { useAdminBypass } from './useAdminBypass';
import { usePlatformPhase } from './usePlatformPhase';

export type PlanType = 'free' | 'premium' | 'monthly' | 'vip';

export interface PlanPermissions {
  planType: PlanType;
  isFree: boolean;
  isPremium: boolean;
  isVip: boolean;

  // Funcionalidades bloqueadas para Free
  canCreateEvents: boolean;
  canViewProfileVisits: boolean;
  canCreateAuctions: boolean;
  canCreatePaidContent: boolean;    // posts pagos, mídias bloqueadas, PPV
  canCreateCoupons: boolean;
  canUseSuperDm: boolean;           // enviar e receber Super DM
  canCreateGoals: boolean;          // metas de arrecadação
  canUseReferralInvites: boolean;   // Convide e Ganhe
  canUseMadrinhaProgram: boolean;   // Programa Madrinhas
  canCreateBroadcasts: boolean;     // Mensagens em Massa

  // Permissões de Chat
  canSendChatAudio: boolean;
  canSendChatVideo: boolean;
  canUseChatCamera: boolean;
  canReplyToPremiumVip: boolean;

  // Permissões de Privacidade
  // Free: bloqueado em todas. Premium: pode privar perfil e ocultar status online.
  // VIP: também pode ocultar idade, localização e aparecer anônimo em rankings.
  canPrivateProfile: boolean;       // Premium+
  canHideOnlineStatus: boolean;     // Premium+
  canHideAge: boolean;              // VIP only
  canHideLocation: boolean;         // VIP only
  canAnonymousRanking: boolean;     // VIP only
  canReceiveSuperDm: boolean;       // Premium+

  // Ghost Mode: add-on pago para Free e Premium, grátis para VIP
  ghostModeFree: boolean;           // VIP tem grátis
  ghostModeAddonPrice: number;      // R$9.90 para Free/Premium
}

export function usePlanPermissions(): PlanPermissions {
  const { profile } = useProfile();
  const { shouldBypass } = useAdminBypass();
  const { freeGetsPremiumSocial } = usePlatformPhase();

  const realPlan = (profile?.plan_type || 'free') as PlanType;
  // Durante o Beta, FREE recebe permissões Premium SOCIAIS (não financeiras).
  // Não altera plan_type real do banco — só o cálculo de capacidades sociais.
  const betaSocialBoost = freeGetsPremiumSocial && realPlan === 'free';

  const planType = realPlan;
  const isFree = realPlan === 'free' && !betaSocialBoost;
  const isPremium = realPlan === 'premium' || realPlan === 'monthly' || betaSocialBoost;
  const isVip = realPlan === 'vip';

  // Admin bypass: libera tudo
  if (shouldBypass) {
    return {
      planType,
      isFree: false,
      isPremium: true,
      isVip: true,
      canCreateEvents: true,
      canViewProfileVisits: true,
      canCreateAuctions: true,
      canCreatePaidContent: true,
      canCreateCoupons: true,
      canUseSuperDm: true,
      canCreateGoals: true,
      canUseReferralInvites: true,
      canUseMadrinhaProgram: true,
      canCreateBroadcasts: true,
      canSendChatAudio: true,
      canSendChatVideo: true,
      canUseChatCamera: true,
      canReplyToPremiumVip: true,
      canPrivateProfile: true,
      canHideOnlineStatus: true,
      canHideAge: true,
      canHideLocation: true,
      canAnonymousRanking: true,
      canReceiveSuperDm: true,
      ghostModeFree: true,
      ghostModeAddonPrice: 0,
    };
  }

  return {
    planType,
    isFree,
    isPremium,
    isVip,

    // Free: tudo bloqueado abaixo
    canCreateEvents: !isFree,
    canViewProfileVisits: !isFree,
    canCreateAuctions: !isFree,
    canCreatePaidContent: isVip,
    canCreateCoupons: isVip,
    canUseSuperDm: !isFree,
    canCreateGoals: !isFree,
    canUseReferralInvites: !isFree,
    canUseMadrinhaProgram: !isFree,
    canCreateBroadcasts: !isFree,

    // Chat
    canSendChatAudio: !isFree,
    canSendChatVideo: !isFree,
    canUseChatCamera: !isFree,
    canReplyToPremiumVip: !isFree,

    // Privacidade
    canPrivateProfile: !isFree,        // Premium+
    canHideOnlineStatus: !isFree,      // Premium+
    canHideAge: isVip,                 // VIP only
    canHideLocation: isVip,            // VIP only
    canAnonymousRanking: isVip,        // VIP only
    canReceiveSuperDm: !isFree,        // Premium+

    // Ghost Mode
    ghostModeFree: isVip,
    ghostModeAddonPrice: 9.90,
  };
}
