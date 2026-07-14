/**
 * SurveyAttentionAlert — banner global especial que chama atenção do usuário
 * para entrar na conversa com @oculto_master e responder a pesquisa pendente.
 *
 * - Detecta survey com status='pending' do usuário logado.
 * - Toca som de notificação + vibra (uma única vez por sessão).
 * - Renderiza um card flutuante pulsante (não-toast) no topo da tela.
 * - CTA "Abrir conversa" navega para /messages?to=<masterProfileId>
 *   reusando o fluxo de auto-criação de conversa.
 * - Some automaticamente quando o usuário já está em /messages, quando o
 *   survey deixa de estar pending, ou quando o usuário fecha o card.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { isMasterUsernameVariant, MASTER_EMAIL_CANONICAL, MASTER_USERNAME_CANONICAL } from '@/lib/masterUsername';
import { playNewMessageSound } from '@/lib/messageSound';
import { hasSurveyFlowDone, markSurveyFlowDone } from '@/lib/userSurveyApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DISMISS_KEY_PREFIX = 'oculto.survey-alert.dismissed:';
const SOUND_KEY_PREFIX = 'oculto.survey-alert.sound-played:';

function getDismissed(userId: string): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY_PREFIX + userId) === '1'; }
  catch { return false; }
}
function setDismissed(userId: string) {
  try { sessionStorage.setItem(DISMISS_KEY_PREFIX + userId, '1'); } catch { /* noop */ }
}
function hasPlayedSound(userId: string): boolean {
  try { return sessionStorage.getItem(SOUND_KEY_PREFIX + userId) === '1'; }
  catch { return false; }
}
function markSoundPlayed(userId: string) {
  try { sessionStorage.setItem(SOUND_KEY_PREFIX + userId, '1'); } catch { /* noop */ }
}

export function SurveyAttentionAlert() {
  const { user } = useAuth();
  const { data: isMasterByRole = false, isLoading: masterRoleLoading } = useIsMasterAdmin();
  const uid = user?.id ?? null;
  const location = useLocation();
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

  const [pending, setPending] = useState(false);
  const [flowDone, setFlowDone] = useState(false);
  const [dismissed, setDismissedState] = useState(false);
  const [masterProfileId, setMasterProfileId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const lastUidRef = useRef<string | null>(null);

  // Reset dismiss state quando usuário muda
  useEffect(() => {
    if (uid !== lastUidRef.current) {
      lastUidRef.current = uid;
      setDismissedState(uid ? getDismissed(uid) : false);
      setFlowDone(uid ? hasSurveyFlowDone(uid) : false);
    }
  }, [uid]);

  // Carrega master profile id (cache local — não muda)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', MASTER_USERNAME_CANONICAL)
        .maybeSingle();
      if (!cancelled && data?.id) setMasterProfileId(data.id);
    })();
    return () => { cancelled = true; };
  }, []);

  // Polling inicial + realtime do survey
  useEffect(() => {
    if (!uid || isMaster || hasSurveyFlowDone(uid)) { setPending(false); setFlowDone(!!uid && hasSurveyFlowDone(uid)); return; }
    let cancelled = false;

    const check = async () => {
      const { data: doneData } = await supabase
        .from('oculto_user_surveys')
        .select('id')
        .eq('user_id', uid)
        .or('status.in.(completed,skipped),reward_given.eq.true')
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (doneData) {
        markSurveyFlowDone(uid);
        setFlowDone(true);
        setPending(false);
        return;
      }

      const { data } = await supabase
        .from('oculto_user_surveys')
        .select('id')
        .eq('user_id', uid)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setFlowDone(false);
      setPending(!!data);
    };
    void check();

    const ch = supabase
      .channel(`survey-alert:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_user_surveys', filter: `user_id=eq.${uid}` },
        () => { void check(); },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [uid, isMaster]);

  const onMessagesRoute = location.pathname.startsWith('/messages');

  const visible = useMemo(
    () => !!uid && !isMaster && !masterRoleLoading && !flowDone && pending && !dismissed && !onMessagesRoute,
    [uid, isMaster, masterRoleLoading, flowDone, pending, dismissed, onMessagesRoute],
  );

  // Som + vibração 1x por sessão quando o banner se torna visível
  useEffect(() => {
    if (!visible || !uid) return;
    if (hasPlayedSound(uid)) return;
    markSoundPlayed(uid);
    try { playNewMessageSound(`survey-alert:${uid}`); } catch { /* noop */ }
  }, [visible, uid]);

  if (!visible) return null;

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    try {
      if (masterProfileId) {
        navigate(`/messages?to=${masterProfileId}`);
      } else {
        // Fallback: tenta resolver agora
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', MASTER_USERNAME_CANONICAL)
          .maybeSingle();
        if (data?.id) navigate(`/messages?to=${data.id}`);
        else navigate('/messages');
      }
    } finally {
      setOpening(false);
    }
  };

  const handleDismiss = () => {
    if (uid) setDismissed(uid);
    setDismissedState(true);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Pesquisa OCULTO pendente"
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-[60]',
        'top-2 sm:top-4 w-[min(94vw,420px)]',
        'pointer-events-auto',
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-pink-500/60',
          'bg-gradient-to-br from-pink-600/95 via-fuchsia-600/95 to-purple-700/95',
          'shadow-[0_8px_32px_-4px_rgba(236,72,153,0.55)]',
          'animate-in fade-in slide-in-from-top-4 duration-300',
        )}
      >
        {/* Glow pulsante de fundo */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            boxShadow: '0 0 0 0 rgba(236,72,153,0.55)',
            animation: 'oculto-survey-pulse 1.8s ease-out infinite',
          }}
        />
        <style>{`
          @keyframes oculto-survey-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(236,72,153,0.55); }
            70%  { box-shadow: 0 0 0 14px rgba(236,72,153,0); }
            100% { box-shadow: 0 0 0 0 rgba(236,72,153,0); }
          }
        `}</style>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dispensar aviso"
          className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="relative p-4 pr-9">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-white/15 p-2 ring-1 ring-white/20">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-pink-100">
                <Sparkles className="h-3 w-3" />
                Convite exclusivo
              </div>
              <div className="mt-0.5 text-sm font-bold text-white leading-snug">
                @oculto_master quer ouvir você
              </div>
              <div className="mt-1 text-xs text-white/90 leading-relaxed">
                Abra a conversa para responder uma pesquisa rápida e ajudar a moldar a OCULTO.
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleOpen}
              disabled={opening}
              className={cn(
                'flex-1 h-9 rounded-xl font-semibold',
                'bg-white text-pink-700 hover:bg-pink-50',
                'shadow-md',
              )}
            >
              {opening ? 'Abrindo…' : 'Abrir conversa'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-9 rounded-xl text-white/90 hover:text-white hover:bg-white/10"
            >
              Depois
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SurveyAttentionAlert;
