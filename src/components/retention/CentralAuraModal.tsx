/**
 * CentralAuraModal — Painel Central Aura IA.
 *
 * Reaproveita exclusivamente hooks e componentes já existentes (sem nova tabela).
 *  - Jornada       → useUserJourney
 *  - História      → useUserHistory
 *  - Oportunidades → useSmartOpportunities + hooks reais (stories, sugestões,
 *                    comunidades, presentes, ranking, Oculto Play)
 *  - Missões       → componentes do Aura Match (Streak + DailyQuests + WeeklyChest)
 *  - Explorar      → useFeatureUsageMap (Mapa do Oculto) ou fallback
 *
 * Sem fechamento automático: o modal só fecha quando o usuário tocar no X.
 * Mobile-first: scroll vertical garantido em todas as guias, tabs coloridas
 * com ícones que cabem em telas pequenas.
 */
import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { NearbyRadarPeekModal } from './NearbyRadarPeekModal';
import { SecretNightMatchModal } from './SecretNightMatchModal';
import { RadarWavesModal } from './RadarWavesModal';
import { useRadarPings } from '@/hooks/useRadarPings';
import { Link, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles,
  Compass,
  Target,
  Telescope,
  Bot,
  X,
  Flame,
  Crown,
  ArrowRight,
  Heart,
  Users,
  Music,
  Gift,
  Trophy,
  PlayCircle,
  Video,
  Check,
  RotateCw,
  MessageSquare,
} from 'lucide-react';
import { usePersonalAI } from '@/hooks/retention/usePersonalAI';
import { useUserJourney } from '@/hooks/retention/useUserJourney';
import { useUserHistory } from '@/hooks/retention/useUserHistory';
import { useTodayInOculto } from '@/hooks/retention/useTodayInOculto';
import { useSmartOpportunities, type Opportunity } from '@/hooks/retention/useSmartOpportunities';
import { useFeatureUsageMap, markFeatureExplored, type FeatureNode } from '@/hooks/retention/useFeatureUsageMap';
import { NewMembersStrip } from '@/components/feed/NewMembersStrip';
import { useFeatureFlag } from '@/hooks/usePlatformFeatureFlags';
import { useFlashStories } from '@/hooks/useFlashStories';
import { useAnyRealSuggestedUsers } from '@/hooks/useSuggestedUsers';
import { useCommunities } from '@/hooks/useCommunities';
import { useAuraGiftsRanking } from '@/hooks/useAuraGifts';
import { useAuraTopRanking } from '@/hooks/useAuraTopRanking';
import { useEngagementRanking } from '@/hooks/useEngagementRanking';
import { useLatestCommunityTopics } from '@/hooks/retention/useLatestCommunityTopics';
import { useOcultoPlayTrending24h } from '@/hooks/useOcultoPlayTrending24h';
import { useLatestPlayMovies } from '@/hooks/useLatestPlayMovies';
import { useLatestAdultPlayMovies } from '@/hooks/useLatestAdultPlayMovies';
import { useMostLikedFeedPost } from '@/hooks/retention/useMostLikedFeedPost';
import { AuraStreakCard } from '@/components/aura-match/AuraStreakCard';
import { AuraDailyQuests } from '@/components/aura-match/AuraDailyQuests';
import { AuraWeeklyChest } from '@/components/aura-match/AuraWeeklyChest';
import { AuraAchievements } from '@/components/aura-match/AuraAchievements';
import { normalizePublicStorageUrl } from '@/lib/storageUrl';
import { parseEmbeddedVideo } from '@/lib/embeddedVideoUrl';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Paleta por aba — ícones, ring de destaque e gradientes de cards.
const TAB_THEME: Record<
  string,
  { active: string; iconWrap: string; labelIdle: string; tintIdle: string; ring: string }
> = {
  jornada:       { active: 'data-[state=active]:from-fuchsia-500/35 data-[state=active]:to-pink-500/25 data-[state=active]:text-pink-100 data-[state=active]:shadow-[0_0_18px_-4px_rgba(236,72,153,0.55)]',     iconWrap: 'text-pink-300 drop-shadow-[0_0_6px_rgba(236,72,153,0.7)]',    labelIdle: 'text-pink-200/85',    tintIdle: 'bg-pink-500/10 ring-pink-400/20',       ring: 'ring-pink-400/30' },
  historia:      { active: 'data-[state=active]:from-violet-500/35 data-[state=active]:to-indigo-500/25 data-[state=active]:text-violet-100 data-[state=active]:shadow-[0_0_18px_-4px_rgba(139,92,246,0.55)]', iconWrap: 'text-violet-300 drop-shadow-[0_0_6px_rgba(139,92,246,0.7)]',  labelIdle: 'text-violet-200/85',  tintIdle: 'bg-violet-500/10 ring-violet-400/20',   ring: 'ring-violet-400/30' },
  oportunidades: { active: 'data-[state=active]:from-cyan-500/35 data-[state=active]:to-sky-500/25 data-[state=active]:text-cyan-100 data-[state=active]:shadow-[0_0_18px_-4px_rgba(34,211,238,0.55)]',        iconWrap: 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]',    labelIdle: 'text-cyan-200/85',    tintIdle: 'bg-cyan-500/10 ring-cyan-400/20',       ring: 'ring-cyan-400/30' },
  missoes:       { active: 'data-[state=active]:from-amber-500/35 data-[state=active]:to-orange-500/25 data-[state=active]:text-amber-100 data-[state=active]:shadow-[0_0_18px_-4px_rgba(251,146,60,0.55)]',  iconWrap: 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]',   labelIdle: 'text-amber-200/85',   tintIdle: 'bg-amber-500/10 ring-amber-400/20',     ring: 'ring-amber-400/30' },
  explorar:      { active: 'data-[state=active]:from-emerald-500/35 data-[state=active]:to-teal-500/25 data-[state=active]:text-emerald-100 data-[state=active]:shadow-[0_0_18px_-4px_rgba(16,185,129,0.55)]', iconWrap: 'text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.7)]', labelIdle: 'text-emerald-200/85', tintIdle: 'bg-emerald-500/10 ring-emerald-400/20', ring: 'ring-emerald-400/30' },
};

const TABS = [
  { v: 'jornada',       icon: Sparkles,   label: 'Jornada' },
  { v: 'oportunidades', icon: Compass,    label: 'Sinais' },
  { v: 'missoes',       icon: Target,     label: 'Missões' },
  { v: 'explorar',      icon: Telescope,  label: 'Explorar' },
] as const;

type AuraTabValue = (typeof TABS)[number]['v'];

function resolveAuraMovieCoverUrl(item: any): string | undefined {
  const clean = (value?: string | null) => {
    if (value == null) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    const lower = raw.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'none') return undefined;
    if (lower.includes('placeholder.svg') || lower.includes('/placeholders/')) return undefined;
    return normalizePublicStorageUrl(raw, 'oculto-play-media') ?? raw;
  };

  const thumb = clean(item?.thumb_url);
  if (thumb) return thumb;

  const media = clean(item?.media_url);
  if (media && /\.(avif|webp|png|jpe?g|gif)(?:[?#].*)?$/i.test(media)) return media;

  const source = item?.source_url || item?.media_url || '';
  try {
    return parseEmbeddedVideo(source)?.thumbnailUrl || undefined;
  } catch {
    return undefined;
  }
}

export const CentralAuraModal = memo(function CentralAuraModal({ open, onClose }: Props) {
  // Lazy mount: enquanto o painel está fechado, nenhum hook pesado executa.
  // Isso evita disparar useUserJourney/useUserHistory/useTodayInOculto/usePersonalAI
  // até o usuário realmente abrir o painel — ganho grande em mobile fraco.
  if (!open) return null;
  return <CentralAuraBody onClose={onClose} />;
});

function CentralAuraBody({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<AuraTabValue>('jornada');
  const scrollRef = useRef<HTMLDivElement>(null);
  const ai = usePersonalAI();
  const journey = useUserJourney();
  const { data: history } = useUserHistory();
  const { data: today } = useTodayInOculto();

  const totalSignals = useMemo(() => {
    const t = today?.counts;
    return (t?.radarActive ?? 0) + (t?.upcomingEvents ?? 0) + (t?.newPlay ?? 0) + (t?.newCommunities ?? 0);
  }, [today]);

  // Sub-flags do Master: quando OFF, a aba mostra apenas dicas básicas (fallback).
  const oppsEnabled = !!useFeatureFlag('oportunidades_inteligentes').data;
  const mapEnabled  = !!useFeatureFlag('mapa_do_oculto').data;

  return (
    <Dialog modal={false} open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-aura-modal=""
        overlayClassName="!z-[40] sm:!z-[80]"
        className="
          !left-0 !top-0 !translate-x-0 !translate-y-0 !z-[50] sm:!z-[81]
          p-0 gap-0 border-0 !overflow-hidden overscroll-contain
          !w-screen !h-[100dvh] !max-h-[100dvh] !max-w-none rounded-none
          sm:!left-1/2 sm:!top-1/2 sm:!-translate-x-1/2 sm:!-translate-y-1/2
          sm:!w-[min(960px,95vw)] sm:!h-[90dvh] sm:!max-h-[90dvh] sm:!max-w-[960px] sm:rounded-2xl
          bg-black
          sm:shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_40px_120px_-30px_rgba(34,211,238,0.45)]
          [&>button.absolute]:hidden
        "
      >
        {/* halos neon */}
        <div aria-hidden className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full sm:blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.45), transparent 70%)' }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full sm:blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.45), transparent 70%)' }} />

        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          {/* header */}
          <header className="flex shrink-0 items-start gap-3 border-b border-white/5 px-3 py-3 sm:px-5">
            <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-fuchsia-500/30 ring-1 ring-cyan-300/40">
              <Bot className="h-5 w-5 text-cyan-100" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#08080f]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300/80">
                  Central Aura IA
                </span>
                {totalSignals > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 ring-1 ring-cyan-300/30">
                    <span className="tabular-nums">{totalSignals}</span> sinais
                  </span>
                )}
              </div>
              <h2 className="break-words text-base font-semibold text-white leading-snug">
                {ai.greeting}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="inline-flex h-9 w-9 shrink-0 self-center items-center justify-center rounded-full bg-white/5 text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {/* tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value as AuraTabValue);
              requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
            }}
            className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TabsList className="mx-2 mt-2 grid h-auto shrink-0 grid-cols-4 gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/5 sm:mx-5 sm:mt-3">
              {TABS.map((t) => {
                const theme = TAB_THEME[t.v];
                return (
                  <TabsTrigger
                    key={t.v}
                    value={t.v}
                    className={[
                      'flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-semibold uppercase tracking-tight',
                      'transition-all ring-1',
                      theme.tintIdle,
                      theme.labelIdle,
                      'data-[state=active]:bg-gradient-to-br data-[state=active]:text-white data-[state=active]:ring-white/10',
                      theme.active,
                      'sm:flex-row sm:gap-1.5 sm:text-[11px] sm:tracking-wide',
                    ].join(' ')}
                  >
                    <t.icon className={`h-4 w-4 shrink-0 ${theme.iconWrap}`} />
                    <span className="leading-none">{t.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div
              ref={scrollRef}
              className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-10 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* JORNADA + HISTÓRIA (unificadas) */}
              <TabsContent value="jornada" className="mt-0 space-y-4">
                {journey ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: 'Dias',        value: journey.daysOnOculto,     grad: 'from-fuchsia-500/40 via-pink-500/25 to-rose-500/15',    ring: 'ring-fuchsia-400/60', glow: 'shadow-[0_0_22px_-6px_rgba(236,72,153,0.65)]', text: 'text-fuchsia-200' },
                        { label: 'Aura Nv',     value: journey.auraLevel,        grad: 'from-violet-500/40 via-indigo-500/25 to-purple-500/15', ring: 'ring-violet-400/60', glow: 'shadow-[0_0_22px_-6px_rgba(139,92,246,0.65)]', text: 'text-violet-200' },
                        { label: 'Comunidades', value: journey.communitiesJoined, grad: 'from-emerald-500/40 via-teal-500/25 to-green-500/15',   ring: 'ring-emerald-400/60', glow: 'shadow-[0_0_22px_-6px_rgba(16,185,129,0.65)]', text: 'text-emerald-200' },
                        { label: 'Seguidores',  value: journey.totalFollowers,   grad: 'from-cyan-500/40 via-sky-500/25 to-blue-500/15',        ring: 'ring-cyan-400/60', glow: 'shadow-[0_0_22px_-6px_rgba(34,211,238,0.65)]', text: 'text-cyan-200' },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-xl bg-gradient-to-br ${s.grad} p-3 ring-1 ${s.ring} ${s.glow}`}>
                          <div className="text-2xl font-bold text-white tabular-nums drop-shadow">{s.value}</div>
                          <div className={`mt-0.5 text-[10px] uppercase tracking-wider font-bold ${s.text}`}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {(journey.streakDays > 1 || (history?.isVeteran)) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {journey.streakDays > 1 && (
                          <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500/15 to-amber-500/10 px-3 py-2 ring-1 ring-orange-400/30">
                            <Flame className="h-4 w-4 text-orange-300" />
                            <span className="text-sm text-orange-100">Sequência <b>{journey.streakDays} dias</b></span>
                          </div>
                        )}
                        {history?.isVeteran && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/30 to-indigo-500/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-violet-100 ring-1 ring-violet-400/50">
                            <Crown className="h-3 w-3" /> Veterano
                          </span>
                        )}
                      </div>
                    )}

                    {/* Narrativa da jornada (resumo afetivo) */}
                    {journey.story?.length > 0 && (
                      <ul className="space-y-1.5">
                        {journey.story.map((line, i) => (
                          <li key={i} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-white/85 ring-1 ring-white/5">
                            <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-fuchsia-400" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Retrospectiva (História — números marcantes) */}
                    {history && !history.isEmpty && history.retrospective.length > 0 && (
                      <section>
                        <header className="mb-2 flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-400/40 text-[10px]">✦</span>
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300/90">Sua retrospectiva</h3>
                        </header>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {history.retrospective.slice(0, 4).map((r, i) => {
                            const palettes = [
                              'from-violet-500/25 to-fuchsia-500/10 ring-violet-400/40 text-violet-100',
                              'from-cyan-500/25 to-sky-500/10 ring-cyan-400/40 text-cyan-100',
                              'from-emerald-500/25 to-teal-500/10 ring-emerald-400/40 text-emerald-100',
                              'from-amber-500/25 to-orange-500/10 ring-amber-400/40 text-amber-100',
                            ];
                            const p = palettes[i % palettes.length];
                            return (
                              <div
                                key={i}
                                className={`rounded-lg bg-gradient-to-br ${p.split(' ').slice(0, 2).join(' ')} p-2.5 text-center ring-1 ${p.split(' ')[2]}`}
                              >
                                <div className={`text-[11px] font-semibold ${p.split(' ')[3]}`}>{r}</div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Linha do tempo (História) */}
                    {history && !history.isEmpty && history.timeline.length > 0 && (
                      <section>
                        <header className="mb-2 flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 ring-1 ring-indigo-400/40 text-[10px]">⏳</span>
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300/90">Linha do tempo</h3>
                        </header>
                        <ol className="relative space-y-3 pl-5 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-gradient-to-b before:from-violet-400/60 before:via-violet-400/30 before:to-transparent">
                          {history.timeline.map((ev) => (
                            <li key={ev.id} className="relative">
                              <span className="absolute -left-[18px] top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/30 text-[10px] ring-2 ring-[#08080f]">
                                {ev.icon}
                              </span>
                              <div className="text-sm font-medium text-white">{ev.title}</div>
                              {ev.subtitle && <div className="text-[11px] text-white/55">{ev.subtitle}</div>}
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}
                  </>
                ) : <EmptyState text="Sua jornada começa agora." />}
              </TabsContent>

              {/* OPORTUNIDADES (Sinais) */}
              <TabsContent value="oportunidades" className="mt-0 space-y-3">
                <OpportunitiesPane onNavigate={onClose} fallbackHints={ai.items} smart={oppsEnabled} />
                <SocialOpportunitiesExtras onNavigate={onClose} />
              </TabsContent>

              {/* MISSÕES — sincronizado com Aura Match */}
              <TabsContent value="missoes" className="mt-0 space-y-3">
                <XpBalanceCard onNavigate={onClose} />
                <AuraStreakCard />
                <AuraDailyQuests />
                <AuraWeeklyChest />
                <AuraAchievements />
                <Link
                  to="/aura-match"
                  onClick={onClose}
                  className="group mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-4 py-3 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(251,146,60,0.7)] transition-all hover:brightness-110"
                >
                  <Sparkles className="h-4 w-4" />
                  Abrir Aura Match
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </TabsContent>

              {/* EXPLORAR — Mapa do Oculto (smart) ou grid estático (fallback) + mistérios */}
              <TabsContent value="explorar" className="mt-0 space-y-4">
                {mapEnabled ? <OcultoMap onNavigate={onClose} /> : <ExploreFallback onNavigate={onClose} />}
                <MysteryStrip onNavigate={onClose} />
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-6 text-center text-sm text-white/55 ring-1 ring-white/5">
      {text}
    </div>
  );
}

/* ---------- aba Oportunidades: dados reais via useSmartOpportunities ---------- */
function OpportunitiesPane({
  onNavigate,
  fallbackHints,
  smart = true,
}: {
  onNavigate: () => void;
  fallbackHints: Array<{ icon: string; text: string; href?: string }>;
  smart?: boolean;
}) {
  const { data, isLoading } = useSmartOpportunities();

  if (smart && isLoading) {
    return <EmptyState text="Analisando seus sinais…" />;
  }

  const items = smart ? (data ?? []) : [];

  if (items.length === 0) {
    if (fallbackHints.length === 0) return null;
    return (
      <div className="space-y-2">
        {fallbackHints.map((it, i) => {
          const inner = (
            <span className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/5 hover:bg-white/[0.07] hover:ring-cyan-300/30 transition-colors">
              <span className="text-lg" aria-hidden>{it.icon}</span>
              <span className="flex-1 text-sm text-white/90">{it.text}</span>
              {it.href && <ArrowRight className="h-4 w-4 text-cyan-300/70" />}
            </span>
          );
          return it.href
            ? <Link key={i} to={it.href} onClick={onNavigate}>{inner}</Link>
            : <div key={i}>{inner}</div>;
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((op: Opportunity) => {
        const sev =
          op.severity === 'hot'
            ? 'from-rose-500/20 to-fuchsia-500/10 ring-rose-400/40'
            : op.severity === 'warn'
            ? 'from-amber-500/15 to-orange-500/5 ring-amber-400/30'
            : 'from-cyan-500/15 to-sky-500/5 ring-cyan-400/30';
        return (
          <Link
            key={op.id}
            to={op.href}
            onClick={onNavigate}
            className={`group block rounded-xl bg-gradient-to-br ${sev} ring-1 px-3 py-2.5 transition-all hover:-translate-y-0.5`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl shrink-0" aria-hidden>{op.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">{op.title}</div>
                <div className="text-[11px] text-white/65 leading-snug truncate">{op.body}</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ---------- Card de Saldo de XP (aba Missões) ---------- */
function XpBalanceCard({ onNavigate }: { onNavigate: () => void }) {
  const { profile } = useProfile();
  const auraXp = Number((profile as any)?.aura_xp ?? 0);
  return (
    <div className="rounded-xl bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-yellow-500/10 p-4 ring-1 ring-amber-400/40 shadow-[0_0_22px_-6px_rgba(251,191,36,0.5)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_0_18px_rgba(251,146,60,0.6)] ring-1 ring-white/30">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/80">Seu saldo de XP</div>
            <div className="text-2xl font-bold text-white tabular-nums drop-shadow">
              {auraXp.toLocaleString('pt-BR')} <span className="text-sm font-semibold text-amber-200">XP</span>
            </div>
          </div>
        </div>
        <Link
          to="/aura-match"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1.5 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-500/30"
        >
          Aura Match <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

/* ---------- Extras sociais da aba Oportunidades ----------
 * Cada bloco SÓ renderiza quando tem dado real (silencioso quando vazio).
 * Reaproveita 100% dos hooks existentes — zero nova tabela.
 */
function SocialOpportunitiesExtras({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: stories = [] } = useFlashStories();
  const { data: suggested = [] } = useAnyRealSuggestedUsers(24);
  const { data: communities = [] } = useCommunities({ featuredOnly: true });
  const { data: giftRanking = [] } = useAuraGiftsRanking();
  const { myRank } = useAuraTopRanking(10);
  const { data: engagementRanking = [] } = useEngagementRanking(100);
  const engagementMyRank = useMemo(() => {
    if (!engagementRanking?.length) return null;
    const meId = user?.id;
    const myProfileId = (profile as any)?.id;
    const idx = engagementRanking.findIndex((r: any) =>
      (meId && r.user_id === meId) || (myProfileId && r.profile_id === myProfileId)
    );
    if (idx < 0) return null;
    const row: any = engagementRanking[idx];
    return {
      rank: idx + 1,
      total: engagementRanking.length,
      score: Math.round(Number(row.engagement_score || 0)),
      username: row.username as string | null,
    };
  }, [engagementRanking, user?.id, profile]);
  const { data: trending = [] } = useOcultoPlayTrending24h();
  const { data: mostLikedPost } = useMostLikedFeedPost();
  const { data: latestTopics = [] } = useLatestCommunityTopics(20);
  const { allItems: playMovies = [] } = useLatestPlayMovies();
  const { items: adultPlayMovies = [] } = useLatestAdultPlayMovies();

  // Card rotativo de "último tópico criado" — muda a comunidade exibida
  // a cada montagem (cada abertura do modal incrementa o contador).
  const [topicRotIdx, setTopicRotIdx] = useState(0);
  useEffect(() => {
    if (!latestTopics.length) return;
    try {
      const raw = sessionStorage.getItem('oculto:aura:community-topic-rot');
      const n = (raw ? Number(raw) || 0 : 0) + 1;
      sessionStorage.setItem('oculto:aura:community-topic-rot', String(n));
      setTopicRotIdx(n % latestTopics.length);
    } catch {
      setTopicRotIdx(Math.floor(Math.random() * latestTopics.length));
    }
  }, [latestTopics.length]);

  // Rotação determinística por usuário+dia.
  const pickPersonalized = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const seedBase = `${user?.id ?? 'anon'}-${today}`;
    const hashWith = (suffix: string) => {
      const s = `${seedBase}-${suffix}`;
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      return Math.abs(h >>> 0);
    };
    return <T,>(arr: T[], suffix: string): T | undefined => {
      if (!arr || arr.length === 0) return undefined;
      return arr[hashWith(suffix) % arr.length];
    };
  }, [user?.id]);

  // Filtro de gênero: H -> M+casal | M -> H+casal | casal -> tudo.
  const compatiblePool = useMemo(() => {
    const norm = (v?: string | null) => (v ?? '').toString().toLowerCase().trim();
    const myGender = norm(profile?.gender) || norm((profile as any)?.profile_type);
    const isCouple = myGender.includes('casal') || myGender === 'couple' || norm((profile as any)?.profile_type) === 'couple';
    const isMale = !isCouple && (myGender.startsWith('m') || myGender.includes('mascul') || myGender === 'homem' || myGender === 'male');
    const isFemale = !isCouple && (myGender.startsWith('f') || myGender.includes('femin') || myGender === 'mulher' || myGender === 'female');

    const list = (suggested as any[]).filter((u) => {
      const g = norm(u?.gender);
      const t = norm(u?.profile_type);
      const targetIsCouple = g.includes('casal') || g === 'couple' || t === 'couple';
      const targetIsMale = !targetIsCouple && (g.startsWith('m') || g.includes('mascul') || g === 'homem' || g === 'male');
      const targetIsFemale = !targetIsCouple && (g.startsWith('f') || g.includes('femin') || g === 'mulher' || g === 'female');

      if (isCouple) return true;
      if (isMale) return targetIsFemale || targetIsCouple;
      if (isFemale) return targetIsMale || targetIsCouple;
      return true; // gênero desconhecido → mostra tudo
    });

    if (list.length === 0) return suggested as any[];
    return list;
  }, [suggested, profile?.gender, (profile as any)?.profile_type]);

  // Índice cicla com botão "ver próximo". A cada abertura do modal Aura IA
  // (cada montagem deste pane), avançamos a partir do último índice exibido,
  // garantindo que a sugestão NUNCA fique parada na mesma pessoa.
  const compatCursorKey = `oculto:aura:compat-cursor:${user?.id ?? 'anon'}`;
  const [compatIdx, setCompatIdx] = useState(0);
  useEffect(() => {
    if (compatiblePool.length === 0) return;
    let last = -1;
    try { last = parseInt(localStorage.getItem(compatCursorKey) || '-1', 10); } catch { /* noop */ }
    if (!Number.isFinite(last)) last = -1;
    // Avança para o próximo do pool; se o pool tiver só 1 item, mantém ele.
    let next = compatiblePool.length > 1
      ? ((last + 1) % compatiblePool.length)
      : 0;
    // Se por algum motivo o próximo coincidir com o último (pool=1 não conta),
    // soma 1 para forçar uma nova sugestão.
    if (compatiblePool.length > 1 && next === last) {
      next = (next + 1) % compatiblePool.length;
    }
    setCompatIdx(next);
    try { localStorage.setItem(compatCursorKey, String(next)); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatiblePool.length, user?.id]);

  // Mantém o cursor persistido sincronizado quando o usuário clica em
  // "ver próximo" manualmente, pra próxima abertura também avançar.
  useEffect(() => {
    if (compatiblePool.length === 0) return;
    try { localStorage.setItem(compatCursorKey, String(compatIdx)); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatIdx]);

  const unseenStoriesCount = (stories as any[]).filter((u) => u?.hasUnviewed).length;
  const topSuggested = compatiblePool.length > 0
    ? compatiblePool[compatIdx % compatiblePool.length]
    : undefined;
  const topCommunity = (communities as any[])[0];
  const topGifter = (giftRanking as any[])[0];

  // Trilhas em alta já visitadas pelo usuário ficam fora — gira em tempo real.
  const playSeenKey = `oculto:aura:play-seen:${user?.id ?? 'anon'}`;
  const [playSeenTick, setPlaySeenTick] = useState(0);
  useEffect(() => {
    const onChanged = (ev: Event) => {
      const ce = ev as CustomEvent<{ uid?: string }>;
      if (!ce.detail?.uid || ce.detail.uid === user?.id) setPlaySeenTick((n) => n + 1);
    };
    window.addEventListener('oculto:play-featured-seen', onChanged as EventListener);
    return () => window.removeEventListener('oculto:play-featured-seen', onChanged as EventListener);
  }, [user?.id]);

  const featuredTrack = useMemo(() => {
    const pool = (trending as any[]).filter((t) => t && t.id);
    if (pool.length === 0) return undefined;
    let seen = new Set<string>();
    try {
      seen = new Set(JSON.parse(localStorage.getItem(playSeenKey) || '[]'));
    } catch { /* noop */ }
    let avail = pool.filter((t) => !seen.has(String(t.id)));
    if (avail.length === 0) {
      // todas vistas → reseta e usa o pool inteiro novamente
      try { localStorage.removeItem(playSeenKey); } catch { /* noop */ }
      avail = pool;
    }
    return pickPersonalized(avail, `play-${playSeenTick}`);
  }, [trending, pickPersonalized, playSeenKey, playSeenTick]);

  const markFeaturedTrackSeen = useCallback((id?: string | null) => {
    if (!id) return;
    try {
      const arr: string[] = JSON.parse(localStorage.getItem(playSeenKey) || '[]');
      if (!arr.includes(id)) {
        arr.push(id);
        localStorage.setItem(playSeenKey, JSON.stringify(arr));
      }
    } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent('oculto:play-featured-seen', { detail: { uid: user?.id } }));
  }, [playSeenKey, user?.id]);

  const featuredMovie = useMemo(() => {
    const pool = (playMovies as any[]).filter((t) => t && t.id);
    return pickPersonalized(pool, 'play-movie-signal');
  }, [playMovies, pickPersonalized]);

  const featuredAdultMovie = useMemo(() => {
    const pool = (adultPlayMovies as any[]).filter((t) => t && t.id);
    return pickPersonalized(pool, 'play-adult-movie-signal');
  }, [adultPlayMovies, pickPersonalized]);

  const blocks: React.ReactNode[] = [];

  if (unseenStoriesCount > 0) {
    blocks.push(
      <Link
        key="stories"
        to="/feed?stories=1"
        onClick={onNavigate}
        className="group block rounded-xl bg-gradient-to-br from-rose-500/20 to-pink-500/10 px-3 py-2.5 ring-1 ring-rose-400/30 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/25 ring-1 ring-rose-300/40">
            <PlayCircle className="h-4 w-4 text-rose-200" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">
              {unseenStoriesCount} {unseenStoriesCount === 1 ? 'story novo' : 'stories novos'}
            </div>
            <div className="text-[11px] text-white/65">Veja antes de expirarem em 24 h.</div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    );
  }

  if (topSuggested) {
    const name = topSuggested.name || topSuggested.username || 'alguém compatível';
    const avatar = topSuggested.avatar_url;
    const handle = topSuggested.username
      ? `/u/${encodeURIComponent(topSuggested.username)}`
      : `/creator/${topSuggested.user_id ?? topSuggested.id}`;

    // Afinidade determinística entre o usuário logado e o perfil sugerido.
    // Combina sinais reais (mesma cidade, segue você, destaque, gênero
    // compatível) + um hash estável por par para variar entre perfis,
    // mantendo o valor consistente entre re-renders.
    const myCity = ((profile as any)?.address_city || '').toLowerCase().trim();
    const theirCity = (topSuggested.city || '').toLowerCase().trim();
    const sameCity = !!myCity && !!theirCity && myCity === theirCity;
    const pairSeed = `${user?.id ?? 'anon'}|${topSuggested.user_id ?? topSuggested.id ?? topSuggested.username ?? ''}`;
    let h = 2166136261;
    for (let i = 0; i < pairSeed.length; i++) h = Math.imul(h ^ pairSeed.charCodeAt(i), 16777619);
    const jitter = (Math.abs(h >>> 0) % 16); // 0..15
    let affinity = 60 + jitter;
    if (sameCity) affinity += 12;
    if ((topSuggested as any).follows_me) affinity += 10;
    if ((topSuggested as any).is_highlighted) affinity += 6;
    affinity = Math.max(62, Math.min(98, affinity));

    const goNext = () => {
      if (compatiblePool.length > 1) {
        setCompatIdx((i) => (i + 1) % compatiblePool.length);
      }
    };
    const openProfile = () => {
      // Avança para a próxima sugestão ANTES de navegar, garantindo que
      // ao voltar ao modal o card já exibe outra opção compatível.
      goNext();
      onNavigate();
    };

    blocks.push(
      <div
        key="suggested"
        className="group relative rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/10 px-3 py-2.5 ring-1 ring-fuchsia-400/30 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <Link to={handle} onClick={openProfile} className="contents">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fuchsia-500/25 ring-1 ring-fuchsia-300/40">
              {avatar
                ? <img src={avatar} alt="" loading="lazy" className="h-full w-full object-cover" />
                : <Heart className="h-4 w-4 text-fuchsia-200" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="text-sm font-semibold text-white truncate">Compatível: {name}</div>
                <span
                  className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-fuchsia-500/30 px-1.5 py-[1px] text-[10px] font-bold text-fuchsia-100 ring-1 ring-fuchsia-300/50"
                  title="Nível de afinidade com você"
                >
                  <Heart className="h-2.5 w-2.5 fill-current" />
                  {affinity}%
                </span>
              </div>
              <div className="text-[11px] text-white/65 truncate">
                Afinidade {affinity}% · {sameCity ? 'mesma cidade' : 'perfil sugerido pra você'}
              </div>
            </div>
          </Link>
          {compatiblePool.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goNext();
              }}
              title="Ver próximo compatível"
              aria-label="Ver próximo compatível"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-300/50 hover:bg-fuchsia-500/40 hover:text-white"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          )}
          <Link to={handle} onClick={openProfile} aria-label={`Abrir perfil ${name}`}>
            <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    );
  }


  // Lista de comunidades recomendadas (até 3) — não apenas a top.
  const topCommunities = (communities as any[]).slice(0, 3);
  if (topCommunities.length > 0) {
    blocks.push(
      <div key="communities-group" className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/70 pt-1">
          Comunidades pra você
        </div>
        {topCommunities.map((c: any) => (
          <Link
            key={c.id ?? c.slug}
            to={`/comunidades/${c.slug}`}
            onClick={onNavigate}
            className="group block rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 px-3 py-2.5 ring-1 ring-emerald-400/30 transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-500/25 ring-1 ring-emerald-300/40">
                {c.cover_url || c.avatar_url
                  ? <img src={c.cover_url ?? c.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  : <Users className="h-4 w-4 text-emerald-200" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">{c.title ?? c.name}</div>
                <div className="text-[11px] text-white/65 truncate">
                  {(c.members_count ?? 0)} pessoas — entre e conecte-se.
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    );
  }

  // Card rotativo — último tópico criado dentro de uma comunidade.
  // A cada abertura do modal, mostra uma comunidade diferente.
  if (latestTopics.length > 0) {
    const lt = latestTopics[topicRotIdx % latestTopics.length];
    if (lt) {
      blocks.push(
        <Link
          key="latest-community-topic"
          to={`/comunidades/${lt.community_slug}/topico/${lt.topic_id}`}
          onClick={onNavigate}
          className="group block rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/10 px-3 py-2.5 ring-1 ring-teal-400/30 transition-all hover:-translate-y-0.5 hover:ring-teal-300/60 hover:shadow-[0_0_22px_-4px_rgba(45,212,191,0.55)]"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-teal-500/25 ring-1 ring-teal-300/40">
              {lt.community_cover
                ? <img src={lt.community_cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                : <MessageSquare className="h-4 w-4 text-teal-200" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-teal-300/80 truncate">
                Novo tópico · {lt.community_title}
              </div>
              <div className="text-sm font-semibold text-white truncate">{lt.topic_title}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      );
    }
  }




  if (featuredMovie) {
    const fm = featuredMovie as any;
    const title = fm.title || fm.caption || 'Novo filme disponível';
    const cover = resolveAuraMovieCoverUrl(fm);
    blocks.push(
      <Link
        key="play-movie"
        to="/oculto-play#filmes"
        onClick={onNavigate}
        className="group block rounded-xl bg-gradient-to-br from-sky-600/30 via-cyan-700/20 to-blue-900/25 px-3 py-2.5 ring-1 ring-sky-400/40 transition-all hover:-translate-y-0.5 hover:ring-sky-300/60 hover:shadow-[0_0_22px_-4px_rgba(56,189,248,0.5)]"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sky-500/25 ring-1 ring-sky-300/40">
            {cover
              ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <Video className="h-4 w-4 text-sky-200" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-200/85 truncate">
              Filmes no Oculto Play
            </div>
            <div className="text-sm font-semibold text-white truncate">{title}</div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    );
  }

  if (featuredAdultMovie) {
    const fam = featuredAdultMovie as any;
    const title = fam.title || fam.caption || 'Filme +18 disponível';
    const cover = resolveAuraMovieCoverUrl(fam);
    blocks.push(
      <Link
        key="play-adult-movie"
        to="/oculto-play#filmes-adult"
        onClick={onNavigate}
        className="group block rounded-xl bg-gradient-to-br from-red-700/55 via-rose-800/40 to-red-950/50 px-3 py-2.5 ring-1 ring-red-400/55 transition-all hover:-translate-y-0.5 hover:ring-red-300/70 hover:shadow-[0_0_24px_-4px_rgba(248,113,113,0.65)]"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-red-500/30 ring-1 ring-red-200/45">
            {cover
              ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <Video className="h-4 w-4 text-red-100" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-100/90 truncate">
              Filmes +18 no Oculto Play
            </div>
            <div className="text-sm font-semibold text-white truncate">{title}</div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    );
  }

  if (featuredTrack) {
    const ft = featuredTrack as any;
    const title = ft.title || ft.caption || 'Música em destaque';
    const cover = ft.thumb_url || ft.author_avatar_url || null;
    blocks.push(
      <Link
        key="play"
        to={`/oculto-play${ft.id ? `?item=${ft.id}` : ''}`}
        onClick={() => { markFeaturedTrackSeen(ft.id); onNavigate?.(); }}
        className="group block rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 px-3 py-2.5 ring-1 ring-amber-400/30 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-500/25 ring-1 ring-amber-300/40">
            {cover
              ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <Music className="h-4 w-4 text-amber-200" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">Em alta no Oculto Play</div>
            <div className="text-[11px] text-white/65 truncate">{title}</div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    );
  }

  if (mostLikedPost && mostLikedPost.likes_count > 0) {
    const mp = mostLikedPost;
    const author = mp.author;
    const authorName = author?.name || author?.username || 'Alguém';
    const cover = mp.thumbnail_url || mp.media_url || author?.avatar_url || null;
    const snippet = (mp.content_text || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    blocks.push(
      <Link
        key="most-liked-post"
        to={`/c/${mp.id}`}
        onClick={onNavigate}
        className="group block rounded-xl bg-gradient-to-br from-rose-500/20 to-fuchsia-500/10 px-3 py-2.5 ring-1 ring-rose-400/30 transition-all hover:-translate-y-0.5 hover:ring-rose-300/60 hover:shadow-[0_0_22px_-4px_rgba(244,63,94,0.55)]"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-rose-500/25 ring-1 ring-rose-300/40">
            {cover
              ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <Heart className="h-4 w-4 text-rose-200" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300/85 truncate">
              Postagem mais curtida · {mp.likes_count} {mp.likes_count === 1 ? 'curtida' : 'curtidas'}
            </div>
            <div className="text-sm font-semibold text-white truncate">
              {snippet || `Veja o post de ${authorName}`}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    );
  }

  if (engagementMyRank?.rank) {
    blocks.push(
      <Link
        key="rank"
        to="/ranking"
        onClick={onNavigate}
        className="group block rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 px-3 py-2.5 ring-1 ring-violet-400/30 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/25 ring-1 ring-violet-300/40">
            <Trophy className="h-4 w-4 text-violet-200" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">
              Você está em #{engagementMyRank.rank} no Ranking de Engajamento
            </div>
            <div className="text-[11px] text-white/65 truncate">
              {engagementMyRank.score} pontos · de {engagementMyRank.total}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    );
  }

  if (topGifter && (topGifter.gifts_count ?? 0) > 0) {
    const s = topGifter.sender;
    const name = s?.username ? `@${s.username}` : 'um admirador';
    const handle = s?.username
      ? `/u/${encodeURIComponent(s.username)}`
      : (s?.user_id ? `/creator/${s.user_id}` : '/aura-match?tab=gifts');
    blocks.push(
      <Link
        key="gifter"
        to={handle}
        onClick={onNavigate}
        className="group block rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/10 px-3 py-2.5 ring-1 ring-pink-400/30 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-500/25 ring-1 ring-pink-300/40">
            {s?.avatar_url
              ? <img src={s.avatar_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <Gift className="h-4 w-4 text-pink-200" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">{name} é quem mais te presenteia</div>
            <div className="text-[11px] text-white/65 truncate">
              {topGifter.gifts_count} presente{topGifter.gifts_count === 1 ? '' : 's'} · {topGifter.total_xp} XP recebidos
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    );
  }

  // Sempre exibe 3 CTAs de engajamento (publicar, presentear, curtir)
  blocks.push(
    <div key="engage-cta" className="space-y-2.5 pt-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
        Aumente sua presença
      </div>
      <ActionCard
        icon="✨"
        title="Publique algo novo no feed"
        body="Posts recentes atraem seguidores e visitas ao seu perfil."
        accent="fuchsia"
        onClick={() => {
          onNavigate();
          setTimeout(() => {
            window.dispatchEvent(new Event('oculto:open-create-post'));
          }, 50);
        }}
        navigateToFeed
      />
      <ActionCard
        icon="🎁"
        title="Envie um presente a alguém"
        body="Presentes geram XP, conexão real e respostas."
        accent="amber"
        onClick={() => {
          onNavigate();
          setTimeout(() => {
            window.dispatchEvent(new Event('oculto:open-gift-modal'));
          }, 50);
        }}
      />
      <ActionCard
        icon="❤️"
        title="Curta postagens no feed"
        body="Suas curtidas alimentam o algoritmo de afinidade."
        accent="rose"
        onClick={() => {
          onNavigate();
          setTimeout(() => {
            window.dispatchEvent(new Event('oculto:focus-first-post'));
          }, 250);
        }}
        navigateToFeed
      />
      <ActionCard
        icon="💫"
        title="Entre em uma sala da Aura"
        body="Salas ao vivo conectam você por afinidade real, agora."
        accent="violet"
        onClick={() => {
          onNavigate();
        }}
        navigateTo="/aura-match"
      />
    </div>
  );

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
        Outras conexões pra você
      </div>
      {blocks}
    </div>
  );
}

// Paleta neon vibrante por accent.
const ACCENT_STYLES: Record<string, { bg: string; ring: string; iconBg: string; glow: string; text: string }> = {
  fuchsia: {
    bg: 'from-fuchsia-600/40 via-pink-600/30 to-purple-700/25',
    ring: 'ring-fuchsia-400/60',
    iconBg: 'bg-gradient-to-br from-fuchsia-500 to-pink-600 shadow-[0_0_18px_rgba(236,72,153,0.7)]',
    glow: 'shadow-[0_0_28px_-6px_rgba(236,72,153,0.55)] hover:shadow-[0_0_38px_-4px_rgba(236,72,153,0.85)]',
    text: 'text-fuchsia-200',
  },
  amber: {
    bg: 'from-amber-500/40 via-orange-600/30 to-yellow-600/20',
    ring: 'ring-amber-400/60',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-600 shadow-[0_0_18px_rgba(251,146,60,0.7)]',
    glow: 'shadow-[0_0_28px_-6px_rgba(251,146,60,0.55)] hover:shadow-[0_0_38px_-4px_rgba(251,146,60,0.85)]',
    text: 'text-amber-200',
  },
  rose: {
    bg: 'from-rose-600/40 via-red-600/30 to-pink-700/25',
    ring: 'ring-rose-400/60',
    iconBg: 'bg-gradient-to-br from-rose-500 to-red-600 shadow-[0_0_18px_rgba(244,63,94,0.7)]',
    glow: 'shadow-[0_0_28px_-6px_rgba(244,63,94,0.55)] hover:shadow-[0_0_38px_-4px_rgba(244,63,94,0.85)]',
    text: 'text-rose-200',
  },
  violet: {
    bg: 'from-violet-600/40 via-fuchsia-600/30 to-indigo-700/25',
    ring: 'ring-violet-400/60',
    iconBg: 'bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-[0_0_18px_rgba(139,92,246,0.7)]',
    glow: 'shadow-[0_0_28px_-6px_rgba(139,92,246,0.55)] hover:shadow-[0_0_38px_-4px_rgba(139,92,246,0.85)]',
    text: 'text-violet-200',
  },
};

function ActionCard({ icon, title, body, accent, onClick, navigateToFeed, navigateTo }: {
  icon: string; title: string; body: string; accent: keyof typeof ACCENT_STYLES;
  onClick: () => void; navigateToFeed?: boolean; navigateTo?: string;
}) {
  const navigate = useNavigate();
  const s = ACCENT_STYLES[accent];
  const handle = () => {
    if (navigateTo && window.location.pathname !== navigateTo) {
      navigate(navigateTo);
    } else if (navigateToFeed && window.location.pathname !== '/feed') {
      navigate('/feed');
    }
    onClick();
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={`group block w-full text-left rounded-xl bg-gradient-to-br ${s.bg} px-3 py-3 ring-1 ${s.ring} ${s.glow} transition-all hover:-translate-y-0.5`}
    >
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.iconBg} text-xl ring-1 ring-white/30`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate drop-shadow">{title}</div>
          <div className={`text-[11px] truncate ${s.text}`}>{body}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-white transition-transform group-hover:translate-x-1" />
      </div>
    </button>
  );
}

function CtaCard({ to, onNavigate, icon, title, body, tone }: {
  to: string; onNavigate: () => void; icon: string; title: string; body: string; tone: string;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`group block rounded-xl bg-gradient-to-br ${tone} px-3 py-2.5 ring-1 transition-all hover:-translate-y-0.5`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg ring-1 ring-white/15">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{title}</div>
          <div className="text-[11px] text-white/65 truncate">{body}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}


/* ---------- aba Explorar: Mapa do Oculto (Prompt 5) ---------- */
function OcultoMap({ onNavigate }: { onNavigate: () => void }) {
  const { used, unused, loading } = useFeatureUsageMap();

  if (loading) return <EmptyState text="Mapeando seu universo no Oculto…" />;

  return (
    <>
      {/* Você já utiliza */}
      <section>
        <header className="mb-2 flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/40">
            <Check className="h-3 w-3 text-emerald-300" />
          </span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300/90">
            Você já utiliza
          </h3>
          <span className="text-[10px] text-white/40 tabular-nums">{used.length}</span>
        </header>
        {used.length === 0 ? (
          <div className="rounded-xl bg-white/[0.03] px-3 py-3 text-xs text-white/50 ring-1 ring-white/5">
            Nenhum recurso explorado ainda — comece pelos cards abaixo.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {used.map((f) => (
              <UsedCard key={f.key} node={f} onClick={onNavigate} />
            ))}
          </div>
        )}
      </section>

      {/* Você ainda não explorou — some quando tudo for utilizado */}
      {unused.length > 0 ? (
        <section>
          <header className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 ring-1 ring-cyan-400/40">
              <Sparkles className="h-3 w-3 text-cyan-300" />
            </span>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/90">
              Você ainda não explorou
            </h3>
            <span className="text-[10px] text-white/40 tabular-nums">{unused.length}</span>
          </header>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {unused.map((f) => (
              <UnexploredCard key={f.key} node={f} onClick={onNavigate} />
            ))}
          </div>
        </section>
      ) : (
        /* Tudo explorado → exibe boas-vindas aos novos misteriosos */
        <section onClick={onNavigate}>
          <NewMembersStrip />
        </section>
      )}
    </>
  );
}

function UsedCard({ node, onClick }: { node: FeatureNode; onClick: () => void }) {
  // Aura Match leva à seção "Explorar novos mistérios" no feed (#newcomers)
  const goesToMysteries = node.key === 'aura-match';
  const to = goesToMysteries ? '/feed#newcomers' : node.href;
  const handleClick = () => {
    onClick();
    if (goesToMysteries) {
      const fire = () => {
        try { window.dispatchEvent(new Event('oculto:focus-newcomers')); } catch { /* noop */ }
        try {
          const el = document.getElementById('newcomers');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch { /* noop */ }
      };
      setTimeout(fire, 200);
      setTimeout(fire, 700);
      setTimeout(fire, 1400);
    }
  };
  return (
    <Link
      to={to}
      onClick={handleClick}
      className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${node.tone} p-3 ring-1 ring-emerald-400/20 transition-all hover:-translate-y-0.5 hover:ring-emerald-300/40`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>{node.icon}</span>
        <Check className="h-3.5 w-3.5 text-emerald-300/90" />
      </div>
      <div className="mt-1.5 text-sm font-semibold text-white">{node.title}</div>
      <div className="text-[10px] text-white/55">{node.pitch}</div>
    </Link>
  );
}

function UnexploredCard({ node, onClick }: { node: FeatureNode; onClick: () => void }) {
  // Aura Match e Feed levam à seção "Explorar novos misteriosos(as)" no feed
  // (SuggestedUsersCarousel com id="newcomers"). Outras features abrem sua página.
  const goesToMysteries = node.key === 'feed' || node.key === 'aura-match';
  const to = goesToMysteries ? '/feed#newcomers' : node.href;
  const { user } = useAuth();

  const handleClick = () => {
    // Move o card de "Você ainda não explorou" → "Você já utiliza" imediatamente
    markFeatureExplored(user?.id, node.key);
    onClick();
    if (goesToMysteries) {
      const fire = () => {
        try { window.dispatchEvent(new Event('oculto:focus-newcomers')); } catch { /* noop */ }
        try {
          const el = document.getElementById('newcomers');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch { /* noop */ }
      };
      setTimeout(fire, 200);
      setTimeout(fire, 700);
      setTimeout(fire, 1400);
    }
  };
  return (
    <Link
      to={to}
      onClick={handleClick}
      className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${node.tone} p-3 ring-1 ring-cyan-300/20 transition-all hover:-translate-y-0.5 hover:ring-cyan-300/70 hover:shadow-[0_0_22px_-2px_rgba(34,211,238,0.55)] focus-visible:ring-2 focus-visible:ring-cyan-300/80 active:ring-2 active:ring-cyan-300/90 active:shadow-[0_0_28px_-2px_rgba(34,211,238,0.85)]`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full blur-2xl opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.45), transparent 70%)' }} />
      <div className="relative flex items-start gap-3">
        <span className="text-2xl" aria-hidden>{node.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white truncate">{node.title}</span>
            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-200 ring-1 ring-cyan-300/30">
              novo p/ você
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-white/65 leading-snug">{node.pitch}</div>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 px-2.5 py-1 text-[10px] font-bold text-white ring-1 ring-cyan-300/30 group-hover:from-cyan-500/50 group-hover:to-fuchsia-500/50">
            {goesToMysteries ? 'Explorar novos mistérios' : `Abrir ${node.title}`} <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ---------- Fallback estático da aba Explorar (mapa_do_oculto desligado) ---------- */
const EXPLORE_FALLBACK = [
  { to: '/radar',         title: 'Radar',        subtitle: 'Quem está perto agora',     icon: '📡', tone: 'from-cyan-500/25 to-sky-500/10 ring-cyan-400/30' },
  { to: '/aura-match',    title: 'Aura Match',   subtitle: 'Conexões por afinidade',    icon: '💫', tone: 'from-fuchsia-500/25 to-pink-500/10 ring-fuchsia-400/30' },
  { to: '/comunidades',   title: 'Comunidades',  subtitle: 'Tópicos e tribos',          icon: '🏘️', tone: 'from-emerald-500/25 to-teal-500/10 ring-emerald-400/30' },
  { to: '/oculto-play',   title: 'Oculto Play',  subtitle: 'Mídia exclusiva',           icon: '🎬', tone: 'from-amber-500/25 to-orange-500/10 ring-amber-400/30' },
  { to: '/events',        title: 'Eventos',      subtitle: 'Encontros e festas',        icon: '🎉', tone: 'from-rose-500/25 to-red-500/10 ring-rose-400/30' },
  { to: '/subscriptions', title: 'Canal VIP',    subtitle: 'Conteúdo premium',          icon: '👑', tone: 'from-yellow-500/25 to-amber-500/10 ring-yellow-400/30' },
];
function ExploreFallback({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {EXPLORE_FALLBACK.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          onClick={onNavigate}
          className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${l.tone} p-3 ring-1 transition-all hover:-translate-y-0.5 hover:brightness-110`}
        >
          <div aria-hidden className="pointer-events-none absolute -right-5 -top-5 h-14 w-14 rounded-full bg-white/10 blur-2xl opacity-50" />
          <div className="text-2xl">{l.icon}</div>
          <div className="mt-2 text-sm font-bold text-white">{l.title}</div>
          <div className="text-[11px] text-white/70">{l.subtitle}</div>
          <ArrowRight className="absolute right-2 top-2 h-3.5 w-3.5 text-white/40 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}


/* ---------- Mistérios — cards de descoberta extra na aba Explorar ---------- */
type MysteryItem = {
  icon: string;
  title: string;
  body: string;
  tone: string;
  to?: string;
  action?: 'open-radar-peek' | 'open-secret-night-match' | 'open-radar-waves';
  badge?: number;
};
function MysteryStrip({ onNavigate }: { onNavigate: () => void }) {
  const [radarPeekOpen, setRadarPeekOpen] = useState(false);
  const [secretMatchOpen, setSecretMatchOpen] = useState(false);
  const [radarWavesOpen, setRadarWavesOpen] = useState(false);

  // Contador real-time de acenos recebidos não vistos.
  const { pingersSet } = useRadarPings();
  const wavesCount = pingersSet.size;

  const MYSTERIES: MysteryItem[] = [
    { action: 'open-radar-peek',        icon: '🔮', title: 'Quem cruzou seu caminho?', body: 'Veja perfis que estiveram perto de você hoje.', tone: 'from-violet-500/35 via-fuchsia-500/20 to-purple-500/10 ring-violet-400/50' },
    { action: 'open-secret-night-match', icon: '🌙', title: 'Match secreto da noite',   body: 'A Aura escolheu alguém pra cruzar com você.',  tone: 'from-indigo-500/35 via-violet-500/20 to-blue-500/10 ring-indigo-400/50' },
    { action: 'open-radar-waves',       icon: '👋', title: 'Quem te acenou no Radar', body: wavesCount > 0 ? `${wavesCount} aceno${wavesCount === 1 ? '' : 's'} novo${wavesCount === 1 ? '' : 's'} esperando resposta.` : 'Veja quem acenou pra você e acene de volta.', tone: 'from-cyan-500/35 via-sky-500/20 to-teal-500/10 ring-cyan-400/50', badge: wavesCount },
    { to: '/experiencias-ocultas',      icon: '🎭', title: 'Experiência oculta',      body: 'Histórias e encontros que só acontecem aqui.', tone: 'from-rose-500/35 via-pink-500/20 to-red-500/10 ring-rose-400/50' },
  ];

  return (
    <section className="pt-2">
      <header className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-500/20 ring-1 ring-fuchsia-400/40 text-[10px]">✦</span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/90">Novos mistérios</h3>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MYSTERIES.map((m) => {
          const inner = (
            <>
              <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full blur-2xl opacity-60"
                style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.6), transparent 70%)' }} />
              <div className="relative flex items-start gap-3">
                <span className="relative text-2xl" aria-hidden>
                  {m.icon}
                  {!!m.badge && m.badge > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 text-[10px] font-extrabold text-slate-950 flex items-center justify-center ring-2 ring-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.7)] animate-pulse">
                      {m.badge > 99 ? '99+' : m.badge}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white truncate drop-shadow">{m.title}</span>
                    <span className="rounded-full bg-fuchsia-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fuchsia-100 ring-1 ring-fuchsia-300/50">mistério</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/75 leading-snug">{m.body}</div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" />
              </div>
            </>
          );
          const cls = `group relative overflow-hidden rounded-xl bg-gradient-to-br ${m.tone} p-3 ring-1 shadow-[0_0_18px_-6px_rgba(168,85,247,0.5)] transition-all hover:-translate-y-0.5 hover:brightness-110`;
          if (m.action) {
            const onClick =
              m.action === 'open-radar-peek' ? () => setRadarPeekOpen(true)
              : m.action === 'open-secret-night-match' ? () => setSecretMatchOpen(true)
              : () => setRadarWavesOpen(true);
            return (
              <button
                key={m.title}
                type="button"
                onClick={onClick}
                className={`${cls} text-left`}
              >
                {inner}
              </button>
            );
          }
          return (
            <Link key={(m.to ?? '') + m.title} to={m.to!} onClick={onNavigate} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
      <NearbyRadarPeekModal open={radarPeekOpen} onClose={() => setRadarPeekOpen(false)} />
      <SecretNightMatchModal open={secretMatchOpen} onClose={() => setSecretMatchOpen(false)} />
      <RadarWavesModal open={radarWavesOpen} onClose={() => setRadarWavesOpen(false)} />
    </section>
  );
}



export default CentralAuraModal;
