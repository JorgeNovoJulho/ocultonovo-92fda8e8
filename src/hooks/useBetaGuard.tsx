/**
 * useBetaGuard — guard único para CTAs de monetização.
 * Usar em qualquer botão que dispare cobrança/saque/canal pago.
 *
 *   const { isLocked, lockedLabel, guard } = useBetaGuard('subscriptions');
 *   <Button disabled={isLocked} onClick={() => guard(() => realCheckout())}>
 *     {isLocked ? lockedLabel : 'Assinar'}
 *   </Button>
 */
import { toast } from 'sonner';
import { usePlatformPhase } from './usePlatformPhase';
import { recordBetaLockAttempt } from './useBetaLockLog';

export type BetaFeatureKey =
  | 'monetization'
  | 'subscriptions'
  | 'vip_channels'
  | 'paid_content'
  | 'payouts'
  | 'safe_meetings'
  | 'whatsapp'
  | 'real_experiences';

const LABELS: Record<BetaFeatureKey, { locked: string; toast: string }> = {
  monetization:     { locked: 'Disponível no lançamento oficial', toast: 'Cobranças desativadas durante o Beta.' },
  subscriptions:    { locked: 'Disponível no lançamento oficial', toast: 'Assinaturas pagas serão liberadas no lançamento.' },
  vip_channels:     { locked: 'Em breve no lançamento',           toast: 'Canais VIP pagos serão liberados no lançamento oficial.' },
  paid_content:     { locked: 'Em breve no lançamento',           toast: 'Conteúdo pago será liberado no lançamento oficial.' },
  payouts:          { locked: 'Saques em breve',                  toast: 'Saques serão liberados quando a monetização entrar no ar.' },
  safe_meetings:    { locked: 'Em breve',                         toast: 'Encontros seguros serão liberados em breve.' },
  whatsapp:         { locked: 'Em breve',                         toast: 'Integração WhatsApp será liberada em breve.' },
  real_experiences: { locked: 'Em breve',                         toast: 'Experiências reais serão liberadas em breve.' },
};

const TOGGLE_MAP: Record<BetaFeatureKey, keyof ReturnType<typeof usePlatformPhase>> = {
  monetization:     'monetizationOn',
  subscriptions:    'subscriptionsOn',
  vip_channels:     'vipChannelsOn',
  paid_content:     'paidContentOn',
  payouts:          'payoutsOn',
  safe_meetings:    'safeMeetingsOn',
  whatsapp:         'whatsappOn',
  real_experiences: 'realExperiencesOn',
};

export function useBetaGuard(feature: BetaFeatureKey, source?: string) {
  const phase = usePlatformPhase();
  const flagValue = phase[TOGGLE_MAP[feature]] as boolean;

  // Monetização global é "kill switch": se off, qualquer feature paga fica off.
  const monetizationOff = !phase.monetizationOn;
  const featureOff = !flagValue;
  const isLocked =
    feature === 'safe_meetings' || feature === 'whatsapp' || feature === 'real_experiences'
      ? featureOff
      : (monetizationOff || featureOff);

  const { locked: lockedLabel, toast: lockedToastMsg } = LABELS[feature];

  /** Envolve uma ação real. Se beta-locked, mostra toast com lockedLabel,
   *  registra a tentativa no histórico mock e bloqueia. NUNCA dispara cobrança. */
  const guard = <T,>(action: () => T): T | void => {
    if (isLocked) {
      toast.info(lockedLabel, { description: lockedToastMsg, duration: 3500 });
      recordBetaLockAttempt({ feature, label: lockedLabel, source });
      return;
    }
    return action();
  };

  return { isLocked, lockedLabel, lockedToastMsg, guard, phase };
}
