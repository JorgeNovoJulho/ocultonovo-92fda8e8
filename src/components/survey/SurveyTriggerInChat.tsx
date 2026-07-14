/**
 * SurveyTriggerInChat — wrapper que decide se mostra o card de pesquisa
 * no chat com o usuário ocultomaster. Em qualquer outra conversa, retorna null.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isMasterUsernameVariant, MASTER_EMAIL_CANONICAL } from '@/lib/masterUsername';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { hasSurveyFlowDone } from '@/lib/userSurveyApi';
import SurveyChatCard from './SurveyChatCard';

type Props = {
  otherUsername?: string | null;
  otherEmail?: string | null;
};

export function SurveyTriggerInChat({ otherUsername, otherEmail }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [activeInThisChat, setActiveInThisChat] = useState(false);
  const { user } = useAuth();
  const { data: isCurrentUserMasterByRole = false, isLoading: masterRoleLoading } = useIsMasterAdmin();

  const meta = (user?.user_metadata || {}) as Record<string, unknown>;
  const isCurrentUserMasterIdentity =
    String(user?.email ?? '').trim().toLowerCase() === MASTER_EMAIL_CANONICAL ||
    isMasterUsernameVariant(meta.username) ||
    isMasterUsernameVariant(meta.user_name) ||
    isMasterUsernameVariant(meta.preferred_username) ||
    isMasterUsernameVariant(meta.name) ||
    isMasterUsernameVariant(meta.full_name);
  const isCurrentUserMaster = isCurrentUserMasterIdentity || isCurrentUserMasterByRole;

  const isMaster =
    isMasterUsernameVariant(otherUsername) ||
    String(otherEmail ?? '').trim().toLowerCase() === MASTER_EMAIL_CANONICAL;
  const surveyFlowDone = hasSurveyFlowDone(user?.id);

  useEffect(() => {
    if (isMaster && !dismissed && !surveyFlowDone) {
      setActiveInThisChat(true);
    }
  }, [dismissed, isMaster, surveyFlowDone]);

  // Master admin não recebe a própria pesquisa.
  if (isCurrentUserMaster || masterRoleLoading) return null;
  if (!isMaster || dismissed || (surveyFlowDone && !activeInThisChat)) return null;

  return (
    <SurveyChatCard
      onClose={() => setDismissed(true)}
      // Não desmonta no completed: o próprio card precisa continuar
      // montado para exibir o modal de recompensa (+200 XP).
      onCompleted={() => setActiveInThisChat(true)}
    />
  );
}

export default SurveyTriggerInChat;
