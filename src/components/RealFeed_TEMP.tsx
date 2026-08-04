export const RealFeed = memo(function RealFeed() {
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
  const { safeBlurOn, toggleSafeBlur } = useSafeBlur();
  const [safeBlurPending, setSafeBlurPending] = useState(false);
  const safeBlurPendingTimer = useRef<number | null>(null);

  const queryClient = useQueryClient();

  const feedModeShows = useCallback(
    (key: string) => {
      if (granularMode === 'custom') {
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

  const sectionEnabledForMode = useCallback(
    (key: string) => {
      if (granularMode !== 'custom') {
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

  useEffect(() => {
    if (forcesCardLayout && activeTab !== 'card') setActiveTab('card');
    if (!forcesCardLayout && activeTab === 'card') setActiveTab('foryou');
  }, [forcesCardLayout]);

  useEffect(() => {
    const handler = () => setShowCreateModal(true);
    window.addEventListener('oculto:open-create-post', handler as EventListener);
    return () => window.removeEventListener('oculto:open-create-post', handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = () => {
      try {
        virtuosoRef.current?.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const sidebarWidgetsReady = useDeferredMount(0);
  const socialStripsReady = useDeferredMount(0);
  const storiesReady = useDeferredMount(0);
  const suggestionsReady = useDeferredMount(0);
  const auxiliaryDataReady = useDeferredMount(0);
  const heavyWidgetsReady = useDeferredMount(0);

  const { profile: perfProfile } = usePerformance();
  const dataSaver = perfProfile.dataSaver;
  const feedPageSize = FEED_PAGE_SIZE;
  const showHeavyCarousels = granularMode === 'custom' ? true : heavyWidgetsReady;
  const showRequiredAdultSections = !isAdultOnly && showHeavyCarousels;

  const feedAccess = useFeatureAccess('feed_view');
  const [feedLimitOpen, setFeedLimitOpen] = useState(false);
  useEffect(() => {
    if (!feedAccess.checking && !feedAccess.allowed) setFeedLimitOpen(true);
  }, [feedAccess.checking, feedAccess.allowed]);


  const {
    data: infiniteData,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage: rawHasNextPage,
    isFetchingNextPage,
  } = useInfinitePosts(feedPageSize, { explicitAdultOnly: isAdultOnly });

  const pagesLoaded = infiniteData?.pages?.length ?? 0;
  const hasNextPage = !!rawHasNextPage;

  const [skeletonTimedOut, setSkeletonTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) { setSkeletonTimedOut(false); return; }
    const t = window.setTimeout(() => setSkeletonTimedOut(true), 6000);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' });
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  }, [queryClient, isRefreshing]);

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
  const cachedFeedPosts = useFeedCacheStore((s) => s.posts);
  const cachedFeedOwner = useFeedCacheStore((s) => s.feedOwnerId);
  const cachedFeedUpdatedAt = useFeedCacheStore((s) => s.updatedAt);
  const cachedFeedFallback = useMemo(() => {
    if (!cachedFeedPosts?.length) return [] as any[];
    if (Date.now() - cachedFeedUpdatedAt > 24 * 60 * 60 * 1000) return [];
    if (user?.id && cachedFeedOwner && cachedFeedOwner !== user.id) return [];
    return cachedFeedPosts as any[];
  }, [cachedFeedPosts, cachedFeedUpdatedAt, cachedFeedOwner, user?.id]);
  
  const posts = useMemo(() => {
    let live = (infiniteData?.pages || []).flatMap((p: any) => p?.posts || []);
    if (isOcultoOnly) {
       live = live.filter(p => !p.is_adult);
    }
    return live.length > 0 ? live : cachedFeedFallback;
  }, [infiniteData?.pages, cachedFeedFallback, isOcultoOnly]);

  const allPosts = posts;
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const handleOpenExpandedPost = useCallback((post: any) => {
     setExpandedPost(post);
  }, []);

  const handleSubscribe = useCallback(() => {
     setShowSubscribeModal(true);
  }, []);

  if (isLoading && allPosts.length === 0 && !skeletonTimedOut) {
    return <div className="p-4 space-y-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
    </div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <FeedExperienceModeIndicator />
      <FeedModeSyncIndicator />
      <div className="flex-1 w-full max-w-2xl mx-auto">
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b">
          <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
        
        <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
          <Virtuoso
            ref={virtuosoRef}
            useWindowScroll
            data={allPosts}
            totalCount={allPosts.length}
            itemContent={(index, post) => (
              <FeedItem
                key={post.id}
                post={post}
                index={index}
                totalPosts={allPosts.length}
                onSubscribe={handleSubscribe}
                marketplaceAds={EMPTY_MARKETPLACE_ADS}
                marketplaceLoading={false}
                showMarketplace={false}
                activeTab={activeTab}
                suggestionsReady={suggestionsReady}
                showAuctions={sectionEnabledForMode('auctions')}
                showMisterios={sectionEnabledForMode('mysterious_discovery')}
                showHiddenRoomsInline={feedModeShows('hiddenRooms')}
                isAdultOnly={isAdultOnly}
                isOcultoOnly={isOcultoOnly}
                safeBlurOn={safeBlurOn}
                onOpenExpandedPost={handleOpenExpandedPost}
              />
            )}
            components={{
              Header: () => (
                <div className="space-y-4 pt-4 px-2">
                   {feedModeShows('stories') && <Suspense fallback={<Skeleton className="h-24 w-full" />}><FlashStoriesBar /></Suspense>}
                   <NovidadesDoOcultoCarousel />
                   {showRequiredAdultSections && feedModeShows('vipCreators') && <Suspense fallback={<Skeleton className="h-48 w-full" />}><VipCreatorsCarousel /></Suspense>}
                </div>
              ),
              Footer: () => (
                <div className="p-8 flex justify-center">
                  {hasNextPage ? (
                    <Button variant="ghost" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                      {isFetchingNextPage ? <Loader2 className="animate-spin" /> : "Carregar mais"}
                    </Button>
                  ) : (
                    <p className="text-muted-foreground text-sm">Você chegou ao fim do mistério.</p>
                  )}
                </div>
              )
            }}
          />
        </PullToRefresh>
      </div>

      <FloatingActionButton onClick={() => setShowCreateModal(true)} />
      
      <Suspense fallback={null}>
        {showCreateModal && <CreatePostModal open={showCreateModal} onOpenChange={setShowCreateModal} />}
        {showSubscribeModal && <SubscriptionModal open={showSubscribeModal} onOpenChange={setShowSubscribeModal} />}
        {showVitrineModal && <VitrinePlansModal open={showVitrineModal} onOpenChange={setShowVitrineModal} />}
        {expandedPost && <PostExpandedModal post={expandedPost} open={!!expandedPost} onOpenChange={() => setExpandedPost(null)} />}
        <FeedContentTypeModal open={showFeedContentTypeModal} onOpenChange={setShowFeedContentTypeModal} />
        <FeedGenderFilterModal open={showFeedFilterModal} onOpenChange={setShowFeedFilterModal} />
        <RateLimitReachedModal open={feedLimitOpen} onOpenChange={setFeedLimitOpen} feature="feed_view" />
      </Suspense>
    </div>
  );
});