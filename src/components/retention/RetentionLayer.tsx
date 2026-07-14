/**
 * RetentionLayer — Camada de retenção acima do feed.
 *
 * Visual moderno, agressivo e cinematográfico:
 *  - Cards com gradientes vivos, glow sutil, bordas iluminadas
 *  - Ícones Lucide ao invés de emojis para os títulos
 *  - Stats em grid, números grandes, hierarquia clara
 *  - Mobile-first: gradientes via CSS (sem libs), nada de blur pesado
 *
 * Blocos sob feature flags (Laboratório Oculto):
 *   today_in_oculto · journey_system · ai_concierge · historical_timeline
 */
import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sunrise,
  Sparkles,
  Bot,
  ScrollText,
  Flame,
  ArrowRight,
  Users,
  Heart,
  MessageCircle,
  Crown,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { useFeatureFlag } from '@/hooks/usePlatformFeatureFlags';
import { useTodayInOculto } from '@/hooks/retention/useTodayInOculto';
import { useUserJourney } from '@/hooks/retention/useUserJourney';
import { usePersonalAI } from '@/hooks/retention/usePersonalAI';
import { useUserHistory } from '@/hooks/retention/useUserHistory';
import { logRetentionView } from '@/lib/retentionMetrics';
import { CentralAuraModal } from './CentralAuraModal';

/* ---------- helpers visuais ---------- */

function SectionShell({
  children,
  tone,
  ariaLabel,
}: {
  children: React.ReactNode;
  tone: 'amber' | 'fuchsia' | 'cyan' | 'violet';
  ariaLabel: string;
}) {
  const palette: Record<string, { ring: string; glow: string; from: string; to: string }> = {
    amber:   { ring: 'ring-amber-400/30',   glow: 'shadow-[0_0_40px_-12px_rgba(245,158,11,0.45)]', from: 'from-amber-500/15',   to: 'to-orange-500/5' },
    fuchsia: { ring: 'ring-fuchsia-400/30', glow: 'shadow-[0_0_40px_-12px_rgba(217,70,239,0.45)]', from: 'from-fuchsia-500/15', to: 'to-pink-500/5' },
    cyan:    { ring: 'ring-cyan-400/30',    glow: 'shadow-[0_0_40px_-12px_rgba(34,211,238,0.45)]', from: 'from-cyan-500/15',    to: 'to-sky-500/5' },
    violet:  { ring: 'ring-violet-400/30',  glow: 'shadow-[0_0_40px_-12px_rgba(139,92,246,0.45)]', from: 'from-violet-500/15',  to: 'to-indigo-500/5' },
  };
  const p = palette[tone];
  return (
    <section
      aria-label={ariaLabel}
      className={`relative mx-3 mt-3 overflow-hidden rounded-2xl ring-1 ${p.ring} ${p.glow} bg-gradient-to-br ${p.from} ${p.to} backdrop-blur-[2px]`}
    >
      {/* aura superior */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-gradient-to-br ${p.from} ${p.to} blur-2xl opacity-60`}
      />
      <div className="relative p-3.5">{children}</div>
    </section>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  accent,
  badge,
}: {
  icon: any;
  title: string;
  accent: string; // tailwind text color class
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg bg-background/60 ring-1 ring-border/50 ${accent}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <h2 className={`text-sm font-bold tracking-tight uppercase ${accent}`}>{title}</h2>
      {badge && <div className="ml-auto">{badge}</div>}
    </div>
  );
}

/* ---------- bloco: Hoje no Oculto ---------- */

function TodayBlock() {
  const { data, isLoading } = useTodayInOculto();
  if (isLoading || !data || data.isEmpty) return null;
  return (
    <SectionShell tone="amber" ariaLabel="Hoje no Oculto">
      <SectionHeader icon={Sunrise} title="Hoje no Oculto" accent="text-amber-300" />
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.highlights.map((h) => (
          <Link
            key={`${h.kind}-${h.id}`}
            to={h.href}
            className="group relative shrink-0 w-48 overflow-hidden rounded-xl border border-amber-400/20 bg-gradient-to-br from-background/80 to-background/40 p-3 transition-all hover:border-amber-400/60 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300/80">
              <span aria-hidden>{h.icon}</span>
              <span>{h.kind}</span>
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground line-clamp-2 leading-tight">
              {h.title}
            </div>
            {h.subtitle && (
              <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{h.subtitle}</div>
            )}
            <ArrowRight className="absolute bottom-2 right-2 h-3.5 w-3.5 text-amber-300/60 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}

/* ---------- bloco: Sua Jornada ---------- */

function JourneyBlock() {
  const j = useUserJourney();
  if (!j) return null;

  const stats = [
    { label: 'Dias', value: j.daysOnOculto, icon: Flame, color: 'text-orange-400' },
    { label: 'Aura', value: `Nv ${j.auraLevel}`, icon: Sparkles, color: 'text-fuchsia-300' },
    { label: 'Comunidades', value: j.communitiesJoined, icon: Users, color: 'text-cyan-300' },
    { label: 'Seguidores', value: j.totalFollowers, icon: Heart, color: 'text-pink-400' },
  ];

  return (
    <SectionShell tone="fuchsia" ariaLabel="Sua Jornada">
      <SectionHeader
        icon={Sparkles}
        title="Sua Jornada"
        accent="text-fuchsia-300"
        badge={
          j.streakDays > 1 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300 ring-1 ring-orange-400/40">
              <Flame className="h-3 w-3" /> {j.streakDays}d
            </span>
          ) : null
        }
      />

      {/* grid de estatísticas */}
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-background/40 ring-1 ring-border/40 px-2 py-2 text-center"
          >
            <s.icon className={`mx-auto h-3.5 w-3.5 ${s.color}`} />
            <div className="mt-0.5 text-sm font-bold text-foreground leading-none">{s.value}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* narrativa em chips */}
      <div className="space-y-1">
        {j.story.slice(0, 3).map((line, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-md bg-background/30 px-2 py-1.5 text-[12px] text-foreground/90 leading-snug"
          >
            <span className="mt-1 inline-block h-1 w-1 rounded-full bg-fuchsia-400" />
            {line}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link to="/aura-match" className="rounded-full bg-gradient-to-r from-fuchsia-500/20 to-pink-500/20 px-2.5 py-1 text-[11px] font-medium text-fuchsia-200 ring-1 ring-fuchsia-400/40 hover:from-fuchsia-500/30 hover:to-pink-500/30 transition-colors">
          Aura Match
        </Link>
        <Link to="/comunidades" className="rounded-full bg-background/40 px-2.5 py-1 text-[11px] font-medium text-fuchsia-200/90 ring-1 ring-fuchsia-400/30 hover:bg-background/60 transition-colors">
          Comunidades
        </Link>
        <Link to="/visits" className="rounded-full bg-background/40 px-2.5 py-1 text-[11px] font-medium text-fuchsia-200/90 ring-1 ring-fuchsia-400/30 hover:bg-background/60 transition-colors">
          Visitas
        </Link>
      </div>
    </SectionShell>
  );
}

/* ---------- bloco: IA Pessoal ---------- */

function AIBlock() {
  const b = usePersonalAI();
  const central = useFeatureFlag('central_aura_ia');
  const centralEnabled = !!central.data;
  const [idx, setIdx] = useState(0);
  const [centralOpen, setCentralOpen] = useState(false);

  useEffect(() => {
    if (!b.items.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % b.items.length), 4200);
    return () => clearInterval(t);
  }, [b.items.length]);

  // Abre o modal central automaticamente ao montar (botão Aura IA do topo
  // dispara `oculto:open-aura`, que monta este componente). Também escuta
  // eventos globais para reabrir o modal quando já estiver montado.
  useEffect(() => {
    if (!centralEnabled) return;
    setCentralOpen(true);
    const openCentralEvt = () => setCentralOpen(true);
    window.addEventListener('oculto:open-aura', openCentralEvt as EventListener);
    window.addEventListener('oculto:open-aura-central', openCentralEvt as EventListener);
    return () => {
      window.removeEventListener('oculto:open-aura', openCentralEvt as EventListener);
      window.removeEventListener('oculto:open-aura-central', openCentralEvt as EventListener);
    };
  }, [centralEnabled]);

  const featured = b.items[idx] ?? b.items[0];
  const totalSignals = b.items.length;
  const openCentral = () => { if (centralEnabled) setCentralOpen(true); };

  return (
    <>
      <section
        aria-label="Aura IA"
        data-aura-ai-panel
        role={centralEnabled ? 'button' : undefined}
        tabIndex={centralEnabled ? 0 : undefined}
        onClick={centralEnabled ? openCentral : undefined}
        onKeyDown={centralEnabled ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCentral(); } } : undefined}
        className={`relative mx-3 mt-3 overflow-hidden rounded-2xl border border-white/5 transition-transform ${centralEnabled ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
        style={{
          minHeight: 132,
          maxHeight: 180,
          background:
            'radial-gradient(120% 140% at 0% 0%, rgba(34,211,238,0.12) 0%, rgba(168,85,247,0.08) 38%, rgba(10,10,20,0.85) 72%, rgba(10,10,20,0.95) 100%)',
          boxShadow: '0 0 0 1px rgba(34,211,238,0.08), 0 18px 50px -28px rgba(34,211,238,0.45)',
        }}
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full opacity-50 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.35), transparent 70%)' }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }} />

        <div className="relative flex h-full flex-col gap-2.5 p-3.5">
          <div className="flex items-start gap-3">
            <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-fuchsia-500/30 ring-1 ring-cyan-300/40">
              <Bot className="h-4 w-4 text-cyan-100" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0a14]" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">
                <Zap className="h-2.5 w-2.5" />
                <span>Aura IA</span>
                <span className="text-cyan-300/40">·</span>
                <span className="text-emerald-300/80">ao vivo</span>
                {totalSignals > 0 && (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200 ring-1 ring-cyan-300/30 normal-case tracking-normal">
                    <span className="tabular-nums">{totalSignals}</span> sinais
                  </span>
                )}
              </div>
              <h2 className="mt-0.5 text-sm font-semibold leading-snug text-white/95 break-words">
                {b.greeting}
              </h2>
            </div>

            {centralEnabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openCentral(); }}
                aria-label="Abrir Assistente"
                className="group inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-gradient-to-r from-cyan-500/90 to-fuchsia-500/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)] transition-transform hover:scale-[1.03]"
              >
                <span className="hidden sm:inline">Abrir Assistente</span>
                <span className="sm:hidden">Abrir</span>
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>

          {featured && (
            <div className="group flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <span aria-hidden className="text-base leading-none">{featured.icon}</span>
              <span className="flex-1 truncate text-[13px] text-white/90">{featured.text}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-cyan-300/70" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {b.items.slice(0, 8).map((_, i) => (
                <span
                  key={i}
                  className={`h-0.5 flex-1 rounded-full transition-colors ${
                    i === idx ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-400' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
            <span className="tabular-nums text-[10px] text-white/40">
              {Math.min(idx + 1, totalSignals)}/{totalSignals}
            </span>
          </div>
        </div>
      </section>

      {centralEnabled && <CentralAuraModal open={centralOpen} onClose={() => setCentralOpen(false)} />}
    </>
  );

}

/* ---------- bloco: Sua História ---------- */

function HistoryBlockModern() {
  const { data, isLoading } = useUserHistory();
  if (isLoading || !data || data.isEmpty) return null;

  return (
    <SectionShell tone="violet" ariaLabel="Sua História no Oculto">
      <SectionHeader
        icon={ScrollText}
        title="Sua História no Oculto"
        accent="text-violet-300"
        badge={
          data.isVeteran ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/30 to-indigo-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-100 ring-1 ring-violet-400/50">
              <Crown className="h-3 w-3" /> Veterano
            </span>
          ) : null
        }
      />

      {data.retrospective.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {data.retrospective.slice(0, 4).map((r, i) => (
            <div
              key={i}
              className="rounded-lg bg-gradient-to-br from-violet-500/15 to-indigo-500/5 ring-1 ring-violet-400/30 px-2 py-1.5 text-center"
            >
              <div className="text-[11px] font-semibold text-violet-100 leading-tight">{r}</div>
            </div>
          ))}
        </div>
      )}

      {/* timeline com trilho gradiente */}
      <ol className="relative space-y-2.5 pl-5 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-gradient-to-b before:from-violet-400/60 before:via-violet-400/30 before:to-transparent">
        {data.timeline.slice(0, 5).map((ev) => (
          <li key={ev.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[18px] top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 ring-2 ring-background text-[10px]"
            >
              {ev.icon}
            </span>
            <div className="text-[13px] font-medium text-foreground leading-snug">{ev.title}</div>
            {ev.subtitle && (
              <div className="text-[11px] text-muted-foreground/80">{ev.subtitle}</div>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex justify-end">
        <Link
          to="/perfil"
          className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-semibold text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/25 transition-colors"
        >
          Ver perfil completo <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </SectionShell>
  );
}

/* ---------- root ---------- */

export const RetentionLayer = memo(function RetentionLayer() {
  const today = useFeatureFlag('today_in_oculto');
  const aiLegacy = useFeatureFlag('ai_concierge');
  const aiNew = useFeatureFlag('nova_aura_ai');
  // A nova Aura IA tem precedência sobre o concierge antigo quando ativa
  // (somente master por padrão; libera para todos quando rollout='global').
  const showAi = aiNew.data || aiLegacy.data;

  useEffect(() => {
    if (today.data) logRetentionView('retention_today');
    if (showAi) logRetentionView('retention_ai');
  }, [today.data, showAi]);

  if (!today.data && !showAi) return null;

  return (
    <div data-retention-layer className="contents">
      {today.data && <TodayBlock />}
      {showAi && <AIBlock />}
    </div>
  );
});

// Componentes mantidos exportados — lógica preservada para uso em outras telas
// (ex.: perfil, jornada dedicada). Apenas removidos da Home.
export { JourneyBlock, HistoryBlockModern };

export default RetentionLayer;
