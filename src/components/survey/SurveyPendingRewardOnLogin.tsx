/**
 * SurveyPendingRewardOnLogin — componente global que, no próximo login,
 * detecta usuários que concluíram a pesquisa mas ficaram sem o presente
 * de +200 XP entregue (reward_given=false) e:
 *   1) chama o RPC oculto_survey_finalize_reward (idempotente — credita
 *      XP, marca reward_given=true e envia a mensagem do @oculto_master);
 *   2) abre o SurveyRewardModal para o usuário ver o presente.
 *
 * Também cobre o caso em que reward_given=true mas o usuário nunca viu
 * o modal (sessão anterior caiu antes de abrir) — só exibe uma vez por
 * usuário (controle em localStorage).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { isMasterUsernameVariant, MASTER_EMAIL_CANONICAL } from '@/lib/masterUsername';
import { finalizeSurveyReward } from '@/lib/userSurveyApi';
import { SurveyRewardModal } from '@/components/survey/SurveyRewardModal';

const SEEN_KEY_PREFIX = 'oculto.survey-reward.seen:';
const SESSION_CHECK_PREFIX = 'oculto.survey-reward.checked:';

function alreadySeen(uid: string): boolean {
  try { return localStorage.getItem(SEEN_KEY_PREFIX + uid) === '1'; } catch { return false; }
}
function markSeen(uid: string) {
  try { localStorage.setItem(SEEN_KEY_PREFIX + uid, '1'); } catch { /* noop */ }
}
function checkedThisSession(uid: string): boolean {
  try { return sessionStorage.getItem(SESSION_CHECK_PREFIX + uid) === '1'; } catch { return false; }
}
function markCheckedThisSession(uid: string) {
  try { sessionStorage.setItem(SESSION_CHECK_PREFIX + uid, '1'); } catch { /* noop */ }
}

export function SurveyPendingRewardOnLogin() {
  const { user } = useAuth();
  const { data: isMasterByRole = false, isLoading: roleLoading } = useIsMasterAdmin();
  const uid = user?.id ?? null;
  const navigate = useNavigate();

  const meta = (user?.user_metadata || {}) as Record<string, unknown>;
  const isMasterIdentity =
    String(user?.email ?? '').trim().toLowerCase() === MASTER_EMAIL_CANONICAL ||
    isMasterUsernameVariant(meta.username) ||
    isMasterUsernameVariant(meta.user_name) ||
    isMasterUsernameVariant(meta.preferred_username) ||
    isMasterUsernameVariant(meta.name) ||
    isMasterUsernameVariant(meta.full_name);
  const isMaster = isMasterIdentity || isMasterByRole;

  const [open, setOpen] = useState(false);
  const [xp, setXp] = useState(200);
  const [balance, setBalance] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || isMaster || roleLoading) return;
    if (alreadySeen(uid) || checkedThisSession(uid)) return;

    let cancelled = false;
    markCheckedThisSession(uid);

    (async () => {
      try {
        // Procura a pesquisa concluída mais recente sem recompensa entregue.
        const { data, error } = await (supabase as any)
          .from('oculto_user_surveys')
          .select('id, status, reward_given, completed_at')
          .eq('user_id', uid)
          .eq('status', 'completed')
          .eq('reward_given', false)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || cancelled || !data?.id) return;

        const result = await finalizeSurveyReward(data.id);
        if (cancelled) return;
        if (!result.ok) return;

        setXp(result.xp_amount ?? 200);
        setBalance(typeof result.new_balance === 'number' ? result.new_balance : null);
        setConversationId(result.conversation_id ?? null);
        markSeen(uid);
        setOpen(true);
      } catch (e) {
        console.warn('[SurveyPendingRewardOnLogin] falhou:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [uid, isMaster, roleLoading]);

  if (!open) return null;

  return (
    <SurveyRewardModal
      open={open}
      onClose={() => setOpen(false)}
      xpAmount={xp}
      newBalance={balance}
      onOpenChat={() => {
        if (conversationId) navigate(`/messages?c=${conversationId}`);
        else navigate('/messages');
      }}
    />
  );
}

export default SurveyPendingRewardOnLogin;
