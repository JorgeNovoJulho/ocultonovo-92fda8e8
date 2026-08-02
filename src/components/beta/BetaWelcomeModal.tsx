/**
 * BetaWelcomeModal — exibido no PRIMEIRO acesso pós-login durante o Beta.
 *
 * Visual: gradiente dourado (âmbar → ouro → champanhe) com tipografia e
 * ícones em alto contraste (preto/profundo) sobre o ouro.
 *
 * Conteúdo: além das boas-vindas, o usuário escolhe sua experiência inicial:
 *   - "Quero ver apenas conteúdo +18"  → feed restrito a posts +18
 *   - "Quero ver a experiência completa" → universo completo do Oculto
 *
 * A escolha é persistida em profiles.feed_experience_mode e tem efeito
 * imediato no feed (realtime). Pode ser trocada depois em /settings.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Crown, Flame, Globe2, Check, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';
import { useFeedExperienceMode, type FeedExperienceMode } from '@/hooks/useFeedExperienceMode';
import { supabase } from '@/lib/supabaseExternal';
import { cn } from '@/lib/utils';

const SESSION_KEY_PREFIX = 'oculto:betaWelcomeShown:';
const LOCAL_KEY_PREFIX = 'oculto:betaWelcomeSeen:';

function alreadyShown(userId: string): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY_PREFIX + userId) === '1') return true;
    if (localStorage.getItem(LOCAL_KEY_PREFIX + userId) === '1') return true;
  } catch { /* noop */ }
  return false;
}
function markShown(userId: string) {
  try { sessionStorage.setItem(SESSION_KEY_PREFIX + userId, '1'); } catch { /* noop */ }
  try { localStorage.setItem(LOCAL_KEY_PREFIX + userId, '1'); } catch { /* noop */ }
}

export function BetaWelcomeModal() {
  const { user } = useAuth();
  const { profile, refetchProfile } = useProfile() as any;
  const { isBeta } = usePlatformPhase();
  const { setMode } = useFeedExperienceMode();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<FeedExperienceMode>('complete');
  const decidedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !profile || !isBeta) return;
    if (profile.beta_welcome_seen_at) return;
    // Se o usuário já escolheu uma experiência de feed (em qualquer device),
    // ele já passou pelo modal — não exibir novamente.
    if (profile.feed_experience_mode === 'adult_only' || profile.feed_experience_mode === 'complete' || profile.feed_experience_mode === 'oculto_only') {
      markShown(user.id);
      return;
    }
    if (alreadyShown(user.id)) return;
    if (decidedRef.current === user.id) return;

    decidedRef.current = user.id;
    setOpen(true);

    (async () => {
      try { await supabase.rpc('mark_beta_founder_self'); refetchProfile?.(); }
      catch { /* noop */ }
    })();
  }, [user?.id, profile, isBeta, refetchProfile]);

  const confirm = async () => {
    setMode(choice);
    setOpen(false);
    if (user?.id) markShown(user.id);
    try {
      await supabase.rpc('mark_beta_welcome_seen');
      refetchProfile?.();
    } catch {/* não bloqueia UX */}
  };


  if (!isBeta) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); if (user?.id) markShown(user.id); } }}>
      <DialogContent
        className="
          p-0 overflow-hidden border-0 rounded-2xl
          w-[calc(100vw-1rem)] max-w-md
          max-h-[calc(100dvh-2rem)]
          shadow-[0_20px_60px_-15px_rgba(180,130,30,0.65)]
          flex flex-col
        "
        style={{
          background:
            'linear-gradient(160deg, #f8e7a1 0%, #e9c45a 22%, #c98f1e 55%, #8a5a10 100%)',
          color: '#1a0f00',
        }}
      >
        {/* brilho dourado decorativo */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
          style={{
            background:
              'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.55), transparent 45%), radial-gradient(circle at 80% 100%, rgba(0,0,0,0.25), transparent 55%)',
          }}
        />

        <div
          className="beta-welcome-scroll relative p-5 sm:p-6 space-y-4 overflow-y-auto flex-1"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
          }}
        >
          <style>{`.beta-welcome-scroll::-webkit-scrollbar{display:none;width:0;height:0}`}</style>

          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2 text-[#3a1f00]">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-[0.18em] font-bold">
                Beta Público Ativo
              </span>
            </div>
            <DialogTitle className="text-xl sm:text-3xl font-extrabold text-[#1a0f00] leading-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
              Você entrou no Beta do Oculto
            </DialogTitle>
            <DialogDescription className="text-[#2a1700]/90 text-[13px] sm:text-sm leading-relaxed font-medium">
              Plataforma em fase de testes. Funções Premium sociais liberadas temporariamente.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-black/15 backdrop-blur-sm border border-black/20 p-3 text-[12.5px] leading-relaxed text-[#1a0f00] font-medium space-y-1">
            <p>O <strong>Oculto</strong> é uma plataforma de rede social completa.</p>
            <p>O foco não é unicamente a sacanagem, mas pode direcionar para seus interesses e foco. Escolha agora seu interesse:</p>
          </div>

          {/* Opções selecionáveis */}
          <div className="grid gap-2.5">
            <ChoiceCard
              active={choice === 'adult_only'}
              icon={<Flame className="h-5 w-5" />}
              title="QUERO VER APENAS CONTEÚDO +18"
              subtitle="Feed restrito a postagens marcadas como +18."
              onClick={() => setChoice('adult_only')}
            />
            <ChoiceCard
              active={choice === 'oculto_only'}
              icon={<ShieldAlert className="h-5 w-5" />}
              title="APENAS UNIVERSO OCULTO"
              subtitle="Oculta conteúdos +18, seções de destaque e comunidades adultas."
              onClick={() => setChoice('oculto_only')}
            />
            <ChoiceCard
              active={choice === 'complete'}
              icon={<Globe2 className="h-5 w-5" />}
              title="QUERO VER A EXPERIÊNCIA COMPLETA"
              subtitle="Stories, comunidades, salas, Oculto Play e todo o universo."
              onClick={() => setChoice('complete')}
            />
          </div>

          <p className="text-[11px] text-[#2a1700]/80 text-center font-medium leading-snug">
            Nas suas <strong>Configurações</strong> você poderá mudar a experiência quando quiser.
          </p>

          <Button
            onClick={confirm}
            size="lg"
            className="w-full h-12 bg-[#1a0f00] hover:bg-black text-amber-200 font-bold text-sm tracking-wider border border-amber-300/30 shadow-lg"
          >
            <Crown className="h-4 w-4 mr-2" />
            ENTRAR NO UNIVERSO OCULTO
          </Button>

          <p className="text-center text-[12px] font-extrabold uppercase tracking-wider text-[#2a1700] leading-tight">
            Sejam todos bem-vindos ao Oculto<br />e não escondam seus segredos!!!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function ChoiceCard({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group w-full text-left rounded-xl border-2 p-3 transition-all flex items-start gap-3',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a0f00]',
        active
          ? 'border-[#1a0f00] bg-[#1a0f00] text-amber-200 shadow-lg scale-[1.01]'
          : 'border-[#1a0f00]/40 bg-white/25 text-[#1a0f00] hover:bg-white/40'
      )}
    >
      <div
        className={cn(
          'shrink-0 h-9 w-9 rounded-lg flex items-center justify-center',
          active ? 'bg-amber-300 text-[#1a0f00]' : 'bg-[#1a0f00] text-amber-200'
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-extrabold tracking-wide leading-tight">{title}</div>
        <div className={cn('text-[11px] leading-snug mt-0.5', active ? 'text-amber-100/85' : 'text-[#2a1700]/80')}>
          {subtitle}
        </div>
      </div>
      <div
        className={cn(
          'shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center mt-0.5',
          active ? 'border-amber-300 bg-amber-300 text-[#1a0f00]' : 'border-[#1a0f00]/60 bg-transparent'
        )}
      >
        {active && <Check className="h-4 w-4" strokeWidth={3} />}
      </div>
    </button>
  );
}
