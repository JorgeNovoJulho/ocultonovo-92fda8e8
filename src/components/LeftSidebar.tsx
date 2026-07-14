import { useState, lazy, Suspense, useEffect } from "react";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
const CreatePostModal = lazy(() => import("./CreatePostModal").then(m => ({ default: m.CreatePostModal })));
const SubscriptionPlansModal = lazy(() => import("./SubscriptionPlansModal").then(m => ({ default: m.SubscriptionPlansModal })));
const FollowersFollowingModal = lazy(() => import("./FollowersFollowingModal").then(m => ({ default: m.FollowersFollowingModal })));
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { LegalFooter } from "./LegalFooter";
const SupportTicketModal = lazy(() => import("./SupportTicketModal").then(m => ({ default: m.SupportTicketModal })));
import { ActivityTicker } from "@/components/activity";
import { useIsAdmin, useIsMasterAdmin } from "@/hooks/useUserRoles";
import { useOnlineCount } from "@/hooks/useOnlineCount";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useMatches } from "@/hooks/useMatches";
import { useViewedMatches } from "@/hooks/useViewedMatches";
import { useViewedLikes } from "@/hooks/useViewedLikes";
import { useMyProfileStats } from "@/hooks/useMyProfileStats";
const PremiumUpgradeModal = lazy(() => import("@/components/PremiumUpgradeModal").then(m => ({ default: m.PremiumUpgradeModal })));
import { useChat } from "@/hooks/useChat";
import { useReceivedLikesCount } from "@/hooks/useProfileLikes";
import { useAuraGiftsUnseenCount } from "@/hooks/useAuraGifts";
import { useSocialBetaModule } from "@/hooks/useSocialBetaModule";
import { useAuraXpInteraction } from "@/hooks/useAuraXpInteraction";
import { HiddenSessionsEntry } from "@/components/view-mode/HiddenSessionsEntry";
import { SectionShortcutsNav } from "@/components/view-mode/SectionShortcutsNav";

const VitrinePlansModal = lazy(() => import("@/components/VitrinePlansModal").then(m => ({ default: m.VitrinePlansModal })));
const FinanceiroModal = lazy(() => import("@/components/FinanceiroModal").then(m => ({ default: m.FinanceiroModal })));
const PromotionsModal = lazy(() => import("@/components/PromotionsModal").then(m => ({ default: m.PromotionsModal })));
const DeleteAccountModal = lazy(() => import("@/components/settings/DeleteAccountModal").then(m => ({ default: m.DeleteAccountModal })));
import { OnlineDot } from "@/components/ui/OnlineDot";
const LiveOnlineUsersDialog = lazy(() => import("./LiveOnlineUsersDialog").then(m => ({ default: m.LiveOnlineUsersDialog })));
import { ProfileRatingBadge } from "@/components/profile/ProfileRatingBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Home,
  AlertTriangle,
  Radar,
  Search,
  Eye,
  Heart,
  HeartHandshake,
  Sparkles,
  BrainCircuit,
  Bookmark,
  DollarSign,
  Settings,
  PartyPopper,
  Plus,
  Crown,
  LogOut,
  BarChart3,
  FolderOpen,
  Download,
  Bell,
  Flame,
  Lock,
  Gavel,
  Activity,
  Users2,
  UserCheck2,
  MessageCircle,
  User,
  Store,
  ShieldCheck,
  Gift,
  Trash2,
  NotebookPen,
  Trophy,
  GraduationCap,
} from "lucide-react";
const NotepadModal = lazy(() => import("./notepad/NotepadModal").then(m => ({ default: m.NotepadModal })));
import { CreateCheckinDialog } from "@/components/safety/CreateCheckinDialog";
import { useEngagementLevel } from "@/hooks/useInitialExperience";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";
import { getPublicHandle } from "@/lib/userHandle";
import { readSidebarStats, writeSidebarStats } from "@/lib/sidebarStatsCache";
import { OcultoPlayMenuEntry } from "@/components/OcultoPlayMenuEntry";

const getPlanLabel = (planType: string | undefined) => {
  switch (planType) {
    case 'vip': return 'VIP';
    case 'premium':
    case 'monthly': return 'Premium';
    default: return 'Gratuito';
  }
};

const getPlanStyle = (planType: string | undefined) => {
  switch (planType) {
    case 'vip': return 'border-[hsl(45,93%,47%)] text-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10';
    case 'premium':
    case 'monthly': return 'border-primary text-primary bg-primary/10';
    // Plano Gratuito: fundo vermelho com texto branco — visibilidade explícita
    default: return 'border-[hsl(0,84%,45%)] text-white bg-[hsl(0,84%,55%)]';
  }
};

export function LeftSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, error: profileError } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const { data: isMasterAdmin } = useIsMasterAdmin();
  const { unreadCount } = useNotifications();
  const { activeMatches } = useMatches();
  const { data: stats } = useMyProfileStats(profile?.id);
  const { totalUnreadCount: unreadMessages } = useChat();
  const { data: receivedLikesData } = useReceivedLikesCount();
  const totalReceivedLikes = receivedLikesData?.total ?? 0;
  const receivedLikeIds = receivedLikesData?.ids ?? [];
  const { data: onlineCount = 0 } = useOnlineCount();
  const { unviewedCount: newMatchesCount, markAsViewed } = useViewedMatches(activeMatches.map(m => m.id));
  const { unviewedCount: newLikesCount, markAllViewed: markAllLikesViewed } = useViewedLikes(receivedLikeIds);
  const { data: engagementLevel } = useEngagementLevel();
  const { chargeAction } = useAuraXpInteraction();
  const isNewUser = (engagementLevel ?? 'new') === 'new';

  // ── Cache de sessão dos contadores: evita "flash de zeros" ao navegar ──
  const cachedStats = readSidebarStats(profile?.id);
  const displayFollowers = stats?.totalFollowers ?? cachedStats?.totalFollowers ?? 0;
  const displayFollowing = stats?.totalFollowing ?? cachedStats?.totalFollowing ?? 0;
  const displayReceivedLikes = receivedLikesData?.total ?? cachedStats?.receivedLikes ?? totalReceivedLikes;
  const displayAuraXp = Number((profile as any)?.aura_xp ?? cachedStats?.auraXp ?? 0);

  useEffect(() => {
    if (!profile?.id) return;
    if (stats?.totalFollowers !== undefined || stats?.totalFollowing !== undefined) {
      writeSidebarStats(profile.id, {
        totalFollowers: stats?.totalFollowers,
        totalFollowing: stats?.totalFollowing,
        totalPosts: stats?.totalPosts,
        totalViews: stats?.totalViews,
        auraXp: Number((profile as any)?.aura_xp ?? 0),
      });
    }
    if (receivedLikesData?.total !== undefined) {
      writeSidebarStats(profile.id, { receivedLikes: receivedLikesData.total });
    }
  }, [profile?.id, stats?.totalFollowers, stats?.totalFollowing, stats?.totalPosts, stats?.totalViews, receivedLikesData?.total, (profile as any)?.aura_xp]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showVitrineModal, setShowVitrineModal] = useState(false);
  const [showFinanceiroModal, setShowFinanceiroModal] = useState(false);
  const [showPromotionsModal, setShowPromotionsModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showNotepadModal, setShowNotepadModal] = useState(false);
  const [showLiveUsersModal, setShowLiveUsersModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState("recursos financeiros");

  // Permite abrir o bloco de notas de qualquer lugar (ex.: toast do ProfileActionsMenu)
  useEffect(() => {
    const handler = () => setShowNotepadModal(true);
    window.addEventListener("oculto:open-notepad", handler);
    return () => window.removeEventListener("oculto:open-notepad", handler);
  }, []);

  const { freeGetsPremiumSocial } = usePlatformPhase();
  // Flag estrita: ignora o bypass beta. Usada para itens monetizados/pagos
  // (Promoções, Eventos, Leilões, Financeiro, Downloads VIP, Planos Pagos).
  const isPremiumOrVipStrict =
    profile?.plan_type === 'premium' ||
    profile?.plan_type === 'monthly' ||
    profile?.plan_type === 'vip';
  // Flag social (com bypass beta): mantém recursos sociais liberados no beta.
  const isPremiumOrVip = freeGetsPremiumSocial || isPremiumOrVipStrict;

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "'Desde' MMM yyyy", { locale: ptBR })
    : '';

  const fallbackName = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const displayName = getPublicHandle(profile as any) || `@${fallbackName.toLowerCase()}`;

  if (profileError) {
    console.error('[Header] Falha ao buscar perfil externo, aplicando fallback local:', profileError);
  }

  const isActive = (href: string) => {
    if (!href) return false;
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const target = href.replace(/\/+$/, '') || '/';
    return path === target || path.startsWith(target + '/');
  };

  const navLinkClass = (href: string, extra?: string) => cn(
    "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium group",
    isActive(href)
      ? "bg-primary/15 text-primary ring-1 ring-primary/30 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-1 before:rounded-r before:bg-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
    extra
  );

  // Mapa COMPLETO de rotas → action_key (cobrança automática ao clicar)
  const XP_LINK_MAP: Record<string, string> = {
    '/feed': 'menu_feed',
    '/pesquisar': 'menu_pesquisar',
    '/profile': 'menu_profile',
    '/radar': 'menu_radar',
    '/canal-vip': 'menu_canal_vip',
    '/aura-match': 'menu_aura_match',
    '/perfect-pair': 'menu_perfect_pair',
    '/matches': 'menu_matches',
    '/messages': 'menu_chat',
    '/likes': 'menu_likes',
    '/ranking': 'menu_ranking',
    '/visits': 'menu_visits',
    '/notifications': 'menu_notifications',
    '/my-media': 'menu_my_media',
    '/vip-downloads': 'menu_vip_downloads',
    '/subscriptions': 'menu_subscriptions',
    '/affiliates': 'menu_affiliates',
    '/events': 'menu_events',
    '/saved': 'menu_saved',
    '/auctions': 'menu_auctions',
    '/followers': 'menu_followers',
    '/following': 'menu_following',
    '/my-gifts': 'menu_my_gifts',
    '/sessoes-ocultas': 'menu_sessoes_ocultas',
    '/experiencias-ocultas': 'menu_experiencias_ocultas',
    '/settings': 'menu_settings',
  };

  // Cobra XP genericamente. Se ok=true, segue; senão bloqueia (modal global cuida).
  const chargeMenu = async (actionKey: string): Promise<boolean> => {
    const res = await chargeAction({ actionKey, refKey: `sidebar_${actionKey}` });
    return !!res.ok;
  };

  const handleLinkClick = async (e: React.MouseEvent, href: string) => {
    const actionKey = XP_LINK_MAP[href];
    if (!actionKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (await chargeMenu(actionKey)) navigate(href);
  };

  // Wrapper para botões (sem href). Executa ação apenas se XP suficiente.
  const guardAction = async (actionKey: string, action: () => void) => {
    if (await chargeMenu(actionKey)) action();
  };

  return (
    <>
      <aside
        className="hidden md:block sticky top-16 border-r border-border/30 overflow-y-auto"
        style={{
          height: 'calc(100dvh - 4rem)',
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          alignSelf: 'start', // CRÍTICO: não estica o grid row
        } as React.CSSProperties}
      >
        <div className="px-3 pt-5 pb-10 space-y-2">

          {/* ── Perfil ── */}
          <Link
            to="/profile"
            className="mb-1 p-4 rounded-2xl bg-gradient-to-br from-card/70 via-card/40 to-card/20 border border-border/50 hover:border-primary/40 transition-all block shadow-sm"
          >
            <div className="space-y-2">
              {/* Username em linha própria — usa toda a largura do card */}
              <p className="font-extrabold text-foreground text-[15px] leading-tight break-all">
                {displayName}
              </p>

              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <Avatar className="h-14 w-14 ring-2 ring-primary/40 shadow-lg">
                    <AvatarImage src={buildSupabaseImageThumb(profile?.avatar_url, { width: 160, quality: 75 }) || profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/15 text-primary text-base font-bold">
                      {displayName?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <OnlineDot user={profile as any} size="md" borderClassName="border-card" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Tags padronizadas — todas h-5, mesmo tamanho de fonte/padding */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={cn("inline-flex items-center h-5 px-1.5 py-0 text-[10px] font-bold leading-none", getPlanStyle(profile?.plan_type))}>
                      {getPlanLabel(profile?.plan_type)}
                    </Badge>
                    {profile?.id && (
                      <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        <ProfileRatingBadge
                          targetProfileId={profile.id}
                          displayHandle={profile?.username ? `@${profile.username}` : displayName}
                          disabled
                          className="inline-flex items-center h-5 px-1.5 py-0 text-[10px] leading-none"
                        />
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500/90 to-amber-400/90 px-1.5 h-5 text-[10px] font-black text-black leading-none">
                      ⚡ {displayAuraXp.toLocaleString('pt-BR')} XP
                    </span>
                  </div>
                  {memberSince && (
                    <p className="text-[10px] text-muted-foreground capitalize whitespace-nowrap">
                      {memberSince}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[11px] whitespace-nowrap">
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate('/followers'); }}
                      className="text-[hsl(199,89%,55%)] hover:underline cursor-pointer font-medium"
                    >
                      <strong className="text-foreground">{displayFollowers}</strong> seguidores
                    </span>
                    <span className="text-border">•</span>
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate('/following'); }}
                      className="text-[hsl(280,75%,65%)] hover:underline cursor-pointer font-medium"
                    >
                      <strong className="text-foreground">{displayFollowing}</strong> seguindo
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Link>


          <div className="space-y-0.5 pb-1">

            {/* ── 1. PUBLICAR ── */}
            <button
              onClick={() => guardAction('menu_publicar', () => setShowCreateModal(true))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40"
            >
              <Plus className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex-1 text-left">Publicar</span>
            </button>

            {/* ── 1a.1 ATALHOS DINÂMICOS — refletem as seções ativadas em /sessoes-ocultas ── */}
            <SectionShortcutsNav variant="sidebar" />

            {/* ── 2. INÍCIO ── */}
            <Link to="/feed" onClick={e => handleLinkClick(e, '/feed')} className={navLinkClass('/feed')}>
              <Home className={cn("h-5 w-5 shrink-0", isActive('/feed') ? "text-primary" : "text-primary/70")} />
              <span className="flex-1">Início</span>
            </Link>

            {/* ── 3. PESQUISAR ── */}
            <Link to="/pesquisar" onClick={e => handleLinkClick(e, '/pesquisar')} className={navLinkClass('/pesquisar')}>
              <Search className={cn("h-5 w-5 shrink-0", isActive('/pesquisar') ? "text-primary" : "text-cyan-400")} />
              <span className="flex-1">Pesquisar</span>
            </Link>

            {/* ── 4. MEU PERFIL ── */}
            <Link to="/profile" onClick={e => handleLinkClick(e, '/profile')} className={navLinkClass('/profile')}>
              <User className={cn("h-5 w-5 shrink-0", isActive('/profile') ? "text-primary" : "text-violet-400")} />
              <span className="flex-1">Meu Perfil</span>
            </Link>

            {/* ── 5. MEU CANAL VIP (exclusivo VIP) ── */}
            {profile?.plan_type === 'vip' && (
              <Link to="/canal-vip" onClick={e => handleLinkClick(e, '/canal-vip')} className={navLinkClass('/canal-vip')}>
                <Crown className={cn("h-5 w-5 shrink-0", isActive('/canal-vip') ? "text-primary" : "text-[hsl(45,93%,47%)]")} />
                <span className="flex-1 text-left">Meu Canal VIP</span>
              </Link>
            )}

            {/* ── OCULTO PLAY (acima de Comunidades) ── */}
            <OcultoPlayMenuEntry
              onClick={() => navigate('/oculto-play')}
              isActive={isActive('/oculto-play')}
              variant="sidebar"
            />

            {/* ── COMUNIDADES OCULTAS (acima do Chat) ── */}
            <button
              onClick={() => navigate('/comunidades')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive('/comunidades') ? 'bg-fuchsia-500/10 text-fuchsia-300' : 'text-foreground/80 hover:bg-accent/50'
              )}
            >
              <Users2 className="h-5 w-5 shrink-0 text-fuchsia-400" />
              <span className="flex-1 text-left">Comunidades</span>
              <Badge className="bg-fuchsia-500/20 text-fuchsia-300 text-[9px] font-bold border-0 h-4 px-1.5">NOVO</Badge>
            </button>


            {/* ── CHAT ── */}
            <Link to="/messages" onClick={e => handleLinkClick(e, '/messages')} className={cn(navLinkClass('/messages'), "relative")}>
              <MessageCircle className={cn("h-5 w-5 shrink-0", isActive('/messages') ? "text-primary" : "text-blue-400")} />
              <span className="flex-1">Chat</span>
              {unreadMessages > 0 && (
                <Badge className="bg-primary text-primary-foreground text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </Badge>
              )}
            </Link>


            {/* ── AURA IA (painel inteligente no feed) ── */}
            <button
              onClick={() => {
                if (location.pathname !== '/feed') {
                  navigate('/feed?openAura=1');
                  return;
                }
                try { window.dispatchEvent(new CustomEvent('oculto:open-aura')); } catch {}
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold w-full",
                "text-white border-2 border-white/30",
                "bg-[linear-gradient(115deg,#ff1aa8_0%,#d946ef_30%,#a855f7_60%,#22d3ee_100%)]",
                "shadow-[0_0_14px_rgba(217,70,239,0.6),0_0_28px_rgba(168,85,247,0.4)]",
                "hover:brightness-125"
              )}
              aria-label="Abrir Aura IA"
            >
              <BrainCircuit className="h-5 w-5 shrink-0 drop-shadow-[0_0_6px_rgba(255,255,255,1)]" />
              <span className="flex-1 text-left tracking-wide">Aura IA</span>
              <Badge className="bg-white/20 text-white text-[9px] font-bold border-0 h-4 px-1.5">NOVO</Badge>
            </button>

            {/* ── 6. AURA MATCH ── */}
            <button
              onClick={async () => {
                const res = await chargeAction({ actionKey: 'menu_aura_match', refKey: 'sidebar_aura_match' });
                if (res.ok) navigate('/aura-match');
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold w-full",
                isActive('/aura-match')
                  ? "bg-fuchsia-500/20 text-fuchsia-300"
                  : "text-muted-foreground hover:text-fuchsia-300 hover:bg-fuchsia-500/10"
              )}
            >
              <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-400" />
              <span className="flex-1 text-left">Aura Match</span>
              <Badge className="bg-fuchsia-500/20 text-fuchsia-300 text-[9px] font-bold border-0 h-4 px-1.5">NOVO</Badge>
            </button>

            {/* ── MATCHES ── */}
            <Link to="/matches" className={navLinkClass('/matches')} onClick={(e) => { e.preventDefault(); guardAction('menu_matches', () => { activeMatches.forEach(m => markAsViewed(m.id)); navigate('/matches'); }); }}>
              <Flame className={cn("h-5 w-5 shrink-0", isActive('/matches') ? "text-primary" : "text-orange-500")} />
              <span className="flex-1">Matches</span>
              {newMatchesCount > 0 && (
                <Badge className="bg-orange-500 text-primary-foreground text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5">
                  {newMatchesCount > 99 ? '99+' : newMatchesCount}
                </Badge>
              )}
            </Link>

            {/* ── 7. SEGUIDORES ── */}
            <button
              onClick={() => guardAction('menu_followers', () => setShowFollowersModal(true))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 w-full"
            >
              <Users2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex-1 text-left">Seguidores</span>
              {(stats?.totalFollowers ?? 0) > 0 && (
                <Badge className="bg-primary/20 text-primary text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5 border-0">
                  {stats?.totalFollowers}
                </Badge>
              )}
            </button>

            {/* ── 8. SEGUINDO ── */}
            <button
              onClick={() => guardAction('menu_following', () => setShowFollowingModal(true))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 w-full"
            >
              <UserCheck2 className="h-5 w-5 shrink-0 text-secondary" />
              <span className="flex-1 text-left">Seguindo</span>
              {(stats?.totalFollowing ?? 0) > 0 && (
                <Badge className="bg-secondary/20 text-secondary text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5 border-0">
                  {stats?.totalFollowing}
                </Badge>
              )}
            </button>

            {/* ── MEUS PRESENTES ── */}
            <MyGiftsSidebarItem
              isActive={isActive('/my-gifts')}
              onClick={() => guardAction('menu_my_gifts', () => navigate('/my-gifts'))}
              cn={cn}
            />

            {/* ── PERFECT PAIR (apenas Master Admin — invisível para demais) ── */}
            {isMasterAdmin && (
              <button
                onClick={async () => {
                  const res = await chargeAction({ actionKey: 'menu_perfect_pair', refKey: 'sidebar_perfect_pair' });
                  if (res.ok) navigate('/perfect-pair');
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold w-full",
                  isActive('/perfect-pair')
                    ? "bg-[#FF2D55]/20 text-[#FF2D55]"
                    : "text-muted-foreground hover:text-[#FF2D55] hover:bg-[#FF2D55]/10"
                )}
              >
                <HeartHandshake className="h-5 w-5 shrink-0 text-[#FF2D55]" />
                <span className="flex-1 text-left">Perfect Pair</span>
              </button>
            )}


            {/* ── EXPERIÊNCIAS OCULTAS (gated, invisível por padrão) ── */}
            <HiddenExperiencesSidebarItem
              isActive={isActive('/experiencias-ocultas')}
              onClick={() => navigate('/experiencias-ocultas')}
            />





            {/* ── RADAR ── */}
            <Link to="/radar" onClick={e => handleLinkClick(e, '/radar')} className={navLinkClass('/radar')}>
              <Radar className={cn("h-5 w-5 shrink-0", isActive('/radar') ? "text-primary" : "text-green-400")} />
              <span className="flex-1">Radar</span>
            </Link>

            {/* ── BLOCO DE NOTAS ── */}
            <button
              onClick={() => guardAction('menu_notepad', () => setShowNotepadModal(true))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40"
            >
              <NotebookPen className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex-1 text-left">Bloco de Notas</span>
            </button>

            {/* ── TUTORIAIS (somente master) ── */}
            {isMasterAdmin && (
              <Link to="/tutoriais" onClick={e => handleLinkClick(e, '/tutoriais')} className={navLinkClass('/tutoriais')}>
                <GraduationCap className={cn("h-5 w-5 shrink-0", isActive('/tutoriais') ? "text-primary" : "text-teal-400")} />
                <span className="flex-1">Tutoriais</span>
              </Link>
            )}

            {/* ── CURTIDAS ── */}
            <Link to="/likes" className={navLinkClass('/likes')} onClick={(e) => { e.preventDefault(); guardAction('menu_likes', () => { markAllLikesViewed(); navigate('/likes'); }); }}>
              <Heart className={cn("h-5 w-5 shrink-0", isActive('/likes') ? "text-primary" : "text-rose-500")} />
              <span className="flex-1">Curtidas</span>
              {newLikesCount > 0 && (
                <Badge className="bg-rose-500 text-white text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5">
                  {newLikesCount > 99 ? '99+' : newLikesCount}
                </Badge>
              )}
            </Link>

            {/* ── RANKING ── */}
            <Link to="/ranking" onClick={e => handleLinkClick(e, '/ranking')} className={navLinkClass('/ranking')}>
              <Trophy className={cn("h-5 w-5 shrink-0", isActive('/ranking') ? "text-primary" : "text-amber-400")} />
              <span className="flex-1">Ranking</span>
            </Link>

            {/* ── VISITAS RECEBIDAS ── */}
            {isPremiumOrVip ? (
              <Link to="/visits" onClick={e => handleLinkClick(e, '/visits')} className={navLinkClass('/visits')}>
                <Eye className={cn("h-5 w-5 shrink-0", isActive('/visits') ? "text-primary" : "text-cyan-400")} />
                <span className="flex-1">Visitas Recebidas</span>
              </Link>
            ) : (
              <button
                onClick={() => { setUpgradeFeature("Visitas Recebidas"); setShowUpgradeModal(true); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
              >
                <Eye className="h-5 w-5 shrink-0 text-cyan-400" />
                <span className="flex-1 text-left">Visitas Recebidas</span>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            )}


            {/* ── NOTIFICAÇÕES ── */}
            <Link to="/notifications" onClick={e => handleLinkClick(e, '/notifications')} className={navLinkClass('/notifications')}>
              <Bell className={cn("h-5 w-5 shrink-0", isActive('/notifications') ? "text-primary" : "text-yellow-400")} />
              <span className="flex-1">Notificações</span>
              {unreadCount > 0 && (
                <Badge className="bg-[#FF007F] text-white text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Badge>
              )}
            </Link>

            {/* ── PROMOÇÕES ── */}
            <button
              onClick={() => {
                if (!isPremiumOrVipStrict) { setUpgradeFeature("Promoções"); setShowUpgradeModal(true); return; }
                guardAction('menu_promotions', () => setShowPromotionsModal(true));
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40",
                !isPremiumOrVipStrict && "opacity-60"
              )}
            >
              <Gift className="h-5 w-5 shrink-0 text-[hsl(45,93%,47%)]" />
              <span className="flex-1 text-left">Promoções</span>
              {!isPremiumOrVipStrict && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
            </button>

            {/* ── MINHAS MÍDIAS ── */}
            <Link to="/my-media" onClick={e => handleLinkClick(e, '/my-media')} className={navLinkClass('/my-media')}>
              <FolderOpen className={cn("h-5 w-5 shrink-0", isActive('/my-media') ? "text-primary" : "text-indigo-400")} />
              <span className="flex-1">Minhas Mídias</span>
            </Link>

            {/* ── MEUS DOWNLOADS VIP ── */}
            {isPremiumOrVipStrict ? (
              <Link to="/vip-downloads" onClick={e => handleLinkClick(e, '/vip-downloads')} className={navLinkClass('/vip-downloads')}>
                <Download className={cn("h-5 w-5 shrink-0", isActive('/vip-downloads') ? "text-primary" : "text-emerald-400")} />
                <span className="flex-1">Meus downloads VIP</span>
              </Link>
            ) : (
              <button
                onClick={() => { setUpgradeFeature("Meus downloads VIP"); setShowUpgradeModal(true); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
              >
                <Download className="h-5 w-5 shrink-0 text-emerald-400" />
                <span className="flex-1 text-left">Meus downloads VIP</span>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            )}

            {/* ── SAFETY CHECK-IN ── */}
            {isPremiumOrVip ? (
              <CreateCheckinDialog
                trigger={
                  <button
                    onClick={async (e) => {
                      const ok = await chargeMenu('menu_safety_checkin');
                      if (!ok) { e.preventDefault(); e.stopPropagation(); }
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs font-semibold w-full text-green-400 hover:text-green-300 hover:bg-green-500/10"
                  >
                    <ShieldCheck className="h-5 w-5 shrink-0 text-green-400" />
                    <span className="flex-1 text-left">Encontro Seguro</span>
                  </button>
                }
              />
            ) : (
              <button
                onClick={() => { setUpgradeFeature("Encontro Seguro"); setShowUpgradeModal(true); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs font-semibold w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
              >
                <ShieldCheck className="h-5 w-5 shrink-0 text-green-400" />
                <span className="flex-1 text-left">Encontro Seguro</span>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            )}

            {/* ── PROBLEMAS ── */}
            <button
              onClick={() => guardAction('menu_support', () => setShowSupportModal(true))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-orange-400" />
              <span className="flex-1 text-left">Problemas?</span>
            </button>

            {/* ── PLANOS PAGOS ── */}
            <button
              onClick={() => {
                if (!isPremiumOrVipStrict) { setUpgradeFeature("Planos Pagos"); setShowUpgradeModal(true); return; }
                guardAction('menu_plans_paid', () => setShowPlansModal(true));
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40",
                !isPremiumOrVipStrict && "opacity-60"
              )}
            >
              <Crown className="h-5 w-5 shrink-0 text-[hsl(45,93%,47%)]" />
              <span className="flex-1 text-left">Planos Pagos</span>
              {!isPremiumOrVipStrict && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
            </button>

          </div>

          <div className="border-t border-border/20 pt-2 space-y-0.5">

            {/* ── 6. ASSINATURAS ── */}
            <Link to="/subscriptions" onClick={e => handleLinkClick(e, '/subscriptions')} className={navLinkClass('/subscriptions')}>
              <Crown className={cn("h-5 w-5 shrink-0", isActive('/subscriptions') ? "text-primary" : "text-[hsl(45,93%,47%)]")} />
              <span className="flex-1">Assinaturas</span>
            </Link>

            {/* ── VITRINE ── */}
            <button
              onClick={() => guardAction('menu_vitrine', () => setShowVitrineModal(true))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40"
            >
              <Store className="h-5 w-5 shrink-0 text-pink-400" />
              <span className="flex-1 text-left">Vitrine</span>
            </button>

            {/* ── GANHE INDICANDO ── */}
            <Link
              to="/affiliates"
              onClick={e => handleLinkClick(e, '/affiliates')}
              className={cn(
                navLinkClass('/affiliates'),
                isNewUser && "ring-1 ring-amber-400/50 bg-amber-500/5 hover:bg-amber-500/10"
              )}
            >
              <Gift className={cn("h-5 w-5 shrink-0", isActive('/affiliates') ? "text-primary" : "text-amber-400")} />
              <span className="flex-1">Ganhe Indicando</span>
              {isNewUser && <span className="text-[10px] font-bold text-amber-400">NOVO</span>}
            </Link>

            {/* ── EVENTOS ── */}
            {isPremiumOrVipStrict ? (
              <Link to="/events" onClick={e => handleLinkClick(e, '/events')} className={navLinkClass('/events')}>
                <PartyPopper className={cn("h-5 w-5 shrink-0", isActive('/events') ? "text-primary" : "text-purple-400")} />
                <span className="flex-1">Eventos</span>
              </Link>
            ) : (
              <button
                onClick={() => { setUpgradeFeature("Eventos"); setShowUpgradeModal(true); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
              >
                <PartyPopper className="h-5 w-5 shrink-0 text-purple-400" />
                <span className="flex-1 text-left">Eventos</span>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            )}

            {/* ── SALVOS ── */}
            <Link to="/saved" onClick={e => handleLinkClick(e, '/saved')} className={navLinkClass('/saved')}>
              <Bookmark className={cn("h-5 w-5 shrink-0", isActive('/saved') ? "text-primary" : "text-blue-400")} />
              <span className="flex-1">Salvos</span>
            </Link>




            {/* ── LEILÕES ── */}
            {isPremiumOrVipStrict ? (
              <Link to="/auctions" onClick={e => handleLinkClick(e, '/auctions')} className={navLinkClass('/auctions')}>
                <Gavel className={cn("h-5 w-5 shrink-0", isActive('/auctions') ? "text-primary" : "text-amber-500")} />
                <span className="flex-1">Leilões</span>
              </Link>
            ) : (
              <button
                onClick={() => { setUpgradeFeature("Leilões"); setShowUpgradeModal(true); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
              >
                <Gavel className="h-5 w-5 shrink-0 text-amber-500" />
                <span className="flex-1 text-left">Leilões</span>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>
            )}

            {/* ── FINANCEIRO ── */}
            <button
              onClick={() => {
                if (!isPremiumOrVipStrict) {
                  setUpgradeFeature("Financeiro");
                  setShowUpgradeModal(true);
                  return;
                }
                guardAction('menu_financeiro', () => setShowFinanceiroModal(true));
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full",
                "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                !isPremiumOrVipStrict && "opacity-60"
              )}
            >
              <DollarSign className="h-5 w-5 shrink-0 text-emerald-400" />
              <span className="flex-1 text-left">Financeiro</span>
              {!isPremiumOrVipStrict && <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />}
            </button>

            {/* ── SESSÕES OCULTAS (movido para baixo de Financeiro) ── */}
            <HiddenSessionsEntry variant="sidebar" />

          </div>

          {/* ── Activity Ticker ── */}
          <div className="pt-3 border-t border-border/20">
            <button
              type="button"
              onClick={() => {
                if (onlineCount <= 0) return;
                if (isMasterAdmin) {
                  window.dispatchEvent(new CustomEvent('master:open-online-gift'));
                } else {
                  setShowLiveUsersModal(true);
                }
              }}
              className={cn(
                "flex items-center gap-2 mb-2 px-1 w-full rounded-md py-1 -mx-1 transition-colors",
                onlineCount > 0 ? "hover:bg-muted/30 cursor-pointer" : "opacity-50 cursor-default"
              )}
              aria-label="Ver usuários online"
            >
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">Ao Vivo</span>
              {onlineCount > 0 && (
                <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-1.5 py-0.5 leading-none">
                  {onlineCount}
                </span>
              )}
              <span className="relative flex h-2 w-2 ml-auto">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            </button>
            <ActivityTicker maxVisible={3} />
          </div>

          {/* ── Bottom Actions ── */}
          <div className="pt-2 border-t border-border/20 space-y-1">
            <InstallAppButton
              variant="outline"
              size="sm"
              fullWidth
              surface="sidebar"
              label="Instalar app"
              className="h-9 text-xs font-medium border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 justify-center gap-2"
            />
            <Link to="/settings">
              <Button variant="outline" size="sm" className="w-full h-9 text-xs font-medium border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 justify-center gap-2">
                <Settings className="h-3.5 w-3.5" />
                Configurações
              </Button>
            </Link>
            {isAdmin && (
              <button
                onClick={() => navigate('/admin/dashboard')}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-semibold w-full bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 hover:border-primary/50"
              >
                <BarChart3 className="h-4 w-4 text-primary" />
                <span>Painel Admin</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-400/50 w-full"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
            <button
              onClick={() => setShowDeleteAccountModal(true)}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-semibold text-red-300 bg-red-700/15 border border-red-700/40 hover:bg-red-700/30 hover:text-red-100 hover:border-red-500/70 w-full"
              aria-label="Excluir minha conta"
            >
              <Trash2 className="h-4 w-4" />
              <span>Excluir Conta</span>
            </button>
          </div>

          {/* ── Legal ── */}
          <div className="pt-2 border-t border-border/20">
            <div className="flex items-center justify-between">
              <LegalFooter variant="sidebar" />
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin/dashboard')}
                  className="p-1.5 rounded-full hover:bg-primary/10 group transition-all"
                  aria-label="Panel"
                >
                  <div className="relative">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30 group-hover:bg-primary group-hover:shadow-[0_0_8px_hsl(330,100%,50%)] transition-all" />
                    <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary/50 animate-ping opacity-0 group-hover:opacity-100" />
                  </div>
                </button>
              )}
            </div>
          </div>

        </div>
      </aside>

      <Suspense fallback={null}>
        {showCreateModal && <CreatePostModal open={showCreateModal} onOpenChange={setShowCreateModal} />}
        {showPlansModal && <SubscriptionPlansModal open={showPlansModal} onOpenChange={setShowPlansModal} />}
        {showUpgradeModal && <PremiumUpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} feature={upgradeFeature} />}
        {showFollowersModal && <FollowersFollowingModal open={showFollowersModal} onOpenChange={setShowFollowersModal} mode="followers" />}
        {showFollowingModal && <FollowersFollowingModal open={showFollowingModal} onOpenChange={setShowFollowingModal} mode="following" />}
        {showSupportModal && <SupportTicketModal open={showSupportModal} onOpenChange={setShowSupportModal} />}
        {showVitrineModal && <VitrinePlansModal open={showVitrineModal} onOpenChange={setShowVitrineModal} />}
        {showFinanceiroModal && <FinanceiroModal open={showFinanceiroModal} onOpenChange={setShowFinanceiroModal} />}
        {showPromotionsModal && <PromotionsModal open={showPromotionsModal} onOpenChange={setShowPromotionsModal} />}
        {showDeleteAccountModal && <DeleteAccountModal open={showDeleteAccountModal} onOpenChange={setShowDeleteAccountModal} />}
        {showNotepadModal && <NotepadModal open={showNotepadModal} onOpenChange={setShowNotepadModal} />}
        {showLiveUsersModal && <LiveOnlineUsersDialog open={showLiveUsersModal} onOpenChange={setShowLiveUsersModal} />}
      </Suspense>
    </>
  );
}

// ── Item da sidebar para "Meus Presentes" com badge de não vistos ──
function MyGiftsSidebarItem({
  isActive,
  onClick,
  cn,
}: {
  isActive: boolean;
  onClick: () => void;
  cn: (...args: any[]) => string;
}) {
  const { data: unseen = 0 } = useAuraGiftsUnseenCount();
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold w-full',
        isActive
          ? 'bg-amber-500/20 text-amber-300'
          : 'text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10',
      )}
    >
      <Gift className="h-5 w-5 shrink-0 text-amber-400" />
      <span className="flex-1 text-left">Meus Presentes</span>
      {unseen > 0 && (
        <Badge className="bg-amber-500 text-black text-[10px] font-bold border-0 h-5 min-w-5 px-1.5 flex items-center justify-center">
          {unseen > 99 ? '99+' : unseen}
        </Badge>
      )}
    </button>
  );
}


function HiddenExperiencesSidebarItem({
  isActive,
  onClick,
}: {
  isActive: boolean;
  onClick: () => void;
}) {
  const { allowed, config } = useSocialBetaModule();
  if (!allowed) return null;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold w-full',
        isActive
          ? 'bg-violet-500/20 text-violet-300'
          : 'text-muted-foreground hover:text-violet-300 hover:bg-violet-500/10',
      )}
    >
      <Sparkles className="h-5 w-5 shrink-0 text-violet-400" />
      <span className="flex-1 text-left">{config.moduleName}</span>
      <Badge className="bg-violet-500/20 text-violet-300 text-[9px] font-bold border-0 h-4 px-1.5">BETA</Badge>
    </button>
  );
}
