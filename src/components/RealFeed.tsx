import { useState, useMemo, useCallback, memo, useEffect, useRef, lazy, Suspense } from "react";
import FeedModeSyncIndicator from "@/components/feed/FeedModeSyncIndicator";
import FeedContentTypeModal from "@/components/feed/FeedContentTypeModal";
import { FeedExperienceModeIndicator } from "@/components/feed/FeedExperienceModeIndicator";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { peekScrollToPost, consumeScrollToPost } from "@/lib/feedScrollHint";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { RealPostCard } from "./RealPostCard";
import { PostExpandedModal } from "./PostExpandedModal";
import { VipNarrativeFeedCard } from "./feed/VipNarrativeFeedCard";
import { CommunityTopicFeedCard, parseCommunityTopicSnapshot } from "./feed/CommunityTopicFeedCard";

import { SubscriptionModal } from "./SubscriptionModal";
import { FeedTabs, FeedTab } from "./FeedTabs";
import { FeedCardItem } from "./feed/FeedCardItem";
import { NovidadesDoOcultoCarousel } from "./feed/NovidadesDoOcultoCarousel";
const FlashStoriesBar = lazy(() =>
  import("./stories").then((m) => ({ default: m.FlashStoriesBar }))
);
const PlayRailPulse = lazy(() =>
  import("./oculto-play/PlayRailPulse").then((m) => ({ default: m.PlayRailPulse }))
);
const RecentMatchesWidget = lazy(() =>
  import("./matches/RecentMatchesWidget").then((m) => ({ default: m.RecentMatchesWidget }))
);
const CommunityTrendingWidget = lazy(() =>
  import("./communities/CommunityTrendingWidget").then((m) => ({ default: m.CommunityTrendingWidget }))
);
const MyCommunitiesFeedStrip = lazy(() =>
  import("./feed/MyCommunitiesFeedStrip").then((m) => ({ default: m.MyCommunitiesFeedStrip }))
);

import { FloatingActionButton } from "./FloatingActionButton";
import { useFabEnabled } from "@/hooks/useFabEnabled";
const CreatePostModal = lazy(() => import("./CreatePostModal").then(m => ({ default: m.CreatePostModal })));
import { ErrorBoundary } from "./ErrorBoundary";
const SuggestedUsersCarousel = lazy(() =>
  import("./feed/SuggestedUsersCarousel").then((m) => ({ default: m.SuggestedUsersCarousel }))
);
// Carrosséis pesados são montados após o primeiro paint para acelerar o feed em
// celulares low-end (ex.: Realme C55). Lazy-load corta JS do bundle inicial.
const VipCreatorsCarousel = lazy(() =>
  import("./feed/VipCreatorsCarousel").then((m) => ({ default: m.VipCreatorsCarousel }))
);
const HiddenRoomsCarousel = lazy(() =>
  import("./feed/HiddenRoomsCarousel").then((m) => ({ default: m.HiddenRoomsCarousel }))
);
const DiscoveryUniverseCarousel = lazy(() =>
  import("./feed/DiscoveryUniverseCarousel").then((m) => ({ default: m.DiscoveryUniverseCarousel }))
);
const NewMembersStrip = lazy(() =>
  import("./feed/NewMembersStrip").then((m) => ({ default: m.NewMembersStrip }))
);
const EventsFeedStrip = lazy(() =>
  import("./feed/EventsFeedStrip").then((m) => ({ default: m.EventsFeedStrip }))
);
const AuctionsFeedStrip = lazy(() =>
  import("./feed/AuctionsFeedStrip").then((m) => ({ default: m.AuctionsFeedStrip }))
);
const VitrinePlansModal = lazy(() =>
  import("./VitrinePlansModal").then((m) => ({ default: m.VitrinePlansModal }))
);
const MyShareLinkCard = lazy(() =>
  import("./share/MyShareLinkCard").then((m) => ({ default: m.MyShareLinkCard }))
);
import { useDeferredMount } from "@/hooks/useDeferredMount";
import { PullToRefresh } from "./feed/PullToRefresh";
import { DataSaverBadge } from "./feed/DataSaverBadge";
const CentralAuraModal = lazy(() =>
  import("./retention/CentralAuraModal").then((m) => ({ default: m.CentralAuraModal }))
);
const NoiteOcultaBanner = lazy(() =>
  import("./social/NoiteOcultaBanner").then((m) => ({ default: m.NoiteOcultaBanner }))
);
const FeedVivoStrip = lazy(() =>
  import("./social/FeedVivoStrip").then((m) => ({ default: m.FeedVivoStrip }))
);
const PresencePulseStrip = lazy(() =>
  import("./social/PresencePulseStrip").then((m) => ({ default: m.PresencePulseStrip }))
);
const CaixaOcultaFeedStrip = lazy(() =>
  import("./caixa-oculta/CaixaOcultaFeedStrip").then((m) => ({ default: m.CaixaOcultaFeedStrip }))
);
const MicroTipsStrip = lazy(() =>
  import("./social/MicroTipsStrip").then((m) => ({ default: m.MicroTipsStrip }))
);
const EarnByReferralCard = lazy(() =>
  import("./social/EarnByReferralCard").then((m) => ({ default: m.EarnByReferralCard }))
);
const AffiliateCampaignsStrip = lazy(() =>
  import("./social/AffiliateCampaignsStrip").then((m) => ({ default: m.AffiliateCampaignsStrip }))
);
const ExperienciasReaisStrip = lazy(() =>
  import("./social/ExperienciasReaisStrip").then((m) => ({ default: m.ExperienciasReaisStrip }))
);
const SocialAiHintsStrip = lazy(() =>
  import("./social/SocialAiHintsStrip").then((m) => ({ default: m.SocialAiHintsStrip }))
);
const RetentionMissionsStrip = lazy(() =>
  import("./social/RetentionMissionsStrip").then((m) => ({ default: m.RetentionMissionsStrip }))
);
const AbandonReturnCard = lazy(() =>
  import("./social/AbandonReturnCard").then((m) => ({ default: m.AbandonReturnCard }))
);
const SocialCycleBadge = lazy(() =>
  import("./social/SocialCycleBadge").then((m) => ({ default: m.SocialCycleBadge }))
);
import { MarketplaceAdCard } from "./marketplace-ads/MarketplaceAdCard";
import { MarketplaceAdSkeleton, MarketplaceAdEmpty } from "./marketplace-ads/MarketplaceAdSkeleton";
import { MisteriosEmDestaqueSection } from "./feed/MisteriosEmDestaqueSection";
import { CommunidadesOcultasFeedSection } from "./feed/CommunidadesOcultasFeedSection";
const LatestPlayVideosStrip = lazy(() =>
  import("./feed/LatestPlayVideosStrip").then((m) => ({ default: m.LatestPlayVideosStrip }))
);
const LatestAdultMoviesStrip = lazy(() =>
  import("./feed/LatestAdultMoviesStrip").then((m) => ({ default: m.LatestAdultMoviesStrip }))
);
const LatestMoviesBigStrip = lazy(() =>
  import("./feed/LatestMoviesBigStrip").then((m) => ({ default: m.LatestMoviesBigStrip }))
);
const OcultoPlayRandomBigCards = lazy(() =>
  import("./feed/OcultoPlayRandomBigCards").then((m) => ({ default: m.OcultoPlayRandomBigCards }))
);
const SponsoredAdsCarousel = lazy(() =>
  import("./feed/SponsoredAdsCarousel").then((m) => ({ default: m.SponsoredAdsCarousel }))
);
import { useMarketplaceAdsEnabled, useActiveMarketplaceAds } from "@/hooks/useMarketplaceAds";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Crown, RefreshCw, Users, CheckCircle, ArrowUp, PlusCircle, Plus, SlidersHorizontal, Search, Sun, Moon, MonitorSmartphone, Compass, EyeOff, Eye, BrainCircuit, Loader2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSafeBlur } from "@/safe-blur/SafeBlurProvider";
import { toast } from "sonner";

import { FeedGenderFilterModal } from "@/components/feed/FeedGenderFilterModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
// useNavigate already imported above
import { useTheme } from "@/hooks/useTheme";
import { useInfinitePosts, FEED_PAGE_SIZE } from "@/hooks/usePosts";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { RateLimitReachedModal } from "./RateLimitReachedModal";
import { useAuth } from "@/hooks/useAuth";
import { useEnsureWelcomeMessage } from "@/hooks/useEnsureWelcomeMessage";
import { useFollowingIds } from "@/hooks/useFollowingIds";
import { useMyVipAccess } from "@/hooks/useMyVipAccess";
import { useSubscribedVipPosts } from "@/hooks/useSubscribedVipPosts";
import { usePerformance } from "@/contexts/PerformanceContext";
import { useFeedMode } from "@/feed-modes/FeedModeProvider";
import { FeedModeSelector } from "@/feed-modes/FeedModeSelector";
import { useViewModePreferences } from "@/hooks/useViewModePreferences";
import { useFeedExperienceMode } from "@/hooks/useFeedExperienceMode";
import { useFeedCacheStore } from "@/store/useFeedCacheStore";
import { FeedSyncStatusChip } from "@/components/feed/FeedSyncStatusChip";
import { prefetchFeedMedia } from "@/lib/imageLoadCache";
import { isVideoUrl } from "@/lib/mediaType";
import { useFeedDebugStore } from "@/store/useFeedDebugStore";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";

// Bridge: chaves usadas no RealFeed → chaves canônicas em HOME_SECTIONS
// (src/config/homeSections.ts). Usado pelo gate granular isSectionEnabled().
const REAL_FEED_TO_HOME_SECTION: Record<string, string> = {
  newMembers: 'new_members',
  noiteOculta: 'smart_start',
  retentionBlock: 'smart_start',
  microTips: 'micro_tips',
  earnByReferral: 'referral_link',
  affiliateCampaigns: 'referral_link',
  feedVivo: 'feed_vivo',
  presence: 'presence_pulse',
  caixaOculta: 'caixa_oculta',
  experienciasReais: 'discover_universe',
  sponsoredAds: 'sponsored_ads',
  stories: 'stories',
  matches: 'active_matches',
  discoveryUniverse: 'discover_universe',
  shareLink: 'referral_link',
  vipCreators: 'vip_creators',
  hiddenRooms: 'hidden_rooms',
  events: 'events',
  communitiesTrending: 'communities_trending',
  communitiesFeedCard: 'communities_feed_card',
};

// ── Posição ÚNICA da sessão "Explorar novos misteriosos(as)" ────────────
// Aparece UMA única vez no feed, fixa após o 3º post (index 2), e nunca
// reaparece mais abaixo — pedido explícito do produto. Sempre visível
// (sem gate de deferred mount) para não "sumir e reaparecer" no scroll.
const SUGGESTION_FIXED_INDEX = 2;
const SUGGESTION_POSITIONS = new Set<number>([SUGGESTION_FIXED_INDEX]);

const MISTERIOS_FIXED_INDEX = 5;
const COMMUNITIES_FEED_FIXED_INDEX = 6;
const AUCTIONS_FIXED_INDEX = 8;
const OCULTO_PLAY_RANDOM_FIXED_INDEX = 16;
const LATEST_MOVIES_BIG_FIXED_INDEX = 1; // Posição fixa após o primeiro post (índice 1)
const EMPTY_MARKETPLACE_ADS: any[] = [];

// ── Posições onde injetar o card do Marketplace ─────────────────────────
// Aparece após o 7º post e depois a cada 12-18 posts. Não colide com sugestões.
const MARKETPLACE_POSITIONS = (() => {
  const positions = new Set<number>();
  let pos = 6; // 7º post
  positions.add(pos);
  const intervals = [12, 15, 18];
  let cursor = 0;
  while (pos < 500) {
    // Determinístico para mobile e desktop montarem as sessões nos mesmos
    // índices. Math.random() aqui fazia a ordem divergir entre dispositivos.
    pos += intervals[cursor % intervals.length];
    cursor += 1;
    if (!SUGGESTION_POSITIONS.has(pos)) positions.add(pos);
  }
  return positions;
})();

const isFeedOverlayOpen = () => {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
};

// ── Componente memoizado para cada item do feed ─────────────────────────
const FeedItem = memo(function FeedItem({
  post,
  index,
  totalPosts,
  onSubscribe,
  marketplaceAds,
  marketplaceLoading,
  showMarketplace,
  activeTab,
  suggestionsReady,
  showAuctions,
  showMisterios,
  showHiddenRoomsInline,
  isAdultOnly,
  isOcultoOnly,
  safeBlurOn,
  onOpenExpandedPost,
}: {
  post: any;
  index: number;
  totalPosts: number;
  onSubscribe: () => void;
  marketplaceAds: any[];
  marketplaceLoading: boolean;
  showMarketplace: boolean;
  activeTab: FeedTab;
  suggestionsReady: boolean;
  showAuctions: boolean;
  showMisterios: boolean;
  showHiddenRoomsInline: boolean;
  isAdultOnly: boolean;
  isOcultoOnly: boolean;
  safeBlurOn: boolean;
  onOpenExpandedPost: (post: any) => void;
}) {
  const showSuggestions = SUGGESTION_POSITIONS.has(index);

  const isMarketplaceSlot = showMarketplace && MARKETPLACE_POSITIONS.has(index);
  const isFirstMarketplaceSlot = index === 6;
  const hasAds = marketplaceAds.length > 0;
  const showMarketplaceContent =
    isMarketplaceSlot && (marketplaceLoading || hasAds || isFirstMarketplaceSlot);

  const isNarrative = post?.content_format === "narrative";
  const isCommunityTopic =
    post?.post_type === "community_topic" || !!parseCommunityTopicSnapshot(post?.content_text);
  return (
    <div className="feed-post-item" style={{ contain: 'layout style', minHeight: '400px' }}>
      {isCommunityTopic
        ? <CommunityTopicFeedCard post={post} />
        : isNarrative
          ? <VipNarrativeFeedCard post={post} />
          : <RealPostCard post={post} onSubscribe={onSubscribe} onOpenExpandedPost={onOpenExpandedPost} isOcultoOnly={isOcultoOnly} />}


      {showMarketplaceContent && (
        <ErrorBoundary>
          <div className="my-4">
            {marketplaceLoading ? (
              <MarketplaceAdSkeleton count={2} />
            ) : hasAds ? (
              <MarketplaceAdCard ads={marketplaceAds} />
            ) : (
              <MarketplaceAdEmpty />
            )}
          </div>
        </ErrorBoundary>
      )}
      {showSuggestions && activeTab !== 'vip' && !isAdultOnly && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[260px]" aria-hidden />}>
            {/* Trocou de posição com "Explorar novos misteriosos(as)" —
                Comunidades Ocultas agora ocupa o slot fixo do feed (index 2). */}
            <CommunidadesOcultasFeedSection />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* Mistérios em Destaque: aparece após o 6º post; se o feed tiver
          menos de 6 posts, aparece logo após o último para nunca sumir. */}
      {showMisterios && activeTab !== 'vip' && !isOcultoOnly &&
        (index === MISTERIOS_FIXED_INDEX ||
          (totalPosts <= MISTERIOS_FIXED_INDEX && index === totalPosts - 1)) && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[260px]" aria-hidden />}>
            <div id="oculto-misterios-section" style={{ scrollMarginTop: '88px' }}>
              <MisteriosEmDestaqueSection />
            </div>
          </Suspense>
        </ErrorBoundary>
      )}
      {/* Filmes +18 do Oculto Play — substitui o slot anterior dos "Últimos vídeos".
          Visível para usuários que escolheram "Apenas +18" e também no modo
          "Experiência Completa" (com blur + botão MOSTRAR). */}
      {activeTab !== 'vip' && !isAdultOnly && !isOcultoOnly &&
        (index === MISTERIOS_FIXED_INDEX ||
          (totalPosts <= MISTERIOS_FIXED_INDEX && index === totalPosts - 1)) && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[240px]" aria-hidden />}>
            <LatestAdultMoviesStrip isAdultOnly={isAdultOnly} safeBlurOn={safeBlurOn} />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* Últimos vídeos do Oculto Play — movido para logo acima de Salas Ocultas. */}
      {activeTab !== 'vip' && !isAdultOnly &&
        (index === COMMUNITIES_FEED_FIXED_INDEX ||
          (totalPosts <= COMMUNITIES_FEED_FIXED_INDEX && index === totalPosts - 1)) && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[220px]" aria-hidden />}>
            <LatestPlayVideosStrip />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* Salas Ocultas: posicionado logo abaixo de "Últimos vídeos do Oculto Play". */}
      {showHiddenRoomsInline && activeTab !== 'vip' &&
        (index === COMMUNITIES_FEED_FIXED_INDEX ||
          (totalPosts <= COMMUNITIES_FEED_FIXED_INDEX && index === totalPosts - 1)) && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[260px]" aria-hidden />}>
            <HiddenRoomsCarousel />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* Filmes no Oculto Play (azul) — logo abaixo de Comunidades Ocultas.
          Apenas no Universo Completo (não aparece em "Apenas +18"). */}
      {activeTab !== 'vip' && !isAdultOnly &&
        (index === LATEST_MOVIES_BIG_FIXED_INDEX ||
          (totalPosts <= LATEST_MOVIES_BIG_FIXED_INDEX && index === totalPosts - 1)) && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[420px]" aria-hidden />}>
            <LatestMoviesBigStrip />
          </Suspense>
        </ErrorBoundary>
      )}
      {/* Descubra no OCULTO PLAY — 5 vídeos aleatórios por sessão.
          Aparece 5 postagens depois de Salas Ocultas (index 6+5 = 11). Se o
          feed for menor, ancora ao último post para nunca sumir. */}
      {activeTab !== 'vip' && !isAdultOnly &&
        (index === OCULTO_PLAY_RANDOM_FIXED_INDEX ||
          (totalPosts <= OCULTO_PLAY_RANDOM_FIXED_INDEX && index === totalPosts - 1)) && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[360px]" aria-hidden />}>
            <OcultoPlayRandomBigCards />
          </Suspense>
        </ErrorBoundary>
      )}
      {showAuctions && index === AUCTIONS_FIXED_INDEX && activeTab !== 'vip' && !isOcultoOnly && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[180px]" aria-hidden />}>
            <AuctionsFeedStrip />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
});

export const RealFeed = memo(function RealFeed() {
  const queryClient = useQueryClient();
  const lastRenderRef = useRef(Date.now());
  const renderCountRef = useRef(0);
  const { isDebugEnabled: isDebugEnabledGlobal, addLog: addDebugLog } = useFeedDebugStore();
  const cachedFeedLength = useFeedCacheStore(s => s.posts?.length ?? 0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    renderCountRef.current += 1;
    const now = Date.now();
    const diff = now - lastRenderRef.current;
    lastRenderRef.current = now;

    if (renderCountRef.current > 1 && diff < 2000) {
      addDebugLog('render', `Piscada detectada! Re-render em ${diff}ms`, { 
        count: renderCountRef.current,
        hasCache: cachedFeedLength > 0 
      });
      console.warn(`[FeedDebug] Rapid re-render detected: ${diff}ms`);
    } else {
      addDebugLog('render', 'Feed montado/renderizado', { diff });
    }
  }, [addDebugLog, cachedFeedLength]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFeedContentTypeModal, setShowFeedContentTypeModal] = useState(false);
  const [showFeedFilterModal, setShowFeedFilterModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [showVitrineModal, setShowVitrineModal] = useState(false);
  const [expandedPost, setExpandedPost] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<FeedTab>('foryou');
  const { shows: legacyFeedModeShows, forcesCardLayout, mode: legacyMode } = useFeedMode();
  const { isSectionEnabled, viewMode: granularMode } = useViewModePreferences();
  const { isAdultOnly, isOcultoOnly } = useFeedExperienceMode();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { isDebugEnabled, clearLogs } = useFeedDebugStore();
  const { safeBlurOn, toggleSafeBlur } = useSafeBlur();
  const [safeBlurPending, setSafeBlurPending] = useState(false);
  const safeBlurPendingTimer = useRef<number | null>(null);

  const {
    data: infiniteData,
    isLoading,
    error,
    hasNextPage: rawHasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfinitePosts(FEED_PAGE_SIZE, { explicitAdultOnly: isAdultOnly });

  const pagesLoaded = infiniteData?.pages?.length ?? 0;
  const hasNextPage = !!rawHasNextPage;

  // Fail-safe: nunca deixar o skeleton infinito.
  const [skeletonTimedOut, setSkeletonTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) { setSkeletonTimedOut(false); return; }
    const t = window.setTimeout(() => setSkeletonTimedOut(true), 6000);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  const [isHardRefreshing, setIsHardRefreshing] = useState(false);
  const handleHardRefresh = useCallback(async () => {
    if (isHardRefreshing) return;
    setIsHardRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['posts-infinite'], exact: false, refetchType: 'active' });
      await queryClient.invalidateQueries({ queryKey: ['posts'], exact: false, refetchType: 'active' });
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } finally {
      setIsHardRefreshing(false);
    }
  }, [isHardRefreshing, queryClient]);

  const { user } = useAuth();
  const feedIdentityReady = !!user?.id;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Gate combinado:
  // - O seletor legado (Completo/Social/Descoberta/Limpo/Card) é a fonte
  //   primária — mudanças têm efeito imediato no feed.
  // - O gate granular (HOME_SECTIONS) só se aplica quando o usuário
  //   explicitamente entrou em modo "custom" via Sessões Ocultas; assim
  //   "Completo" do seletor realmente mostra tudo.
  // O seletor de modo de visualização (Completo/Social/Descoberta/Limpo/Card)
  // é SEMPRE a fonte da verdade para QUAIS sessões aparecem no feed — tanto
  // em "Experiência completa" quanto em "Apenas +18". A escolha de experiência
  // (+18 vs. completa) só afeta o CONTEÚDO dos posts (filtragem por is_adult),
  // que é feita em usePosts/RealPostCard. Assim, trocar o modo de visualização
  // ou o modo de experiência reflete imediatamente em mobile e desktop.
  const feedModeShows = useCallback(
    (key: string) => {
      // Em modo CUSTOM, o gate legado é ignorado: o toggle granular é a única
      // fonte da verdade — ativar "Salas Ocultas" (ou qualquer bloco) aparece
      // no feed em tempo real sem depender do modo Completo/Limpo.
      if (granularMode === 'custom') {
        // Fail-safe: no modo "Limpo", as 3 sessões obrigatórias
        // (Stories, Salas Ocultas, Comunidades Ocultas) DEVEM aparecer mesmo
        // se o granular ainda não as tiver habilitadas explicitamente.
        if (
          legacyMode === 'limpo' &&
          (key === 'stories' || key === 'hiddenRooms' || key === 'communitiesFeedCard')
        ) {
          return true;
        }
        const mapped = REAL_FEED_TO_HOME_SECTION[key] ?? key;
        return isSectionEnabled(mapped);
      }
      return legacyFeedModeShows(key as Parameters<typeof legacyFeedModeShows>[0]);
    },
    [legacyFeedModeShows, isSectionEnabled, granularMode, legacyMode]
  );

  // Mesma regra para as seções fixas no FeedItem (Mistérios / Leilões):
  // só são gated pelo granular quando o usuário está em modo "custom".
  const sectionEnabledForMode = useCallback(
    (key: string) => {
      if (granularMode !== 'custom') {
        // 'Completo' libera tudo. 'Limpo' também exibe Mistérios em Destaque
        // por padrão (pedido do produto: feed limpo + Explorar + Mistérios).
        if (legacyMode === 'completo') return true;
        if (legacyMode === 'limpo' && key === 'mysterious_discovery') return true;
        if (legacyMode === 'limpo' && key === 'communities_feed_card') return true;
        if (legacyMode === 'limpo' && key === 'hidden_rooms') return true;
        return false;
      }
      return isSectionEnabled(key);
    },
    [granularMode, legacyMode, isSectionEnabled]
  );

  // Modo "Card" força a aba card; trocar de modo sai dela
  useEffect(() => {
    if (forcesCardLayout && activeTab !== 'card') setActiveTab('card');
    if (!forcesCardLayout && activeTab === 'card') setActiveTab('foryou');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcesCardLayout]);
  // Escuta o evento global disparado pelo card "Faça sua primeira publicação"
  // no carrossel Descubra o Universo Oculto para abrir o modal de criação.
  useEffect(() => {
    const handler = () => setShowCreateModal(true);
    window.addEventListener('oculto:open-create-post', handler as EventListener);
    return () => window.removeEventListener('oculto:open-create-post', handler as EventListener);
  }, []);
  // Foco na primeira postagem (vindo da Central Aura IA → "Curta postagens no feed").
  useEffect(() => {
    const handler = () => {
      try {
        virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Pulso visual no primeiro card
        setTimeout(() => {
          const first = document.querySelector<HTMLElement>('[data-feed-post-index="0"]')
            ?? document.querySelector<HTMLElement>('[data-real-post-card]');
          if (first) {
            first.classList.add('ring-2', 'ring-pink-400/70', 'shadow-[0_0_30px_-4px_rgba(236,72,153,0.7)]', 'transition-all', 'duration-500');
            setTimeout(() => {
              first.classList.remove('ring-2', 'ring-pink-400/70', 'shadow-[0_0_30px_-4px_rgba(236,72,153,0.7)]');
            }, 2200);
          }
        }, 500);
      } catch { /* noop */ }
    };
    window.addEventListener('oculto:focus-first-post', handler as EventListener);
    return () => window.removeEventListener('oculto:focus-first-post', handler as EventListener);
  }, []);

  // Scroll para seções do feed via hash ou eventos globais.
  // - "#oculto-misterios-section" / "oculto:focus-misterios" → Mistérios em Destaque
  // - "#newcomers" / "oculto:focus-newcomers" → Explorar novos misteriosos(as) (SuggestedUsersCarousel)
  useEffect(() => {
    const scrollToTarget = (targetId: string) => {
      const tryScroll = (attempt = 0) => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('ring-2', 'ring-cyan-400/70', 'shadow-[0_0_40px_-4px_rgba(34,211,238,0.7)]', 'rounded-2xl', 'transition-all', 'duration-500');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-cyan-400/70', 'shadow-[0_0_40px_-4px_rgba(34,211,238,0.7)]');
          }, 2500);
        } else if (attempt < 10) {
          setTimeout(() => tryScroll(attempt + 1), 400);
        }
      };
      tryScroll();
    };
    const scrollToMisterios = () => scrollToTarget('oculto-misterios-section');
    const scrollToNewcomers = () => scrollToTarget('newcomers');
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#oculto-misterios-section') setTimeout(scrollToMisterios, 300);
      if (window.location.hash === '#newcomers') setTimeout(scrollToNewcomers, 300);
    }
    window.addEventListener('oculto:focus-misterios', scrollToMisterios as EventListener);
    window.addEventListener('oculto:focus-newcomers', scrollToNewcomers as EventListener);
    return () => {
      window.removeEventListener('oculto:focus-misterios', scrollToMisterios as EventListener);
      window.removeEventListener('oculto:focus-newcomers', scrollToNewcomers as EventListener);
    };
  }, []);
  // Sessões auxiliares montam já no primeiro idle após o paint (sem delays
  // artificiais de 1-2s). Assim o usuário vê todas as sessões do feed logo
  // após o login, sem “aparecer em degraus”.
  const sidebarWidgetsReady = useDeferredMount(0);
  const socialStripsReady = useDeferredMount(0);
  const storiesReady = useDeferredMount(0);
  const suggestionsReady = useDeferredMount(0);
  const auxiliaryDataReady = useDeferredMount(0);
  const heavyWidgetsReady = useDeferredMount(0);


  // ⚡️ Modo Economia: hardware fraco ou auto-downgrade por FPS baixo.
  // Quando ativo: reduz overscan, antecipa prefetch e esconde carrosséis pesados.
  const { profile: perfProfile } = usePerformance();
  const dataSaver = perfProfile.dataSaver;
  // Mantém mobile e desktop com a mesma janela inicial de posts. Antes o mobile
  // buscava 10 e o desktop 15; como as sessões são injetadas por índice fixo,
  // isso deixava cada dispositivo com ordem visual diferente e podia parecer
  // feed vazio quando os primeiros itens filtrados acabavam antes do desktop.
  const feedPageSize = FEED_PAGE_SIZE;
  // Em modo "custom" (Modo Personalizado), os toggles são fonte da verdade —
  // não dependem do gate de "heavy widgets" para aparecer imediatamente.
  // As mesmas sessões liberadas precisam aparecer em mobile e desktop, na mesma
  // ordem; por isso o gate é só de montagem lazy, não de tipo de dispositivo.
  const showHeavyCarousels = granularMode === 'custom' ? true : heavyWidgetsReady;
  // No modo "Apenas +18" as seções sociais (Stories, Salas Ocultas,
  // Comunidades, Discovery, Oculto Play, etc.) NÃO devem aparecer no feed,
  // tanto em mobile quanto em desktop. Elas só são liberadas no modo
  // "Experiência completa" (e respeitando o gate de defer de performance).
  const showRequiredAdultSections = !isAdultOnly && showHeavyCarousels;

  // Backend rate-limit: feed_view (janela alinhada por plano)
  const feedAccess = useFeatureAccess('feed_view');
  const [feedLimitOpen, setFeedLimitOpen] = useState(false);
  useEffect(() => {
    if (!feedAccess.checking && !feedAccess.allowed) setFeedLimitOpen(true);
  }, [feedAccess.checking, feedAccess.allowed]);


  const hasValidCache = useFeedCacheStore(s => !!s.posts?.length && (Date.now() - s.updatedAt < 24 * 60 * 60 * 1000));
  const [showRenderWarning, setShowRenderWarning] = useState(false);

  useEffect(() => {
    addDebugLog('render', 'RealFeed montado/remontado');
    if (hasValidCache) {
      setShowRenderWarning(true);
      // Limpar logs antigos se o feed está remontando sem motivo aparente
      if (isDebugEnabled) {
        addDebugLog('stale', 'ALERTA: Remontagem inesperada detectada');
      }
      const t = setTimeout(() => setShowRenderWarning(false), 3000);
      return () => clearTimeout(t);
    }
  }, [addDebugLog, hasValidCache, isDebugEnabled]);

  const cachedFeedPosts = useFeedCacheStore((s) => s.posts);
  const cachedFeedOwner = useFeedCacheStore((s) => s.feedOwnerId);
  const cachedFeedUpdatedAt = useFeedCacheStore((s) => s.updatedAt);
  const cachedFeedFallback = useMemo(() => {
    if (!cachedFeedPosts?.length) return [] as any[];
    if (Date.now() - cachedFeedUpdatedAt > 24 * 60 * 60 * 1000) return [];
    if (user?.id && cachedFeedOwner && cachedFeedOwner !== user.id) return [];
    return cachedFeedPosts as any[];
  }, [cachedFeedPosts, cachedFeedUpdatedAt, cachedFeedOwner, user?.id]);
  const postsFiltered = useMemo(() => {
    let live = (infiniteData?.pages || []).flatMap((p: any) => p?.posts || []);
    if (isOcultoOnly) {
      live = live.filter((p: any) => p?.is_adult !== true);
    }
    // Dedupe global por id + ordenação determinística por created_at desc.
    // Garante que prepend otimista + refetch não criem itens duplicados,
    // e que novos posts cheguem sempre na posição correta sem reload.
    if (live.length) {
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const p of live) {
        if (!p?.id || seen.has(p.id)) continue;
        seen.add(p.id);
        deduped.push(p);
      }
      deduped.sort((a, b) => {
        const ta = new Date(a?.created_at || 0).getTime();
        const tb = new Date(b?.created_at || 0).getTime();
        return tb - ta;
      });
      return deduped;
    }
    return isAdultOnly ? [] : cachedFeedFallback;
  }, [infiniteData, cachedFeedFallback, isAdultOnly, isOcultoOnly]);

  // Se uma página do banco vier cheia, mas todos os itens forem descartados por
  // filtros de tipo/visibilidade/modo (+18), não podemos mostrar "Nenhum post".
  // Carrega páginas seguintes automaticamente até encontrar posts exibíveis,
  // mantendo mobile e desktop com a mesma fonte/ordem do infinite feed.
  const emptyPageAutofillRef = useRef({ key: '', attempts: 0 });
  const feedAutofillKey = `${isAdultOnly ? 'adult' : isOcultoOnly ? 'oculto' : 'complete'}:${activeTab}:${user?.id ?? 'anon'}`;
  useEffect(() => {
    if (emptyPageAutofillRef.current.key !== feedAutofillKey) {
      emptyPageAutofillRef.current = { key: feedAutofillKey, attempts: 0 };
    }
    if (isLoading || isFetchingNextPage || postsFiltered.length > 0 || !hasNextPage) return;
    if (emptyPageAutofillRef.current.attempts >= 12) return;
    emptyPageAutofillRef.current.attempts += 1;
    void fetchNextPage();
  }, [feedAutofillKey, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, postsFiltered.length]);

  const isFillingFilteredEmptyFeed = postsFiltered.length === 0 && (hasNextPage || isFetchingNextPage);
  useEffect(() => {
    const live = (infiniteData?.pages || []).flatMap((p: any) => p?.posts || []);
    if (live.length && !isAdultOnly) {
      useFeedCacheStore.getState().setPosts(live, user?.id || null);
    }
  }, [infiniteData, user?.id, isAdultOnly]);
  const openSidebarSearch = useCallback(() => {
    navigate('/pesquisar');
  }, [navigate]);

  // ── Aura IA on-demand ──────────────────────────────────────────────
  // Abre o modal diretamente, sem depender da montagem/flag do bloco de retenção.
  const [auraOpen, setAuraOpen] = useState(false);
  const toggleAura = useCallback(() => {
    setAuraOpen((prev) => !prev);
  }, []);
  const closeAura = useCallback(() => setAuraOpen(false), []);

  const handleOpenExpandedPost = useCallback((post: any) => {
    setExpandedPost(post);
  }, []);

  const handleExpandedOpenChange = useCallback((open: boolean) => {
    if (!open) setExpandedPost(null);
  }, []);

  // Permite que outros componentes (ex.: FeedTabs, Sidebar, menu mobile)
  // abram o modal Aura IA via evento global ou /feed?openAura=1.
  useEffect(() => {
    const open = () => {
      setAuraOpen(true);
    };
    const toggle = () => setAuraOpen((p) => !p);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('openAura') === '1') {
        setAuraOpen(true);
        url.searchParams.delete('openAura');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch { /* noop */ }
    window.addEventListener('oculto:open-aura', open as EventListener);
    window.addEventListener('oculto:open-aura-central', open as EventListener);
    window.addEventListener('oculto:toggle-aura', toggle as EventListener);
    return () => {
      window.removeEventListener('oculto:open-aura', open as EventListener);
      window.removeEventListener('oculto:open-aura-central', open as EventListener);
      window.removeEventListener('oculto:toggle-aura', toggle as EventListener);
    };
  }, []);

  const auraModalMount = auraOpen ? (
    <ErrorBoundary fallback={<></>}>
      <Suspense fallback={null}>
        <CentralAuraModal open={auraOpen} onClose={closeAura} />
      </Suspense>
    </ErrorBoundary>
  ) : null;

  // Rede de segurança: garante envio da mensagem de boas-vindas no 1º acesso ao feed.
  useEnsureWelcomeMessage();
  const { enabled: fabEnabled } = useFabEnabled();
  const { data: followingIds } = useFollowingIds({ enabled: auxiliaryDataReady });
  const { data: marketplaceEnabled } = useMarketplaceAdsEnabled({ enabled: auxiliaryDataReady });
  const { data: marketplaceAds, isLoading: marketplaceLoading } = useActiveMarketplaceAds({ enabled: auxiliaryDataReady });
  const vipAccess = useMyVipAccess({ enabled: auxiliaryDataReady });

  // A view `v_feed_posts` oculta posts VIP de não-donos; por isso buscamos
  // os posts dos criadores assinados diretamente da tabela `posts` para
  // popular a aba "Meu Conteúdo VIP".
  const subscribedUserIdsArr = useMemo(
    () => Array.from(vipAccess.subscribedCreatorUserIds || []),
    [vipAccess.subscribedCreatorUserIds]
  );
  const subscribedProfileIdsArr = useMemo(
    () => Array.from(vipAccess.subscribedCreatorProfileIds || []),
    [vipAccess.subscribedCreatorProfileIds]
  );
  const {
    data: subscribedVipPosts = [],
    refetch: refetchVipPosts,
    isRefetching: isRefetchingVipPosts,
    fetchNextPage: fetchNextVipPage,
    hasNextPage: hasNextVipPage,
    isFetchingNextPage: isFetchingNextVipPage,
  } = useSubscribedVipPosts({
    subscribedUserIds: subscribedUserIdsArr,
    subscribedProfileIds: subscribedProfileIdsArr,
    explicitPostIds: Array.from(vipAccess.purchasedPostIds || []),
    enabled:
      auxiliaryDataReady &&
      activeTab === 'vip' &&
      (subscribedUserIdsArr.length > 0 || subscribedProfileIdsArr.length > 0 || vipAccess.purchasedPostIds.size > 0),
  });

  const handleRefreshVipTab = useCallback(async () => {
    try {
      await refetchVipPosts();
      toast.success('Conteúdo VIP atualizado');
    } catch {
      toast.error('Não foi possível atualizar agora');
    }
  }, [refetchVipPosts]);

  // Filtrar posts baseado na aba ativa
  const filteredPosts = useMemo(() => {
    if (!postsFiltered) return [];

    const sortPinnedPostsFirst = (items: any[]) =>
      items.slice().sort((a: any, b: any) => {
        const ap = a?.is_pinned ? 1 : 0;
        const bp = b?.is_pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;

        const pinnedAtA = a?.pinned_at ? new Date(a.pinned_at).getTime() : 0;
        const pinnedAtB = b?.pinned_at ? new Date(b.pinned_at).getTime() : 0;
        if (pinnedAtA !== pinnedAtB) return pinnedAtB - pinnedAtA;

        const createdAtA = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const createdAtB = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return createdAtB - createdAtA;
      });

    const hasVipSubscriptionForPost = (post: any) => {
      const ownerIds = [post?.user_id, post?.author_id, post?.creator_id].filter(Boolean);
      return ownerIds.some(
        (id) => vipAccess.subscribedCreatorUserIds.has(id) || vipAccess.subscribedCreatorProfileIds.has(id)
      );
    };

    const followingSet = new Set(followingIds ?? []);

    const NARRATIVE_SECTIONS = new Set(['story','chapter','diary','article','series','text_post','backstage','narrative']);
    const isNarrativePost = (post: any) =>
      post?.content_format === 'narrative' ||
      (post?.section_type && NARRATIVE_SECTIONS.has(String(post.section_type).toLowerCase()));

    const visiblePosts = postsFiltered.filter((post: any) => {
      if (post?.is_hidden === true || post?.privacy_level === 'hidden') return false;

      // Modo "Apenas +18": mostra somente publicações criadas com a chave
      // Conteúdo +18 ligada (posts.is_adult=true). Conteúdo legado/nulo e
      // embeds do OCULTO PLAY ficam só no modo completo.
      if (isAdultOnly) {
        // STRICT: só publicações criadas com o botão +18 ATIVO (is_adult=true).
        // Posts legados/null e não-adultos ficam fora.
        if (post?.is_adult !== true) return false;
        // Stories (is_flash) nunca aparecem como post no feed.
        if ((post as any)?.is_flash === true) return false;
        // Compartilhamentos do OCULTO PLAY só na experiência completa.
        if ((post as any)?.oculto_play_item_id) return false;
      }

      // A view do backend já devolve apenas o que pode aparecer no feed do
      // usuário. O frontend não deve reaplicar filtros de friends/VIP/pago aqui,
      // pois isso escondia cards válidos em “Experiência completa”. Paywall/blur
      // continuam sendo tratados no próprio card.
      return true;
    });

    switch (activeTab) {
      case 'following':
        if (!followingIds || followingIds.length === 0) return [];
        return sortPinnedPostsFirst(visiblePosts.filter(post => followingSet.has(post.user_id) || followingSet.has((post as any).author_id)));

      case 'vip': {
        // 1) Posts VIP que já vieram no feed (raros — view oculta a maioria)
        const fromFeed = visiblePosts.filter((post: any) => {
          const isVipPost =
            post?.privacy_level === 'vip' ||
            post?.privacy_level === 'subscribers' ||
            post?.is_paid === true ||
            isNarrativePost(post);
          if (!isVipPost) return false;
          const purchased = vipAccess.purchasedPostIds.has(post.id);
          const subscribed = hasVipSubscriptionForPost(post);
          const ownNarrativeFromSubscribedCreator = isNarrativePost(post) && subscribed;
          return purchased || subscribed || ownNarrativeFromSubscribedCreator;
        });
        // 2) Mescla com os posts buscados diretamente dos criadores assinados.
        const seen = new Set(fromFeed.map((p: any) => p.id));
        const extras = (subscribedVipPosts as any[]).filter((p) => !seen.has(p.id));
        return sortPinnedPostsFirst([...fromFeed, ...extras]);
      }

      case 'card':
      case 'foryou':
      default:
        return sortPinnedPostsFirst(visiblePosts);
    }
  }, [postsFiltered, activeTab, followingIds, vipAccess.purchasedPostIds, vipAccess.subscribedCreatorUserIds, vipAccess.subscribedCreatorProfileIds, user?.id, subscribedVipPosts, isAdultOnly]);

  const activeExpandedPost = useMemo(() => {
    if (!expandedPost?.id) return null;
    return filteredPosts.find((p: any) => p?.id === expandedPost.id) || expandedPost;
  }, [expandedPost, filteredPosts]);


  // Scroll até post + foco em comments/saved/likes vindo de notificações.
  // Se o post-alvo não estiver nas páginas carregadas, tentamos carregar
  // mais páginas (até 5x) antes de desistir, para garantir visualização.
  const scrollAttemptsRef = useRef(0);
  useEffect(() => {
    const routerState = location.state as { scrollToPost?: string; focus?: 'comments' | 'saved' | 'likes' | 'shares' } | null;
    // Fallback persistente em sessionStorage (sobrevive a perda de state do router).
    let targetId = routerState?.scrollToPost;
    let targetFocus = routerState?.focus;
    if (!targetId) {
      // Lazy import para não inflar o bundle inicial.
      // Síncrono via require dinâmico não é ideal; usamos getter direto.
      try {
        const hint = peekScrollToPost();
        if (hint?.postId) {
          targetId = hint.postId;
          targetFocus = hint.focus;
        }
      } catch {}
    }
    if (!targetId) return;

    // Garante que estamos na aba "Para você" — outras abas filtram posts.
    if (activeTab !== 'foryou') {
      setActiveTab('foryou');
      return;
    }

    if (!filteredPosts.length) return;

    const idx = filteredPosts.findIndex((p: any) => p.id === targetId);

    // Não encontrado: pede a próxima página e tenta de novo (máx 5 tentativas).
    if (idx < 0) {
      if (hasNextPage && !isFetchingNextPage && scrollAttemptsRef.current < 5) {
        scrollAttemptsRef.current += 1;
        fetchNextPage();
      } else if (scrollAttemptsRef.current >= 5 || !hasNextPage) {
        // Limpa state/hint para evitar loop
        navigate(location.pathname, { replace: true, state: null });
        try { consumeScrollToPost(); } catch {}
        scrollAttemptsRef.current = 0;
      }
      return;
    }

    // Encontrado — limpa state/hint e rola até ele
    scrollAttemptsRef.current = 0;
    navigate(location.pathname, { replace: true, state: null });
    try { consumeScrollToPost(); } catch {}

    virtuosoRef.current?.scrollToIndex({ index: idx, align: 'start', behavior: 'smooth' });

    // Após o scroll, dispara highlight + foco em seção (comments/saved/likes)
    window.setTimeout(() => {
      const el = document.getElementById(`post-${targetId}`);
      if (!el) return;
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
      }, 2400);

      if (targetFocus) {
        window.dispatchEvent(new CustomEvent('post:focus', {
          detail: { postId: targetId, focus: targetFocus }
        }));
      }
    }, 600);
  }, [filteredPosts, location, navigate, activeTab, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    console.log('[FeedDebug] PullToRefresh started');
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
      console.log('[FeedDebug] PullToRefresh finished');
    }
  }, [refetch, isRefreshing]);


  // Prefetch antecipado em idle: assim que a 1ª página chega e o usuário
  // ainda não rolou, pré-carrega a próxima para que o scroll infinito não
  // tenha "salto" no primeiro endReached. Custa 1 request extra por sessão
  // e só roda quando o navegador estiver ocioso (não compete com paint).
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    if (!filteredPosts.length || !hasNextPage || isFetchingNextPage) return;
    prefetchedRef.current = true;
    const idle = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 1200));
    const cancel = (window as any).cancelIdleCallback || clearTimeout;
    const handle = idle(() => {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { timeout: 3000 });
    return () => cancel(handle);
  }, [filteredPosts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const prefetchMediaWindow = useCallback((start: number, end: number) => {
    const lookahead = filteredPosts.slice(Math.max(0, start), Math.min(filteredPosts.length, end + 8));
    for (const p of lookahead) {
      const snap = parseCommunityTopicSnapshot(p?.content_text);
      if (snap) {
        const url = snap.first_media_cover_url || snap.first_media_url || snap.community_cover_url || snap.community_avatar_url;
        if (url) prefetchFeedMedia(url, snap.first_media_kind === 'video' ? 'video' : 'image');
        continue;
      }
      const media = p?.media_url || (Array.isArray(p?.media_urls) ? p.media_urls[0] : null) || p?.preview_url;
      const thumb = p?.thumbnail_url || p?.preview_url;
      if (thumb) prefetchFeedMedia(thumb, 'image');
      if (media) prefetchFeedMedia(media, isVideoUrl(media) ? 'video' : 'image');
    }
  }, [filteredPosts]);

  useEffect(() => {
    if (!filteredPosts.length) return;
    prefetchMediaWindow(0, Math.min(filteredPosts.length - 1, 5));
  }, [filteredPosts.length, prefetchMediaWindow]);

  const handleFeedEndReached = useCallback(() => {
    if (isFeedOverlayOpen()) return;
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleFeedRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    prefetchMediaWindow(range.startIndex, range.endIndex);
    const lookahead = dataSaver ? 10 : 8;
    if (
      !isFeedOverlayOpen() &&
      hasNextPage &&
      !isFetchingNextPage &&
      filteredPosts.length > 0 &&
      range.endIndex >= filteredPosts.length - lookahead
    ) {
      fetchNextPage();
    }
  }, [prefetchMediaWindow, dataSaver, hasNextPage, isFetchingNextPage, filteredPosts.length, fetchNextPage]);



  const handleSubscribe = useCallback(() => {
    setShowSubscribeModal(true);
  }, []);

  // ── Footer memoizado para o Virtuoso ───────────────────────────────────────
  // CRÍTICO de performance: se o objeto `components` (ou o `Footer`) for
  // recriado a cada render, o Virtuoso desmonta/remonta o Footer continuamente
  // (visto no replay como o bloco "Atualizar feed / Carregar mais" piscando
  // a cada ~1s). Isso quebra a sensação de carregamento e parece travamento.
  const FeedFooter = useMemo(() => {
    const Footer = () => (
      <div className="px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:pb-6">
        {hasNextPage ? (
          <div className="py-6 flex flex-col items-center gap-3">
            {isFetchingNextPage ? (
              <>
                <Skeleton className="h-32 w-full rounded-lg" />
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Carregando mais publicações…
                </p>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => fetchNextPage()}>
                  Carregar mais
                </Button>
                <p className="text-[10px] text-muted-foreground">Página {pagesLoaded}</p>
              </>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleHardRefresh}
                disabled={isHardRefreshing}
                className="text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isHardRefreshing ? 'animate-spin' : ''}`} />
                Atualizar feed
              </Button>
            </div>
          </div>
        ) : (
          <Card className="overflow-hidden border-dashed">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                Você chegou ao fim 🎉
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                Não há mais publicações para exibir agora. Volte mais tarde, ou altere seu filtro do feed.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 text-white font-bold shadow-lg shadow-pink-500/30 hover:opacity-95 hover:shadow-pink-500/40 transition-all"
                  onClick={() => setShowFeedFilterModal(true)}
                >
                  <SlidersHorizontal className="h-5 w-5" />
                  Alterar filtros
                </Button>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-primary to-secondary text-primary-foreground font-semibold shadow-lg hover:opacity-90"
                  onClick={() => setShowCreateModal(true)}
                >
                  <PlusCircle className="h-5 w-5" />
                  Criar Postagem
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="font-semibold"
                  onClick={() => {
                    virtuosoRef.current?.scrollToIndex({ index: 0, align: "start", behavior: "smooth" });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <ArrowUp className="h-5 w-5" />
                  Voltar ao Início
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!user && (
          <Card className="gradient-border overflow-hidden mt-6">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto mb-6">
                <Crown className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                Você viu tudo por agora! 🎉
              </h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Assine o Premium para rolar sem limites e desbloquear todo o conteúdo exclusivo.
              </p>
              <Button
                onClick={handleSubscribe}
                className="glow-primary bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold px-8 h-12"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Assinar Premium
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
    return Footer;
  }, [
    hasNextPage,
    isFetchingNextPage,
    pagesLoaded,
    isHardRefreshing,
    handleHardRefresh,
    handleSubscribe,
    fetchNextPage,
    user,
  ]);

  const virtuosoComponents = useMemo(() => ({ Footer: FeedFooter }), [FeedFooter]);
  const renderFeedItem = useCallback((index: number, post: any) => (
    <div className="px-4 pb-6">
      <ErrorBoundary fallback={<div className="h-2" />}>
        <FeedItem
          post={post}
          index={index}
          totalPosts={filteredPosts.length}
          onSubscribe={handleSubscribe}
          marketplaceAds={marketplaceAds || EMPTY_MARKETPLACE_ADS}
          marketplaceLoading={marketplaceLoading}
          showMarketplace={!!marketplaceEnabled && !isAdultOnly}
          activeTab={activeTab}
          suggestionsReady={suggestionsReady}
          showAuctions={sectionEnabledForMode('auctions')}
          showMisterios={sectionEnabledForMode('mysterious_discovery')}
          showHiddenRoomsInline={sectionEnabledForMode('hidden_rooms') && !isAdultOnly}
          isAdultOnly={isAdultOnly}
          isOcultoOnly={isOcultoOnly}
          safeBlurOn={safeBlurOn}
          onOpenExpandedPost={handleOpenExpandedPost}
        />
      </ErrorBoundary>
    </div>
  ), [
    filteredPosts.length,
    handleSubscribe,
    marketplaceAds,
    marketplaceLoading,
    marketplaceEnabled,
    activeTab,
    suggestionsReady,
    sectionEnabledForMode,
    isAdultOnly,
    isOcultoOnly,
    safeBlurOn,
    handleOpenExpandedPost,
  ]);

  const topActionButtons = (
    <div className="sticky top-0 z-[70] flex justify-center sm:justify-end items-center gap-2 px-2 pt-2 pb-1 flex-wrap bg-background/95 backdrop-blur-md border-b border-border/20 shadow-sm">
      <FeedSyncStatusChip className="hidden sm:flex" />
      
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFeedFilterModal(true)}
              className="h-10 sm:h-8 w-10 sm:w-auto sm:min-w-0 gap-1 px-0 sm:px-2 text-[11px] font-bold touch-manipulation bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 text-white border border-pink-500/60 shadow-sm hover:brightness-110 hover:text-white transition"
              aria-label="Alterar filtro de gênero do feed"
            >
              <SlidersHorizontal className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Filtro</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Alterar filtro do feed</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={openSidebarSearch}
              className="h-10 sm:h-8 w-10 sm:w-auto sm:min-w-0 gap-1 px-0 sm:px-2 text-[11px] font-bold touch-manipulation bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500 text-white border border-indigo-500/60 shadow-sm hover:brightness-110 hover:text-white transition"
              aria-label="Abrir página de pesquisa"
            >
              <Search className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Pesquisar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Abrir a página de pesquisa</TooltipContent>
        </Tooltip>


        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative inline-flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFeedContentTypeModal(true)}
                className="h-10 sm:h-8 w-10 sm:w-auto sm:min-w-0 gap-1 px-0 sm:px-2 text-[11px] font-bold touch-manipulation bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-black border border-amber-500/80 shadow-sm hover:brightness-110 hover:text-black transition"
                aria-label="Escolher tipo de conteúdo do feed (+18 ou completa)"
              >
                <Flame className="h-5 w-5 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} />
                <span className="hidden sm:inline">Conteúdo</span>
              </Button>
              <FeedExperienceModeIndicator onOpenSelector={() => setShowFeedContentTypeModal(true)} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px] text-xs leading-snug text-center">
            Tipo de conteúdo no feed — o ponto colorido mostra o modo ativo (âmbar = Apenas +18, fúcsia = Experiência completa).
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAura}
              aria-pressed={auraOpen}
              aria-label={auraOpen ? 'Recolher Aura IA' : 'Abrir Aura IA'}
              className={[
                'relative h-12 sm:h-11 w-12 sm:w-auto sm:min-w-0 gap-1.5 px-0 sm:px-5 text-xs sm:text-[13px] font-extrabold touch-manipulation',
                'bg-[linear-gradient(115deg,#ff1aa8_0%,#d946ef_28%,#a855f7_55%,#22d3ee_100%)] text-white',
                'border-2 border-white/70',
                'shadow-[0_0_22px_rgba(217,70,239,1),0_0_44px_rgba(168,85,247,0.75),0_0_60px_rgba(34,211,238,0.55)]',
                'ring-2 ring-fuchsia-300/80 ring-offset-2 ring-offset-background',
                'hover:brightness-125 hover:text-white transition-all',
                auraOpen ? 'ring-cyan-300 brightness-110' : '',
              ].join(' ')}
            >
              <BrainCircuit className="h-6 w-6 sm:h-5 sm:w-5 drop-shadow-[0_0_8px_rgba(255,255,255,1)]" strokeWidth={2.6} />
              <span className="hidden sm:inline tracking-wider drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]">Aura IA</span>
              <span aria-hidden className="pointer-events-none absolute -inset-[4px] rounded-md ring-2 ring-fuchsia-400/70 blur-[5px] opacity-75" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px] text-xs leading-snug text-center">
            Abrir Aura IA — painel inteligente com sinais, oportunidades e missões.
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'auto' : 'light';
                setThemeMode(next);
              }}
              className="h-10 sm:h-8 w-10 sm:w-auto sm:min-w-0 gap-1 px-0 sm:px-2 text-[11px] font-bold touch-manipulation bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white border border-orange-500/60 shadow-sm hover:brightness-110 hover:text-white transition"
              aria-label={`Alternar tema (atual: ${themeMode === 'light' ? 'Claro' : themeMode === 'dark' ? 'Escuro' : 'Auto'})`}
            >
              {themeMode === 'light' ? <Sun className="h-5 w-5 sm:h-3.5 sm:w-3.5" /> : themeMode === 'dark' ? <Moon className="h-5 w-5 sm:h-3.5 sm:w-3.5" /> : <MonitorSmartphone className="h-5 w-5 sm:h-3.5 sm:w-3.5" />}
              <span className="hidden sm:inline">{themeMode === 'light' ? 'Claro' : themeMode === 'dark' ? 'Escuro' : 'Auto'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Alternar tema</TooltipContent>
        </Tooltip>

        {/*
          IMPORTANTE: Sem Tooltip aqui. Em mobile (iOS/Android) o Radix Tooltip
          intercepta o primeiro toque para abrir o balão e o clique do botão
          não dispara — o blur não ligava/desligava. Mantemos title nativo +
          aria-label para acessibilidade. Também removemos o lock `disabled`
          durante o "pending" — toggles rápidos agora são sempre respondidos.
        */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = !safeBlurOn;
            // Feedback visual breve (não bloqueia novos cliques).
            setSafeBlurPending(true);
            void toggleSafeBlur();
            toast.success(next ? '🔒 Blur Seguro ativado' : '👁 Blur Seguro desativado', {
              description: next
                ? 'Cobrindo postagens +18 com animação suave.'
                : 'Revelando postagens +18 sem recarregar o feed.',
              duration: 1800,
            });
            if (safeBlurPendingTimer.current) window.clearTimeout(safeBlurPendingTimer.current);
            safeBlurPendingTimer.current = window.setTimeout(() => setSafeBlurPending(false), 350);
          }}
          className={cn(
            "h-10 sm:h-8 w-10 sm:w-auto sm:min-w-0 gap-1 px-0 sm:px-2 text-[11px] font-bold touch-manipulation bg-gradient-to-r from-slate-700 via-zinc-700 to-stone-800 text-white border border-zinc-600/60 shadow-sm hover:brightness-110 hover:text-white transition-all duration-300 active:scale-95",
            safeBlurPending && "opacity-90",
            safeBlurOn ? "ring-1 ring-rose-400/40" : "ring-1 ring-emerald-400/30",
          )}
          aria-label={safeBlurOn ? 'Desligar Modo Blur Seguro (mostrar +18)' : 'Ligar Modo Blur Seguro (cobrir +18)'}
          aria-pressed={safeBlurOn}
          title={safeBlurOn
            ? 'Modo Blur Seguro LIGADO — toque para revelar postagens +18'
            : 'Modo Blur Seguro DESLIGADO — toque para cobrir postagens +18'}
        >
          <span key={safeBlurOn ? 'on' : 'off'} className="inline-flex items-center gap-1 animate-scale-in pointer-events-none">
            {safeBlurPending ? (
              <Loader2 className="h-5 w-5 sm:h-3.5 sm:w-3.5 animate-spin" />
            ) : safeBlurOn ? (
              <EyeOff className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            ) : (
              <Eye className="h-5 w-5 sm:h-3.5 sm:w-3.5" />
            )}
            <span className="hidden sm:inline">
              {safeBlurOn ? 'Blur' : 'Aberto'}
            </span>
          </span>
        </Button>
      </TooltipProvider>

      <FeedModeSelector />
      <FeedContentTypeModal open={showFeedContentTypeModal} onOpenChange={setShowFeedContentTypeModal} />
    </div>
  );

  // Loading state
  if (((isLoading && postsFiltered.length === 0) || isFillingFilteredEmptyFeed) && !skeletonTimedOut) {
    return (
      <div className="flex flex-col">
        {topActionButtons}
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} onCreatePost={() => setShowCreateModal(true)} onScrollTop={() => { virtuosoRef.current?.scrollToIndex({ index: 0, align: "start", behavior: "smooth" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        {auraModalMount}
        {feedModeShows('vipCreators') && showHeavyCarousels && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <VipCreatorsCarousel />
            </Suspense>
          </ErrorBoundary>
        )}
        {feedModeShows('hiddenRooms') && showHeavyCarousels && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <HiddenRoomsCarousel />
            </Suspense>
          </ErrorBoundary>
        )}
        <div className="space-y-6 p-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4 mb-4" />
                <Skeleton className="h-64 w-full rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col">
        {topActionButtons}
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} onCreatePost={() => setShowCreateModal(true)} onScrollTop={() => { virtuosoRef.current?.scrollToIndex({ index: 0, align: "start", behavior: "smooth" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        {auraModalMount}
        {feedModeShows('vipCreators') && showHeavyCarousels && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <VipCreatorsCarousel />
            </Suspense>
          </ErrorBoundary>
        )}
        {feedModeShows('hiddenRooms') && showHeavyCarousels && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <HiddenRoomsCarousel />
            </Suspense>
          </ErrorBoundary>
        )}
        <div className="p-4">
          <Card className="overflow-hidden">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground mb-4">
                Erro ao carregar posts. Tente novamente.
              </p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Empty state — preserva Stories + Sugestões mesmo sem posts
  const shouldShowGlobalEmptyState = (!postsFiltered || postsFiltered.length === 0) && !isFillingFilteredEmptyFeed && !(
    activeTab === 'vip' && (vipAccess.isLoading || vipAccess.hasAnyAccess || subscribedVipPosts.length > 0)
  );

  if (shouldShowGlobalEmptyState) {
    return (
      <div className="flex flex-col">
        {topActionButtons}
        <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} onCreatePost={() => setShowCreateModal(true)} onScrollTop={() => { virtuosoRef.current?.scrollToIndex({ index: 0, align: "start", behavior: "smooth" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        <ErrorBoundary>
          <Suspense fallback={null}>
            <div className="mb-4" style={{ contain: 'layout style', minHeight: '130px' }}>
              <NovidadesDoOcultoCarousel />
            </div>
          </Suspense>
        </ErrorBoundary>
        {!isAdultOnly && storiesReady && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <FlashStoriesBar />
            </Suspense>
          </ErrorBoundary>
        )}
        {activeTab !== 'vip' && (
          <ErrorBoundary>
            <Suspense fallback={<div className="px-3 pt-2 pb-3"><div className="h-[150px] rounded-xl bg-muted/40 animate-pulse" /></div>}>
              <NewMembersStrip />
            </Suspense>
          </ErrorBoundary>
        )}
        {!isAdultOnly && sidebarWidgetsReady && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <RecentMatchesWidget />
            </Suspense>
          </ErrorBoundary>
        )}
        {sidebarWidgetsReady && feedModeShows('communitiesTrending') && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <MyCommunitiesFeedStrip />
            </Suspense>
          </ErrorBoundary>
        )}
        {sidebarWidgetsReady && feedModeShows('communitiesTrending') && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <CommunityTrendingWidget />
            </Suspense>
          </ErrorBoundary>
        )}
        {auraModalMount}

        {feedModeShows('vipCreators') && showHeavyCarousels && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <VipCreatorsCarousel />
            </Suspense>
          </ErrorBoundary>
        )}
        {feedModeShows('hiddenRooms') && showHeavyCarousels && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <HiddenRoomsCarousel />
            </Suspense>
          </ErrorBoundary>
        )}
        <div className="p-4 space-y-4">
          <Card className="overflow-hidden">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhum post ainda
              </h3>
              <p className="text-muted-foreground">
                Seja o primeiro a criar conteúdo!
              </p>
            </CardContent>
          </Card>
          {suggestionsReady && !isOcultoOnly && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <SuggestedUsersCarousel />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
        {fabEnabled && (
          <FloatingActionButton onClick={() => user ? setShowCreateModal(true) : (window.location.href = '/auth')} />
        )}
        {showCreateModal && (
          <Suspense fallback={null}>
            <CreatePostModal open={showCreateModal} onOpenChange={setShowCreateModal} />
          </Suspense>
        )}
        <FeedContentTypeModal open={showFeedContentTypeModal} onOpenChange={setShowFeedContentTypeModal} />
        {isHardRefreshing && (
          <div className="fixed inset-0 z-[60] bg-background/20 backdrop-blur-[2px] pointer-events-none flex items-center justify-center">
            <div className="bg-background/80 border rounded-full px-4 py-2 shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Sincronizando feed...
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sincronizando feed (overlay visual opcional)
  const isRefreshingSync = isHardRefreshing;

  // Empty state para abas específicas
  const emptyTabContent = (() => {
    if (activeTab === 'following' && filteredPosts.length === 0) {
      return (
        <Card className="overflow-hidden mx-4 mt-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhum post de quem você segue
            </h3>
            <p className="text-muted-foreground">
              Comece a seguir criadores para ver seus posts aqui!
            </p>
          </CardContent>
        </Card>
      );
    }
    if (activeTab === 'vip' && vipAccess.isLoading) {
      return (
        <Card className="overflow-hidden mx-4 mt-4 border-border/60">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-5 w-40 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5 mx-auto" />
            <Skeleton className="h-11 w-44 mx-auto" />
          </CardContent>
        </Card>
      );
    }
    if (activeTab === 'vip' && filteredPosts.length === 0) {
      return (
        <Card className="overflow-hidden mx-4 mt-4 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-background to-fuchsia-500/10">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
              <Crown className="h-8 w-8 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">
              Você está perdendo o melhor conteúdo Adulto +18 da plataforma
            </h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              Adquira algum conteúdo individual ou assine Canais VIP agora para desbloquear vídeos, fotos e lives exclusivos dos criadores.
            </p>
            <Button
              size="lg"
              onClick={() => navigate('/vitrine-vip')}
              className="bg-gradient-to-r from-amber-500 to-fuchsia-600 text-white font-semibold shadow-lg hover:opacity-90"
            >
              <Crown className="h-5 w-5" />
              Ir para a Vitrine VIP
            </Button>
          </CardContent>
        </Card>
      );
    }
    return null;
  })();

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <FeedModeSyncIndicator />
      <div className="flex flex-col gap-2 p-3">
        {topActionButtons}
        <div className="flex items-center justify-between">
          <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
          <FeedSyncStatusChip />
        </div>
        {isDebugEnabled && (
          <div className="flex flex-col gap-1 items-start">
            {showRenderWarning && (
              <Alert variant="destructive" className="py-1 px-3 w-auto bg-amber-500/10 border-amber-500/30 text-amber-500 animate-pulse">
                <AlertTriangle className="h-3 w-3 mr-2" />
                <AlertDescription className="text-[10px] font-bold uppercase">Re-render inesperado</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-mono">
              <Info className="h-2.5 w-2.5" />
              <span>DEBUG: Monitoring v18.5 Active</span>
            </div>
          </div>
        )}
      </div>


      {auraModalMount}



      {/* Novidades do Oculto — carrossel acima dos Stories. */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <div className="mb-4" style={{ contain: 'layout style', minHeight: '130px' }}>
            <NovidadesDoOcultoCarousel />
          </div>
        </Suspense>
      </ErrorBoundary>

      {/* Flash Stories Bar — agora acima da sessão "Boas-vindas aos novos do OCULTO". */}
      {feedModeShows('stories') && storiesReady && !isAdultOnly && !isOcultoOnly && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <FlashStoriesBar />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Boas-vindas aos novos do OCULTO — sempre visível no Modo Simples,
          inclusive ao trocar entre as guias (Seguindo / Novidades / Meu VIP / Card). */}
      {(granularMode === 'simple' || feedModeShows('newMembers')) && (
        <ErrorBoundary>
          <Suspense fallback={<div className="px-3 pt-2 pb-3"><div className="h-[150px] rounded-xl bg-muted/40 animate-pulse" /></div>}>
            <NewMembersStrip />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Badge "Modo Economia" — visível só quando dataSaver está ativo */}
      <DataSaverBadge />

      {/* Universo Social — Noite Oculta ativa (se houver) */}
      {feedModeShows('noiteOculta') && socialStripsReady && !isOcultoOnly && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <div className="px-3 pt-2">
              <NoiteOcultaBanner />
            </div>
          </Suspense>
        </ErrorBoundary>
      )}


      {/* Feed Vivo — tira horizontal de eventos do universo (cap 8) */}
      {socialStripsReady && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <div className="px-3 pt-3 space-y-3">
              {/* === Início Inteligente (Retenção) === */}
              {feedModeShows('retentionBlock') && !isOcultoOnly && (
                <section
                  aria-label="Início Inteligente"
                  className="rounded-2xl border border-pink-500/20 bg-gradient-to-b from-pink-500/[0.06] to-transparent p-3 space-y-2.5"
                >
                  <div className="flex items-center gap-2 px-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-pulse" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-pink-200/85">
                      Início Inteligente
                    </span>
                  </div>
                  <AbandonReturnCard />
                  <SocialCycleBadge />
                  <RetentionMissionsStrip />
                </section>
              )}
              {feedModeShows('microTips') && <MicroTipsStrip />}
              {feedModeShows('earnByReferral') && <EarnByReferralCard />}
              {feedModeShows('affiliateCampaigns') && <AffiliateCampaignsStrip />}

              {feedModeShows('feedVivo') && <FeedVivoStrip />}
              {feedModeShows('presence') && <PresencePulseStrip />}
              {feedModeShows('caixaOculta') && <CaixaOcultaFeedStrip />}
              {feedModeShows('experienciasReais') && <ExperienciasReaisStrip />}
              {feedModeShows('sponsoredAds') && <SponsoredAdsCarousel />}
            </div>
          </Suspense>
        </ErrorBoundary>
      )}




      {/* Widget de Matches Ativos */}
      {feedModeShows('matches') && sidebarWidgetsReady && !isOcultoOnly && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <RecentMatchesWidget />
          </Suspense>
        </ErrorBoundary>
      )}

      {feedModeShows('discoveryUniverse') && showRequiredAdultSections && activeTab !== 'vip' && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <DiscoveryUniverseCarousel />
          </Suspense>
        </ErrorBoundary>
      )}

      {feedModeShows('shareLink') && activeTab !== 'vip' && !isOcultoOnly && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <div className="mb-3 px-3">
              <MyShareLinkCard />
            </div>
          </Suspense>
        </ErrorBoundary>
      )}

      {feedModeShows('vipCreators') && showHeavyCarousels && !isOcultoOnly && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <VipCreatorsCarousel />
          </Suspense>
        </ErrorBoundary>
      )}

      {feedModeShows('communitiesFeedCard') && showRequiredAdultSections && activeTab !== 'vip' && !isOcultoOnly && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            {/* Trocou de posição com Comunidades Ocultas — agora "Explorar
                novos misteriosos(as)" ocupa este slot fora do feed virtualizado.
                No modo +18, esta é a única sessão de descoberta mantida ativa;
                Comunidades Ocultas continuam bloqueadas pelo slot inline do FeedItem. */}
            <SuggestedUsersCarousel />
          </Suspense>
        </ErrorBoundary>
      )}


      {feedModeShows('events') && activeTab !== 'vip' && (
        <ErrorBoundary>
          <Suspense fallback={<div className="my-4 h-[60px]" aria-hidden />}>
            <EventsFeedStrip />
          </Suspense>
        </ErrorBoundary>
      )}

      {emptyTabContent}

      {/* ── Modo Card + aba VIP em cards: grid responsivo (2/3/4 colunas) ───── */}
      {(activeTab === 'card' || activeTab === 'vip') && filteredPosts.length > 0 && (
        <div className="px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] md:pb-6">
          {activeTab === 'vip' && (
            <div className="flex items-center justify-between gap-2 py-2 mb-1">
              <p className="text-xs text-muted-foreground">
                {filteredPosts.length} {filteredPosts.length === 1 ? 'item' : 'itens'} sincronizados com os canais VIP que você assina
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshVipTab}
                disabled={isRefetchingVipPosts}
                className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/10"
                aria-label="Atualizar Meu Conteúdo VIP"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefetchingVipPosts ? 'animate-spin' : ''}`} />
                {isRefetchingVipPosts ? 'Atualizando…' : 'Atualizar'}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filteredPosts.map((p: any) => {
              const isCommunityTopic =
                p?.post_type === 'community_topic' || !!parseCommunityTopicSnapshot(p?.content_text);
              return isCommunityTopic
                ? <div key={p.id} className="col-span-2 sm:col-span-3 lg:col-span-4"><CommunityTopicFeedCard post={p} /></div>
                : <FeedCardItem key={p.id} post={p} />;
            })}
          </div>

          {activeTab === 'vip' ? (
            hasNextVipPage && (
              <div className="py-6 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextVipPage()}
                  disabled={isFetchingNextVipPage}
                >
                  {isFetchingNextVipPage ? 'Carregando…' : 'Carregar conteúdos mais antigos'}
                </Button>
              </div>
            )
          ) : (
            hasNextPage && (
              <div className="py-6 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
                </Button>
              </div>
            )
          )}
        </div>
      )}

      {/* ── Feed Virtualizado ────────────────────────────────────────────
          Renderizado SEM gate por `length > 0` para evitar que o Virtuoso
          desmonte/remonte (perda de scroll + "pisca") em estados transientes
          de array vazio (revalidação, troca de aba, filtros). */}
      {activeTab !== 'card' && activeTab !== 'vip' && (

        <Virtuoso
          key={`feed-virtuoso-${activeTab}-${mounted ? 'm' : 'u'}`}
          ref={virtuosoRef}
          useWindowScroll
          data={filteredPosts}
          computeItemKey={(index, post: any) => post?.id ?? `post-${index}`}
          overscan={isOcultoOnly || dataSaver ? 2500 : 4000}
          increaseViewportBy={dataSaver ? { top: 500, bottom: 1000 } : { top: 1000, bottom: 2000 }}

          // Histerese de prefetch: dispara cedo para esconder a latência de rede.
          atBottomThreshold={dataSaver ? 2000 : 1500}
          endReached={handleFeedEndReached}
          rangeChanged={handleFeedRangeChanged}
          itemContent={renderFeedItem}
          components={virtuosoComponents}
          style={{ minHeight: '100vh', contain: 'none' }}
        />


      )}

      {activeExpandedPost && (
        <PostExpandedModal
          open={!!activeExpandedPost}
          onOpenChange={handleExpandedOpenChange}
          post={activeExpandedPost}
          isLiked={!!activeExpandedPost.is_liked}
          isDisliked={!!activeExpandedPost.is_disliked}
          isSaved={!!activeExpandedPost.is_saved}
        />
      )}

      <SubscriptionModal 
        open={showSubscribeModal} 
        onOpenChange={setShowSubscribeModal} 
      />

      {showVitrineModal && (
        <Suspense fallback={null}>
          <VitrinePlansModal open={showVitrineModal} onOpenChange={setShowVitrineModal} />
        </Suspense>
      )}

      {/* Floating Action Button para criar posts (mobile) */}
      {fabEnabled && (
        <FloatingActionButton onClick={() => user ? setShowCreateModal(true) : (window.location.href = '/auth')} />
      )}

      {/* Modal de criação de posts */}
      {showCreateModal && (
        <Suspense fallback={null}>
          <CreatePostModal
            open={showCreateModal}
            onOpenChange={setShowCreateModal}
          />
        </Suspense>
      )}

      {/* Modal de filtro de gênero do feed */}
      <FeedGenderFilterModal open={showFeedFilterModal} onOpenChange={setShowFeedFilterModal} />

      {/* Modal de limite de feed atingido */}
      <RateLimitReachedModal
        open={feedLimitOpen}
        onClose={() => setFeedLimitOpen(false)}
        feature="feed_view"
        reason={feedAccess.status?.reason as any}
        count={feedAccess.status?.count}
        limit={feedAccess.status?.limit}
        resetAt={feedAccess.status?.reset_at}
        plan={feedAccess.status?.plan}
      />
    </PullToRefresh>
  );
});
