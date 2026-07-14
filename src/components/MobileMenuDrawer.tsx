import { useState, useEffect, lazy, Suspense } from "react";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { highlightConfig } from "./MobileNavbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

// Lazy modals — só baixam quando o usuário abre cada ação no menu mobile.
// Tiram ~200 KB do bundle eager.
const CreatePostModal = lazy(() => import("./CreatePostModal").then(m => ({ default: m.CreatePostModal })));
const SubscriptionPlansModal = lazy(() => import("./SubscriptionPlansModal").then(m => ({ default: m.SubscriptionPlansModal })));
const FollowersFollowingModal = lazy(() => import("./FollowersFollowingModal").then(m => ({ default: m.FollowersFollowingModal })));
const SupportTicketModal = lazy(() => import("./SupportTicketModal").then(m => ({ default: m.SupportTicketModal })));
const PremiumUpgradeModal = lazy(() => import("@/components/PremiumUpgradeModal").then(m => ({ default: m.PremiumUpgradeModal })));
const VitrinePlansModal = lazy(() => import("@/components/VitrinePlansModal").then(m => ({ default: m.VitrinePlansModal })));
const FinanceiroModal = lazy(() => import("@/components/FinanceiroModal").then(m => ({ default: m.FinanceiroModal })));
const PromotionsModal = lazy(() => import("@/components/PromotionsModal").then(m => ({ default: m.PromotionsModal })));
const DeleteAccountModal = lazy(() => import("@/components/settings/DeleteAccountModal").then(m => ({ default: m.DeleteAccountModal })));
const CreateCheckinDialog = lazy(() => import("@/components/safety/CreateCheckinDialog").then(m => ({ default: m.CreateCheckinDialog })));
const NotepadModal = lazy(() => import("./notepad/NotepadModal").then(m => ({ default: m.NotepadModal })));
const LiveOnlineUsersDialog = lazy(() => import("./LiveOnlineUsersDialog").then(m => ({ default: m.LiveOnlineUsersDialog })));
import { LegalFooter } from "./LegalFooter";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";
import { useNotifications } from "@/hooks/useNotifications";
import { useMatches } from "@/hooks/useMatches";
import { useMyProfileStats } from "@/hooks/useMyProfileStats";
import { useIsAdmin, useIsMasterAdmin } from "@/hooks/useUserRoles";
import { useOnlineCount } from "@/hooks/useOnlineCount";
import { useChat } from "@/hooks/useChat";
import { useReceivedLikesCount } from "@/hooks/useProfileLikes";
import { useEngagementLevel } from "@/hooks/useInitialExperience";
import { useSocialBetaModule } from "@/hooks/useSocialBetaModule";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { useFabEnabled } from "@/hooks/useFabEnabled";
import {
  Menu,
  Home,
  AlertTriangle,
  Radar,
  NotebookPen,
  Search,
  Eye,
  Heart,
  HeartHandshake,
  Sparkles,
  BrainCircuit,
  Bookmark,
  Trophy,
  DollarSign,
  Settings,
  PartyPopper,
  Plus,
  Crown,
  LogOut,
  BarChart3,
  Ticket,
  FolderOpen,
  Download,
  Bell,
  Flame,
  Receipt,
  Lock,
  Gavel,
  PlusCircle,
  Users2,
  UserCheck2,
  MessageCircle,
  User,
  Activity,
  Store,
  Gift,
  ShieldCheck,
  Trash2,
  GraduationCap,
} from "lucide-react";
import { ActivityTicker } from "@/components/activity";
import { getPublicHandle, getHandleInitial } from "@/lib/userHandle";
import { HiddenSessionsEntry } from "@/components/view-mode/HiddenSessionsEntry";
import { SectionShortcutsNav } from "@/components/view-mode/SectionShortcutsNav";
import { readSidebarStats } from "@/lib/sidebarStatsCache";
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

export function MobileMenuDrawer() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const { data: isMasterAdmin } = useIsMasterAdmin();
  const { unreadCount } = useNotifications();
  const { activeMatches } = useMatches();
  const { data: stats } = useMyProfileStats(profile?.id);
  const cachedStats = readSidebarStats(profile?.id);
  const displayAuraXp = Number((profile as any)?.aura_xp ?? cachedStats?.auraXp ?? 0);
  const { totalUnreadCount: unreadMessages } = useChat();
  const { data: receivedLikesData } = useReceivedLikesCount();
  const receivedLikesCount = receivedLikesData?.total ?? 0;
  const { data: onlineCount = 0 } = useOnlineCount();
  const { data: engagementLevel } = useEngagementLevel();
  const isNewUser = (engagementLevel ?? 'new') === 'new';

  const [open, setOpen] = useState(false);
  const { enabled: fabEnabled, setFabEnabled } = useFabEnabled();

  // Garante que o body nunca fica travado após fechar o Sheet no Android
  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      // Força limpeza imediata e após animação de fechamento
      const unlock = () => {
        document.body.style.overflow = '';
        document.body.style.overflowY = '';
        document.body.style.paddingRight = '';
        document.documentElement.style.overflow = '';
        document.documentElement.style.overflowY = '';
      };
      unlock();
      setTimeout(unlock, 50);
      setTimeout(unlock, 300);
    }
  };
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

  useEffect(() => {
    const handler = () => setShowNotepadModal(true);
    window.addEventListener("oculto:open-notepad", handler);
    return () => window.removeEventListener("oculto:open-notepad", handler);
  }, []);

  const [upgradeFeature, setUpgradeFeature] = useState("recursos financeiros");

  const { freeGetsPremiumSocial } = usePlatformPhase();
  const isPremiumOrVipStrict =
    profile?.plan_type === 'premium' ||
    profile?.plan_type === 'monthly' ||
    profile?.plan_type === 'vip';
  const isPremiumOrVip = freeGetsPremiumSocial || isPremiumOrVipStrict;

  const handleLogout = async () => {
    setOpen(false);
    await signOut();
    navigate("/login", { replace: true });
  };

  const memberSince = profile?.updated_at
    ? format(new Date(profile.updated_at), "'desde' MMM yyyy", { locale: ptBR })
    : '';

  const isActive = (href: string) => {
    if (!href) return false;
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const target = href.replace(/\/+$/, '') || '/';
    return path === target || path.startsWith(target + '/');
  };

  const navLinkClass = (href: string, extra?: string) => cn(
    "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
    isActive(href)
      ? "bg-primary/15 text-primary ring-1 ring-primary/30 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-1 before:rounded-r before:bg-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
    extra
  );


  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <button
            className={cn(
              "relative flex min-w-0 flex-1 basis-0 flex-col items-center justify-center px-0.5 py-1.5 transition-colors",
              !open ? cn(highlightConfig.menu.text, highlightConfig.menu.hover) : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative">
              {!open && (
                <span
                  className={cn(
                    "absolute -inset-1 rounded-full blur-[2px] animate-pulse pointer-events-none",
                    highlightConfig.menu.glow
                  )}
                  aria-hidden="true"
                />
              )}
              <Menu
                className={cn("h-[23px] w-[23px] relative", !open && highlightConfig.menu.shadow)}
                strokeWidth={!open ? 2.4 : 2}
              />
            </div>
            <span className={cn("text-[9px] min-[380px]:text-[10px] mt-1 leading-none truncate max-w-full", !open ? "font-bold" : "font-medium")}>Menu</span>
          </button>
        </SheetTrigger>

        <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 border-r border-border/50">
          <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
            <div className="p-3 space-y-2 pb-10">

              {/* ── Perfil ── */}
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="mb-1 p-4 rounded-2xl bg-gradient-to-br from-card/70 via-card/40 to-card/20 border border-border/50 hover:border-primary/40 transition-all block shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <div className="relative shrink-0">
                    <Avatar className="h-14 w-14 ring-2 ring-primary/40 shadow-lg">
                      <AvatarImage src={buildSupabaseImageThumb(profile?.avatar_url, { width: 160, quality: 75 }) || profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/15 text-primary text-base font-bold">
                        {getHandleInitial(profile as any)}
                      </AvatarFallback>
                    </Avatar>
                    <OnlineDot user={profile as any} size="md" borderClassName="border-card" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="font-extrabold text-foreground truncate text-[15px] leading-tight">
                      {getPublicHandle(profile as any)}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 font-bold", getPlanStyle(profile?.plan_type))}>
                        {getPlanLabel(profile?.plan_type)}
                      </Badge>
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500/90 to-amber-400/90 px-2 h-5 text-[10px] font-black text-black shadow-sm">
                        ⚡ {displayAuraXp.toLocaleString('pt-BR')} XP
                      </span>
                    </div>
                    {memberSince && (
                      <p className="text-[10px] text-muted-foreground capitalize whitespace-nowrap">
                        {memberSince}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-[11px] whitespace-nowrap">
                      <Link
                        to="/followers"
                        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                        className="text-[hsl(199,89%,55%)] hover:underline font-medium"
                      >
                        <strong className="text-foreground">{stats?.totalFollowers ?? 0}</strong> seguidores
                      </Link>
                      <span className="text-border">•</span>
                      <Link
                        to="/following"
                        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                        className="text-[hsl(280,75%,65%)] hover:underline font-medium"
                      >
                        <strong className="text-foreground">{stats?.totalFollowing ?? 0}</strong> seguindo
                      </Link>
                    </div>
                  </div>
                </div>
              </Link>

              <div className="space-y-0.5 pb-1">

                {/* ── 1. PUBLICAR ── */}
                <button
                  onClick={() => { setOpen(false); setShowCreateModal(true); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40"
                >
                  <Plus className="h-5 w-5 shrink-0 text-primary" />
                  <span className="flex-1 text-left">Publicar</span>
                </button>

                {/* ── 1a.1 ATALHOS DINÂMICOS — refletem as seções ativadas em /sessoes-ocultas ── */}
                <SectionShortcutsNav variant="drawer" onNavigate={() => setOpen(false)} />

                {/* ── 2. INÍCIO ── */}
                <Link to="/feed" onClick={() => setOpen(false)} className={navLinkClass('/feed')}>
                  <Home className={cn("h-5 w-5 shrink-0", isActive('/feed') ? "text-primary" : "text-primary/70")} />
                  <span className="flex-1">Início</span>
                </Link>

                {/* ── 3. PESQUISAR ── */}
                <Link to="/pesquisar" onClick={() => setOpen(false)} className={navLinkClass('/pesquisar')}>
                  <Search className={cn("h-5 w-5 shrink-0", isActive('/pesquisar') ? "text-primary" : "text-cyan-400")} />
                  <span className="flex-1">Pesquisar</span>
                </Link>

                {/* ── 4. MEU PERFIL ── */}
                <Link to="/profile" onClick={() => setOpen(false)} className={navLinkClass('/profile')}>
                  <User className={cn("h-5 w-5 shrink-0", isActive('/profile') ? "text-primary" : "text-violet-400")} />
                  <span className="flex-1">Meu Perfil</span>
                </Link>

                {/* ── 5. MEU CANAL VIP (exclusivo VIP) ── */}
                {profile?.plan_type === 'vip' && (
                  <Link to="/canal-vip" onClick={() => setOpen(false)} className={navLinkClass('/canal-vip')}>
                    <Crown className={cn("h-5 w-5 shrink-0", isActive('/canal-vip') ? "text-primary" : "text-[hsl(45,93%,47%)]")} />
                    <span className="flex-1 text-left">Meu Canal VIP</span>
                  </Link>
                )}

                {/* ── OCULTO PLAY (acima de Comunidades) ── */}
                <OcultoPlayMenuEntry variant="mobile" onClick={() => setOpen(false)} />

                {/* ── COMUNIDADES OCULTAS (acima do Chat) ── */}
                <Link to="/comunidades" onClick={() => setOpen(false)} className={navLinkClass('/comunidades')}>
                  <Users2 className="h-5 w-5 shrink-0 text-fuchsia-400" />
                  <span className="flex-1 text-left">Comunidades</span>
                  <Badge className="bg-fuchsia-500/20 text-fuchsia-300 text-[9px] font-bold border-0 h-4 px-1.5">NOVO</Badge>
                </Link>


                {/* ── CHAT ── */}
                <Link to="/messages" onClick={() => setOpen(false)} className={cn(navLinkClass('/messages'), "relative")}>
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
                    setOpen(false);
                    if (location.pathname !== '/feed') {
                      navigate('/feed?openAura=1');
                      return;
                    }
                    setTimeout(() => {
                      try { window.dispatchEvent(new CustomEvent('oculto:open-aura')); } catch {}
                    }, 120);
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
                  onClick={() => { setOpen(false); navigate('/aura-match'); }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold w-full",
                    isActive('/aura-match')
                      ? "bg-fuchsia-500/20 text-fuchsia-300"
                      : "text-muted-foreground hover:text-fuchsia-300 hover:bg-fuchsia-500/10"
                  )}
                >
                  <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-400" />
                  <span className="flex-1 text-left">Aura Match</span>
                </button>

                {/* ── MATCHES ── */}
                <Link to="/matches" onClick={() => setOpen(false)} className={navLinkClass('/matches')}>
                  <Flame className={cn("h-5 w-5 shrink-0", isActive('/matches') ? "text-primary" : "text-orange-500")} />
                  <span className="flex-1">Matches</span>
                  {activeMatches.length > 0 && (
                    <Badge className="bg-orange-500 text-white text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5">
                      {activeMatches.length > 99 ? '99+' : activeMatches.length}
                    </Badge>
                  )}
                </Link>

                {/* ── 7. SEGUIDORES ── */}
                <button
                  onClick={() => { setOpen(false); setShowFollowersModal(true); }}
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
                  onClick={() => { setOpen(false); setShowFollowingModal(true); }}
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

                {/* ── MEUS PRESENTES (badge de não vistos) ── */}
                <MobileMyGiftsItem
                  isActive={isActive('/my-gifts')}
                  onClick={() => { setOpen(false); navigate('/my-gifts'); }}
                />

                {/* ── PERFECT PAIR (apenas Master Admin — invisível para demais) ── */}
                {isMasterAdmin && (
                  <button
                    onClick={() => { setOpen(false); navigate('/perfect-pair'); }}
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
                <HiddenExperiencesMobileItem
                  isActive={isActive('/experiencias-ocultas')}
                  onClick={() => { setOpen(false); navigate('/experiencias-ocultas'); }}
                />





                <Link to="/radar" onClick={() => setOpen(false)} className={navLinkClass('/radar')}>
                  <Radar className={cn("h-5 w-5 shrink-0", isActive('/radar') ? "text-primary" : "text-green-400")} />
                  <span className="flex-1">Radar</span>
                </Link>

                {/* ── BLOCO DE NOTAS ── */}
                <button
                  onClick={() => {
                    setOpen(false);
                    window.dispatchEvent(new Event("oculto:open-notepad"));
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40"
                >
                  <NotebookPen className="h-5 w-5 shrink-0 text-primary" />
                  <span className="flex-1 text-left">Bloco de Notas</span>
                </button>

                {/* ── TUTORIAIS (somente master) ── */}
                {isMasterAdmin && (
                  <Link to="/tutoriais" onClick={() => setOpen(false)} className={navLinkClass('/tutoriais')}>
                    <GraduationCap className={cn("h-5 w-5 shrink-0", isActive('/tutoriais') ? "text-primary" : "text-teal-400")} />
                    <span className="flex-1">Tutoriais</span>
                  </Link>
                )}


                {/* ── 10. CURTIDAS ── */}
                <Link to="/likes" onClick={() => setOpen(false)} className={navLinkClass('/likes')}>
                  <Heart className={cn("h-5 w-5 shrink-0", isActive('/likes') ? "text-primary" : "text-rose-500")} />
                  <span className="flex-1">Curtidas</span>
                  {receivedLikesCount > 0 && (
                    <Badge className="bg-rose-500 text-white text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5">
                      {receivedLikesCount > 99 ? '99+' : receivedLikesCount}
                    </Badge>
                  )}
                </Link>

                {/* ── 11. VISITAS RECEBIDAS ── */}
                {isPremiumOrVip ? (
                  <Link to="/visits" onClick={() => setOpen(false)} className={navLinkClass('/visits')}>
                    <Eye className={cn("h-5 w-5 shrink-0", isActive('/visits') ? "text-primary" : "text-cyan-400")} />
                    <span className="flex-1">Visitas Recebidas</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => { setOpen(false); setUpgradeFeature("Visitas Recebidas"); setShowUpgradeModal(true); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
                  >
                    <Eye className="h-5 w-5 shrink-0 text-cyan-400" />
                    <span className="flex-1 text-left">Visitas Recebidas</span>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </button>
                )}

                {/* ── 12. NOTIFICAÇÕES ── */}
                <Link to="/notifications" onClick={() => setOpen(false)} className={navLinkClass('/notifications')}>
                  <Bell className={cn("h-5 w-5 shrink-0", isActive('/notifications') ? "text-primary" : "text-yellow-400")} />
                  <span className="flex-1">Notificações</span>
                  {unreadCount > 0 && (
                    <Badge className="bg-[#FF007F] text-white text-[10px] font-bold min-w-5 h-5 flex items-center justify-center px-1.5">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                  )}
                </Link>

                {/* ── 13. PROMOÇÕES ── */}
                <button
                  onClick={() => {
                    setOpen(false);
                    if (!isPremiumOrVipStrict) { setUpgradeFeature("Promoções"); setShowUpgradeModal(true); return; }
                    setShowPromotionsModal(true);
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

                {/* ── GANHE INDICANDO (CTA persistente, destaque para novo) ── */}
                <Link
                  to="/affiliates"
                  onClick={() => setOpen(false)}
                  className={cn(
                    navLinkClass('/affiliates'),
                    isNewUser && "ring-1 ring-amber-400/50 bg-amber-500/5 hover:bg-amber-500/10"
                  )}
                >
                  <Gift className={cn("h-5 w-5 shrink-0", isActive('/affiliates') ? "text-primary" : "text-amber-400")} />
                  <span className="flex-1">Ganhe Indicando</span>
                  {isNewUser && <span className="text-[10px] font-bold text-amber-400">NOVO</span>}
                </Link>

                {/* ── 14. MINHAS MÍDIAS ── */}
                <Link to="/my-media" onClick={() => setOpen(false)} className={navLinkClass('/my-media')}>
                  <FolderOpen className={cn("h-5 w-5 shrink-0", isActive('/my-media') ? "text-primary" : "text-indigo-400")} />
                  <span className="flex-1">Minhas Mídias</span>
                </Link>

                {/* ── 15. DOWNLOADS VIP ── */}
                {isPremiumOrVipStrict ? (
                  <Link to="/vip-downloads" onClick={() => setOpen(false)} className={navLinkClass('/vip-downloads')}>
                    <Download className={cn("h-5 w-5 shrink-0", isActive('/vip-downloads') ? "text-primary" : "text-emerald-400")} />
                    <span className="flex-1">Meus downloads VIP</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => { setOpen(false); setUpgradeFeature("Meus downloads VIP"); setShowUpgradeModal(true); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
                  >
                    <Download className="h-5 w-5 shrink-0 text-emerald-400" />
                    <span className="flex-1 text-left">Meus downloads VIP</span>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </button>
                )}

                {/* ── 16. ENCONTRO SEGURO ── */}
                {isPremiumOrVip ? (
                  <Suspense fallback={null}>
                    <CreateCheckinDialog
                      trigger={
                        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs font-semibold w-full text-green-400 hover:text-green-300 hover:bg-green-500/10">
                          <ShieldCheck className="h-5 w-5 shrink-0 text-green-400" />
                          <span className="flex-1 text-left">Encontro Seguro</span>
                        </button>
                      }
                    />
                  </Suspense>
                ) : (
                  <button
                    onClick={() => { setOpen(false); setUpgradeFeature("Encontro Seguro"); setShowUpgradeModal(true); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs font-semibold w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
                  >
                    <ShieldCheck className="h-5 w-5 shrink-0 text-green-400" />
                    <span className="flex-1 text-left">Encontro Seguro</span>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </button>
                )}

                {/* ── 17. PROBLEMAS ── */}
                <button
                  onClick={() => { setOpen(false); setShowSupportModal(true); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0 text-orange-400" />
                  <span className="flex-1 text-left">Problemas?</span>
                </button>

                {/* ── 18. PLANOS PAGOS ── */}
                <button
                  onClick={() => {
                    setOpen(false);
                    if (!isPremiumOrVipStrict) { setUpgradeFeature("Planos Pagos"); setShowUpgradeModal(true); return; }
                    setShowPlansModal(true);
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

                {/* ── 19. ASSINATURAS ── */}
                <Link to="/subscriptions" onClick={() => setOpen(false)} className={navLinkClass('/subscriptions')}>
                  <Crown className={cn("h-5 w-5 shrink-0", isActive('/subscriptions') ? "text-primary" : "text-[hsl(45,93%,47%)]")} />
                  <span className="flex-1">Assinaturas</span>
                </Link>

                {/* ── 20. VITRINE ── */}
                <button
                  onClick={() => { setOpen(false); setShowVitrineModal(true); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40"
                >
                  <Store className="h-5 w-5 shrink-0 text-pink-400" />
                  <span className="flex-1 text-left">Vitrine</span>
                </button>

                {/* ── 21. EVENTOS ── */}
                {isPremiumOrVipStrict ? (
                  <Link to="/events" onClick={() => setOpen(false)} className={navLinkClass('/events')}>
                    <PartyPopper className={cn("h-5 w-5 shrink-0", isActive('/events') ? "text-primary" : "text-purple-400")} />
                    <span className="flex-1">Eventos</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => { setOpen(false); setUpgradeFeature("Eventos"); setShowUpgradeModal(true); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
                  >
                    <PartyPopper className="h-5 w-5 shrink-0 text-purple-400" />
                    <span className="flex-1 text-left">Eventos</span>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </button>
                )}

                {/* ── 22. SALVOS ── */}
                <Link to="/saved" onClick={() => setOpen(false)} className={navLinkClass('/saved')}>
                  <Bookmark className={cn("h-5 w-5 shrink-0", isActive('/saved') ? "text-primary" : "text-blue-400")} />
                  <span className="flex-1">Salvos</span>
                </Link>

                {/* ── 22.5 RANKING ── */}
                <Link to="/ranking" onClick={() => setOpen(false)} className={navLinkClass('/ranking')}>
                  <Trophy className={cn("h-5 w-5 shrink-0", isActive('/ranking') ? "text-primary" : "text-amber-400")} />
                  <span className="flex-1">Ranking</span>
                </Link>

                {/* ── 23. LEILÕES ── */}
                {isPremiumOrVipStrict ? (
                  <>
                    <Link to="/auctions" onClick={() => setOpen(false)} className={navLinkClass('/auctions')}>
                      <Gavel className={cn("h-5 w-5 shrink-0", isActive('/auctions') ? "text-primary" : "text-amber-500")} />
                      <span className="flex-1">Leilões</span>
                    </Link>
                    <Link to="/auctions/create" onClick={() => setOpen(false)} className={navLinkClass('/auctions/create')}>
                      <PlusCircle className={cn("h-5 w-5 shrink-0", isActive('/auctions/create') ? "text-primary" : "text-amber-400")} />
                      <span className="flex-1">Criar Leilão</span>
                    </Link>
                  </>
                ) : (
                  <button
                    onClick={() => { setOpen(false); setUpgradeFeature("Leilões"); setShowUpgradeModal(true); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium w-full text-muted-foreground hover:text-foreground hover:bg-muted/40 opacity-60"
                  >
                    <Gavel className="h-5 w-5 shrink-0 text-amber-500" />
                    <span className="flex-1 text-left">Leilões</span>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </button>
                )}

                {/* ── 24. FINANCEIRO ── */}
                <button
                  onClick={() => {
                    setOpen(false);
                    if (!isPremiumOrVipStrict) { setUpgradeFeature("Financeiro"); setShowUpgradeModal(true); return; }
                    setShowFinanceiroModal(true);
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
                <HiddenSessionsEntry variant="drawer" onNavigate={() => setOpen(false)} />

              </div>

              {/* ── Activity Ticker ── */}
              <div className="pt-3 border-t border-border/20">
                <button
                  type="button"
                  onClick={() => { setShowLiveUsersModal(true); setOpen(false); }}
                  className="flex items-center gap-2 mb-2 px-1 w-full hover:bg-muted/30 rounded-md py-1 -mx-1 transition-colors"
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

              {/* ── Botão flutuante (FAB) toggle ── */}
              <div className="pt-2 border-t border-border/20">
                <div className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-tight">Botão flutuante</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">Atalho para criar publicação</p>
                    </div>
                  </div>
                  <Switch
                    checked={fabEnabled}
                    onCheckedChange={setFabEnabled}
                    aria-label="Ativar botão flutuante para criar publicação"
                  />
                </div>
              </div>

              {/* ── Bottom Actions ── */}
              <div className="pt-2 border-t border-border/20 space-y-1">
                <InstallAppButton
                  variant="outline"
                  size="sm"
                  fullWidth
                  surface="drawer"
                  label="Instalar app"
                  className="h-9 text-xs font-medium border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 justify-center gap-2"
                />
                <Link to="/settings" onClick={() => setOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full h-9 text-xs font-medium border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 justify-center gap-2">
                    <Settings className="h-3.5 w-3.5" />
                    Configurações
                  </Button>
                </Link>

                {isAdmin && (
                  <button
                    onClick={() => { setOpen(false); navigate('/admin/dashboard'); }}
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
                <LegalFooter variant="sidebar" />
              </div>

            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modals — gated por flag para que só baixem o chunk quando abertos */}
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

// ── Item "Meus Presentes" no menu mobile (com badge de não vistos) ──
import { useAuraGiftsUnseenCount } from "@/hooks/useAuraGifts";

function MobileMyGiftsItem({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  const { data: unseen = 0 } = useAuraGiftsUnseenCount();
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-bold w-full",
        isActive
          ? "bg-amber-500/20 text-amber-300"
          : "text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10"
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

function HiddenExperiencesMobileItem({
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
