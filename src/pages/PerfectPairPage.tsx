import { useState, useCallback, useRef, useEffect } from 'react';
import { usePerfectPair, type PairCard } from '@/hooks/usePerfectPair';
import { usePerfectPairDailyLimit } from '@/hooks/usePerfectPairDailyLimit';
import { Heart, X, RefreshCw, User, Star, Zap, Undo2, SlidersHorizontal, ChevronLeft, ChevronRight, Lock, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { PerfectPairMatchModal } from '@/components/perfect-pair/PerfectPairMatchModal';
import { PairSettingsModal } from '@/components/perfect-pair/PairSettingsModal';
import { PairMatchesList } from '@/components/perfect-pair/PairMatchesList';
import { PremiumUpgradeModal } from '@/components/PremiumUpgradeModal';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useProfile';
import { useAdminBypass } from '@/hooks/useAdminBypass';
import { useShowDebugPanels } from '@/hooks/useShowDebugPanels';
import { cn } from '@/lib/utils';
import { normalizePlanType } from '@/lib/planType';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion';
import { usePairMatches } from '@/hooks/usePairMatches';
import { toast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

function PerfectPairDebugPanel({
  debug,
  loading,
}: {
  debug: ReturnType<typeof usePerfectPair>['debug'];
  loading: boolean;
}) {
  return (
    <div className="w-full max-w-[340px] mt-4 rounded-lg border border-border/50 bg-card/70 backdrop-blur-sm">
      <Accordion type="single" collapsible>
        <AccordionItem value="perfect-pair-debug" className="border-b-0">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
            <div className="flex w-full items-center justify-between gap-3 pr-2">
              <span>Debug do Perfect Pair</span>
              <span className="text-[10px] font-medium text-muted-foreground">
                {loading ? 'carregando…' : `${debug.finalCount} cards`}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <DebugItem label="Auth user" value={debug.authUserId || '—'} />
              <DebugItem label="Perfil resolvido" value={debug.profileId || 'não'} />
              <DebugItem label="Configurado" value={debug.viewerConfigured ? 'sim' : 'não'} />
              <DebugItem label="Origem" value={debug.source} />
              <DebugItem label="RPC tentada" value={debug.rpcNameTried || '—'} />
              <DebugItem label="Settings por" value={debug.viewerSettingsResolvedBy || '—'} />
              <DebugItem label="Min idade" value={debug.minAge ?? '—'} />
              <DebugItem label="Max idade" value={debug.maxAge ?? '—'} />
              <DebugItem label="Distância" value={debug.maxDistanceKm ? `${debug.maxDistanceKm} km` : '—'} />
              <DebugItem label="Só verificados" value={debug.showOnlyVerified ? 'sim' : 'não'} />
              <DebugItem label="Brutos" value={debug.rawCount} />
              <DebugItem label="Excluídos" value={debug.excludedCount} />
              <DebugItem label="Ocultos/seed" value={debug.hiddenCount} />
              <DebugItem label="Sem mídia" value={debug.mediaLessCount} />
              <DebugItem label="Settings encontradas" value={debug.settingsRowsFound} />
              <DebugItem label="Final" value={debug.finalCount} />
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <DebugBlock label="Motivo / erro" value={debug.fetchError || debug.viewerReason || 'Nenhum'} />
              <DebugBlock label="Lookup pair_settings" value={debug.viewerSettingsLookupIds.length ? debug.viewerSettingsLookupIds.join(', ') : '—'} />
              <DebugBlock label="Interesses" value={debug.interestedIn.length ? debug.interestedIn.join(', ') : '—'} />
              <DebugBlock label="IDs finais" value={debug.finalIds.length ? debug.finalIds.join(', ') : '—'} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function DebugItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/60 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-foreground">{String(value)}</p>
    </div>
  );
}

function DebugBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/60 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-foreground/90">{value}</p>
    </div>
  );
}

const SWIPE_THRESHOLD = 100;
const SWIPE_UP_THRESHOLD = -80;
// Max cards rendered at once to save RAM on low-end devices
const MAX_VISIBLE_CARDS = 3;

function SwipeCard({
  card,
  isTop,
  onSwipe,
  superLikeActive,
  receivedSuperLike,
  viewerUsername,
  onDragStart,
  onDragEnd: onDragEndProp,
  locked = false,
  lockedInfo,
  onUpgrade,
}: {
  card: PairCard;
  isTop: boolean;
  onSwipe: (action: 'like' | 'dislike' | 'superlike') => void;
  superLikeActive?: boolean;
  receivedSuperLike?: boolean;
  viewerUsername?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  locked?: boolean;
  lockedInfo?: { used: number; limit: number; resetsAt: number | null };
  onUpgrade?: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
  const likeOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const skipOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const superLikeOpacity = useTransform(y, [SWIPE_UP_THRESHOLD, 0], [1, 0]);

  // Carousel state for photos
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = getCardPhotos(card);
  const totalPhotos = photos.length;

  const isVip = card.plan_type === 'vip';
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    // Notify parent drag ended (re-enable scroll)
    onDragEndProp?.();

    // Check swipe direction
    if (info.offset.y < SWIPE_UP_THRESHOLD && Math.abs(info.offset.x) < SWIPE_THRESHOLD) {
      onSwipe('superlike');
      return;
    }
    if (info.offset.x > SWIPE_THRESHOLD) {
      onSwipe('like');
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      onSwipe('dislike');
    } else {
      // Snap back to center if threshold not reached (prevents card from getting stuck)
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
      animate(y, 0, { type: 'spring', stiffness: 400, damping: 30 });
    }
  }, [onSwipe, onDragEndProp, x, y]);

  // Use framer-motion onTap which correctly fires only on taps, not drags
  const handleTap = useCallback((event: MouseEvent | TouchEvent | PointerEvent) => {
    if (totalPhotos <= 1) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    
    let clientX: number;
    if ('clientX' in event) {
      clientX = event.clientX;
    } else if ('touches' in event && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
    } else {
      return;
    }
    
    const relX = (clientX - rect.left) / rect.width;
    if (relX < 0.3) {
      setPhotoIndex(prev => (prev > 0 ? prev - 1 : totalPhotos - 1));
    } else {
      setPhotoIndex(prev => (prev < totalPhotos - 1 ? prev + 1 : 0));
    }
  }, [totalPhotos]);

  if (!isTop) {
    return (
      <motion.div
        className={cn(
          "absolute inset-0 rounded-2xl overflow-hidden border",
          receivedSuperLike
            ? "border-blue-400/70"
            : isVip ? "border-yellow-500/50" : "border-border/50"
        )}
        style={{ backgroundColor: 'hsl(var(--card))', contain: 'layout style paint' }}
        initial={{ scale: 0.92, opacity: 0.5 }}
        animate={{ scale: 0.95, opacity: 0.6 }}
        transition={{ duration: 0.2 }}
      >
        {photos[0] && (
          <img
            src={photos[0]}
            alt=""
            decoding="async"
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      className={cn(
        "absolute inset-0 rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing touch-none",
        receivedSuperLike
          ? "border-2 border-blue-400 shadow-[0_0_25px_rgba(96,165,250,0.5)]"
          : isVip
            ? "border-2 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
            : "border border-border/50"
      )}
      style={{
        x, y, rotate,
        backgroundColor: 'hsl(var(--card))',
        willChange: 'transform',
        zIndex: 2,
        contain: 'layout style',
      }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.85}
      onDragStart={onDragStart}
      onDragEnd={handleDragEnd}
      onTap={handleTap}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
    >

      {/* Photo with carousel */}
      <div
        className="relative w-full h-full"
        onContextMenu={(e) => e.preventDefault()}
      >
        {photos[photoIndex] ? (
          <img
            src={photos[photoIndex]}
            alt={card.name || ''}
            decoding="async"
            loading={photoIndex === 0 ? 'eager' : 'lazy'}
            className={cn(
              "w-full h-full object-cover pointer-events-none select-none transition-[filter] duration-300",
              locked && "blur-2xl scale-110"
            )}
            draggable={false}
            style={{ WebkitTouchCallout: 'none' } as any}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <User className="h-20 w-20 text-muted-foreground/20" />
          </div>
        )}

        {/* Watermark overlay */}
        {viewerUsername && (
          <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center overflow-hidden" style={{ WebkitTouchCallout: 'none' } as any}>
            <span className="text-white/[0.12] text-lg font-bold rotate-[-30deg] whitespace-nowrap">
              @{viewerUsername}
            </span>
          </div>
        )}

        {/* Transparent save interceptor */}
        <div className="absolute inset-0 z-[1]" style={{ pointerEvents: 'none', WebkitTouchCallout: 'none' } as any} />

        {/* Photo counter badge */}
        {totalPhotos > 1 && (
          <div className="absolute top-3 right-3 z-10 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-1">
              <span className="text-white text-xs font-semibold">{photoIndex + 1}/{totalPhotos}</span>
            </div>
          </div>
        )}

        {/* Photo progress bars */}
        {totalPhotos > 1 && (
          <div className="absolute top-3 left-3 right-14 flex gap-1 z-10 pointer-events-none">
            {photos.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-[3px] rounded-full flex-1 transition-all duration-200",
                  i === photoIndex ? "bg-white" : i < photoIndex ? "bg-white/70" : "bg-white/30"
                )}
              />
            ))}
          </div>
        )}

        {/* Tap zones indicators */}
        {totalPhotos > 1 && photoIndex > 0 && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <ChevronLeft className="h-6 w-6 text-white/40" />
          </div>
        )}
        {totalPhotos > 1 && photoIndex < totalPhotos - 1 && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <ChevronRight className="h-6 w-6 text-white/40" />
          </div>
        )}
      </div>

      {/* CONECTAR stamp */}
      <motion.div className="absolute top-8 left-6 z-10 pointer-events-none" style={{ opacity: likeOpacity }}>
        <div className="border-4 border-[hsl(142,76%,36%)] rounded-lg px-4 py-2 -rotate-12">
          <span className="text-[hsl(142,76%,36%)] font-black text-2xl tracking-wider">CONECTAR</span>
        </div>
      </motion.div>

      {/* PULAR stamp */}
      <motion.div className="absolute top-8 right-6 z-10 pointer-events-none" style={{ opacity: skipOpacity }}>
        <div className="border-4 border-destructive rounded-lg px-4 py-2 rotate-12">
          <span className="text-destructive font-black text-2xl tracking-wider">PULAR</span>
        </div>
      </motion.div>

      {/* SUPER LIKE stamp */}
      <motion.div className="absolute top-1/3 left-0 right-0 z-10 pointer-events-none flex justify-center" style={{ opacity: superLikeOpacity }}>
        <div className="border-4 border-[hsl(210,100%,60%)] rounded-lg px-6 py-3 bg-[hsl(210,100%,60%)]/10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Star className="h-6 w-6 text-[hsl(210,100%,60%)]" fill="currentColor" />
            <span className="text-[hsl(210,100%,60%)] font-black text-2xl tracking-wider">SUPER LIKE</span>
          </div>
        </div>
      </motion.div>

      {/* Super Like flash overlay */}
      <AnimatePresence>
        {superLikeActive && (
          <motion.div
            className="absolute inset-0 z-20 rounded-2xl pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ background: 'linear-gradient(180deg, hsl(210,100%,60%,0.3) 0%, hsl(210,100%,60%,0.05) 60%, transparent 100%)' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Star className="h-16 w-16 text-[hsl(210,100%,60%)]" fill="currentColor" style={{ filter: 'drop-shadow(0 0 20px hsl(210,100%,60%))' }} />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Received Super Like indicator */}
      {receivedSuperLike && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-[hsl(210,100%,60%)]/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-[0_0_12px_hsl(210,100%,60%,0.5)]">
          <Star className="h-3.5 w-3.5 text-white" fill="currentColor" />
          <span className="text-white text-xs font-bold">Super Like</span>
        </div>
      )}

      {/* Boosted indicator */}
      {card.is_boosted && !receivedSuperLike && (
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-primary/90 backdrop-blur-sm rounded-full p-2 shadow-[0_0_12px_hsl(330,100%,50%,0.5)]">
            <Zap className="h-4 w-4 text-primary-foreground" fill="currentColor" />
          </div>
        </div>
      )}

      {/* VIP badge */}
      {isVip && !receivedSuperLike && (
        <div className="absolute top-4 left-4 z-10">
          <Badge className="bg-[hsl(45,93%,47%)]/90 text-[hsl(0,0%,5%)] text-xs font-bold px-2 py-0.5 shadow-md">VIP</Badge>
        </div>
      )}

      {/* Info overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/80 via-black/50 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <h2 className="text-2xl font-bold text-white drop-shadow-lg">{card.name}</h2>
          {card.age && <span className="text-xl font-semibold text-white/90">{card.age}</span>}
          {receivedSuperLike && <Star className="h-5 w-5 text-[hsl(210,100%,60%)]" fill="currentColor" />}
          {(() => {
            const plan = (card.plan_type || 'free').toLowerCase();
            if (plan === 'vip') {
              return <Badge className="bg-[hsl(45,93%,47%)]/95 text-[hsl(0,0%,5%)] text-[10px] font-bold px-2 py-0.5 shadow-md">VIP</Badge>;
            }
            if (plan === 'premium') {
              return <Badge className="bg-primary/90 text-primary-foreground text-[10px] font-bold px-2 py-0.5 shadow-md">PREMIUM</Badge>;
            }
            return <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 border-white/30 text-white/80">FREE</Badge>;
          })()}
        </div>

        {/* Real distance + city */}
        <p className="text-xs text-white/60 mb-1">
          📍 {[
            card.distance_km != null ? `${card.distance_km} km` : null,
            (card as any).city || null,
          ].filter(Boolean).join(' • ') || 'Localização indisponível'}
        </p>

        {/* Pair bio or fallback to profile bio */}
        {(card.pair_bio || card.bio) && (
          <p className="text-sm text-white/75 line-clamp-2 leading-relaxed">{card.pair_bio || card.bio}</p>
        )}

      {/* Rotating tags per photo */}
        {(() => {
          const allTags = getRotatingTags(card, photoIndex);
          if (allTags.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1 mt-2">
              {allTags.map(({ tag, isAdult }) => (
                <span
                  key={tag}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm",
                    isAdult
                      ? "bg-destructive/25 text-red-300 border border-destructive/20"
                      : "bg-primary/30 text-primary-foreground/90 border border-primary/20"
                  )}
                >
                  {isAdult ? `🔥 ${tag}` : tag}
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Locked overlay (free plan limit reached) */}
      {locked && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/55 backdrop-blur-sm px-6 text-center">
          <div className="h-14 w-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <p className="text-base font-bold text-foreground drop-shadow">Limite diário atingido</p>
          <p className="text-xs text-foreground/85 max-w-[260px] leading-relaxed">
            Você usou {lockedInfo?.used ?? lockedInfo?.limit ?? 5} de {lockedInfo?.limit ?? 5} cards do plano gratuito nas últimas 24h.
          </p>
          {lockedInfo?.resetsAt && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/90 bg-background/70 border border-border/40 rounded-full px-3 py-1">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Próximo reset em ~{Math.max(1, Math.ceil((lockedInfo.resetsAt - Date.now()) / 3_600_000))}h
            </p>
          )}
          {onUpgrade && (
            <Button
              size="sm"
              className="pointer-events-auto mt-1 gap-1.5"
              onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
            >
              <Zap className="h-4 w-4" /> Liberar cards ilimitados
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** Get rotating tags for a given photo index, mixing social and adult tags without repeating */
function getRotatingTags(card: PairCard, photoIndex: number): { tag: string; isAdult: boolean }[] {
  const social = (card.tags_social || []).map(t => ({ tag: t, isAdult: false }));
  const adult = (card.tags_adult || []).map(t => ({ tag: t, isAdult: true }));
  
  // Interleave social and adult tags
  const all: { tag: string; isAdult: boolean }[] = [];
  const maxLen = Math.max(social.length, adult.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < social.length) all.push(social[i]);
    if (i < adult.length) all.push(adult[i]);
  }
  
  if (all.length === 0) return [];
  
  const TAGS_PER_PHOTO = 4;
  const startIdx = (photoIndex * TAGS_PER_PHOTO) % all.length;
  const result: { tag: string; isAdult: boolean }[] = [];
  for (let i = 0; i < TAGS_PER_PHOTO && i < all.length; i++) {
    result.push(all[(startIdx + i) % all.length]);
  }
  return result;
}

/** Get all displayable photos for a card: pair_photos first, then avatar_url as fallback */
function getCardPhotos(card: PairCard): string[] {
  const photos: string[] = [];
  if (card.pair_photos && card.pair_photos.length > 0) {
    photos.push(...card.pair_photos);
  }
  if (card.avatar_url && !photos.includes(card.avatar_url)) {
    photos.unshift(card.avatar_url);
  }
  return photos.length > 0 ? photos : card.avatar_url ? [card.avatar_url] : [];
}

export default function PerfectPairPage() {
  const { cards, debug, loading, viewerCardStatus, swipe, undo, match, dismissMatch, refetch, hasUndo, receivedSuperLikes } = usePerfectPair();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const isMasterAdmin = useShowDebugPanels();
  const [swiping, setSwiping] = useState(false);
  const [superLikeFlash, setSuperLikeFlash] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'discover' | 'matches'>('discover');
  const [isDragging, setIsDragging] = useState(false);
  const { data: matchList } = usePairMatches();
  const dailyLimit = usePerfectPairDailyLimit();

  const isVip = normalizePlanType(profile?.plan_type) === 'vip';
  // Render only MAX_VISIBLE_CARDS to save RAM on low-end devices
  const visibleCards = cards.slice(0, MAX_VISIBLE_CARDS);
  const currentCard = visibleCards[0];
  const nextCard = visibleCards[1];
  const isCurrentLocked = dailyLimit.isFree && dailyLimit.reachedLimit;

  // Disable body scroll while dragging card (prevent gesture conflict on mobile)
  useEffect(() => {
    if (isDragging) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isDragging]);

  // Prevent overscroll on discover tab to avoid vertical gesture conflict
  useEffect(() => {
    if (activeTab === 'discover') {
      document.documentElement.style.overscrollBehavior = 'none';
    } else {
      document.documentElement.style.overscrollBehavior = '';
    }
    return () => { document.documentElement.style.overscrollBehavior = ''; };
  }, [activeTab]);

  useEffect(() => {
    if (!loading && activeTab === 'discover' && !viewerCardStatus.configured) {
      setShowSetupModal(true);
    }
  }, [loading, activeTab, viewerCardStatus.configured]);

  const handleDragStart = useCallback(() => setIsDragging(true), []);
  const handleDragEndCb = useCallback(() => setIsDragging(false), []);

  // Locally-skipped cards while locked (free user past 5/24h) — não persiste no banco
  const [localSkipIds, setLocalSkipIds] = useState<Set<string>>(new Set());

  const handleSwipe = useCallback((action: 'like' | 'dislike' | 'superlike') => {
    if (!currentCard || swiping) return;

    // Free com limite atingido: bloqueia ações reais
    if (dailyLimit.isFree && dailyLimit.reachedLimit) {
      const resetDate = dailyLimit.resetsAt ? new Date(dailyLimit.resetsAt) : null;
      const hoursLeft = resetDate
        ? Math.max(1, Math.ceil((resetDate.getTime() - Date.now()) / 3_600_000))
        : 24;
      toast({
        title: '🔒 Limite diário atingido',
        description: `Você usou seus ${dailyLimit.limit} cards de hoje. Libera em ~${hoursLeft}h ou faça upgrade Premium.`,
        variant: 'destructive',
      });
      setShowVipModal(true);
      return;
    }

    if (action === 'superlike' && !isVip) {
      setShowVipModal(true);
      return;
    }

    setSwiping(true);

    if (action === 'superlike') {
      setSuperLikeFlash(true);
      setTimeout(() => setSuperLikeFlash(false), 600);
    }

    setTimeout(() => {
      // Consome 1 contador de janela diária (Free)
      const consumed = dailyLimit.consumeCard();
      if (consumed.allowed) {
        swipe(currentCard.id, action);
      }
      setSwiping(false);
    }, action === 'superlike' ? 500 : 150);
  }, [currentCard, swiping, swipe, isVip, dailyLimit]);

  const handleCardSwipe = useCallback((action: 'like' | 'dislike' | 'superlike') => {
    handleSwipe(action);
  }, [handleSwipe]);

  // Shared header and tab bar to avoid duplication
  const header = (
    <div className="flex items-center justify-between w-full max-w-[400px] mb-4 md:mb-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Perfect Pair</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Encontre sua combinação perfeita</p>
      </div>
      <button
        onClick={() => setShowSettings(true)}
        className="h-10 w-10 rounded-full border border-border/50 flex items-center justify-center hover:bg-muted/50 transition-colors"
        aria-label="Configurações"
      >
        <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  );

  const tabBar = (
    <div className="flex w-full max-w-[400px] mb-5 bg-muted/50 rounded-full p-1">
      <button
        onClick={() => setActiveTab('discover')}
        className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-medium transition-all", activeTab === 'discover' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
      >
        <Heart className="h-4 w-4" /> Descobrir
      </button>
      <button
        onClick={() => setActiveTab('matches')}
        className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-medium transition-all", activeTab === 'matches' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
      >
        <Heart className="h-4 w-4" fill={activeTab === 'matches' ? 'currentColor' : 'none'} /> Matches
        {matchList && matchList.length > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
            {matchList.length}
          </span>
        )}
      </button>
    </div>
  );

  // Empty state
  if (!loading && activeTab === 'discover' && (!viewerCardStatus.configured || cards.length === 0)) {
    return (
      <div className="flex flex-col items-center min-h-[calc(100vh-8rem)] px-4 py-4 md:py-6">
        {header}
        {tabBar}
        <div className="flex flex-col items-center justify-center flex-1 text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Heart className="h-10 w-10 text-primary/40" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {!viewerCardStatus.configured ? 'Seu card ainda não foi configurado' : 'Sem perfis por agora'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            {!viewerCardStatus.configured
              ? (viewerCardStatus.reason || 'Configure seu card do Perfect Pair para começar a receber perfis.')
              : 'Procurando novos pares na sua região... Volte em breve!'}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {!viewerCardStatus.configured ? (
              <Button size="sm" onClick={() => { setShowSetupModal(false); setShowSettings(true); }} className="gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Configurar meu card
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Tentar novamente
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" /> Filtros
                </Button>
              </>
            )}
          </div>
          {isMasterAdmin && <PerfectPairDebugPanel debug={debug} loading={loading} />}
        </div>
        <PairSettingsModal open={showSettings} onOpenChange={(open) => { setShowSettings(open); if (!open) refetch(); }} />
        <Dialog open={showSetupModal} onOpenChange={setShowSetupModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Configure seu card primeiro</DialogTitle>
              <DialogDescription>
                {viewerCardStatus.reason || 'Adicione suas fotos do Perfect Pair para liberar a vitrine de perfis.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => navigate('/settings')}>Ir para perfil</Button>
              <Button onClick={() => { setShowSetupModal(false); setShowSettings(true); }}>Configurar meu card</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-8rem)] px-3 sm:px-4 py-4 md:py-6">
      {header}
      {tabBar}

      <AnimatePresence mode="wait">
        {activeTab === 'matches' ? (
          <motion.div
            key="matches"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full overflow-y-auto"
          >
            <PairMatchesList />
          </motion.div>
        ) : (
          <motion.div
            key="discover"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center w-full"
          >
            {/* Daily limit indicator (Free) */}
            {dailyLimit.isFree && (
              <div className={cn(
                "w-full max-w-[340px] mb-3 px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2",
                isCurrentLocked
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-primary/30 bg-primary/5 text-foreground/80"
              )}>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {isCurrentLocked ? <Lock className="h-3.5 w-3.5" /> : <Heart className="h-3.5 w-3.5" />}
                  {isCurrentLocked
                    ? 'Limite diário atingido'
                    : `${dailyLimit.remaining}/${dailyLimit.limit} cards hoje`}
                </span>
                {isCurrentLocked && dailyLimit.resetsAt && (
                  <span className="inline-flex items-center gap-1 opacity-80">
                    <Clock className="h-3 w-3" />
                    libera em ~{Math.max(1, Math.ceil((dailyLimit.resetsAt - Date.now()) / 3_600_000))}h
                  </span>
                )}
              </div>
            )}

            {/* Cards Stack — responsive sizing for 360px screens */}
            <div
              className="relative w-full mx-auto"
              style={{
                maxWidth: 'min(340px, calc(100vw - 24px))',
                height: 'min(460px, calc(100svh - 340px))',
                minHeight: 300,
              }}
            >
              {loading && cards.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Background card (next in stack) */}
                  {nextCard && (
                    <SwipeCard
                      key={`bg-${nextCard.id}`}
                      card={nextCard}
                      isTop={false}
                      onSwipe={() => {}}
                      receivedSuperLike={receivedSuperLikes.has(nextCard.id)}
                      viewerUsername={profile?.username ?? undefined}
                      locked={isCurrentLocked}
                      lockedInfo={isCurrentLocked ? { used: dailyLimit.used, limit: dailyLimit.limit, resetsAt: dailyLimit.resetsAt } : undefined}
                      onUpgrade={() => setShowVipModal(true)}
                    />
                  )}
                  {/* Top card — draggable */}
                  <AnimatePresence mode="popLayout">
                    {currentCard && (
                      <SwipeCard
                        key={currentCard.id}
                        card={currentCard}
                        isTop={true}
                        onSwipe={handleCardSwipe}
                        superLikeActive={superLikeFlash}
                        receivedSuperLike={receivedSuperLikes.has(currentCard.id)}
                        viewerUsername={profile?.username ?? undefined}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEndCb}
                        locked={isCurrentLocked}
                        lockedInfo={isCurrentLocked ? { used: dailyLimit.used, limit: dailyLimit.limit, resetsAt: dailyLimit.resetsAt } : undefined}
                        onUpgrade={() => setShowVipModal(true)}
                      />
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>

            {/* Action Buttons — all ≥44px touch targets */}
            {currentCard && (
              <TooltipProvider delayDuration={300}>
                <div className="flex items-center justify-center gap-3 md:gap-4 mt-4 md:mt-5">
                  {/* Undo — VIP only */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { if (!isVip) { setShowVipModal(true); return; } undo(); }}
                        className={cn(
                          "h-11 w-11 rounded-full flex items-center justify-center border transition-all active:scale-90",
                          isVip
                            ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-500"
                            : "border-border/30 bg-muted/30 text-muted-foreground/40"
                        )}
                        style={{ minWidth: 44, minHeight: 44 }}
                        aria-label="Desfazer"
                      >
                        <Undo2 className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>Desfazer</p></TooltipContent>
                  </Tooltip>

                  {/* Dislike */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSwipe('dislike')}
                        disabled={swiping}
                        className="h-14 w-14 rounded-full flex items-center justify-center border-2 border-destructive/40 bg-destructive/10 active:scale-90 transition-transform disabled:opacity-50"
                        style={{ minWidth: 56, minHeight: 56 }}
                        aria-label="Pular"
                      >
                        <X className="h-7 w-7 text-destructive" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>Pular</p></TooltipContent>
                  </Tooltip>

                  {/* Super Like */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSwipe('superlike')}
                        disabled={swiping}
                        className={cn(
                          "h-12 w-12 rounded-full flex items-center justify-center border-2 active:scale-90 transition-all disabled:opacity-50",
                          isVip ? "border-blue-400/60 bg-blue-400/15" : "border-blue-400/30 bg-blue-400/5"
                        )}
                        style={{ minWidth: 48, minHeight: 48 }}
                        aria-label="Super Like"
                      >
                        <Star className="h-6 w-6 text-blue-400" fill="currentColor" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>Super Like</p></TooltipContent>
                  </Tooltip>

                  {/* Like */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSwipe('like')}
                        disabled={swiping}
                        className="h-14 w-14 rounded-full flex items-center justify-center bg-primary active:scale-90 transition-transform disabled:opacity-50"
                        style={{ minWidth: 56, minHeight: 56 }}
                        aria-label="Conectar"
                      >
                        <Heart className="h-7 w-7 text-primary-foreground" fill="currentColor" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>Conectar</p></TooltipContent>
                  </Tooltip>

                  {/* Boost */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowVipModal(true)}
                        className="h-11 w-11 rounded-full flex items-center justify-center border border-primary/40 bg-primary/10 active:scale-90 transition-transform"
                        style={{ minWidth: 44, minHeight: 44 }}
                        aria-label="Boost"
                      >
                        <Zap className="h-5 w-5 text-primary" fill="currentColor" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>Boost</p></TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            )}

            {isMasterAdmin && <PerfectPairDebugPanel debug={debug} loading={loading} />}
          </motion.div>
        )}
      </AnimatePresence>

      <PerfectPairMatchModal
        match={match}
        currentUserAvatar={profile?.avatar_url}
        currentUserName={profile?.name || 'Você'}
        onDismiss={dismissMatch}
      />
      <PairSettingsModal open={showSettings} onOpenChange={(open) => { setShowSettings(open); if (!open) refetch(); }} />
      <Dialog open={showSetupModal} onOpenChange={setShowSetupModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configure seu card primeiro</DialogTitle>
            <DialogDescription>
              {viewerCardStatus.reason || 'Adicione suas fotos do Perfect Pair para começar a receber cards compatíveis.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/settings')}>Ir para perfil</Button>
            <Button onClick={() => { setShowSetupModal(false); setShowSettings(true); }}>Configurar meu card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PremiumUpgradeModal open={showVipModal} onOpenChange={setShowVipModal} feature="Super Like" />
    </div>
  );
}

