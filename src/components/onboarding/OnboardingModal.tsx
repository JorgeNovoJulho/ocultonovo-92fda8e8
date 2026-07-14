/**
 * OnboardingModal — Tour pós-login em etapas (4 steps)
 * Foco: ativação de monetização e engajamento.
 *
 * - Mostra para TODOS, exceto "Não exibir novamente" ou "Pular" há <30 dias.
 * - Salva o step atual no Supabase para restaurar entre sessões/dispositivos.
 * - Etapa de monetização abre o modal de upgrade (PIX/Cartão).
 * - Animações leves: CSS slide + fade entre steps (sem framer-motion).
 */
import { memo, useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Sparkles,
  DollarSign,
  Users,
  Shield,
  LifeBuoy,
  ChevronRight,
  Check,
  Zap,
  Handshake,
  MapPin,
  Rocket,
  Eye,
  Copy,
  Share2,
  Layers,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useCreatorReferralCode } from '@/hooks/useCreatorReferrals';
import { buildCreatorInviteShareUrl } from '@/lib/inviteLinks';
import { useInviteCodeStore } from '@/store/useInviteCodeStore';
import { toast } from 'sonner';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { FeedModePreviewGrid } from '@/feed-modes/FeedModePreviewGrid';


const PremiumUpgradeModal = lazy(() =>
  import('@/components/PremiumUpgradeModal').then((m) => ({ default: m.PremiumUpgradeModal }))
);
const LivenessCheckModal = lazy(() =>
  import('@/components/LivenessCheckModal').then((m) => ({ default: m.LivenessCheckModal }))
);
const IdentityApprovedModal = lazy(() =>
  import('@/components/onboarding/IdentityApprovedModal').then((m) => ({
    default: m.IdentityApprovedModal,
  }))
);

const InviteQRCode = lazy(async () => {
  const m = await import('qrcode.react');
  return { default: m.QRCodeSVG as unknown as React.ComponentType<{ value: string; size?: number }> };
});

type Audience = 'all' | 'creator' | 'user';

interface Step {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  bullets?: string[];
  footer?: string;
  ctaLabel: string;
  action: 'next' | 'navigate' | 'upgrade' | 'verify' | 'intent';
  ctaPath?: string;
  accent: string;
  audience?: Audience; // 'all' (default) | 'creator' | 'user'
  creatorBoost?: boolean; // realça visualmente para creators
}

const STEPS: Step[] = [
  // STEP 0 — INTENÇÃO (smart routing)
  {
    id: 'intent',
    icon: Sparkles,
    title: '👉 Como você pretende usar o Oculto?',
    description:
      'Personalizamos sua experiência com base na sua intenção. Você pode mudar isso depois nas configurações.',
    ctaLabel: 'Selecione uma opção acima',
    action: 'intent',
    accent: 'text-primary',
    audience: 'all',
  },
  // STEP 1 — BOAS-VINDAS
  {
    id: 'welcome',
    icon: Sparkles,
    title: '👋 Bem-vindo(a) ao Oculto',
    description:
      'Você agora faz parte de uma plataforma completa para conectar, interagir e monetizar com total privacidade. Aqui, você controla sua experiência — e pode transformar sua presença em oportunidades reais.',
    ctaLabel: 'Vamos começar',
    action: 'next',
    accent: 'text-primary',
  },
  // STEP — MONETIZAÇÃO (priorizado para creator)
  {
    id: 'monetization',
    icon: DollarSign,
    title: '💰 Como ganhar dinheiro no Oculto',
    description: 'Você define o valor, o acesso e o que deseja compartilhar.',
    bullets: [
      '🔐 Conteúdo exclusivo para assinantes',
      '💎 Assinaturas mensais (renda recorrente)',
      '🎯 Venda de conteúdos sob demanda',
    ],
    footer:
      'Assine Premium ou VIP via PIX ou Cartão para liberar matches ilimitados, radar avançado e monetização.',
    ctaLabel: 'Ativar monetização agora',
    action: 'upgrade',
    accent: 'text-amber-400',
    creatorBoost: true,
  },
  // STEP — AFILIADOS
  {
    id: 'affiliates',
    icon: Handshake,
    title: '🤝 Ganhe comissões com seu link exclusivo',
    description: 'Sua rede pode gerar renda continuamente.',
    bullets: [
      'Convide novos usuários',
      'Eles entram pela sua indicação',
      'Você ganha comissões sobre as assinaturas',
    ],
    ctaLabel: 'Continuar',
    action: 'next',
    accent: 'text-cyan-400',
  },
  // STEP — FUNCIONALIDADES (mais relevante para "user")
  {
    id: 'features',
    icon: Zap,
    title: '🔥 O que você pode fazer no Oculto',
    description: 'Tudo em um ambiente completo, pensado para liberdade e controle.',
    bullets: [
      '📲 Publicar conteúdos no feed (fotos, vídeos e atualizações)',
      '💬 Conversar em tempo real com outros usuários',
      '💘 Dar match e conhecer novas pessoas',
      '🎥 Criar stories e conteúdos exclusivos',
      '📍 Marcar encontros com mais segurança',
      '🚨 Utilizar ferramentas de proteção e denúncia',
    ],
    ctaLabel: 'Continuar',
    action: 'next',
    accent: 'text-rose-400',
  },
  // STEP — VERIFICAÇÃO DE IDENTIDADE
  {
    id: 'verify',
    icon: Shield,
    title: 'Verifique sua identidade',
    description:
      'A verificação libera selo verificado, recursos premium e protege a comunidade. Leva menos de 2 minutos. Seus dados são protegidos por criptografia de ponta a ponta e não são compartilhados com terceiros (LGPD — Lei nº 13.709/2018).',
    ctaLabel: 'Verificar agora',
    action: 'verify',
    accent: 'text-emerald-400',
  },
  // STEP — SEGURANÇA E PRIVACIDADE
  {
    id: 'privacy',
    icon: Shield,
    title: '🛡️ Anonimato garantido por contrato e por tecnologia',
    description:
      'Seu nome real, fotos do documento, selfie de verificação, CPF, e-mail e telefone NUNCA são exibidos para nenhum outro usuário — em nenhuma circunstância.',
    bullets: [
      'Outros só veem seu apelido, avatar escolhido e o que você publicar',
      'Dados reais usados APENAS para LGPD, KYC e antifraude',
      'Banco de dados com Row-Level Security e criptografia em trânsito e repouso',
      'Você decide o que compartilhar — controle total',
    ],
    footer: 'Conformidade total com a LGPD (Lei 13.709/2018) e Marco Civil da Internet.',
    ctaLabel: 'Continuar',
    action: 'next',
    accent: 'text-emerald-400',
  },
  // STEP — ENCONTRO SEGURO
  {
    id: 'safe-meeting',
    icon: MapPin,
    title: '📍 Encontros com mais segurança',
    description: 'O Oculto possui recursos pensados para sua proteção:',
    bullets: [
      'Compartilhamento controlado de localização',
      'Alertas de segurança em tempo real',
      'Acompanhamento de encontros (Encontro Seguro)',
    ],
    footer: 'Mais tranquilidade para você se conectar fora da plataforma.',
    ctaLabel: 'Continuar',
    action: 'next',
    accent: 'text-sky-400',
  },
  // STEP — MODOS DE VISUALIZAÇÃO DO FEED
  {
    id: 'feed-modes',
    icon: Layers,
    title: '🎚️ Personalize seu feed em 1 toque',
    description:
      'Escolha como o feed se comporta. Você troca quando quiser pelo ícone de camadas no topo.',
    bullets: [
      'Completo — tudo do feed',
      'Social — stories, presença e matches',
      'Descoberta — radar, criadores VIP e salas',
      'Limpo — só posts, sem distrações',
      'Card — grade visual em 2/3/4 colunas',
    ],
    footer: 'Sua escolha fica salva e sincroniza entre dispositivos.',
    ctaLabel: 'Continuar',
    action: 'next',
    accent: 'text-violet-400',
  },
  // STEP — FINAL / ATIVAÇÃO
  {
    id: 'final',
    icon: Rocket,
    title: '🚀 Agora é com você',
    description:
      'Usuários que utilizam todas as funcionalidades têm mais chances de crescer, ganhar seguidores e gerar renda.',
    bullets: [
      'Crescer na plataforma',
      'Ganhar seguidores',
      'Gerar renda recorrente',
    ],
    footer: 'Explore, interaja e aproveite tudo que o Oculto oferece.',
    ctaLabel: 'Explorar agora',
    action: 'navigate',
    ctaPath: '/feed', // sobrescrito por intenção em runtime
    accent: 'text-fuchsia-400',
  },
];

/**
 * Personalização por intenção: ajusta título/descrição/bullets/footer/CTA
 * para falar a língua do creator (foco em receita) ou do user (foco em descoberta).
 */
function personalizeStep(step: Step, intent: 'creator' | 'user' | null): Step {
  if (!intent) return step;
  const isCreator = intent === 'creator';

  switch (step.id) {
    case 'monetization':
      return isCreator
        ? {
            ...step,
            title: '💰 Comece a faturar hoje mesmo',
            description:
              'Você tem tudo pronto para transformar seu conteúdo em renda recorrente. Quanto antes ativar, antes começa a receber.',
            bullets: [
              '🔐 Cobre por conteúdo exclusivo (PPV)',
              '💎 Receba assinaturas mensais recorrentes',
              '🚀 Ganhe destaque no feed e no radar',
              '💸 Saques rápidos via PIX',
            ],
            footer:
              'Ative Premium ou VIP em segundos via PIX/Cartão e desbloqueie todas as ferramentas de monetização.',
            ctaLabel: '🚀 Ativar monetização agora',
          }
        : {
            ...step,
            title: '✨ Acesse o que há de melhor no Oculto',
            description:
              'Desbloqueie matches ilimitados, radar avançado e veja conteúdos exclusivos dos criadores.',
            bullets: [
              '💘 Matches ilimitados',
              '📍 Radar avançado e filtros premium',
              '🎥 Acesso a conteúdos exclusivos',
              '🛡️ Modo invisível e privacidade extra',
            ],
            footer: 'Assine Premium ou VIP via PIX/Cartão e tenha a experiência completa.',
            ctaLabel: 'Quero ser Premium',
          };

    case 'affiliates':
      return isCreator
        ? {
            ...step,
            title: '🤝 Multiplique sua renda com afiliados',
            description: 'Além do seu conteúdo, ganhe comissão recorrente trazendo novos usuários.',
            bullets: [
              'Compartilhe seu link exclusivo',
              'Receba 5% sobre as assinaturas indicadas',
              'Comissão paga enquanto eles assinarem',
            ],
            ctaLabel: 'Quero meu link de afiliado',
          }
        : {
            ...step,
            title: '🤝 Indique amigos e ganhe',
            description: 'Convide pessoas que combinam com você e ganhe recompensas a cada assinatura.',
            bullets: [
              'Convide quem você quiser',
              'Ganhe 5% das assinaturas indicadas',
              'Acompanhe tudo no seu painel',
            ],
            ctaLabel: 'Continuar',
          };

    case 'features':
      return isCreator
        ? {
            ...step,
            title: '🎯 Ferramentas para crescer e vender',
            description: 'Tudo que você precisa para construir audiência e converter em receita.',
            bullets: [
              '📲 Publique fotos, vídeos e stories',
              '🎥 Crie acervo VIP para assinantes',
              '💬 Converse com fãs em tempo real',
              '📊 Acompanhe seus ganhos no painel',
              '📍 Marque encontros com segurança',
            ],
            ctaLabel: 'Continuar',
          }
        : step;

    case 'safe-meeting':
      return isCreator
        ? {
            ...step,
            description: 'Proteção extra para você e seus assinantes na vida real:',
            footer: 'Sua segurança é nossa prioridade — dentro e fora da plataforma.',
          }
        : step;

    case 'final':
      return isCreator
        ? {
            ...step,
            title: '🚀 Hora de faturar',
            description:
              'Criadores ativos faturam mais. Vá direto ao painel e configure seus preços, mídias e assinatura.',
            bullets: [
              'Configurar preços e planos',
              'Publicar primeiro conteúdo VIP',
              'Compartilhar link de afiliado',
            ],
            footer: 'Tudo pronto. Bora monetizar?',
            ctaLabel: '🚀 Ir para meu painel',
            ctaPath: '/dashboard',
          }
        : {
            ...step,
            title: '✨ Pronto para explorar',
            description:
              'Conheça pessoas, dê match, troque mensagens e descubra conteúdos que combinam com você.',
            bullets: [
              'Curtir e comentar publicações',
              'Dar match e iniciar conversas',
              'Encontrar pessoas próximas no radar',
            ],
            footer: 'Aproveite o Oculto do seu jeito.',
            ctaLabel: '💘 Explorar feed agora',
            ctaPath: '/feed',
          };

    default:
      return step;
  }
}

/**
 * Reordena os steps com base na intenção:
 * - creator → monetização e afiliados antes
 * - user    → funcionalidades sociais antes; afiliados ao final
 */
function buildStepOrder(intent: 'creator' | 'user' | null): Step[] {
  const byId = (id: string) => STEPS.find((s) => s.id === id)!;
  const p = (id: string) => personalizeStep(byId(id), intent);
  const intentStep = byId('intent');

  if (intent === 'creator') {
    return [
      intentStep,
      p('welcome'),
      p('monetization'),
      p('affiliates'),
      p('verify'),
      p('privacy'),
      p('safe-meeting'),
      p('features'),
      p('final'),
    ];
  }
  if (intent === 'user') {
    return [
      intentStep,
      p('welcome'),
      p('features'),
      p('verify'),
      p('privacy'),
      p('safe-meeting'),
      p('monetization'),
      p('affiliates'),
      p('final'),
    ];
  }
  return [intentStep];
}


export const OnboardingModal = memo(function OnboardingModal() {
  const {
    open,
    initialStep,
    intent,
    skip,
    closeNow,
    complete,
    completeNow,
    dismissForThirtyDays,
    isHiddenLocally,
    getHideUntilTs,
    saveStep,
    setOnboardingIntent,
    forceOpen,
    resetFlags,
  } = useOnboarding();
  const [step, setStep] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showLiveness, setShowLiveness] = useState(false);
  const [showIdentityApproved, setShowIdentityApproved] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [qaOpen, setQaOpen] = useState(false);
  // Reflete o estado salvo: se já há bloqueio ativo no localStorage, vem marcado.
  const [hideForThirtyDays, setHideForThirtyDays] = useState<boolean>(() => isHiddenLocally());
  const { data: isMasterAdmin = false, isLoading: isMasterLoading } = useIsMasterAdmin();
  // QA MODE só aparece para ADMINISTRADOR MASTER (oculto para todos os demais)
  const showQaMode = !isMasterLoading && isMasterAdmin === true;

  // Referral / share link — gerado automaticamente quando o usuário chega no step de afiliados
  const { code: referralCode, isLoading: codeLoading, generateCode, isGenerating, isError: codeError, reset: resetCode } = useCreatorReferralCode();
  const persistedCode = useInviteCodeStore((s) => s.code);
  const setPersistedCode = useInviteCodeStore((s) => s.setCode);
  const effectiveCode = referralCode || persistedCode;
  const inviteLink = buildCreatorInviteShareUrl(effectiveCode) || '';

  // Persist no Zustand + localStorage assim que o código existir
  useEffect(() => {
    if (referralCode && referralCode !== persistedCode) {
      setPersistedCode(referralCode);
    }
  }, [referralCode, persistedCode, setPersistedCode]);

  const handleCopyInvite = useCallback(() => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    toast.success('Link copiado! Envie aos seus amigos.');
  }, [inviteLink]);

  const handleShareInvite = useCallback(async () => {
    if (!inviteLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Oculto — Convite',
          text: 'Use meu convite para entrar no Oculto:',
          url: inviteLink,
        });
        return;
      } catch { /* fallback */ }
    }
    handleCopyInvite();
  }, [inviteLink, handleCopyInvite]);

  // Lista de steps personalizada por intenção
  const orderedSteps = buildStepOrder(intent);

  // Restaura step persistido na primeira abertura
  useEffect(() => {
    if (open) {
      const safe = Math.min(Math.max(0, initialStep), orderedSteps.length - 1);
      setStep(safe);
      setAnimKey((k) => k + 1);
      // Reflete o estado real persistido (não força true).
      setHideForThirtyDays(isHiddenLocally());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStep, intent]);

  const current = orderedSteps[step] ?? orderedSteps[0];
  const isLast = step === orderedSteps.length - 1;
  const Icon = current.icon;
  const navigate = useNavigate();
  const isIntentStep = current.action === 'intent';

  // Auto-gera o código de convite quando o usuário chega no step de afiliados
  // (uma única tentativa por sessão; após erro, exige clique manual no botão "Tentar novamente")
  const triedGenerateRef = useRef(false);
  useEffect(() => {
    if (
      current.id === 'affiliates' &&
      !effectiveCode &&
      !codeLoading &&
      !isGenerating &&
      !codeError &&
      !triedGenerateRef.current
    ) {
      triedGenerateRef.current = true;
      generateCode();
    }
  }, [current.id, effectiveCode, codeLoading, isGenerating, codeError, generateCode]);

  const handleRetryGenerate = useCallback(() => {
    resetCode();
    triedGenerateRef.current = true;
    generateCode();
  }, [resetCode, generateCode]);

  const goToStep = useCallback(
    (next: number) => {
      const bounded = Math.min(Math.max(0, next), orderedSteps.length - 1);
      setStep(bounded);
      setAnimKey((k) => k + 1);
      saveStep(bounded);
    },
    [saveStep, orderedSteps.length]
  );

  const handleNext = useCallback(() => {
    if (isLast) {
      complete();
      setStep(0);
    } else {
      goToStep(step + 1);
    }
  }, [isLast, complete, goToStep, step]);

  const handleSelectIntent = useCallback(
    async (value: 'creator' | 'user') => {
      await setOnboardingIntent(value);
      // Após salvar a intenção, a lista é recalculada e avançamos para o próximo step
      setStep(1);
      setAnimKey((k) => k + 1);
      saveStep(1);
    },
    [setOnboardingIntent, saveStep]
  );

  const handleCta = useCallback(() => {
    switch (current.action) {
      case 'intent':
        return; // botões dedicados tratam a seleção
      case 'upgrade':
        setShowUpgrade(true);
        return;
      case 'verify':
        setShowLiveness(true);
        return;
      case 'navigate':
        if (current.ctaPath) {
          complete();
          setStep(0);
          navigate(current.ctaPath);
        }
        return;
      case 'next':
      default:
        handleNext();
    }
  }, [current.action, current.ctaPath, complete, navigate, handleNext]);

  const handleSkip = useCallback(() => {
    if (hideForThirtyDays) {
      skip(step);
    } else {
      closeNow(step);
    }
    setStep(0);
  }, [closeNow, hideForThirtyDays, skip, step]);

  const handleBack = useCallback(() => {
    if (step > 0) goToStep(step - 1);
  }, [step, goToStep]);

  if (!open) return null;

  const progress = ((step + 1) / orderedSteps.length) * 100;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
        <DialogContent
          className="sm:max-w-md p-0 border-border/50 flex flex-col gap-0 w-[calc(100vw-1.5rem)] sm:w-full"
        >
          <Progress value={progress} className="h-1 rounded-none bg-muted shrink-0" />

          <div
            key={animKey}
            className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5 animate-fade-in overflow-y-auto overscroll-contain flex-1 min-h-0 scrollbar-hide"
          >
            <DialogHeader className="space-y-2 sm:space-y-3 text-center">
              <div className="mx-auto w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-muted flex items-center justify-center transition-transform duration-300 shrink-0">
                <Icon className={`h-6 w-6 sm:h-7 sm:w-7 ${current.accent}`} />
              </div>
              <DialogTitle className="text-base sm:text-xl font-bold leading-tight break-words hyphens-auto px-1">
                {current.title}
              </DialogTitle>
              <DialogDescription className="text-[13px] sm:text-sm text-muted-foreground leading-[1.5] break-words hyphens-auto px-1">
                {current.description}
              </DialogDescription>
            </DialogHeader>

            {/* Intent selection (Step 0) */}
            {isIntentStep && (
              <div className="mt-5 grid grid-cols-1 gap-2">
                <button
                  onClick={() => handleSelectIntent('creator')}
                  className="group flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 p-3 text-left transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                    <DollarSign className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground break-words">
                      💰 Quero ganhar dinheiro com meu conteúdo
                    </p>
                    <p className="text-xs text-muted-foreground break-words">
                      Monetização, assinaturas e vendas
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                </button>
                <button
                  onClick={() => handleSelectIntent('user')}
                  className="group flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 p-3 text-left transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                    <Eye className="h-5 w-5 text-rose-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground break-words">
                      👀 Quero explorar e interagir
                    </p>
                    <p className="text-xs text-muted-foreground break-words">
                      Conhecer pessoas, dar match e conversar
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                </button>
              </div>
            )}

            {/* Bullets list */}
            {!isIntentStep && current.bullets && current.bullets.length > 0 && (
              <ul className="mt-3 sm:mt-4 space-y-1.5 sm:space-y-2 text-[13px] sm:text-sm text-foreground/90">
                {current.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-muted/40 border border-border/40 px-2.5 sm:px-3 py-2 leading-[1.45] break-words hyphens-auto"
                  >
                    <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Preview interativo dos modos de feed */}
            {current.id === 'feed-modes' && (
              <FeedModePreviewGrid onApplied={() => completeNow()} />
            )}


            {/* Bloco de share — etapa de afiliados: gera/exibe link automaticamente */}
            {current.id === 'affiliates' && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-[11px] uppercase tracking-wider text-primary/80 font-semibold mb-2">
                  Seu link de convite
                </p>
                {effectiveCode && inviteLink ? (
                  <>
                    {/* QR + link + copy */}
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 rounded-md bg-white p-1.5 border border-border/60">
                        <Suspense fallback={<div className="w-[72px] h-[72px] bg-muted animate-pulse rounded" />}>
                          <InviteQRCode value={inviteLink} size={72} />
                        </Suspense>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 rounded-md bg-background/60 border border-border/50 px-2 py-2">
                          <span className="flex-1 text-[12px] sm:text-xs text-foreground/90 truncate font-mono">
                            {inviteLink}
                          </span>
                          <button
                            onClick={handleCopyInvite}
                            aria-label="Copiar link"
                            className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
                          >
                            <Copy className="h-4 w-4 text-primary" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopyInvite}
                        className="h-9 text-xs gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleShareInvite}
                        className="h-9 text-xs gap-1.5"
                      >
                        <Share2 className="h-3.5 w-3.5" /> Compartilhar
                      </Button>
                    </div>
                  </>
                ) : codeError ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-destructive/90 text-center">
                      Não foi possível gerar seu link agora.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleRetryGenerate}
                      disabled={isGenerating}
                      className="w-full h-9 text-xs gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {isGenerating ? 'Tentando...' : 'Tentar novamente'}
                    </Button>
                  </div>
                ) : (isGenerating || codeLoading) ? (
                  /* Skeleton placeholder enquanto gera */
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-[72px] h-[72px] rounded-md bg-muted animate-pulse" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="h-8 rounded-md bg-muted animate-pulse" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-9 rounded-md bg-muted animate-pulse" />
                        <div className="h-9 rounded-md bg-muted animate-pulse" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => generateCode()}
                    className="w-full h-9 text-xs gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Gerar meu link de convite
                  </Button>
                )}
              </div>
            )}

            {/* Footer / closing line */}
            {!isIntentStep && current.footer && (
              <p className="mt-3 text-[11px] sm:text-xs text-muted-foreground text-center leading-[1.5] break-words hyphens-auto px-2 [overflow-wrap:anywhere]">
                👉 {current.footer}
              </p>
            )}

            <div className="mt-4 border-t border-border/40 pt-3">
              <div className="flex items-start gap-2.5 text-left">
                <LifeBuoy className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-[1.5] break-words [overflow-wrap:anywhere]">
                  <span className="text-foreground font-medium">Suporte técnico e reporte de problemas:</span>{' '}
                  se encontrar erros, falhas ou qualquer problema no sistema, use a opção{' '}
                  <span className="text-foreground font-medium">Problemas no sistema</span> no menu lateral esquerdo.
                </p>
              </div>
            </div>

            {/* Step indicators */}
            <div className="flex justify-center gap-1.5 mt-5">
              {orderedSteps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToStep(i)}
                  aria-label={`Etapa ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? 'w-6 bg-primary'
                      : i < step
                      ? 'w-1.5 bg-primary/60'
                      : 'w-1.5 bg-muted hover:bg-muted-foreground/40'
                  }`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-2">
              {!isIntentStep && (
                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <Button
                      onClick={handleBack}
                      variant="outline"
                      className="h-11 px-3 shrink-0"
                      style={{ touchAction: 'manipulation' }}
                      aria-label="Voltar à etapa anterior"
                    >
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </Button>
                  )}
                  <Button
                    onClick={handleCta}
                    className={`flex-1 h-11 font-medium gap-2 transition-transform active:scale-[0.98] ${
                      current.creatorBoost && intent === 'creator'
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 text-white'
                        : ''
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    {current.ctaLabel}
                    {isLast ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </div>
              )}
              {!isLast && !isIntentStep && (
                <Button
                  onClick={handleNext}
                  variant="ghost"
                  className="w-full h-9 text-xs text-muted-foreground"
                  style={{ touchAction: 'manipulation' }}
                >
                  Pular esta etapa
                </Button>
              )}
              {step === 0 && (
                <div className="pt-1">
                  <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground/80 hover:text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideForThirtyDays}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHideForThirtyDays(checked);
                        if (checked) {
                          // Marcar a caixa = fechar imediatamente e ocultar por 30 dias
                          setStep(0);
                          dismissForThirtyDays();
                        } else {
                          // Desmarcar = liberar para reaparecer já na próxima abertura
                          closeNow(0);
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                    Não exibir esta tela novamente pelos próximos 30 dias
                  </label>
                  {hideForThirtyDays && getHideUntilTs() > 0 && (
                    <p className="mt-1 text-center text-[10px] text-muted-foreground/60">
                      Reaparecerá em{' '}
                      {new Date(getHideUntilTs()).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* QA mode (dev only) */}
            {showQaMode && (
              <div className="mt-4 border-t border-border/40 pt-3">
                <button
                  onClick={() => setQaOpen((v) => !v)}
                  className="text-[10px] uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                >
                  {qaOpen ? '▼' : '▶'} QA mode (dev)
                </button>
                {qaOpen && (
                  <div className="mt-2 space-y-2 rounded-md bg-muted/30 border border-dashed border-border/60 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] flex-1"
                        onClick={() => goToStep(step - 1)}
                        disabled={step === 0}
                      >
                        ◀ Voltar
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        {step + 1}/{orderedSteps.length}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] flex-1"
                        onClick={() => goToStep(step + 1)}
                        disabled={step >= orderedSteps.length - 1}
                      >
                        Avançar ▶
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px]"
                        onClick={() => skip(step)}
                      >
                        Forçar Skip (30d)
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px]"
                        onClick={() => dismissForThirtyDays()}
                      >
                        Forçar ocultar 30d
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px]"
                        onClick={async () => {
                          await resetFlags();
                          setStep(0);
                          setAnimKey((k) => k + 1);
                        }}
                      >
                        Reset & Reabrir
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px]"
                        onClick={() => forceOpen(0)}
                      >
                        Forçar Abrir
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 text-center">
                      Intent: <strong>{intent ?? 'none'}</strong> · Step id: <strong>{current.id}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {showUpgrade && (
        <Suspense fallback={null}>
          <PremiumUpgradeModal
            open={showUpgrade}
            onOpenChange={(v) => {
              setShowUpgrade(v);
              if (!v) handleNext(); // ao fechar checkout, segue para próxima etapa
            }}
            feature="Premium / VIP"
          />
        </Suspense>
      )}

      {showLiveness && (
        <Suspense fallback={null}>
          <LivenessCheckModal
            open={showLiveness}
            onOpenChange={setShowLiveness}
            onSuccess={() => {
              setShowLiveness(false);
              setShowIdentityApproved(true);
            }}
          />
        </Suspense>
      )}

      {showIdentityApproved && (
        <Suspense fallback={null}>
          <IdentityApprovedModal
            open={showIdentityApproved}
            onOpenChange={setShowIdentityApproved}
            onContinue={() => {
              setShowIdentityApproved(false);
              handleNext();
            }}
          />
        </Suspense>
      )}
    </>
  );
});
