/**
 * Experiências Ocultas — página de sub-área (slot).
 * Header social, sessões em destaque, conteúdo específico e consentimento.
 */
import { Navigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Layers3, Loader2, ShieldCheck, Sparkles, Users2 } from 'lucide-react';
import { useSocialBetaModule } from '@/hooks/useSocialBetaModule';
import { useSocialBetaVisit, type SocialBetaSlot } from '@/hooks/useSocialBetaVisit';
import { useSocialBetaSlotEvent } from '@/hooks/useSocialBetaSlotEvent';
import { SocialBetaSessionsPanel } from '@/components/social-beta/SocialBetaSessionsPanel';
import { SocialBetaConsentSettings } from '@/components/social-beta/SocialBetaConsentSettings';
import { SlotSpecificContent } from '@/components/social-beta/slot-content/SlotSpecificContent';

const VALID_SLOTS: SocialBetaSlot[] = ['lounge', 'connections', 'games', 'dynamics'];

const SLOT_META: Record<Exclude<SocialBetaSlot, 'hub'>, {
  summary: string;
  icon: typeof Users2;
  accent: string;
  bg: string;
}> = {
  lounge: {
    summary: 'Recepção e regras combinadas antes de qualquer interação.',
    icon: Users2,
    accent: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  connections: {
    summary: 'Forme pares e pequenos grupos com convites direcionados.',
    icon: ShieldCheck,
    accent: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  games: {
    summary: 'Rodadas guiadas com progresso simples para o grupo.',
    icon: Layers3,
    accent: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
  },
  dynamics: {
    summary: 'Fluxos por etapas com próxima ação sempre visível.',
    icon: Sparkles,
    accent: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
  },
};

export default function ExperienciasOcultasSlotPage() {
  const { slot } = useParams<{ slot: string }>();
  const normalized = (slot ?? '').toLowerCase() as SocialBetaSlot;
  const isValid = (VALID_SLOTS as string[]).includes(normalized);
  const { allowed, isLoading, config } = useSocialBetaModule();

  useSocialBetaVisit(isValid ? normalized : 'hub', allowed && isValid);
  useSocialBetaSlotEvent(isValid ? normalized : 'hub', allowed && isValid);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed || !isValid) return <Navigate to="/feed" replace />;

  const label =
    normalized === 'lounge' ? config.loungeLabel
    : normalized === 'connections' ? config.connectionsLabel
    : normalized === 'games' ? config.gamesLabel
    : config.dynamicsLabel;
  const meta = SLOT_META[normalized as Exclude<SocialBetaSlot, 'hub'>];
  const Icon = meta.icon;

  return (
    <div className="min-h-dvh bg-background px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to="/experiencias-ocultas"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground min-h-11">
          <ArrowLeft className="h-4 w-4" />
          Voltar para {config.moduleName}
        </Link>

        <header className="flex items-start gap-3">
          <div className={`h-11 w-11 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${meta.accent}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{config.moduleName}</p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{label}</h1>
            <p className="text-sm text-muted-foreground mt-1">{meta.summary}</p>
          </div>
        </header>

        <SocialBetaSessionsPanel slot={normalized as Exclude<SocialBetaSlot, 'hub'>} />

        <SlotSpecificContent slot={normalized as Exclude<SocialBetaSlot, 'hub'>} />

        <SocialBetaConsentSettings />
      </div>
    </div>
  );
}
