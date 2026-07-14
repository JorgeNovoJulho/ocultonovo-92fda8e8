/**
 * Experiências Ocultas — hub final.
 * 4 sub-áreas renomeáveis em tempo real pelo Admin Master.
 */
import { Navigate, Link } from 'react-router-dom';
import { ArrowRight, Layers3, Loader2, ShieldCheck, Sparkles, Users2 } from 'lucide-react';
import { useSocialBetaModule } from '@/hooks/useSocialBetaModule';
import { useSocialBetaVisit, type SocialBetaSlot } from '@/hooks/useSocialBetaVisit';

const SLOT_THEME: Record<Exclude<SocialBetaSlot, 'hub'>, {
  description: string;
  icon: typeof Users2;
  gradient: string;
  accent: string;
}> = {
  lounge: {
    description: 'Recepção, contexto e regras visíveis antes do início.',
    icon: Users2,
    gradient: 'from-amber-500/10 via-rose-500/5 to-transparent',
    accent: 'text-amber-500',
  },
  connections: {
    description: 'Pares e pequenos grupos com visibilidade controlada.',
    icon: ShieldCheck,
    gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent',
    accent: 'text-emerald-500',
  },
  games: {
    description: 'Rodadas guiadas com progresso simples em tempo real.',
    icon: Layers3,
    gradient: 'from-cyan-500/10 via-sky-500/5 to-transparent',
    accent: 'text-cyan-500',
  },
  dynamics: {
    description: 'Fluxos coordenados por etapas e próxima ação clara.',
    icon: Sparkles,
    gradient: 'from-indigo-500/10 via-purple-500/5 to-transparent',
    accent: 'text-indigo-500',
  },
};

export default function ExperienciasOcultasPage() {
  const { allowed, isLoading, config } = useSocialBetaModule();
  useSocialBetaVisit('hub', allowed);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) return <Navigate to="/feed" replace />;

  const slots: { slot: SocialBetaSlot; label: string }[] = [
    { slot: 'lounge', label: config.loungeLabel },
    { slot: 'connections', label: config.connectionsLabel },
    { slot: 'games', label: config.gamesLabel },
    { slot: 'dynamics', label: config.dynamicsLabel },
  ];

  return (
    <div className="min-h-dvh bg-background px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{config.moduleName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sessões privadas, convites diretos e dinâmicas em tempo real entre quem você escolher.
            </p>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          {slots.map(({ slot, label }) => {
            const theme = SLOT_THEME[slot as Exclude<SocialBetaSlot, 'hub'>];
            const Icon = theme.icon;
            return (
              <Link
                key={slot}
                to={`/experiencias-ocultas/${slot}`}
                aria-label={`Entrar em ${label}`}
                className={`group relative block rounded-2xl border border-border bg-gradient-to-br ${theme.gradient} p-5 min-h-[124px] hover:border-primary/40 active:scale-[0.99] transition-all`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border">
                      <Icon className={`h-5 w-5 ${theme.accent}`} />
                    </div>
                    <h2 className="font-semibold text-foreground truncate">{label}</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">{theme.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
