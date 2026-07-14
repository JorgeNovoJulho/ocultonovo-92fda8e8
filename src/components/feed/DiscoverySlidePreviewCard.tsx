import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { HelpCircle, Check, Headphones, RefreshCw, CheckCircle2, AlertCircle, Download, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getDiscoveryIcon } from './discoveryIcons';
// Lazy: ambos os dialogs só carregam quando o usuário toca em "Saiba mais".
const EvolutionXpInfoDialog = lazy(() =>
  import('./EvolutionXpInfoDialog').then((m) => ({ default: m.EvolutionXpInfoDialog })),
);
const SlideInfoDialog = lazy(() =>
  import('./SlideInfoDialog').then((m) => ({ default: m.SlideInfoDialog })),
);
const VoiceBioExamplesDialog = lazy(() =>
  import('./VoiceBioExamplesDialog').then((m) => ({ default: m.VoiceBioExamplesDialog })),
);
import { hasViewedSlideGuide } from '@/lib/slideGuideViewed';
import type { DiscoverySlide, DiscoveryPlan } from '@/data/discoveryUniverseSlides';
import { checkWebAppVersion, forceWebAppUpdate, getInstalledAppVersion, type WebAppUpdateInfo } from '@/utils/appUpdateRecovery';

function planRank(p: DiscoveryPlan): number {
  return p === 'vip' ? 2 : p === 'premium' ? 1 : 0;
}

/**
 * Paleta vibrante por categoria — gradiente moderno, alto contraste com texto branco,
 * mantendo legibilidade e clima do produto. Fallback escuro elegante se categoria desconhecida.
 */
const CATEGORY_GRADIENTS: Record<string, { bg: string; ring: string; glow: string }> = {
  social:       { bg: 'from-fuchsia-700 via-pink-600 to-rose-500',     ring: 'border-pink-300/40',     glow: 'hsl(330 90% 60% / 0.55)' },
  discovery:    { bg: 'from-indigo-700 via-violet-600 to-fuchsia-500', ring: 'border-violet-300/40',   glow: 'hsl(270 90% 65% / 0.55)' },
  creator:      { bg: 'from-amber-600 via-orange-500 to-pink-500',     ring: 'border-amber-300/40',    glow: 'hsl(28 95% 60% / 0.55)'  },
  vip:          { bg: 'from-yellow-500 via-amber-500 to-orange-600',   ring: 'border-yellow-300/50',   glow: 'hsl(45 100% 60% / 0.6)'  },
  plans:        { bg: 'from-emerald-600 via-teal-500 to-cyan-500',     ring: 'border-emerald-300/40',  glow: 'hsl(170 80% 55% / 0.55)' },
  events:       { bg: 'from-blue-700 via-indigo-600 to-purple-600',    ring: 'border-blue-300/40',     glow: 'hsl(220 90% 65% / 0.55)' },
  gamification: { bg: 'from-purple-700 via-fuchsia-600 to-pink-500',   ring: 'border-fuchsia-300/40', glow: 'hsl(290 90% 65% / 0.55)' },
  safety:       { bg: 'from-slate-700 via-cyan-700 to-emerald-600',    ring: 'border-cyan-300/40',     glow: 'hsl(180 70% 55% / 0.55)' },
};
const DEFAULT_GRADIENT = { bg: 'from-zinc-800 via-zinc-900 to-black', ring: 'border-border/50', glow: 'hsl(var(--primary) / 0.6)' };


interface Props {
  slide: DiscoverySlide;
  userPlan?: DiscoveryPlan;
  onCta?: () => void;
  className?: string;
}

/**
 * Card visual idêntico ao usado dentro do `DiscoveryUniverseCarousel`.
 * Exportado para preview no admin.
 */
export function DiscoverySlidePreviewCard({
  slide,
  userPlan = 'free',
  onCta,
  className,
}: Props) {
  const Icon = getDiscoveryIcon(slide.icon);
  const needsUpgrade =
    !!slide.requiresPlan && planRank(userPlan) < planRank(slide.requiresPlan);
  const isEvolution = slide.slug === 'evolution-trail';
  const isBioAudio = slide.slug === 'bio-audio';
  const isWebAppUpdate = slide.slug === 'webapp-update';
  const [xpInfoOpen, setXpInfoOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [viewed, setViewed] = useState<boolean>(() => hasViewedSlideGuide(slide.slug));
  const [updateInfo, setUpdateInfo] = useState<WebAppUpdateInfo | null>(null);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [updatingVersion, setUpdatingVersion] = useState(false);
  const installedVersion = useMemo(() => (isWebAppUpdate ? getInstalledAppVersion() : null), [isWebAppUpdate]);

  useEffect(() => {
    const onView = (e: Event) => {
      const detail = (e as CustomEvent<{ slug: string }>).detail;
      if (detail?.slug === slide.slug) setViewed(true);
    };
    window.addEventListener('slide-guide-viewed', onView as EventListener);
    return () => window.removeEventListener('slide-guide-viewed', onView as EventListener);
  }, [slide.slug]);

  useEffect(() => {
    if (!isWebAppUpdate) return;
    let cancelled = false;
    const load = async () => {
      setCheckingVersion(true);
      try {
        const result = await checkWebAppVersion();
        if (!cancelled) setUpdateInfo(result);
      } catch {
        if (!cancelled) setUpdateInfo(null);
      } finally {
        if (!cancelled) setCheckingVersion(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isWebAppUpdate]);

  const palette = CATEGORY_GRADIENTS[slide.category] || DEFAULT_GRADIENT;
  const updateBadge = updateInfo?.upToDate ?? true;

  const handleRefreshVersion = async () => {
    if (!isWebAppUpdate || checkingVersion || updatingVersion) return;
    setCheckingVersion(true);
    try {
      const result = await checkWebAppVersion();
      setUpdateInfo(result);
    } catch {
      setUpdateInfo(null);
    } finally {
      setCheckingVersion(false);
    }
  };

  const handleUpdateNow = async () => {
    if (!isWebAppUpdate || updatingVersion) {
      onCta?.();
      return;
    }
    setUpdatingVersion(true);
    try {
      await forceWebAppUpdate('manual', updateInfo?.remote);
    } catch {
      setUpdatingVersion(false);
    }
  };

  const ctaHandler = isWebAppUpdate ? handleUpdateNow : onCta;

  return (
    <article
      className={[
        'shrink-0 w-[88%] sm:w-[420px] max-w-[420px] rounded-2xl border',
        palette.ring,
        `bg-gradient-to-br ${palette.bg} p-4 sm:p-5 relative overflow-hidden`,
        'shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)] text-white',
        className || '',
      ].join(' ')}
      style={{ contain: 'content' }}
    >
      {/* glow superior direito */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full opacity-50 blur-3xl"
        style={{ background: `radial-gradient(circle, ${palette.glow} 0%, transparent 70%)` }}
      />
      {/* leve overlay para reforçar contraste do texto */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/35 via-black/10 to-transparent"
      />
      {slide.campaignTag && (
        <div
          className="relative mb-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase bg-white/15 text-white border-white/30"
        >
          {slide.campaignTag}
        </div>
      )}
      <div className="relative flex items-start gap-3 sm:gap-4">
        <div className="shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center border border-white/30 bg-white/15 backdrop-blur-sm">
          <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white drop-shadow" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight drop-shadow-sm">
              {slide.title || 'Sem título'}
            </h3>
            {slide.isNew && (
              <Badge className="h-5 px-1.5 text-[10px] bg-white/20 text-white border border-white/40 hover:bg-white/20">
                Novo
              </Badge>
            )}
            {needsUpgrade && (
              <Badge className="h-5 px-1.5 text-[10px] bg-white/20 text-white border border-white/40 hover:bg-white/20">
                Upgrade
              </Badge>
            )}
            {slide.missionLabel && (
              <Badge className="h-5 px-1.5 text-[10px] bg-white/20 text-white border border-white/40 hover:bg-white/20">
                {slide.missionLabel}
              </Badge>
            )}
          </div>
          <p className={`mt-1 text-xs sm:text-sm text-white/90 leading-snug ${isWebAppUpdate ? '' : 'line-clamp-2'}`}>
            {isWebAppUpdate
              ? 'Mantenha o app leve, rápido e sem arquivos antigos em cache. Atualizar garante correções visuais e de desempenho.'
              : (slide.description || 'Sem descrição.')}
          </p>
          {isWebAppUpdate && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] sm:text-[11px] text-white/95">
              <Badge className="h-6 px-2 bg-white/16 text-white border border-white/30 hover:bg-white/16 font-mono">
                atual: {installedVersion || '—'}
              </Badge>
              <Badge className="h-6 px-2 bg-white/16 text-white border border-white/30 hover:bg-white/16 font-mono">
                disponível: {updateInfo?.remote || installedVersion || '—'}
              </Badge>
              <Badge
                className={
                  updateBadge
                    ? "h-6 px-2 bg-emerald-500 text-white border border-emerald-300 hover:bg-emerald-500"
                    : "h-6 px-2 bg-red-500 text-white border border-red-300 hover:bg-red-500 animate-pulse"
                }
              >
                {updateBadge ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : <AlertCircle className="h-3.5 w-3.5 mr-1" />}
                {updateBadge ? 'Atualizado' : 'Desatualizado'}
              </Badge>
            </div>
          )}
          {slide.missionGoal && (
            <p className="mt-1.5 text-[11px] text-white/95 leading-snug">
              ✦ {slide.missionGoal}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={isWebAppUpdate && (updateBadge || updatingVersion)}
              className={
                isWebAppUpdate
                  ? updateBadge
                    ? "h-8 text-xs px-3 bg-white/30 text-white/70 font-semibold shadow cursor-not-allowed hover:bg-white/30"
                    : "h-8 text-xs px-3 bg-yellow-400 text-zinc-900 hover:bg-yellow-300 font-semibold shadow ring-1 ring-yellow-200"
                  : "h-8 text-xs px-3 bg-white text-zinc-900 hover:bg-white/90 font-semibold shadow"
              }
              onClick={ctaHandler}
              type="button"
            >
              {isWebAppUpdate ? (
                updatingVersion ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Atualizando…</> : <><Download className="h-3.5 w-3.5 mr-1" /> Atualizar agora</>
              ) : (needsUpgrade ? 'Ver planos' : (slide.ctaLabel || 'Ação'))}
            </Button>
            {isWebAppUpdate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRefreshVersion();
                }}
                className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/15 px-2.5 h-8 text-[11px] font-medium text-white hover:bg-white/25 transition-colors"
                aria-label="Verificar versão do aplicativo"
              >
                {checkingVersion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Verificar versão
              </button>
            )}
            {isEvolution ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setXpInfoOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/15 px-2.5 h-8 text-[11px] font-medium text-white hover:bg-white/25 transition-colors"
                aria-label="Saiba como o XP sobe"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Saiba mais
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoOpen(true);
                }}
                className={[
                  'inline-flex items-center gap-1 rounded-full border px-2.5 h-8 text-[11px] font-medium transition-colors',
                  viewed
                    ? 'border-emerald-300/60 bg-emerald-400/20 text-white hover:bg-emerald-400/30'
                    : 'border-white/40 bg-white/15 text-white hover:bg-white/25',
                ].join(' ')}
                aria-label={`Saiba mais sobre ${slide.title}`}
              >
                {viewed ? <Check className="h-3.5 w-3.5" /> : <HelpCircle className="h-3.5 w-3.5" />}
                {viewed ? 'Visto' : 'Saiba mais'}
              </button>
            )}
            {isBioAudio && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExamplesOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/15 px-2.5 h-8 text-[11px] font-medium text-white hover:bg-white/25 transition-colors"
                aria-label="Ouvir exemplos de bio de áudio"
              >
                <Headphones className="h-3.5 w-3.5" />
                Exemplos
              </button>
            )}
          </div>
        </div>
      </div>
      {isEvolution && xpInfoOpen && (
        <Suspense fallback={null}>
          <EvolutionXpInfoDialog open={xpInfoOpen} onOpenChange={setXpInfoOpen} />
        </Suspense>
      )}
      {!isEvolution && infoOpen && (
        <Suspense fallback={null}>
          <SlideInfoDialog
            open={infoOpen}
            onOpenChange={setInfoOpen}
            slide={slide}
            onCta={ctaHandler}
          />
        </Suspense>
      )}
      {isBioAudio && examplesOpen && (
        <Suspense fallback={null}>
          <VoiceBioExamplesDialog open={examplesOpen} onOpenChange={setExamplesOpen} />
        </Suspense>
      )}
    </article>
  );
}
