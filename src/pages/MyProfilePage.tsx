import { useEffect, useState, useRef } from "react";
import { useBannerUpload } from "@/hooks/useBannerUpload";
import { BetaFounderBadge } from "@/components/beta/BetaFounderBadge";
import { MediaGalleryModal } from "@/components/MediaGalleryModal";
import type { MediaItem } from "@/hooks/useMediaManager";

const normalizeMedia = (p: any): MediaItem => ({
  ...(p as MediaItem),
  media_type:
    p?.media_type === "video" || /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(p?.media_url || "")
      ? "video"
      : (p?.media_type || "image"),
});

const toMisterioPost = (p: any): any => p && ({
  id: p.id,
  author_id: p.author_id ?? p.user_id ?? null,
  user_id: p.user_id ?? p.author_id ?? null,
  media_url: p.media_url ?? null,
  media_type: p.media_type ?? "image",
  thumbnail_url: p.thumbnail_url ?? null,
  preview_url: p.preview_url ?? null,
  content_text: p.content_text ?? p.content ?? null,
  likes_count: p.likes_count ?? 0,
  comments_count: p.comments_count ?? 0,
  saves_count: p.saves_count ?? 0,
  created_at: p.created_at ?? new Date().toISOString(),
  is_paid: !!p.is_paid,
  author: {
    id: p.author_id ?? p.user_id ?? "",
    user_id: p.user_id ?? p.author_id ?? null,
    username: p.author?.username ?? p.username ?? p.author_username ?? null,
    name: p.author?.name ?? p.name ?? null,
    avatar_url: p.author?.avatar_url ?? p.avatar_url ?? p.author_avatar_url ?? null,
  },
});
import { PollGridThumb } from "@/components/polls/PollGridThumb";
import { PollResultModal } from "@/components/polls/PollResultModal";
import { useQueryClient } from "@tanstack/react-query";
import { useMyProfileStats, useMyPosts, useLikedPosts, useMyVaultPosts, useResolvedProfileAuthorScope } from "@/hooks/useMyProfileStats";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { SafetyCheckinCard } from "@/components/safety/SafetyCheckinCard";
import { CreateCheckinDialog } from "@/components/safety/CreateCheckinDialog";
import { usePendingCheckins, useSafetyCheckins } from "@/hooks/useSafetyCheckin";
import { BadgeDisplay } from "@/components/BadgeDisplay";
import { TrustScoreCard } from "@/components/TrustScoreCard";
import { SocialIdentityCard } from "@/components/social/SocialIdentityCard";
import { SeasonProgressCard } from "@/components/social/SeasonProgressCard";
import { FounderProgressCard } from "@/components/social/FounderProgressCard";
import { VipPassBadge } from "@/components/social/VipPassBadge";
import { AuraSocialBadge } from "@/components/social-score/AuraSocialBadge";
import { PrestigeBadge } from "@/components/social-score/PrestigeBadge";

import { PrestigeHistoryCard } from "@/components/social-score/PrestigeHistoryCard";
import { VoiceBioRecorder } from "@/components/VoiceBioRecorder";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { ProfileMediaTabs } from "@/components/profile/ProfileMediaTabs";
import { MySubscriptionsHistorySection } from "@/components/subscriptions/MySubscriptionsHistorySection";
import { ProfileReferralSection } from "@/components/profile/ProfileReferralSection";
import { ProfileReferralQuickLink } from "@/components/profile/ProfileReferralQuickLink";
import { useMyAfilhadas } from "@/hooks/useCreatorReferrals";
import { ProfileFinancialSection } from "@/components/profile/ProfileFinancialSection";
import { ProfileBioSection } from "@/components/profile/ProfileBioSection";
import { CreatorOwnedCommunitiesSection } from "@/components/profile/CreatorOwnedCommunitiesSection";
import { UserCommunityMembershipsSection } from "@/components/profile/UserCommunityMembershipsSection";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "@/hooks/use-toast";
import { getShareBaseUrl } from "@/lib/appConfig";
import {
  Crown,
  MessageCircle,
  Share2,
  MapPin,
  Grid3X3,
  Heart,
  Image as ImageIcon,
  Edit,
  Settings,
  Shield,
  Users,
  Wallet,
  Camera,
  Sparkles,
  Play,
  Lock,
  EyeOff,
} from "lucide-react";
import { Link, useLocation as useRouterLocation } from "react-router-dom";
import { getGenderLabel, formatCidadeUF } from "@/lib/profileFormat";
import { isPlaceholderUrl } from "@/lib/placeholderMedia";
import { cn } from "@/lib/utils";
import { getPublicHandle } from "@/lib/userHandle";
import VaultManager from "@/components/profile/VaultManager";
import { resolveBannerUrl } from "@/lib/defaultBanner";
import { useShowDebugPanels } from "@/hooks/useShowDebugPanels";
import { PinterestMasonry } from "@/components/common/PinterestMasonry";
import { PostMysteryViewer } from "@/components/feed/PostMysteryViewer";
import { enrichPostsForGrid, SpecialPostOverlay } from "@/components/feed/specialPostTile";
import { ProfileTestimonialsSection } from "@/components/profile/ProfileTestimonialsSection";
import { ProfileRecommendationsSection } from "@/components/profile/ProfileRecommendationsSection";
import { ProfileMuralSection } from "@/components/profile/ProfileMuralSection";
import { ProfileRatingBadge } from "@/components/profile/ProfileRatingBadge";
import { ProfileDiaryGrid } from "@/components/profile/ProfileDiaryGrid";
import { useMyDiaryPosts } from "@/hooks/useMyDiaryPosts";
import { useVipChannelEnabled } from "@/hooks/useVipChannelEnabled";
import { ProfileVisitsAuraSections } from "@/components/profile/ProfileVisitsAuraSections";
import { BookOpen } from "lucide-react";
import { MyPlayCards } from "@/components/profile/MyPlayCards";

export default function MyProfilePage() {
  const { user } = useAuth();
  const { profile, isLoading, error } = useProfile();
  const queryClient = useQueryClient();
  const routerLocation = useRouterLocation();
  const initialTab = (() => {
    const sp = new URLSearchParams(routerLocation.search);
    const t = sp.get('tab');
    if (t && ["posts","media","play","diary","liked","safety","referral","financial","vault"].includes(t)) return t as any;
    return "posts" as const;
  })();
  const [activeTab, setActiveTab] = useState<"posts" | "media" | "play" | "diary" | "liked" | "safety" | "referral" | "financial" | "vault">(initialTab);
  const voiceBioSectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(routerLocation.search);
    const t = sp.get('tab');
    if (t && ["posts","media","play","diary","liked","safety","referral","financial","vault"].includes(t)) {
      setActiveTab(t as any);
    }
  }, [routerLocation.search]);
  useEffect(() => {
    const shouldFocusVoiceBio = routerLocation.hash === '#voice-bio'
      || (routerLocation.state as { focusSection?: string } | null)?.focusSection === 'voice-bio';

    if (!shouldFocusVoiceBio) return;

    const scrollToVoiceBio = () => {
      voiceBioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    requestAnimationFrame(() => {
      window.setTimeout(scrollToVoiceBio, 120);
    });
  }, [routerLocation.hash, routerLocation.key, routerLocation.state]);
  const coverInputRef = useRef<HTMLInputElement>(null);
  
  const { data: pendingCheckins = [] } = usePendingCheckins();
  const { data: allCheckins = [] } = useSafetyCheckins();
  const { data: stats } = useMyProfileStats(profile?.id);
  const { data: myPosts = [], isLoading: postsLoading } = useMyPosts(profile?.id, 500);
  const { data: vaultMeta } = useMyVaultPosts(profile?.id, 1);
  const vaultTotal = vaultMeta?.total ?? 0;
  const { data: likedPosts = [], isLoading: likedLoading } = useLikedPosts(profile?.id, 24);
  const { data: referrals = [], isLoading: referralsLoading } = useMyAfilhadas();
  const showDebugPanels = useShowDebugPanels();
  const { data: resolvedAuthorScope } = useResolvedProfileAuthorScope(profile?.id, profile?.username);
  const { enabled: vipChannelEnabled } = useVipChannelEnabled();
  const { data: diaryPosts = [], isLoading: diaryLoading } = useMyDiaryPosts(
    vipChannelEnabled ? profile?.id : undefined,
    60,
  );

  // Realtime: invalida cache de posts quando o usuário cria/edita/remove um post.
  const qcMain = useQueryClient();
  useEffect(() => {
    const ownerId = user?.id || profile?.user_id || profile?.id;
    if (!ownerId) return;
    const ch = supabase
      .channel(`my-posts-${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts', filter: `user_id=eq.${ownerId}` },
        () => {
          qcMain.invalidateQueries({ queryKey: ['my-posts'] });
          qcMain.invalidateQueries({ queryKey: ['my-vault-posts'] });
          qcMain.invalidateQueries({ queryKey: ['profile-posts'] });
          qcMain.invalidateQueries({ queryKey: ['my-diary-posts'] });
        },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [user?.id, profile?.user_id, profile?.id, qcMain]);



  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowFallback(false);
      return;
    }
    const t = setTimeout(() => setShowFallback(true), 2000);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (error) {
    console.error('[Perfil] Erro ao carregar perfil externo:', error);
    return (
      <div className="pb-20 flex flex-col items-center justify-center min-h-[50vh] px-4 text-center gap-4">
        <p className="text-muted-foreground">Não foi possível carregar seu perfil.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>
      </div>
    );
  }

  if (!user) return null;

  if (!profile && isLoading && !showFallback) {
    return (
      <div className="pb-20">
        <div className="w-full" style={{ aspectRatio: '3/1', maxHeight: 200, backgroundColor: 'hsl(var(--muted))' }} />
        <div className="px-4 mt-4 space-y-3">
          <Skeleton className="h-28 w-28 rounded-full mx-auto" />
          <Skeleton className="h-5 w-40 mx-auto" />
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
      </div>
    );
  }

  const totalViews = stats?.totalViews || 0;
  const totalFollowing = stats?.totalFollowing || 0;
  const totalFollowers = stats?.totalFollowers || 0;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)} mil`;
    return num.toString();
  };

  const fallbackName = user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário';
  const bio = profile?.bio || (profile ? "Ainda não adicionei uma bio. Clique em editar para personalizar seu perfil!" : "Carregamos seus dados locais temporariamente.");
  const realName = profile?.name || fallbackName;
  const username = profile?.username || (user.user_metadata?.username as string) || realName.toLowerCase().replace(/\s/g, '');
  const displayName = getPublicHandle({ ...(profile as any), username });
  const avatarUrl = profile?.avatar_url;
  const planType = user.email === 'ocultomaster@ocultoswing.com.br' ? 'vip' : (profile?.plan_type || 'free');
  const isOnline = profile?.is_online && profile?.show_online_status !== false;
  const location = profile?.location_lat ? 'Próximo' : null;
  const { bannerPreview, isUploading: uploadingCover, uploadBanner } = useBannerUpload();
  // bannerPreview: local blob URL right after upload; fallback to DB URL com cache-bust,
  // ou ao banner padrão da plataforma quando o usuário ainda não enviou capa.
  const coverImageUrl = resolveBannerUrl(
    profile?.cover_image_url,
    profile?.updated_at,
    bannerPreview,
  );

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadBanner(file);
      toast({ title: "Banner atualizado!" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="pb-20">
      {/* Cover Banner — sempre tem imagem (padrão se o usuário não trocou) */}
      <div className="relative w-full overflow-hidden group" style={{ aspectRatio: '3/1', maxHeight: 200, backgroundColor: 'hsl(var(--muted))', contain: 'layout style' }}>
        <img
          src={coverImageUrl}
          alt="Banner"
          key={coverImageUrl}
          className="w-full h-full object-cover object-center"
          loading="eager"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-banner.jpg'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />


        {/* Change cover button */}
        <button
          onClick={() => coverInputRef.current?.click()}
          disabled={uploadingCover}
          className="absolute bottom-3 right-14 p-2 rounded-full bg-background/70 backdrop-blur-sm hover:bg-background/90 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-100"
        >
          <Camera className={cn("h-4 w-4 text-foreground", uploadingCover && "animate-pulse")} />
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverUpload}
        />

        <Link 
          to="/settings" 
          className="absolute top-4 right-4 p-2 rounded-full bg-background/70 backdrop-blur-sm hover:bg-background/90 transition-colors"
        >
          <Settings className="h-5 w-5 text-foreground" />
        </Link>
      </div>

      <div className="px-1.5 sm:px-4 -mt-16 relative z-10 max-w-full overflow-x-hidden">
        <div className="flex flex-col items-center w-full max-w-full min-w-0">
          {/* Avatar */}
          <div className="relative">
            <div className={cn(
              "w-28 h-28 rounded-full p-[4px]",
              planType === 'vip' 
                ? "bg-gradient-to-tr from-[hsl(45,93%,47%)] via-[hsl(35,93%,47%)] to-[hsl(45,93%,47%)] animate-pulse"
                : "bg-gradient-to-tr from-primary via-secondary to-primary"
            )}>
              <div className="w-full h-full rounded-full p-[3px] bg-background">
                <Avatar className="w-full h-full">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName} className="object-cover" />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {displayName[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            {isOnline && (
              <div className="absolute bottom-1 right-1">
                <div className="w-5 h-5 rounded-full bg-[hsl(142,76%,46%)] border-4 border-background" />
              </div>
            )}
          </div>

          {/* Name & Handle & Plan Badge */}
          <div className="mt-4 w-full max-w-full min-w-0 text-center">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
              {profile?.is_verified && (
                <Badge className="bg-primary/20 text-primary text-[10px]">✓</Badge>
              )}
              {profile?.id && <BadgeDisplay userId={profile.id} maxDisplay={3} size="md" />}
            </div>
            <div className="flex items-center justify-center gap-2 mt-2">
              {profile?.id && <TrustScoreCard userId={profile.id} variant="minimal" />}
              {profile?.id && <AuraSocialBadge userId={profile.id} />}
              {profile?.id && <PrestigeBadge userId={profile.id} interactive showHistory />}
            </div>
            {profile?.id && (
              <div className="px-0 sm:px-3 mt-3 space-y-2 flex flex-col items-stretch w-full max-w-full overflow-x-hidden [&>*]:w-full [&>*]:max-w-full [&>*]:min-w-0">
                {/* Action Buttons — movidos para cima da bio de áudio */}
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <Link to="/settings">
                    <Button
                      className="bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 text-white shadow-md shadow-fuchsia-500/25 hover:opacity-95 hover:shadow-fuchsia-500/35 border-0 font-semibold"
                    >
                      <Edit className="h-4 w-4 mr-2" />Editar Perfil
                    </Button>
                  </Link>
                  <CreateCheckinDialog
                    trigger={
                      <Button
                        className="gap-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-md shadow-emerald-500/25 hover:opacity-95 hover:shadow-emerald-500/35 border-0 font-semibold"
                        onClick={() => setActiveTab('safety')}
                      >
                        <Shield className="h-4 w-4" />
                        Encontro Seguro
                        {allCheckins.filter(c => c.status === 'scheduled').length > 0 && (
                          <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                            {allCheckins.filter(c => c.status === 'scheduled').length}
                          </Badge>
                        )}
                      </Button>
                    }
                  />
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          onClick={async () => {
                            const profileTarget = profile?.id || profile?.user_id || username;
                            const shareUrl = `${getShareBaseUrl().replace(/\/$/, '')}/creator/${profileTarget}`;
                            await navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
                            if (navigator.share) {
                              try {
                                await navigator.share({ title: `${displayName} no OCULTO`, text: `Veja o perfil de ${displayName} no OCULTO!`, url: shareUrl });
                              } catch { /* cancelled */ }
                            } else {
                              window.open(shareUrl, '_blank', 'noopener,noreferrer');
                            }
                            toast({ title: "Link do perfil copiado!", description: shareUrl });
                          }}
                          aria-label="Compartilhar e copiar link do perfil"
                          title="Compartilhar e copiar link do perfil"
                          className="bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 text-white shadow-md shadow-orange-500/25 hover:opacity-95 hover:shadow-orange-500/35 border-0"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Compartilhar e copiar link do perfil</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Bio de texto (acima da bio de áudio) */}
                <ProfileBioSection
                  bio={bio}
                  maxLength={120}
                  tagsSocial={profile?.tags_social || []}
                  tagsAdult={profile?.tags_adult || []}
                  connectionMode={profile?.connection_mode ?? true}
                  viewerConnectionMode={true}
                  isOwnProfile={true}
                  socialLinks={(profile as any)?.social_links || null}
                />

                {/* Bio de áudio */}
                <div
                  id="voice-bio"
                  ref={voiceBioSectionRef}
                  className="w-full scroll-mt-24 rounded-xl ring-1 ring-transparent target:ring-primary/60"
                >
                  <VoiceBioRecorder
                    existingUrl={profile?.voice_bio_url || undefined}
                    existingDuration={profile?.voice_bio_duration || undefined}
                  />
                </div>


                {/* Card unificado: identidade do perfil (badges + @ + tipo/cidade + idade + métricas) */}
                <div className="w-full rounded-2xl border border-border/40 bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-sm p-4 space-y-3 shadow-sm">
                  {/* Badges de plano + fundador */}
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {planType === 'vip' ? (
                      <Badge className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-background gap-1">
                        <Crown className="h-3 w-3" />VIP Creator
                      </Badge>
                    ) : planType === 'premium' || planType === 'monthly' ? (
                      <Badge className="bg-gradient-to-r from-primary to-secondary text-white gap-1">
                        <Crown className="h-3 w-3" />Premium
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-muted-foreground">Gratuito</Badge>
                    )}
                    <BetaFounderBadge isFounder={(profile as any)?.is_beta_founder} compact />
                  </div>

                  {/* Tag de avaliação */}
                  <div className="flex justify-center">
                    <ProfileRatingBadge targetProfileId={profile.id} displayHandle={username} disabled />
                  </div>

                  {/* @username */}
                  <p className="text-center text-muted-foreground text-sm">@{username}</p>


                  {/* Tipo + Cidade/UF */}
                  {(() => {
                    const tipo = getGenderLabel((profile as any)?.gender, (profile as any)?.profile_type);
                    const cityUF = !profile?.hide_location
                      ? formatCidadeUF(profile?.address_city, (profile as any)?.address_state)
                      : null;
                    if (!tipo && !cityUF) return null;
                    return (
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {tipo && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-2 py-0.5 border-primary/40 text-primary bg-primary/5 font-semibold tracking-wide"
                          >
                            {tipo}
                          </Badge>
                        )}
                        {cityUF && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-2 py-0.5 border-border/60 text-foreground/80 bg-card/60"
                          >
                            <MapPin className="h-2.5 w-2.5 mr-1" />
                            {cityUF}
                          </Badge>
                        )}
                      </div>
                    );
                  })()}

                  {/* Idade */}
                  {profile?.birth_date && !profile?.hide_age && (
                    <div className="flex items-center justify-center gap-2 flex-wrap text-sm text-muted-foreground">
                      {(() => {
                        const age1 = Math.floor((Date.now() - new Date(profile.birth_date!).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                        const p2bd = (profile as any)?.partner2_birth_date;
                        if (profile.gender === 'couple' && p2bd) {
                          const age2 = Math.floor((Date.now() - new Date(p2bd).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                          return <span>{age1} e {age2} anos</span>;
                        }
                        return <span>{age1} anos</span>;
                      })()}
                    </div>
                  )}

                  {/* Métricas: visualizações / seguindo / seguidores */}
                  <div className="flex items-center justify-center gap-6 pt-2 border-t border-border/30">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{formatNumber(totalViews)}</p>
                      <p className="text-xs text-muted-foreground">visualizações</p>
                    </div>
                    <div className="w-px h-8 bg-border/50" />
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{formatNumber(totalFollowing)}</p>
                      <p className="text-xs text-muted-foreground">seguindo</p>
                    </div>
                    <div className="w-px h-8 bg-border/50" />
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{formatNumber(totalFollowers)}</p>
                      <p className="text-xs text-muted-foreground">seguidores</p>
                    </div>
                  </div>
                </div>

                {/* Link de Indicação — logo abaixo do card unificado */}
                <ProfileReferralQuickLink />



                <SocialIdentityCard userId={profile.id} />
                <SeasonProgressCard />
                <FounderProgressCard />
                <div className="flex justify-center"><VipPassBadge /></div>
                <PrestigeHistoryCard userId={profile.id} />
                <ProfileVisitsAuraSections />
                <MySubscriptionsHistorySection limit={2} />
                <CreatorOwnedCommunitiesSection
                  userId={user?.id || profile.user_id || profile.id}
                  isOwnProfile={true}
                />
                <UserCommunityMembershipsSection
                  userId={user?.id || profile.user_id || profile.id}
                  isOwnProfile={true}
                />
              </div>
            )}

            {/* Aviso: foto/banner temporários */}
            {(() => {
              const p: any = profile;
              const avatarTemp = !!(p?.avatar_is_placeholder ?? isPlaceholderUrl(p?.avatar_url));
              const coverTemp = !!(p?.cover_is_placeholder ?? isPlaceholderUrl(p?.cover_image_url));
              if (!avatarTemp && !coverTemp) return null;
              const itens: string[] = [];
              if (avatarTemp) itens.push("foto");
              if (coverTemp) itens.push("banner");
              const lista = itens.length > 1 ? `${itens[0]} e ${itens[1]}` : itens[0];
              return (
                <div className="mt-3 flex justify-center">
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                    aria-label={`Sua ${lista} é temporária. Personalizar agora.`}
                  >
                    <Sparkles className="h-3 w-3" />
                    Sua {lista} {itens.length > 1 ? "são temporárias" : "é temporária"} · Personalizar
                  </Link>
                </div>
              );
            })()}
          </div>


          {/* Oculto Match CTA */}
          <Link to="/matches" className="w-full max-w-full min-w-0 mt-4">
            <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-secondary/5 to-primary/10 p-3 flex items-center gap-3 hover:border-primary/50 transition-all group">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Oculto Match</p>
                <p className="text-[11px] text-muted-foreground">Descubra conexões e afinidades próximas</p>
              </div>
              <span className="text-xs text-primary font-semibold group-hover:translate-x-0.5 transition-transform">Entrar →</span>
            </div>
          </Link>

          {/* Info Bar */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-xs text-muted-foreground">
            {profile?.profile_type && (
              <div className="flex items-center gap-1">
                <span>{profile.profile_type === 'couple' ? '👫' : '👤'}</span>
                <span>{profile.profile_type === 'couple' ? 'Casal' : 'Individual'}</span>
              </div>
            )}
            {location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /><span>{location}</span>
              </div>
            )}
          </div>

          {/* Bio de texto e Bio de áudio foram movidos para cima do card Identidade Social */}


          {/* Action Buttons movidos para cima da bio de áudio */}






          {/* Pending Safety Check-ins (overdue only — show as urgent alert) */}
          {pendingCheckins.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-destructive flex items-center gap-2">
                <Shield className="h-4 w-4" />⚠️ Check-ins Atrasados — Confirme sua segurança!
              </p>
              {pendingCheckins.slice(0, 2).map(checkin => (
                <SafetyCheckinCard key={checkin.id} checkin={checkin} />
              ))}
            </div>
          )}

          {showDebugPanels && resolvedAuthorScope && (
            <div className="mt-4 rounded-xl border border-border/40 bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-foreground">Author Scope Debug</p>
                  <p className="text-[11px] text-muted-foreground">IDs canônico e legados usados para buscar as postagens do perfil.</p>
                </div>
                <Badge variant="outline" className="text-[10px]">cache 60s</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 text-[11px]">
                <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1.5">
                  <p className="text-muted-foreground">Canônico</p>
                  <p><span className="text-muted-foreground">profile.id:</span> <span className="font-mono break-all">{resolvedAuthorScope.authorProfileId}</span></p>
                  <p><span className="text-muted-foreground">auth user:</span> <span className="font-mono break-all">{resolvedAuthorScope.creatorId}</span></p>
                  <p><span className="text-muted-foreground">username:</span> <span className="font-mono">{resolvedAuthorScope.canonicalUsername || profile?.username || '—'}</span></p>
                </div>
                <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1.5">
                  <p className="text-muted-foreground">Legados / busca</p>
                  <p><span className="text-muted-foreground">matched usernames:</span> {resolvedAuthorScope.matchedUsernames?.length ? resolvedAuthorScope.matchedUsernames.join(', ') : '—'}</p>
                  <p><span className="text-muted-foreground">legacy profiles:</span> {resolvedAuthorScope.hasLegacyProfiles ? 'sim' : 'não'}</p>
                  <p><span className="text-muted-foreground">owner ids:</span></p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {resolvedAuthorScope.allProfileIds.map((id) => (
                      <Badge key={id} variant="secondary" className="font-mono text-[10px] break-all max-w-full">{id}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Avaliação + Depoimentos + Recomendações (visíveis no próprio perfil) */}
        {profile?.id && (
          <div className="mt-6 space-y-4 w-full max-w-full min-w-0 [&>*]:w-full [&>*]:max-w-full [&>*]:min-w-0">

            <ProfileTestimonialsSection
              targetProfileId={profile.id}
              displayHandle={username}
            />
            <ProfileRecommendationsSection targetProfileId={profile.id} />
            <ProfileMuralSection targetProfileId={profile.id} ownerHandle={username} />
          </div>
        )}

        {/* Posts particionados: cofre (hidden) vs visíveis (demais privacidades) */}
        {(() => null)()}
        {/* Tabs */}
        {(() => {
          const visiblePosts = (myPosts as any[]).filter((p: any) =>
            p.privacy_level !== 'hidden' &&
            p.privacy_level !== 'vip' &&
            !(p.is_paid === true || Number(p.paid_price || 0) > 0) &&
            p.content_format !== 'narrative' &&
            !['diary','story','chapter','article','series','text_post'].includes(String(p.section_type || ''))
          );
          const mediaCount = visiblePosts.filter((p: any) =>
            !!(p.media_url || p.thumbnail_url || p.preview_url) &&
            String(p.media_type || '') !== 'audio' &&
            p.post_type !== 'voice_bio'
          ).length;
          const safetyCount = allCheckins.filter(c => c.status === 'scheduled').length;
          const tabs = [
            { key: 'posts', icon: Grid3X3, label: 'Posts', badge: visiblePosts.length },
            { key: 'media', icon: ImageIcon, label: 'Mídia', badge: mediaCount },
            { key: 'play', icon: Play, label: 'Play' },
            ...(vipChannelEnabled
              ? ([{ key: 'diary', icon: BookOpen, label: 'Diário VIP', badge: diaryPosts.length }] as const)
              : ([] as const)),
            { key: 'liked', icon: Heart, label: 'Curtidos', badge: likedPosts.length },
            { key: 'safety', icon: Shield, label: 'Seguro', badge: safetyCount },
            { key: 'referral', icon: Users, label: 'Indicados', badge: referrals.length },
            { key: 'financial', icon: Wallet, label: 'Financeiro' },
            { key: 'vault', icon: Lock, label: 'Cofre', badge: vaultTotal },
          ] as const;
          return (
            <div className="flex border-b border-border/50 mt-6 overflow-x-auto scrollbar-none">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                    activeTab === tab.key
                      ? tab.key === 'diary'
                        ? "border-amber-500 text-amber-400"
                        : "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {'badge' in tab && (tab as any).badge > 0 && (
                    <Badge
                      variant={tab.key === 'diary' ? 'outline' : tab.key === 'vault' || tab.key === 'safety' ? 'destructive' : 'secondary'}
                      className={cn(
                        "ml-1 h-4 px-1.5 flex items-center justify-center text-[10px] font-semibold",
                        tab.key === 'diary' && "border-amber-500/50 text-amber-300 bg-amber-500/10",
                        activeTab === tab.key && tab.key !== 'diary' && tab.key !== 'vault' && tab.key !== 'safety' && "bg-primary/15 text-primary"
                      )}
                    >
                      {(tab as any).badge}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          );
        })()}


        {/* Posts Grid — exclui mídias hidden, narrativas do Diário VIP, conteúdo VIP e Pago */}
        {activeTab === "posts" && (
          <PostsGrid
            posts={(myPosts as any[]).filter((p: any) =>
              p.privacy_level !== 'hidden' &&
              p.privacy_level !== 'vip' &&
              !(p.is_paid === true || Number(p.paid_price || 0) > 0) &&
              p.content_format !== 'narrative' &&
              !['diary','story','chapter','article','series','text_post'].includes(String(p.section_type || ''))
            )}
            isLoading={postsLoading}
            highlightPostId={new URLSearchParams(routerLocation.search).get('highlight')}
            highlightFocus={new URLSearchParams(routerLocation.search).get('focus') as any}
          />
        )}


        {/* Media Tab — exclui hidden, narrativas, VIP e Pago */}
        {activeTab === "media" && (
          <ProfileMediaTabs
            posts={(myPosts as any[]).filter((p: any) =>
              p.privacy_level !== 'hidden' &&
              p.privacy_level !== 'vip' &&
              !(p.is_paid === true || Number(p.paid_price || 0) > 0) &&
              p.content_format !== 'narrative' &&
              !['diary','story','chapter','article','series','text_post'].includes(String(p.section_type || ''))
            )}
            isLoading={postsLoading}
            planType={planType}
          />
        )}

        {/* Play Tab — itens do dono publicados no Oculto Play */}
        {activeTab === "play" && (
          <MyPlayCards creatorId={profile.id} />
        )}





        {/* Diário VIP Tab — só aparece quando o canal VIP está ativo */}
        {activeTab === "diary" && vipChannelEnabled && (
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <BookOpen className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-amber-300">Diário VIP — Seu canal de leitura.</span>{" "}
                Histórias, capítulos, bastidores e textos publicados no seu canal aparecem aqui.
                Cada item respeita sua privacidade: <b>Público</b>, <b>Amigos</b> ou <b>VIP</b>.
                Itens pagos exibem o valor no card.
              </p>
            </div>
            <ProfileDiaryGrid posts={diaryPosts as any[]} isLoading={diaryLoading} />
          </div>
        )}



        {/* Cofre Tab — privacy_level === 'hidden' (somente dono e master enxergam) */}
        {activeTab === "vault" && (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg border border-slate-500/40 bg-slate-800/30">
              <EyeOff className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Cofre — Invisível a todos.</span>{" "}
                Mídias salvas com privacidade <b>🔒 Invisível a Todos</b> aparecem apenas aqui.
                Nenhum outro usuário consegue ver esta guia.
              </p>
            </div>
            <VaultManager profileId={profile?.id} />
          </div>
        )}

        {/* Liked Tab */}
        {activeTab === "liked" && (
          <LikedGrid posts={likedPosts} isLoading={likedLoading} />
        )}

        {/* Safety Tab */}
        {activeTab === "safety" && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Meus Encontros Seguros
              </h3>
              <CreateCheckinDialog
                trigger={
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10">
                    <Shield className="h-3.5 w-3.5" />
                    Novo
                  </Button>
                }
              />
            </div>
            {allCheckins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <Shield className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Nenhum check-in agendado</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Crie um check-in de segurança para seus encontros. Seus contatos serão alertados caso você não confirme.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {allCheckins.map(checkin => (
                  <SafetyCheckinCard key={checkin.id} checkin={checkin} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Referral Tab */}
        {activeTab === "referral" && (
          <div className="mt-4 space-y-4">
            {/* Aviso de privacidade */}
            <div className="flex items-start gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <svg className="h-4 w-4 text-primary mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Visível apenas para você.</span>{" "}
                As guias <b>Indicados</b> e <b>Financeiro</b> não aparecem para outros usuários no seu perfil público. Somente a administração master tem acesso.
              </p>
            </div>

            <ProfileReferralSection />
            
            {/* Referrals List */}
            <div className="rounded-xl border border-border/30 bg-card/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Meus Indicados ({referrals.length})
              </h3>
              {referralsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="space-y-1 flex-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : referrals.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-2">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Nenhum indicado ainda</p>
                  <p className="text-xs text-muted-foreground mt-1">Compartilhe seu link para convidar amigos!</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {referrals.map((ref: any) => {
                    const p = ref.afilhada_profile || {};
                    const target = p.username || p.id || ref.afilhada_id;
                    const isPaid = Number(ref.total_commission_earned || 0) > 0 && ref.last_commission_at;
                    return (
                      <Link
                        key={ref.id}
                        to={`/creator/${target}`}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <img
                          src={p.avatar_url || ""}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover bg-muted"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {p.name || p.username || "Indicado"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Entrou em {new Date(ref.started_at || ref.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isPaid && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-[hsl(142,76%,36%)] text-white hover:bg-[hsl(142,76%,36%)]">
                              PAGA
                            </Badge>
                          )}
                          <span className="text-[10px] font-semibold text-[hsl(142,76%,36%)]">
                            R$ {Number(ref.total_commission_earned || 0).toFixed(2)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Financial Tab */}
        {activeTab === "financial" && (
          <div className="mt-4">
            <ProfileFinancialSection />
          </div>
        )}
      </div>
    </div>
  );
}

function PostsGrid({
  posts,
  isLoading,
  highlightPostId,
  highlightFocus,
}: {
  posts: any[];
  isLoading: boolean;
  highlightPostId?: string | null;
  highlightFocus?: 'likes' | 'comments' | 'saved' | 'shares' | null;
}) {
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [selectedPollPostId, setSelectedPollPostId] = useState<string | null>(null);
  const lastHighlightRef = useRef<string | null>(null);
  const nonPollPosts = posts
    .filter((post) => post.post_type !== 'poll')
    .slice()
    .sort((a: any, b: any) => {
      const ap = a?.is_pinned ? 1 : 0;
      const bp = b?.is_pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const ad = new Date(a?.created_at || 0).getTime();
      const bd = new Date(b?.created_at || 0).getTime();
      return bd - ad;
    });
  const pollPosts = posts.filter((post) => post.post_type === 'poll');

  // ── Modo seleção (excluir múltiplos posts) ─────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const qcInner = useQueryClient();
  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(nonPollPosts.map((p) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };
  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`Excluir ${selectedIds.size} post(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('posts').delete().in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} post(s) excluído(s).` });
      exitSelectMode();
      qcInner.invalidateQueries({ queryKey: ['my-posts'] });
      qcInner.invalidateQueries({ queryKey: ['profile-posts'] });
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // Abre automaticamente o post destacado vindo das notificações.
  // Se o post não estiver na lista carregada, buscamos sob demanda
  // para garantir que o modal abra direto (sem o usuário cair na grade).
  useEffect(() => {
    if (!highlightPostId) return;
    if (lastHighlightRef.current === highlightPostId) return;

    const target = posts.find((p) => p.id === highlightPostId);
    if (target) {
      lastHighlightRef.current = highlightPostId;
      if (target.post_type === 'poll') {
        setSelectedPollPostId(target.id);
      } else {
        setSelectedPost(target);
      }
      return;
    }

    // Aguarda a lista carregar antes de partir para fetch direto
    if (isLoading) return;

    let cancelled = false;
    lastHighlightRef.current = highlightPostId;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('id', highlightPostId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        if ((data as any).post_type === 'poll') {
          setSelectedPollPostId((data as any).id);
        } else {
          setSelectedPost(data);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [highlightPostId, posts, isLoading]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-sm" />
        ))}
      </div>
    );
  }


  return (
    <>
      {/* Toolbar de seleção/exclusão */}
      {nonPollPosts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!selectMode ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectMode(true)}
              className="text-xs"
            >
              Selecionar para excluir
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={selectAll} className="text-xs">
                Selecionar todas ({nonPollPosts.length})
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection} className="text-xs">
                Limpar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={deleteSelected}
                disabled={!selectedIds.size || deleting}
                className="text-xs ml-auto"
              >
                Excluir selecionadas ({selectedIds.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={exitSelectMode} className="text-xs">
                Cancelar
              </Button>
            </>
          )}
        </div>
      )}

      <div className="mt-4">
        {posts.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground text-sm">Nenhum post ainda</p>
          </div>
        ) : nonPollPosts.length > 0 ? (
          <PinterestMasonry
            items={enrichPostsForGrid(nonPollPosts)}
            onItemClick={(post) => setSelectedPost(post)}
            selectable={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleId}
            renderOverlay={(item) => <SpecialPostOverlay item={item} />}
            className="columns-2 sm:columns-3 lg:columns-4 mt-0"
          />
        ) : null}
      </div>

      {pollPosts.length > 0 && (
        <div className="grid grid-cols-3 gap-1 mt-4">
          {pollPosts.map((post) => (
            <div
              key={post.id}
              className="relative aspect-square group cursor-pointer overflow-hidden rounded-sm"
              onClick={() => setSelectedPollPostId(post.id)}
            >
              <PollGridThumb postId={post.id} />
            </div>
          ))}
        </div>
      )}
      <PostMysteryViewer
        post={selectedPost ? toMisterioPost(selectedPost) : null}
        onClose={() => setSelectedPost(null)}
      />

      <PollResultModal
        open={!!selectedPollPostId}
        onOpenChange={(open) => { if (!open) setSelectedPollPostId(null); }}
        postId={selectedPollPostId}
      />
    </>
  );
}

function LikedGrid({ posts, isLoading }: { posts: any[]; isLoading: boolean }) {
  const [selectedPost, setSelectedPost] = useState<any>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-sm" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <Heart className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">Nenhum post curtido</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Quando você curtir um post, ele aparecerá aqui
        </p>
      </div>
    );
  }

  return (
    <>
      <PinterestMasonry
        items={enrichPostsForGrid(posts)}
        onItemClick={(post) => setSelectedPost(post)}
        renderOverlay={(item) => <SpecialPostOverlay item={item} />}
        className="columns-2 sm:columns-3 lg:columns-4 mt-4"
      />
      <PostMysteryViewer
        post={selectedPost ? toMisterioPost(selectedPost) : null}
        onClose={() => setSelectedPost(null)}
      />

    </>
  );
}
