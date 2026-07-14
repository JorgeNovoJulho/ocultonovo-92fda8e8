import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDiscoverySlides, markCategorySeen } from '@/hooks/useDiscoverySlides';
import { useEvolutionTrailSlide } from '@/hooks/useEvolutionTrailSlide';
import { useContextualOfferSlide } from '@/hooks/useContextualOfferSlide';
import { useCarouselAutoplay } from '@/hooks/useCarouselAutoplay';
import { useProfile } from '@/hooks/useProfile';
import { useHasAnyPost } from '@/hooks/useHasAnyPost';
import { useWebAppHasUpdate } from '@/hooks/useWebAppHasUpdate';
import { useAuth } from '@/hooks/useAuth';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import type { DiscoverySlide, DiscoveryPlan } from '@/data/discoveryUniverseSlides';
import { DiscoverySlidePreviewCard } from './DiscoverySlidePreviewCard';
import { MineracaoRequirementsModal } from './MineracaoRequirementsModal';


/** Evento global escutado pelo RealFeed para abrir o modal de publicação. */
export const OPEN_CREATE_POST_EVENT = 'oculto:open-create-post';

function planRank(p: DiscoveryPlan): number {
  return p === 'vip' ? 2 : p === 'premium' ? 1 : 0;
}

function normalizePlan(plan: string | null | undefined): DiscoveryPlan {
  const p = (plan || 'free').toLowerCase();
  if (p === 'vip') return 'vip';
  if (p === 'premium' || p === 'standard') return 'premium';
  return 'free';
}

const SlideCard = memo(function SlideCard({
  slide,
  userPlan,
  onCta,
}: {
  slide: DiscoverySlide;
  userPlan: DiscoveryPlan;
  onCta: (s: DiscoverySlide) => void;
}) {
  return (
    <DiscoverySlidePreviewCard
      slide={slide}
      userPlan={userPlan}
      onCta={() => onCta(slide)}
      className="snap-start"
    />
  );
});

function DiscoveryUniverseCarouselInner() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { user } = useAuth();
  const { progress: auraProgress } = useAuraProgress(false);
  const { data: isMaster = false } = useIsMasterAdmin();
  const userPlan = normalizePlan(profile?.plan_type);
  const { slides: baseSlides, isLoading } = useDiscoverySlides({ userPlan });
  const evolutionSlide = useEvolutionTrailSlide();
  const offerSlide = useContextualOfferSlide();
  const { data: hasAnyPost } = useHasAnyPost();
  const { data: webAppHasUpdate } = useWebAppHasUpdate();
  const [showMineracaoReq, setShowMineracaoReq] = useState<null | {
    aura: { ok: boolean; current: number; required: number };
    score: { ok: boolean; current: number; required: number };
    prestige: { ok: boolean; current: number; required: number };
  }>(null);

  const webAppUpdateSlide = useMemo<DiscoverySlide>(() => ({
    id: 'static-webapp-update',
    slug: 'webapp-update',
    title: 'Atualização do WebApp',
    description: 'Compare sua versão atual com a disponível e atualize com um toque.',
    ctaLabel: 'Atualizar agora',
    ctaRoute: '/settings#webapp-update',
    icon: 'sparkles',
    category: 'safety',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 999,
    isNew: true,
  }), []);
  const firstPostSlide = useMemo<DiscoverySlide>(() => ({
    id: 'static-first-post',
    slug: 'first-post',
    title: 'Faça sua primeira publicação',
    description: 'Sua primeira postagem é o que abre as portas do feed: você ganha visibilidade, atrai seguidores e o algoritmo começa a te entregar para pessoas compatíveis. Toque para publicar agora — leva menos de 1 minuto.',
    ctaLabel: 'Publicar agora',
    ctaRoute: '/feed#create-post',
    icon: 'plus-circle',
    category: 'creator',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 1000,
    isNew: true,
    campaignTag: 'Comece aqui',
  }), []);
  const mineracaoSlide = useMemo<DiscoverySlide>(() => ({
    id: 'static-mineracao-room',
    slug: 'mineracao-room',
    title: 'Sala Mineração',
    description: 'Sem saldo de XP? Entre na Sala Mineração — converse de verdade e cada minuto vira XP. Acesso liberado para todos os usuários, sem requisitos mínimos.',
    ctaLabel: 'Entrar e ganhar XP',
    ctaRoute: '/aura-match?room=mineracao',
    icon: 'sparkles',
    category: 'social',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 950,
    isNew: true,
    campaignTag: 'Minere XP',
  }), []);

  /**
   * Mostra "Faça sua primeira publicação" para TODOS os usuários logados,
   * mesmo quem já publicou — funciona como CTA permanente de engajamento.
   * (hasAnyPost mantido em contexto para futura personalização do copy.)
   */
  void hasAnyPost;
  const showFirstPost = !!user?.id;
  const showMineracao = !!user?.id;

  const hasZeroXp = (auraProgress.xp ?? 0) === 0;

  const slides = useMemo<DiscoverySlide[]>(() => {
    // Ordem-regra:
    //  - Saldo de XP = 0 → Sala Mineração sobe para o 1º lugar (porta de entrada
    //    para o usuário começar a ganhar XP imediatamente).
    //  - Senão, se há atualização do WebApp → webapp em 1º, primeira-pub em 2º.
    //  - Caso contrário → primeira-pub em 1º, webapp em 2º.
    const head: DiscoverySlide[] = [];
    if (showMineracao && hasZeroXp) {
      head.push(mineracaoSlide);
    }
    if (webAppHasUpdate) {
      head.push(webAppUpdateSlide);
      if (showFirstPost) head.push(firstPostSlide);
    } else {
      if (showFirstPost) head.push(firstPostSlide);
      head.push(webAppUpdateSlide);
    }
    if (showMineracao && !hasZeroXp) head.push(mineracaoSlide);
    if (evolutionSlide) head.push(evolutionSlide);
    if (offerSlide) head.push(offerSlide);
    const dedupedBase = baseSlides.filter((slide) => !head.some((item) => item.slug === slide.slug));
    return [...head, ...dedupedBase];
  }, [webAppUpdateSlide, firstPostSlide, mineracaoSlide, showFirstPost, showMineracao, hasZeroXp, webAppHasUpdate, evolutionSlide, offerSlide, baseSlides]);



  const {
    ref: scrollerRef,
    activeIndex: active,
    markProgrammaticScroll,
  } = useCarouselAutoplay<HTMLDivElement>({
    itemCount: slides.length,
    itemSelector: 'article',
  });

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('article');
    if (!card) return;
    const idx = Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / (card.offsetWidth + 12))));
    if (idx < 0) return;
  }, [slides.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(handleScroll);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [handleScroll]);

  const onCta = useCallback(
    (s: DiscoverySlide) => {
      markCategorySeen(s.category);
      const needsUpgrade =
        s.requiresPlan && planRank(userPlan) < planRank(s.requiresPlan);
      if (needsUpgrade) {
        toast.info('Esta função exige plano superior.');
        navigate('/subscriptions');
        return;
      }
      if (s.requiresKyc && !profile?.is_oculto_verified) {
        toast.info('Verifique sua conta para liberar esse recurso.');
        navigate('/perfil/verificacao');
        return;
      }
      try {
        const raw = localStorage.getItem('discovery_clicks_v1');
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        map[s.slug] = (map[s.slug] || 0) + 1;
        localStorage.setItem('discovery_clicks_v1', JSON.stringify(map));
      } catch {
        // ignore
      }
      // Route guard: rotas conhecidas no app. Se não bater, abre VIP/assinaturas.
      const KNOWN_ROUTES = new Set<string>([
        '/feed', '/aura-match', '/radar', '/messages', '/vitrine-vip',
        '/subscriptions', '/events', '/auctions', '/profile', '/marketplace',
        '/notifications', '/matches', '/wallet', '/earnings', '/canal-vip',
        '/perfil/verificacao', '/settings', '/support', '/my-media', '/novidades',
      ]);
      // Caso especial: "Faça sua primeira publicação" não navega — abre o
      // modal de criação direto no feed via evento global.
      if (s.slug === 'first-post') {
        try {
          window.dispatchEvent(new CustomEvent(OPEN_CREATE_POST_EVENT, { detail: { source: 'discovery-first-post' } }));
        } catch {
          // fallback: rola para o topo do feed
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
      // Caso especial: "Atualização do WebApp" — abre o modal global de
      // atualização (verifica versão e permite atualizar com 1 toque) em
      // vez de navegar para Configurações.
      if (s.slug === 'webapp-update') {
        try {
          window.dispatchEvent(new Event('oculto:open-webapp-update-modal'));
        } catch {
          navigate('/settings#webapp-update');
        }
        return;
      }
      // Caso especial: Sala Mineração — acesso LIBERADO para todos os usuários,
      // sem qualquer requisito mínimo (Aura, Score Social ou Prestígio).
      // O modal de requisitos foi removido propositalmente.
      if (s.slug === 'mineracao-room') {
        navigate('/aura-match?room=mineracao');
        return;
      }

      const pathOnly = s.ctaRoute.split('?')[0].split('#')[0];
      if (!KNOWN_ROUTES.has(pathOnly)) {
        toast.info('Recurso disponível em breve. Conheça o plano VIP.');
        navigate('/subscriptions');
        return;
      }
      navigate(s.ctaRoute);
    },
    [navigate, profile?.is_oculto_verified, profile?.social_score, profile?.prestige_xp, auraProgress.level, userPlan, isMaster]
  );


  const scrollBy = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('article');
    const w = card ? card.offsetWidth + 12 : 320;
    markProgrammaticScroll();
    el.scrollBy({ left: dir * w, behavior: 'smooth' });
  }, [markProgrammaticScroll]);

  const dots = useMemo(() => slides.slice(0, 8), [slides]);

  if (isLoading) {
    return (
      <section
        aria-label="Descubra o Universo Oculto"
        aria-busy="true"
        className="px-3 sm:px-4 mb-3"
      >
        <header className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <h2 className="text-xs sm:text-sm font-medium text-foreground/90">
              Descubra o Universo Oculto
            </h2>
          </div>
        </header>
        <div className="flex gap-3 overflow-hidden pb-2 -mx-1 px-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-[88%] sm:w-[420px] h-[160px] rounded-xl border border-border/40 bg-muted/30 animate-pulse"
              style={{ contain: 'content' }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (slides.length === 0) {
    return (
      <section
        aria-label="Descubra o Universo Oculto"
        className="px-3 sm:px-4 mb-3"
      >
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
          <Sparkles className="h-5 w-5 mx-auto mb-2 text-primary/70" />
          <p className="text-sm text-muted-foreground">
            Nenhuma descoberta disponível no momento. Volte em breve.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Descubra o Universo Oculto"
      className="relative mx-3 sm:mx-4 mb-3 px-3 sm:px-4 py-3 rounded-2xl border border-pink-300/30 bg-gradient-to-br from-pink-200/25 via-pink-300/15 to-pink-400/20 backdrop-blur-sm"
    >
      <header className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-xs sm:text-sm font-medium text-foreground/90">
            Descubra o Universo Oculto
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium tabular-nums text-foreground/80 bg-background/70 border border-primary/30 rounded-full px-2 py-0.5">
            {Math.min(active + 1, slides.length)}/{slides.length}
          </span>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => scrollBy(-1)}
            className="h-9 w-9 rounded-full border border-primary/60 bg-background/90 hover:bg-background active:scale-95 shadow-sm flex items-center justify-center text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => scrollBy(1)}
            className="h-9 w-9 rounded-full border border-primary/60 bg-background/90 hover:bg-background active:scale-95 shadow-sm flex items-center justify-center text-foreground"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/*
        Swipe nativo em mobile:
        - Sem handlers JS de pointer/touch (qualquer pause/preventDefault
          interfere com o pan nativo em iOS/Android).
        - touch-action: pan-x → reserva o gesto horizontal para o scroller
          e libera o pan-y vertical para a página (mesmo dedo dentro do card).
        - -webkit-overflow-scrolling: touch → momentum em iOS.
        - snap proximity para não "lutar" com o dedo durante o arrasto.
      */}
      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-proximity scroll-smooth pb-2 -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
          scrollSnapType: 'x proximity',
          overscrollBehaviorX: 'contain',
        }}
      >
        {slides.map((s) => (
          <SlideCard key={s.id} slide={s} userPlan={userPlan} onCta={onCta} />
        ))}
      </div>


      {slides.length > 1 && (
        <div className="flex justify-center items-center gap-1.5 mt-2">
          {dots.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Ir para card ${i + 1}`}
              onClick={() => {
                const el = scrollerRef.current;
                if (!el) return;
                const card = el.querySelector<HTMLElement>('article');
                const w = card ? card.offsetWidth + 12 : 320;
                markProgrammaticScroll();
                el.scrollTo({ left: i * w, behavior: 'smooth' });
              }}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70'
              }`}
            />
          ))}
          {slides.length > dots.length && (
            <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">+{slides.length - dots.length}</span>
          )}
        </div>
      )}

      {showMineracaoReq && (
        <MineracaoRequirementsModal
          open={!!showMineracaoReq}
          onOpenChange={(v) => { if (!v) setShowMineracaoReq(null); }}
          auraLevel={showMineracaoReq.aura}
          socialScore={showMineracaoReq.score}
          prestige={showMineracaoReq.prestige}
        />
      )}
    </section>
  );
}


export const DiscoveryUniverseCarousel = memo(DiscoveryUniverseCarouselInner);
