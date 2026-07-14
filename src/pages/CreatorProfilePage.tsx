import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useBannerUpload as useBannerUploadHook } from "@/hooks/useBannerUpload";
import { 
  useCreatorProfile, 
  useCreatorStats, 
  useCreatorPosts,
  useCreatorAuthorScope,
  useIsFollowing,
  useIsSubscribedTo
} from "@/hooks/useCreatorProfile";
import { SubscriptionStatusBadge } from "@/components/SubscriptionStatusBadge";
import { useToggleFollow } from "@/hooks/useFollowingIds";
import { useFollowsMe } from "@/hooks/useFollowsMe";
import { useRecordProfileVisit, useVisitCount } from "@/hooks/useProfileVisits";
import { useCanUseGhostMode } from "@/hooks/useGhostMode";
import { useIsProfileLiked, useToggleProfileLike } from "@/hooks/useToggleProfileLike";
import { Navbar } from "@/components/Navbar";
import { MobileNavbar } from "@/components/MobileNavbar";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { VipSubscriptionStatus } from "@/components/subscriptions/VipSubscriptionStatus";
import { RealPostCard } from "@/components/RealPostCard";
import { CommunityTopicFeedCard, parseCommunityTopicSnapshot } from "@/components/feed/CommunityTopicFeedCard";
import { MediaGalleryModal } from "@/components/MediaGalleryModal";
import { resolveMediaKind, resolveVideoThumbnail } from "@/lib/mediaType";
import { resolvePostMediaUrl } from "@/lib/postMediaUtils";
import { resolveBannerUrl } from "@/lib/defaultBanner";
import { PollGridThumb } from "@/components/polls/PollGridThumb";
import { PollResultModal } from "@/components/polls/PollResultModal";
import { TopSupportersWidget } from "@/components/TopSupportersWidget";
import PublicVipTrailer from "@/components/creator/PublicVipTrailer";
import { ProfileBioSection } from "@/components/profile/ProfileBioSection";
import { CreatorVoiceBioCard } from "@/components/profile/CreatorVoiceBioCard";
import { CreatorActiveRoomCard } from "@/components/profile/CreatorActiveRoomCard";
import { CreatorOwnedCommunitiesSection } from "@/components/profile/CreatorOwnedCommunitiesSection";
import { UserCommunityMembershipsSection } from "@/components/profile/UserCommunityMembershipsSection";
import { CreatorPollsTab } from "@/components/polls/CreatorPollsTab";
import { ReportButton } from "@/components/safety/ReportButton";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { AuraSocialBadge } from "@/components/social-score/AuraSocialBadge";
import { ProfileAffinityBadge } from "@/components/profile/ProfileAffinityBadge";
import { AuraXpBadge } from "@/components/social-score/AuraXpBadge";
import { PrestigeBadge } from "@/components/social-score/PrestigeBadge";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { useUserFlashStories } from "@/hooks/useFlashStories";
import { BlockUserButton } from "@/components/profile/BlockUserButton";
import { ProfileActionsMenu } from "@/components/profile/ProfileActionsMenu";
import { ProfileRatingBadge } from "@/components/profile/ProfileRatingBadge";
import { ProfileTestimonialsSection } from "@/components/profile/ProfileTestimonialsSection";
import { ProfileRecommendationsSection } from "@/components/profile/ProfileRecommendationsSection";
import { ProfileMuralSection } from "@/components/profile/ProfileMuralSection";
import { ProfileDiaryGrid } from "@/components/profile/ProfileDiaryGrid";
import { useMyDiaryPosts } from "@/hooks/useMyDiaryPosts";
import { PrivateProfilePlaceholder } from "@/components/profile/PrivateProfilePlaceholder";
import { ProfileTempBlockedCard } from "@/components/profile/ProfileTempBlockedCard";
import { useAdminBypass } from "@/hooks/useAdminBypass";
import { CityDisplay } from "@/components/profile/CityDisplay";
import { getGenderLabel, formatCidadeUF } from "@/lib/profileFormat";
import { useIsBlocked, useUnblockContact } from "@/hooks/useBlockedContacts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldOff, Ban } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreatorPlayItemsStrip } from "@/components/oculto-play/CreatorPlayItemsStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { FollowRelationshipModal } from "@/components/profile/FollowRelationshipModal";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Crown, 
  Heart, 
  MessageCircle, 
  Grid3X3,
  Users,
  UserPlus,
  Sparkles,
  Lock,
  Loader2,
  Calendar,
  BarChart3,
  Image as ImageIcon,
  X,
  ThumbsUp,
  ThumbsDown,
  Video,
  Trash2,
  Camera,
  DollarSign,
  Ghost,
  Link2,
  MoreVertical,
  Check,
  MapPin,
  Play,
  Notebook,
  Gift,
} from "lucide-react";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/hooks/useMediaManager";
import { getPublicHandle } from "@/lib/userHandle";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---- Profile Like Button ----
function ProfileLikeButton({ profileId }: { profileId: string | undefined }) {
  const { data: isLiked } = useIsProfileLiked(profileId);
  const toggleLike = useToggleProfileLike();

  return (
    <Button
      variant={isLiked ? "outline" : "default"}
      className={cn(
        "min-h-[44px] gap-2",
        isLiked
          ? "border-primary text-primary hover:bg-primary/10"
          : "bg-gradient-to-r from-primary to-secondary text-primary-foreground"
      )}
      onClick={() => profileId && toggleLike.mutate(profileId)}
      disabled={toggleLike.isPending}
    >
      {toggleLike.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ThumbsUp className={cn("h-4 w-4", isLiked && "fill-primary")} />
      )}
      {isLiked ? "Curtido" : "Curtir"}
    </Button>
  );
}

const normalizeGalleryMedia = (post: any): MediaItem => {
  const resolvedUrl = resolvePostMediaUrl(post) || post?.media_url || "";
  const kind = resolveMediaKind(post?.media_type, resolvedUrl);
  return {
    ...(post as MediaItem),
    media_url: resolvedUrl,
    media_type: kind === "video" ? "video" : (post?.media_type || "image"),
    thumbnail_url:
      kind === "video"
        ? resolveVideoThumbnail(post?.thumbnail_url, resolvedUrl)
        : (post?.thumbnail_url || resolvedUrl),
  } as MediaItem;
};


/**
 * Renderiza um post escolhendo entre o card padrão e o card especial de
 * tópico de comunidade — evita que o snapshot JSON apareça como texto cru.
 */
function renderProfilePostCard(
  post: any,
  creator: any,
  privacyLevel: 'public' | 'vip' | undefined,
  onSubscribe: () => void,
) {
  const isCommunityTopic =
    post?.post_type === 'community_topic' ||
    !!parseCommunityTopicSnapshot(post?.content_text);
  if (isCommunityTopic) {
    return <CommunityTopicFeedCard key={post.id} post={post} />;
  }
  return (
    <RealPostCard
      key={post.id}
      post={{
        ...post,
        user_id: post.user_id ?? post.author_id ?? creator.id,
        is_locked: post.is_locked ?? false,
        updated_at: post.updated_at ?? post.created_at ?? new Date().toISOString(),
        privacy_level: (privacyLevel ?? (post.privacy_level as any)) || 'public',
        author: creator,
      } as any}
      onSubscribe={onSubscribe}
    />
  );
}

// ---- Main Page ----
export default function CreatorProfilePage() {
  const { creatorId } = useParams<{ creatorId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile: myProfile } = useProfile();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "posts";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);

  // Sincroniza ?tab= com o estado (perfil híbrido: deep-link para Assinar / Acervo / VIP)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab) setActiveTab(t);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleTabChange = (v: string) => {
    setActiveTab(v);
    const next = new URLSearchParams(searchParams);
    if (v === "posts") next.delete("tab"); else next.set("tab", v);
    setSearchParams(next, { replace: true });
  };
  const [galleryState, setGalleryState] = useState<{ media: MediaItem; items: MediaItem[] } | null>(null);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ src: string; alt: string } | null>(null);
  const [selectedPollPostId, setSelectedPollPostId] = useState<string | null>(null);

  const { data: creator, isLoading: loadingCreator } = useCreatorProfile(creatorId);
  const { isMasterAdmin } = useAdminBypass();
  const { data: stats, isLoading: loadingStats } = useCreatorStats(creatorId);
  const { data: posts, isLoading: loadingPosts } = useCreatorPosts(creatorId);
  const { data: diaryPosts = [], isLoading: loadingDiary } = useMyDiaryPosts(creator?.id);
  const { data: creatorAuthorScope } = useCreatorAuthorScope(creatorId);
  const resolvedCreatorProfileId = creator?.id;
  // Use resolved UUID (profile.id) preferentially — passing a username (URL slug)
  // makes the follow check fail with a UUID syntax error and the button snaps back.
  const followQueryTarget = resolvedCreatorProfileId || creator?.user_id || creatorId;
  const { data: isFollowing, isLoading: loadingFollowing } = useIsFollowing(followQueryTarget);
  const { data: followsMe, isLoading: loadingFollowsMe, isError: followsMeError } = useFollowsMe(followQueryTarget);
  const [showRelationshipModal, setShowRelationshipModal] = useState<false | "followers" | "following">(false);
  const { data: isSubscribed } = useIsSubscribedTo(creatorId);
  const { data: userStories } = useUserFlashStories(resolvedCreatorProfileId);
  const hasStories = !!userStories && userStories.stories.length > 0;
  
  const toggleFollow = useToggleFollow();
  const queryClient = useQueryClient();

  const isOwnProfile = !!resolvedCreatorProfileId && myProfile?.id === resolvedCreatorProfileId;
  const { isBlocked: isBlockedByMe } = useIsBlocked(resolvedCreatorProfileId || '');
  const unblockContact = useUnblockContact();
  const [showUnblockModal, setShowUnblockModal] = useState(false);
  const isPrivateProfile = !!(creator as any)?.is_private;
  const canSeeContent = isOwnProfile || !isPrivateProfile || !!isFollowing;

  const { mutate: recordVisit } = useRecordProfileVisit();
  const { data: visitCount = 0 } = useVisitCount();
  const { isActive: isGhostActive } = useCanUseGhostMode();
  useEffect(() => {
    if (myProfile?.id && resolvedCreatorProfileId && !isOwnProfile) {
      recordVisit({ visitorId: myProfile.id, visitedId: resolvedCreatorProfileId });
    }
  }, [myProfile?.id, resolvedCreatorProfileId, isOwnProfile]);

  // Auto-scroll para a âncora indicada no hash (#rating | #testimonials | #recommendations)
  // após o conteúdo do perfil estar carregado.
  useEffect(() => {
    if (!creator?.id) return;
    const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
    if (!hash) return;
    const ALLOWED = ['rating', 'testimonials', 'recommendations'];
    if (!ALLOWED.includes(hash)) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => window.clearTimeout(t);
  }, [creator?.id]);


  // Derived media arrays — esconde itens com privacy 'hidden' (Invisível a Todos)
  // de visitantes. O dono e o administrador master (ocultomaster) enxergam tudo.
  const mediaVisible = (p: any) => isOwnProfile || isMasterAdmin || (p.privacy_level !== 'hidden');
  const photoPosts = (posts || []).filter(p => mediaVisible(p) && p.media_url && (p.media_type === 'image' || (!p.media_type && !p.media_url?.match(/\.(mp4|webm|mov)$/i))));
  const videoPosts = (posts || []).filter(p => mediaVisible(p) && p.media_url && (p.media_type === 'video' || p.media_url?.match(/\.(mp4|webm|mov)$/i)));
  const vaultPosts = (posts || []).filter(p => p.privacy_level === 'hidden');
  const canSeeVault = isOwnProfile || isMasterAdmin;

  const openMediaGallery = useCallback((items: any[], selected: any) => {
    const normalizedItems = items.filter((item) => item?.media_url).map(normalizeGalleryMedia);
    const selectedMedia = normalizeGalleryMedia(selected);
    const isVaultVideo = selected?.privacy_level === 'hidden' && selectedMedia.media_type === 'video';
    if (isVaultVideo) return;
    const allowedItems = selected?.privacy_level === 'hidden'
      ? normalizedItems.filter((item) => item.media_type !== 'video')
      : normalizedItems;
    setGalleryState({ media: selectedMedia, items: allowedItems });
  }, []);

  const [followLoading, setFollowLoading] = useState(false);
  const [optimisticFollow, setOptimisticFollow] = useState<boolean | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const { bannerPreview, isUploading: isUploadingBanner, uploadBanner: uploadBannerHook } = useBannerUploadHook({
    extraInvalidateKeys: [['creator-profile', creatorId || '']],
  });
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleBannerUpload = useCallback(async (file: File) => {
    if (!user || !isOwnProfile) return;
    try {
      await uploadBannerHook(file);
      const { toast } = await import('sonner');
      toast.success('Banner atualizado!');
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error('Erro ao enviar banner. Tente novamente.');
    }
  }, [user, isOwnProfile, uploadBannerHook]);

  // Optimistic follow state: use local override if set, else server state.
  // We DO NOT clear the override on a fixed timeout — it would race with refetch
  // and visually "snap back" to the previous state. Instead we clear it only when
  // the server query confirms the same value (see the effect below).
  const displayFollowing = optimisticFollow !== null ? optimisticFollow : !!isFollowing;

  // Reconcile optimistic state with the server response — when they agree, drop the override.
  useEffect(() => {
    if (optimisticFollow === null) return;
    if (typeof isFollowing !== 'boolean') return;
    if (optimisticFollow === !!isFollowing) {
      setOptimisticFollow(null);
    }
  }, [isFollowing, optimisticFollow]);

  const handleFollow = async () => {
    if (!user) { navigate('/login'); return; }
    if (!resolvedCreatorProfileId || followLoading) return;
    setFollowLoading(true);

    const wasFollowing = displayFollowing;
    const nextFollowing = !wasFollowing;
    setOptimisticFollow(nextFollowing); // instant UI flip — kept until server confirms

    try {
      await toggleFollow.mutateAsync({ targetProfileId: resolvedCreatorProfileId, isFollowing: wasFollowing });

      // Pre-seed the query caches for BOTH possible keys (URL id/username and resolved profile id)
      // so any consumer reads the new value immediately, before refetch completes.
      const keysToSeed: Array<string | undefined> = [creatorId, resolvedCreatorProfileId, creator?.user_id, creator?.username];
      keysToSeed.filter(Boolean).forEach((key) => {
        queryClient.setQueryData(['is-following', key, user.id], nextFollowing);
      });

      // Invalidate every related query so counters/lists refresh.
      queryClient.invalidateQueries({ queryKey: ['is-following'] });
      queryClient.invalidateQueries({ queryKey: ['creator-stats', creatorId] });
      queryClient.invalidateQueries({ queryKey: ['creator-stats', resolvedCreatorProfileId] });
      queryClient.invalidateQueries({ queryKey: ['follow-counts'] });
      queryClient.invalidateQueries({ queryKey: ['following-ids'] });
      queryClient.invalidateQueries({ queryKey: ['followers'] });
      queryClient.invalidateQueries({ queryKey: ['following'] });
    } catch (err) {
      console.error('Follow error:', err);
      setOptimisticFollow(wasFollowing); // revert
      toast.error('Erro ao seguir. Tente novamente.');
    } finally {
      setFollowLoading(false);
      // No fixed timeout — the effect above clears the override once the server confirms.
    }
  };

  const handleMessage = async () => {
    if (!user) { navigate('/login'); return; }
    if (!creator?.user_id || messageLoading) return;
    setMessageLoading(true);
    try {
      // Cria/obtém a conversa via RPC (idempotente)
      const { getOrCreateConversationId } = await import('@/lib/conversationsApi');
      const { id: conversationId, error } = await getOrCreateConversationId(user.id, creator.user_id);

      if (error || !conversationId) {
        console.error('get_or_create_conversation error:', error);
        throw new Error('Erro ao iniciar conversa');
      }

      // Usa o padrão ?to=<profileId> que já trata corrida de carregamento
      // (MessagesPage abre otimisticamente mesmo se a conversa ainda não estiver na lista).
      // Mantemos também openConversationId no state como fallback.
      const profileIdParam = resolvedCreatorProfileId || creator.id;
      navigate(`/messages?to=${profileIdParam}`, {
        state: {
          openConversationId: conversationId,
          targetProfile: {
            id: profileIdParam,
            user_id: creator.user_id,
            name: creator.name,
            username: creator.username,
            avatar_url: creator.avatar_url,
            is_online: creator.is_online,
            profile_type: creator.profile_type,
            is_verified: creator.is_verified,
            is_verified_couple: creator.is_verified_couple,
            plan_type: creator.plan_type,
            is_creator: creator.is_creator,
          },
        },
      });
    } catch (err: any) {
      console.error('Message error:', err);
      toast.error('Erro ao iniciar conversa. Tente novamente.');
    } finally {
      setMessageLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Loading state
  if (loadingCreator) {
    return (
      <div className="min-h-dvh bg-background">
        <Navbar />
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-dvh bg-background">
        <Navbar />
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <Card className="p-8 text-center">
            <Users className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Perfil não encontrado</h2>
            <p className="text-muted-foreground mb-4">Este usuário não existe ou foi removido.</p>
            <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />Voltar
            </Button>
          </Card>
        </div>
        <MobileNavbar />
      </div>
    );
  }

  // Bloqueio temporário aplicado pelo admin master.
  // Próprio dono e admin master continuam acessando (para destravar).
  if (
    (creator as any)?.temp_blocked === true &&
    !isOwnProfile &&
    !isMasterAdmin
  ) {
    return <ProfileTempBlockedCard />;
  }



  const getPlanBadge = () => {
    switch (creator.plan_type) {
      case 'vip':
        return (
          <Badge className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-black">
            <Crown className="h-3 w-3 mr-1" />VIP
          </Badge>
        );
      case 'monthly':
      case 'premium':
        return (
          <Badge className="bg-gradient-to-r from-primary to-secondary text-primary-foreground">
            <Sparkles className="h-3 w-3 mr-1" />Premium
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground font-semibold">
            FREE
          </Badge>
        );
    }
  };

  // Counts for tabs (donos e master veem tudo; visitantes conforme acesso)
  // Helpers: conteúdo VIP, conteúdo pago e narrativas do Canal VIP vivem em abas próprias
  // (Canal VIP / Diário VIP / Conteúdo Pago) e NUNCA devem aparecer na aba "Posts" social.
  const isPaidPost = (p: any) => p?.is_paid === true || Number(p?.paid_price || 0) > 0;
  const isVipPost  = (p: any) => p?.privacy_level === 'vip';
  const isNarrativePost = (p: any) =>
    p?.content_format === 'narrative' ||
    ['diary','story','chapter','article','series','text_post'].includes(String(p?.section_type || ''));
  const visiblePosts = isOwnProfile || isMasterAdmin
    ? (posts || []).filter(p => p.privacy_level !== 'hidden')
    : (posts || []).filter(p => p.privacy_level !== 'hidden' && (p.privacy_level === 'public' || !!isSubscribed));
  // Aba "Posts" do perfil social: somente conteúdo público/social.
  // Postagens fixadas (apenas master) sempre aparecem no topo.
  const publicPosts = visiblePosts
    .filter(p => !isVipPost(p) && !isPaidPost(p) && !isNarrativePost(p))
    .slice()
    .sort((a: any, b: any) => {
      const ap = a?.is_pinned ? 1 : 0;
      const bp = b?.is_pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const ad = new Date(a?.created_at || 0).getTime();
      const bd = new Date(b?.created_at || 0).getTime();
      return bd - ad;
    });
  const vipPosts = (posts || []).filter(p => isVipPost(p) || isNarrativePost(p));
  const paidPosts = (posts || []).filter(p => (isOwnProfile || isMasterAdmin || p.privacy_level !== 'hidden') && isPaidPost(p));

  return (
    <div className="min-h-dvh bg-background pb-20 md:pb-0">
      <Navbar />

      {/* Sticky back button - always visible */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-sm border-b border-border/30">
        <div className="container max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/feed')}>
            <ArrowLeft className="h-4 w-4 mr-2" />Voltar ao Feed
          </Button>
          {isGhostActive && !isOwnProfile && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <Ghost className="h-3.5 w-3.5" />
              Visita anônima
            </span>
          )}
        </div>
      </div>
      
      <div className="container max-w-4xl mx-auto px-4 py-6">

        {/* Banner */}
        <div className="relative w-full rounded-t-xl overflow-hidden" style={{ height: '200px', minHeight: '200px', contain: 'layout style' }}>
          {(() => {
            const bannerSrc = resolveBannerUrl(creator.cover_image_url, creator.updated_at, bannerPreview);
            return (
              <img decoding="async"
                src={bannerSrc}
                alt="Banner"
                key={bannerSrc}
                className="w-full h-full object-cover object-center cursor-zoom-in"
                loading="eager"
                style={{ display: 'block', width: '100%', height: '100%' }}
                onClick={() => setMediaViewer({ src: bannerSrc, alt: `Banner de ${creator.name || 'usuário'}` })}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-banner.jpg'; }}
              />
            );
          })()}

          {isUploadingBanner && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {isOwnProfile && (
            <>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBannerUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => bannerInputRef.current?.click()}
                className="absolute bottom-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-background transition-colors"
                aria-label="Alterar banner"
              >
                <Camera className="h-5 w-5 text-foreground" />
              </button>
            </>
          )}

          {/* Banner de status de relacionamento de follow */}
          {!isOwnProfile && (loadingFollowsMe || (followsMe && !followsMeError)) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => !loadingFollowsMe && setShowRelationshipModal("followers")}
                  disabled={loadingFollowsMe}
                  className={cn(
                    "absolute top-2 left-2 right-2 md:left-4 md:right-auto md:max-w-fit z-10",
                    "px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm",
                    "flex items-center gap-2 text-xs md:text-sm font-semibold",
                    "transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer",
                    loadingFollowsMe
                      ? "bg-muted/80 text-muted-foreground border border-border animate-pulse"
                      : displayFollowing
                        ? "bg-yellow-500/95 text-yellow-950 border border-yellow-300"
                        : "bg-purple-600/95 text-white border border-purple-400"
                  )}
                  aria-label="Ver seguidores e seguindo deste perfil"
                >
                  {loadingFollowsMe ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Verificando relação...</span>
                    </>
                  ) : displayFollowing ? (
                    <>
                      <Heart className="h-3.5 w-3.5 fill-current" />
                      <span>Vocês se seguem mutuamente</span>
                      <Users className="h-3 w-3 opacity-70 ml-0.5" />
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Este usuário segue você</span>
                      <Users className="h-3 w-3 opacity-70 ml-0.5" />
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                {loadingFollowsMe ? (
                  "Verificando se este perfil segue você..."
                ) : displayFollowing ? (
                  <>
                    <strong>Mútuo:</strong> vocês dois se seguem. Toque para ver a lista de
                    seguidores e quem este perfil segue.
                  </>
                ) : (
                  <>
                    <strong>Segue você:</strong> este perfil te segue, mas você ainda não o segue
                    de volta. Toque para ver as conexões dele.
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Tag de bloqueio — clique para desbloquear */}
          {!isOwnProfile && isBlockedByMe && (
            <button
              type="button"
              onClick={() => setShowUnblockModal(true)}
              className={cn(
                "absolute z-10 top-12 left-2 right-2 md:left-4 md:right-auto md:max-w-fit md:top-12",
                "px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm",
                "flex items-center gap-2 text-xs md:text-sm font-bold",
                "bg-destructive/95 text-destructive-foreground border border-destructive",
                "transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer animate-pulse"
              )}
              aria-label="Usuário bloqueado — toque para desbloquear"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Usuário bloqueado — toque para desbloquear</span>
            </button>
          )}
        </div>

        {/* Modal de desbloqueio */}
        <Dialog open={showUnblockModal} onOpenChange={setShowUnblockModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldOff className="h-5 w-5 text-primary" />
                Desbloquear {creator?.username ? `@${creator.username}` : 'usuário'}?
              </DialogTitle>
              <DialogDescription>
                Ao desbloquear, todas as restrições serão removidas: vocês voltam a trocar mensagens,
                ver conteúdos um do outro e receber notificações normalmente.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowUnblockModal(false)} disabled={unblockContact.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (!resolvedCreatorProfileId) return;
                  unblockContact.mutate(resolvedCreatorProfileId, {
                    onSuccess: () => setShowUnblockModal(false),
                  });
                }}
                disabled={unblockContact.isPending || !resolvedCreatorProfileId}
              >
                {unblockContact.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Desbloqueando...</>
                ) : (
                  <><ShieldOff className="h-4 w-4 mr-2" />Desbloquear agora</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <FollowRelationshipModal
          open={!!showRelationshipModal}
          onOpenChange={(o) => !o && setShowRelationshipModal(false)}
          profileId={resolvedCreatorProfileId}
          profileName={creator?.name}
          defaultTab={showRelationshipModal === "following" ? "following" : "followers"}
        />

        {/* Profile Header */}
        <Card className="overflow-hidden bg-card/50 border-border/30 rounded-t-none border-t-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (hasStories) {
                      setShowStoryViewer(true);
                      return;
                    }
                    const resolved = resolveAvatarUrl(creator.avatar_url);
                    if (resolved) {
                      setMediaViewer({ src: resolved, alt: `Foto de ${creator.name || 'usuário'}` });
                    }
                  }}
                  className={cn(
                    "rounded-full transition-transform",
                    hasStories
                      ? "cursor-pointer hover:scale-105 ring-4 ring-primary/60 p-0.5 bg-gradient-to-br from-primary to-[hsl(338,100%,50%)]"
                      : resolveAvatarUrl(creator.avatar_url) ? "cursor-zoom-in hover:scale-[1.03]" : "cursor-default"
                  )}
                  aria-label={hasStories ? "Ver stories" : resolveAvatarUrl(creator.avatar_url) ? "Ampliar foto de perfil" : undefined}
                  disabled={!hasStories && !resolveAvatarUrl(creator.avatar_url)}
                >
                  <Avatar className={cn("h-24 w-24 md:h-32 md:w-32", !hasStories && "ring-4 ring-primary/20")}>
                    <AvatarImage src={creator.avatar_url || undefined} alt={creator.name} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {creator.name?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
                {!creator.is_ghost_active && (
                  <OnlineDot
                    user={creator as any}
                    size="xl"
                    positionClassName="absolute bottom-1 right-1"
                  />
                )}
                {/* Botão destacado de ações do perfil, ao lado da foto */}
                {!isOwnProfile && resolvedCreatorProfileId && (
                  <div className="absolute -top-1 -right-1">
                    <ProfileActionsMenu
                      profileId={resolvedCreatorProfileId}
                      username={creator.username}
                      displayName={creator.name || 'Usuário'}
                      highlighted
                    />
                  </div>
                )}
              </div>

              <div className="flex-1 w-full space-y-2.5 text-center sm:text-left">
                {/* Row 1: handle + verified */}
                <div id="rating" className="flex items-center gap-2 flex-wrap justify-center sm:justify-start scroll-mt-24">
                  <h1 className="text-2xl font-bold text-foreground leading-none">{getPublicHandle(creator as any)}</h1>
                  {creator.is_verified && <CheckCircle2 className="h-5 w-5 text-primary fill-primary/20" />}
                </div>

                {/* Row 2: social stats — uniform pill sizing */}
                <div className="flex items-center gap-1.5 flex-wrap justify-center sm:justify-start [&>*]:h-6 [&>*]:text-[11px]">
                  {resolvedCreatorProfileId && (
                    <ProfileRatingBadge
                      targetProfileId={resolvedCreatorProfileId}
                      displayHandle={getPublicHandle(creator as any)}
                      disabled={isOwnProfile}
                    />
                  )}
                  {resolvedCreatorProfileId && <AuraSocialBadge userId={resolvedCreatorProfileId} />}
                  {resolvedCreatorProfileId && <AuraXpBadge userId={resolvedCreatorProfileId} />}
                  {resolvedCreatorProfileId && <PrestigeBadge userId={resolvedCreatorProfileId} interactive />}
                  {!isOwnProfile && resolvedCreatorProfileId && myProfile?.id && (
                    <ProfileAffinityBadge
                      myProfileId={myProfile.id}
                      targetProfileId={resolvedCreatorProfileId}
                      signals={{
                        followsMe: !!followsMe,
                        iFollow: !!isFollowing,
                        isOnline: (creator as any)?.is_online === true,
                      }}
                    />
                  )}
                </div>

                {/* Tags compactas em LINHA ÚNICA: TIPO + Idades + Cidade/UF + VIP/PIONEIRO + Entrou em + Última vez online */}
                {(() => {
                  const tipo = getGenderLabel((creator as any).gender, (creator as any).profile_type);
                  const cityUF = formatCidadeUF((creator as any).address_city, (creator as any).address_state);
                  const hasCoords = !creator.hide_location && creator.location_lat && creator.location_lng;

                  const calcAge = (dob?: string | null) => {
                    if (!dob) return null;
                    const today = new Date();
                    const b = new Date(dob);
                    let age = today.getFullYear() - b.getFullYear();
                    if (today < new Date(today.getFullYear(), b.getMonth(), b.getDate())) age--;
                    return age;
                  };
                  const isCouple = (creator as any).is_verified_couple || creator.profile_type === 'couple' || creator.gender === 'couple';
                  const age1 = !creator.hide_age ? calcAge(creator.birth_date) : null;
                  const age2 = !creator.hide_age && isCouple ? calcAge((creator as any).partner2_birth_date) : null;
                  let ageStr: string | null = null;
                  if (age1 && age2) ageStr = `${age1} e ${age2} anos`;
                  else if (age1) ageStr = `${age1} anos`;

                  const joinedRaw = (creator as any).created_at || (creator as any).updated_at;
                  const joinedStr = joinedRaw
                    ? format(new Date(joinedRaw), "MMM 'de' yyyy", { locale: ptBR })
                    : null;

                  const ls = (creator as any).last_seen as string | null | undefined;
                  const isOnline = (creator as any).is_online === true && ls && (Date.now() - new Date(ls).getTime() < 2 * 60 * 1000);
                  let seenStr: string | null = null;
                  if ((creator as any).show_online_status !== false) {
                    if (isOnline) seenStr = 'online agora';
                    else if (ls) seenStr = `visto ${formatDistanceToNow(new Date(ls), { locale: ptBR, addSuffix: true })}`;
                  }

                  const isVip = creator.plan_type === 'vip';
                  const isPremium = creator.plan_type === 'premium';
                  const isPioneiro = !!(creator as any).is_pioneiro;
                  const NEUTRAL = '—';

                  return (
                    <>
                    <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none justify-center sm:justify-start -mx-1 px-1 text-[11px] text-muted-foreground">

                      {tipo ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] px-2 py-0.5 border-primary/40 text-primary bg-primary/5 font-semibold tracking-wide"
                        >
                          {tipo}
                        </Badge>
                      ) : (
                        <span className="shrink-0 text-foreground/40">{NEUTRAL}</span>
                      )}

                      <span className="shrink-0 font-semibold text-foreground/80 whitespace-nowrap">
                        {ageStr ?? NEUTRAL}
                      </span>

                      {cityUF ? (
                        <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
                          <MapPin className="h-3 w-3" />
                          {cityUF}
                        </span>
                      ) : hasCoords && !creator.hide_location ? (
                        <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
                          <CityDisplay lat={creator.location_lat!} lng={creator.location_lng!} />
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap text-foreground/40">
                          <MapPin className="h-3 w-3" />
                          {NEUTRAL}
                        </span>
                      )}

                      {/* VIP/PREMIUM e PIONEIRO sempre ao lado da cidade — ordem fixa */}
                      {isVip && (
                        <Badge
                          title="Plano VIP"
                          className="shrink-0 bg-gradient-to-r from-[#FFD700] to-[#F0B400] text-black font-bold text-[10px] px-2 py-0.5 border-0 whitespace-nowrap"
                        >
                          <Crown className="h-3 w-3 mr-1" />VIP
                        </Badge>
                      )}
                      {!isVip && isPremium && (
                        <Badge
                          title="Plano Premium"
                          className="shrink-0 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-[10px] px-2 py-0.5 border-0 whitespace-nowrap"
                        >
                          PREMIUM
                        </Badge>
                      )}
                      {isPioneiro && (
                        <Badge
                          title="Membro Pioneiro — entre os 1000 originais"
                          className="shrink-0 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold text-[10px] px-2 py-0.5 shadow-[0_0_10px_rgba(212,175,55,0.4)] border-0 whitespace-nowrap"
                        >
                          🏆 PIONEIRO
                        </Badge>
                      )}
                    </div>

                    {/* Segunda linha: "Entrou em ..." + "visto há ..." */}
                    <div className="mt-1 flex items-center gap-3 flex-wrap justify-center sm:justify-start text-[11px] text-muted-foreground">
                      <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
                        <Calendar className="h-3 w-3" />
                        Entrou em {joinedStr ?? NEUTRAL}
                      </span>
                      <span className={cn(
                        'shrink-0 inline-flex items-center gap-1 whitespace-nowrap',
                        isOnline && 'text-emerald-400 font-medium'
                      )}>
                        {isOnline && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        {seenStr ?? NEUTRAL}
                      </span>
                    </div>
                    </>
                  );
                })()}



                <div className="mx-auto w-full max-w-xl space-y-4 pt-6 sm:pt-8">

                  {/* Bio em áudio SEMPRE acima da bio em texto */}
                  {!isOwnProfile && (
                    <div className="space-y-2">
                      <CreatorVoiceBioCard
                        url={(creator as any).voice_bio_url}
                        duration={(creator as any).voice_bio_duration}
                        displayName={creator.username ? `@${creator.username}` : 'usuário'}
                        ownerId={creator.user_id || creator.id}
                      />
                      <CreatorActiveRoomCard userId={creator.user_id || creator.id} />
                    </div>
                  )}

                  {(creator.bio ||
                    (creator.tags_social && creator.tags_social.length > 0) ||
                    (creator.tags_adult && creator.tags_adult.length > 0) ||
                    (creator as any)?.social_links) && (
                    <ProfileBioSection
                      bio={creator.bio || ''}
                      maxLength={200}
                      tagsSocial={creator.tags_social || []}
                      tagsAdult={creator.tags_adult || []}
                      connectionMode={creator.connection_mode ?? true}
                      viewerConnectionMode={myProfile?.connection_mode ?? true}
                      isOwnProfile={isOwnProfile}
                      socialLinks={(creator as any)?.social_links || null}
                      viewerTagsSocial={(myProfile as any)?.tags_social || []}
                      viewerTagsAdult={(myProfile as any)?.tags_adult || []}
                    />
                  )}

                  <CreatorOwnedCommunitiesSection
                    userId={creator.user_id || creator.id}
                    isOwnProfile={isOwnProfile}
                  />
                  <UserCommunityMembershipsSection
                    userId={creator.user_id || creator.id}
                    isOwnProfile={isOwnProfile}
                  />
                </div>



                {/* (Idades, cidade e "Entrou em" agora aparecem inline na linha de tags acima) */}


                <div className="flex items-center justify-center gap-6 pt-2">
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground">{formatNumber(stats?.postsCount || 0)}</p>
                    <p className="text-xs text-muted-foreground">Posts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRelationshipModal("followers")}
                    className="text-center rounded-md px-2 py-1 hover:bg-muted/50 transition focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label="Ver seguidores"
                  >
                    <p className="text-xl font-bold text-foreground">{formatNumber(stats?.followersCount || 0)}</p>
                    <p className="text-xs text-muted-foreground">Seguidores</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRelationshipModal("following")}
                    className="text-center rounded-md px-2 py-1 hover:bg-muted/50 transition focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label="Ver quem este perfil segue"
                  >
                    <p className="text-xl font-bold text-foreground">{formatNumber(stats?.followingCount || 0)}</p>
                    <p className="text-xs text-muted-foreground">Seguindo</p>
                  </button>
                  {isOwnProfile && (
                    <button
                      type="button"
                      onClick={() => navigate('/visits')}
                      className="text-center rounded-md px-2 py-1 hover:bg-muted/50 transition focus:outline-none focus:ring-2 focus:ring-primary/40"
                      aria-label="Ver visitas recebidas"
                      title="Ver lista de visitantes"
                    >
                      <p className="text-xl font-bold text-foreground">{formatNumber(visitCount)}</p>
                      <p className="text-xs text-muted-foreground">Visitas</p>
                    </button>
                  )}
                </div>

                {isMasterAdmin && creatorAuthorScope && (

                  <div className="mt-4 rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Author Scope Debug</p>
                        <p className="text-[11px] text-muted-foreground">Resolução usada para exibir posts após troca de username.</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">cache 60s</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 text-[11px]">
                      <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1.5">
                        <p className="text-muted-foreground">Canônico</p>
                        <p><span className="text-muted-foreground">profile.id:</span> <span className="font-mono break-all">{creatorAuthorScope.authorProfileId}</span></p>
                        <p><span className="text-muted-foreground">auth user:</span> <span className="font-mono break-all">{creatorAuthorScope.creatorId}</span></p>
                        <p><span className="text-muted-foreground">username:</span> <span className="font-mono">{creatorAuthorScope.canonicalUsername || creator?.username || '—'}</span></p>
                      </div>
                      <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1.5">
                        <p className="text-muted-foreground">Legados / busca</p>
                        <p><span className="text-muted-foreground">matched usernames:</span> {creatorAuthorScope.matchedUsernames?.length ? creatorAuthorScope.matchedUsernames.join(', ') : '—'}</p>
                        <p><span className="text-muted-foreground">legacy profiles:</span> {creatorAuthorScope.hasLegacyProfiles ? 'sim' : 'não'}</p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {creatorAuthorScope.allProfileIds.map((id) => (
                            <Badge key={id} variant="secondary" className="font-mono text-[10px] break-all max-w-full">{id}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isOwnProfile && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6">
                <Button
                  variant={displayFollowing ? "outline" : "default"}
                  className={cn(
                    "min-h-[44px] gap-2",
                    !displayFollowing && "bg-gradient-to-r from-primary to-secondary",
                    displayFollowing && "border-primary text-primary hover:bg-primary/10"
                  )}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : displayFollowing ? <Heart className="h-4 w-4 fill-primary" /> : <UserPlus className="h-4 w-4" />}
                  {displayFollowing ? "Seguindo" : "Seguir"}
                </Button>
                <ProfileLikeButton profileId={creator?.id} />
                <Button
                  className="min-h-[44px] gap-2 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-black font-semibold border-0 shadow-sm shadow-amber-500/30 hover:opacity-90"
                  onClick={() => {
                    if (!user) { toast.info('Entre para enviar presente.'); return; }
                    setShowGiftModal(true);
                  }}
                >
                  <Gift className="h-4 w-4" />
                  Presente
                </Button>
                <Button 
                  className="min-h-[44px] gap-2 bg-gradient-to-r from-primary to-secondary text-primary-foreground" 
                  onClick={handleMessage}
                  disabled={messageLoading}
                >
                  {messageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                  Mensagem
                </Button>
              </div>
            )}

            {isOwnProfile && (
              <div className="mt-6">
                <Button variant="outline" onClick={() => navigate('/settings')}>Editar Perfil</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {creator.is_creator && (
          <div className="mt-6 space-y-4">
            <PublicVipTrailer
              creatorId={resolvedCreatorProfileId}
              onSubscribe={!isOwnProfile ? () => setShowSubscribeModal(true) : undefined}
            />
            <TopSupportersWidget creatorId={resolvedCreatorProfileId} currentUserId={myProfile?.id} onSubscribe={() => setShowSubscribeModal(true)} />
          </div>
        )}

        {/* Private profile gate */}
        {!canSeeContent ? (
          <PrivateProfilePlaceholder
            creatorName={creator.name || 'este usuário'}
            onFollow={handleFollow}
            isFollowing={displayFollowing}
            followLoading={followLoading}
          />
        ) : (
        <>
        {/* Depoimentos */}
        {resolvedCreatorProfileId && (
          <ProfileTestimonialsSection
            targetProfileId={resolvedCreatorProfileId}
            displayHandle={getPublicHandle(creator as any)}
          />
        )}
        {/* Recomendações reais */}
        {resolvedCreatorProfileId && (
          <ProfileRecommendationsSection targetProfileId={resolvedCreatorProfileId} />
        )}
        {/* Mural — visitantes podem deixar mensagens */}
        {resolvedCreatorProfileId && (
          <ProfileMuralSection
            targetProfileId={resolvedCreatorProfileId}
            ownerHandle={getPublicHandle(creator as any) || creator?.username || null}
          />
        )}
        {/* Content Tabs with counters */}
        <Tabs id="profile-tabs" value={activeTab} onValueChange={handleTabChange} className="mt-6">
          <TabsList className="bg-muted/30 border border-border/50 p-1 w-full overflow-x-auto scrollbar-none flex-nowrap justify-start">
            <TabsTrigger value="posts" className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <Grid3X3 className="h-4 w-4 mr-1" />
              Posts · {publicPosts.length}
            </TabsTrigger>
            <TabsTrigger value="gallery" className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <ImageIcon className="h-4 w-4 mr-1" />
              Fotos · {photoPosts.length}
            </TabsTrigger>
            <TabsTrigger value="videos" className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <Video className="h-4 w-4 mr-1" />
              Vídeos · {videoPosts.length}
            </TabsTrigger>
            {creator.is_creator && (
              <TabsTrigger value="vip" className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
                <Lock className="h-4 w-4 mr-1" />
                VIP · {vipPosts.length}
              </TabsTrigger>
            )}
            {creator.is_creator && (
              <TabsTrigger value="diary" className="shrink-0 data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm">
                <Notebook className="h-4 w-4 mr-1" />
                Diário VIP
              </TabsTrigger>
            )}
            <TabsTrigger value="paid" className="shrink-0 data-[state=active]:bg-[hsl(45,93%,47%)] data-[state=active]:text-[hsl(45,93%,10%)] text-xs sm:text-sm">
              <DollarSign className="h-4 w-4 mr-1" />
              Acervo VIP · {paidPosts.length}
            </TabsTrigger>
            <TabsTrigger value="play" className="shrink-0 data-[state=active]:bg-fuchsia-500 data-[state=active]:text-white text-xs sm:text-sm">
              <Video className="h-4 w-4 mr-1" />
              Play
            </TabsTrigger>
            <TabsTrigger value="polls" className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4 mr-1" />
              Enquetes
            </TabsTrigger>
            {creator.is_creator && (
              <TabsTrigger value="plans" className="shrink-0 data-[state=active]:bg-[hsl(45,93%,47%)] data-[state=active]:text-[hsl(45,93%,10%)] text-xs sm:text-sm">
                <Lock className="h-4 w-4 mr-1" />
                Assinar
              </TabsTrigger>
            )}
            {canSeeVault && (
              <TabsTrigger value="vault" className="shrink-0 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-xs sm:text-sm">
                <Lock className="h-4 w-4 mr-1" />
                Cofre · {vaultPosts.length}
              </TabsTrigger>
            )}
          </TabsList>

          {canSeeVault && (
            <TabsContent value="vault" className="mt-6 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg border border-slate-500/40 bg-slate-800/30">
                <Lock className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Cofre — Invisível a todos.</span>{" "}
                  Mídias com privacidade <b>🔒 Invisível a Todos</b>. Esta guia é visível apenas para o dono do perfil.
                </p>
              </div>
              {vaultPosts.length === 0 ? (
                <Card className="p-8 text-center">
                  <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma mídia no cofre</p>
                </Card>
              ) : (
                <div className="grid grid-cols-3 gap-1 sm:gap-2">
                  {vaultPosts.map((post: any) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => {
                        if (post.media_type === 'video' || /\.(mp4|webm|mov|ogg)$/i.test(post.media_url || '')) return;
                        openMediaGallery(vaultPosts, post);
                      }}
                      className="relative aspect-square overflow-hidden rounded-lg bg-muted/30 border border-slate-500/40 text-left"
                    >
                      {post.media_url ? (
                        post.media_type === 'video' || /\.(mp4|webm|mov)$/i.test(post.media_url) ? (
                          <>
                            <img decoding="async" src={post.thumbnail_url || post.media_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Play className="h-6 w-6 text-white drop-shadow" />
                            </div>
                          </>
                        ) : (
                          <img decoding="async" src={post.media_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <p className="text-[10px] text-muted-foreground line-clamp-4">{post.content_text}</p>
                        </div>
                      )}
                      <div className="absolute top-1 right-1">
                        <Badge variant="secondary" className="bg-slate-900/80 text-slate-100 text-[9px] h-4 px-1">
                          <Lock className="h-2.5 w-2.5 mr-0.5" />Hidden
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {/* Posts Tab */}
          <TabsContent value="posts" className="mt-6 space-y-4">
            {loadingPosts ? (
              [1, 2, 3].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div>
                    </div>
                    <Skeleton className="h-64 w-full rounded-lg" />
                  </CardContent>
                </Card>
              ))
            ) : publicPosts.length > 0 ? (
              <>
                {/* Grid de enquetes do criador (perfil de outros) */}
                {(() => {
                  const polls = publicPosts.filter((p: any) => p.post_type === 'poll');
                  if (polls.length === 0) return null;
                  return (
                    <div className="grid grid-cols-3 gap-1">
                      {polls.map((post: any) => (
                        <div
                          key={post.id}
                          className="relative aspect-square cursor-pointer overflow-hidden rounded-sm"
                          onClick={() => setSelectedPollPostId(post.id)}
                        >
                          <PollGridThumb postId={post.id} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {publicPosts
                  .filter((p: any) => p.post_type !== 'poll')
                  .map((post) => (
                    renderProfilePostCard(post, creator, undefined, () => setShowSubscribeModal(true))
                  ))}
              </>
            ) : (
              <Card className="p-8 text-center">
                <Grid3X3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum post ainda</p>
              </Card>
            )}
          </TabsContent>

          {/* VIP Tab */}
          <TabsContent value="vip" className="mt-6 space-y-4">
            {isSubscribed ? (
              <>
                <div className="flex items-center justify-between rounded-xl border border-green-500/30 bg-green-500/5 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Acesso VIP ativo a <span className="font-semibold text-foreground">{creator.name || creator.username}</span>
                  </p>
                  <SubscriptionStatusBadge creatorId={creatorId} variant="full" />
                </div>
                {vipPosts.length > 0 ? (
                  vipPosts.map((post) => (
                    renderProfilePostCard(post, creator, 'vip', () => setShowSubscribeModal(true))
                  ))
                ) : (
                  <Card className="p-8 text-center">
                    <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">Nenhum conteúdo VIP ainda</p>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-8 text-center bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-transparent">
                <Lock className="h-12 w-12 text-[hsl(45,93%,47%)] mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">Conteúdo Exclusivo</h3>
                <p className="text-muted-foreground mb-4">Assine para acessar todo o conteúdo VIP de {creator.name}</p>
                <Button
                  className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-black"
                  onClick={() => {
                    const params = new URLSearchParams({ subscribe: '1' });
                    if (creator?.id) params.set('creatorId', String(creator.id));
                    if (creator?.name) params.set('creatorName', String(creator.name));
                    navigate(`/subscriptions?${params.toString()}`);
                  }}
                >
                  <Crown className="h-4 w-4 mr-2" />Assinar Agora
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* Acervo VIP - Paid Content Tab */}
          <TabsContent value="paid" className="mt-6 space-y-4">
            {/* Create Album Buttons - only for owner */}
            {isOwnProfile && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2 border-dashed border-2 border-[hsl(45,93%,47%)]/30 hover:border-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/5 transition-all"
                  onClick={() => {
                    navigate('/feed');
                    toast.info("Use 'Criar Post' no feed e marque como Conteúdo Pago (foto).");
                  }}
                >
                  <div className="w-10 h-10 rounded-full bg-[hsl(45,93%,47%)]/10 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">Álbum de Fotos</span>
                  <span className="text-[10px] text-muted-foreground">Criar álbum pago</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2 border-dashed border-2 border-[hsl(45,93%,47%)]/30 hover:border-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/5 transition-all"
                  onClick={() => {
                    navigate('/feed');
                    toast.info("Use 'Criar Post' no feed e marque como Conteúdo Pago (vídeo).");
                  }}
                >
                  <div className="w-10 h-10 rounded-full bg-[hsl(45,93%,47%)]/10 flex items-center justify-center">
                    <Video className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">Álbum de Vídeos</span>
                  <span className="text-[10px] text-muted-foreground">Criar álbum pago</span>
                </Button>
              </div>
            )}

            {paidPosts.length > 0 ? (
              isOwnProfile ? (
                paidPosts.map((post) => (
                  renderProfilePostCard(post, creator, undefined, () => setShowSubscribeModal(true))
                ))
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {paidPosts.map((post) => (
                    <div key={post.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted/30 group">
                      {post.media_url ? (
                        <img decoding="async" src={post.media_url} alt="" className="w-full h-full object-cover pointer-events-none select-none" loading="lazy" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted/50">
                          <DollarSign className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Blur overlay + lock */}
                      <div className="absolute inset-0 backdrop-blur-[25px] bg-black/30 flex flex-col items-center justify-center gap-2">
                        <Lock className="h-6 w-6 text-[hsl(45,93%,47%)]" />
                        {(post as any).paid_price && (
                          <span className="text-xs font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">
                            R$ {((post as any).paid_price as number).toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <Card className="p-8 text-center">
                <DollarSign className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum conteúdo pago ainda</p>
              </Card>
            )}
          </TabsContent>


          <TabsContent value="gallery" className="mt-6">
            {photoPosts.length === 0 ? (
              <Card className="p-8 text-center">
                <ImageIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhuma foto ainda</p>
              </Card>
            ) : (
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                {photoPosts.map((post) => (
                  <button
                    key={post.id}
                    className="relative aspect-square overflow-hidden rounded-lg bg-muted/30 hover:opacity-80 transition-opacity group"
                    onClick={() => openMediaGallery(photoPosts, post)}
                  >
                    <img decoding="async" src={post.media_url!} alt="" className="w-full h-full object-cover pointer-events-none select-none" style={{ WebkitTouchCallout: 'none' } as React.CSSProperties} loading="lazy" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 flex items-center justify-center gap-3 text-white text-[10px]">
                      <span className="flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{post.likes_count || 0}</span>
                      <span className="flex items-center gap-0.5"><ThumbsDown className="h-3 w-3" />{post.dislikes_count || 0}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{post.comments_count || 0}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Videos Tab */}
          <TabsContent value="videos" className="mt-6">
            {videoPosts.length === 0 ? (
              <Card className="p-8 text-center">
                <Video className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhum vídeo ainda</p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-2">
                {videoPosts.map((post) => (
                  <button
                    key={post.id}
                    className="relative aspect-video overflow-hidden rounded-lg bg-muted/30 hover:opacity-80 transition-opacity group"
                    onClick={() => openMediaGallery(videoPosts, post)}
                  >
                    <video src={post.media_url!} className="w-full h-full object-cover" muted preload="metadata" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/50 rounded-full p-3">
                        <Video className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 flex items-center justify-center gap-3 text-white text-[10px]">
                      <span className="flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{post.likes_count || 0}</span>
                      <span className="flex items-center gap-0.5"><ThumbsDown className="h-3 w-3" />{post.dislikes_count || 0}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{post.comments_count || 0}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Polls Tab */}
          <TabsContent value="polls" className="mt-6">
            <CreatorPollsTab creatorId={resolvedCreatorProfileId || creatorId!} isOwnProfile={isOwnProfile} />
          </TabsContent>

          {/* Diário VIP — narrativas do criador (texto/imagem/vídeo/áudio) com paywall por post */}
          {creator.is_creator && (
            <TabsContent value="diary" className="mt-6">
              <ProfileDiaryGrid posts={diaryPosts as any[]} isLoading={loadingDiary} />
            </TabsContent>
          )}


          {/* Aba Assinar — perfil VIP híbrido (atalho ao modal de assinatura + atalhos do criador) */}
          {creator.is_creator && (
            <TabsContent value="plans" className="mt-6 space-y-4">
              <div className="rounded-2xl border border-[hsl(45,93%,47%)]/30 bg-gradient-to-br from-[hsl(45,93%,47%)]/10 via-card/40 to-card/40 p-5 text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.4)]">
                  <Lock className="h-7 w-7 text-[hsl(45,93%,10%)]" />
                </div>
                <div>
                  <p className="text-lg font-bold">Assinar canal de {creator.name || `@${creator.username}`}</p>
                  <p className="text-xs text-muted-foreground">
                    Acesso completo ao Acervo VIP, posts exclusivos, chat priorizado e benefícios mensais.
                  </p>
                </div>
                <div className="flex justify-center">
                  <VipSubscriptionStatus creatorId={resolvedCreatorProfileId || creator.id} />
                </div>
                {isSubscribed ? (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 text-green-500 text-sm py-2 px-3">
                    ✓ Você já é assinante deste criador
                  </div>
                ) : isOwnProfile ? (
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button asChild className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)]">
                      <Link to="/dashboard?tab=monetization">Gerenciar planos & monetização</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/dashboard?tab=earnings">Ver painel financeiro</Link>
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full sm:w-auto bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold"
                    onClick={() => setShowSubscribeModal(true)}
                  >
                    Ver planos & assinar
                  </Button>
                )}
              </div>

              {paidPosts.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                    Conteúdos avulsos disponíveis · {paidPosts.length}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Prefere comprar individualmente? Veja todo o Acervo VIP do criador.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => handleTabChange("paid")}>
                    Abrir Acervo VIP
                  </Button>
                </div>
              )}
            </TabsContent>
          )}

          {/* Aba Play — Etapa 58: itens publicados pelo criador no Oculto Play */}
          <TabsContent value="play" className="mt-6 space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5">
              <Video className="h-4 w-4 text-fuchsia-300 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Oculto Play.</span>{" "}
                Vídeos curtos, memes, áudios e teasers publicados por este criador.
              </p>
            </div>
            <CreatorPlayItemsStrip creatorId={creator.id} />
          </TabsContent>
        </Tabs>
        </>
        )}
      </div>

      <MobileNavbar />

      <MediaGalleryModal
        open={!!galleryState}
        onClose={() => setGalleryState(null)}
        media={galleryState?.media ?? null}
        allMedia={galleryState?.items ?? []}
        onNavigate={(media) => setGalleryState((prev) => prev ? { ...prev, media } : prev)}
      />


      <SubscriptionModal
        open={showSubscribeModal}
        onOpenChange={setShowSubscribeModal}
        creatorName={creator?.name || (creator?.username ? `@${creator.username}` : undefined)}
        creatorId={resolvedCreatorProfileId || creator?.id}
      />
      <AuraXpGiftModal
        open={showGiftModal}
        onOpenChange={setShowGiftModal}
        lockedReceiver={creator ? {
          id: (creator as any).id,
          user_id: (creator as any).user_id ?? null,
          username: (creator as any).username ?? null,
          name: (creator as any).name ?? null,
          avatar_url: (creator as any).avatar_url ?? null,
        } : null}
        title={`Presentear ${creator?.name || (creator?.username ? `@${creator.username}` : 'usuário')}`}
        contextLabel="(via perfil)"
        onSent={() => toast.success('Presente enviado 🎁')}
      />
      <PollResultModal
        open={!!selectedPollPostId}
        onOpenChange={(open) => { if (!open) setSelectedPollPostId(null); }}
        postId={selectedPollPostId}
      />

      {hasStories && userStories && (
        <StoryViewer
          open={showStoryViewer}
          onOpenChange={setShowStoryViewer}
          userStories={userStories}
          onNavigateUser={() => setShowStoryViewer(false)}
          hasNextUser={false}
          hasPrevUser={false}
        />
      )}

      {/* Visualizador fullscreen de avatar/banner */}
      {mediaViewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={mediaViewer.alt}
          className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setMediaViewer(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMediaViewer(null); }}
            aria-label="Fechar"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur flex items-center justify-center text-white"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            decoding="async"
            loading="eager"
            src={mediaViewer.src}
            alt={mediaViewer.alt}
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            onError={(e) => {
              // Evita o fallback global (placeholder cinza 1x1) e fecha o viewer.
              (e.currentTarget as HTMLImageElement).dataset.fallbackApplied = '1';
              setMediaViewer(null);
              toast.error('Não foi possível carregar a foto de perfil.');
            }}
          />
        </div>
      )}
    </div>
  );
}
