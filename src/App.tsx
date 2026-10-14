import { Toaster } from "@/components/ui/toaster";
import { EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { getSupabaseBrowserBaseUrl, supabaseBrowserFetch } from '@/lib/supabaseExternal';
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import RouteMeta from "@/components/seo/RouteMeta";
import { Suspense, useEffect } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { SafeSuspense } from "@/components/ErrorBoundary";
import { RouteSkeleton } from "@/components/RouteSkeleton";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { AgeWarningBanner } from "@/components/AgeWarningBanner";
import { WebAppUpdateModal } from "@/components/global/WebAppUpdateModal";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { MasterAdminRoute } from "@/components/MasterAdminRoute";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { FeedModeProvider } from "@/feed-modes/FeedModeProvider";
import { SafeBlurProvider } from "@/safe-blur/SafeBlurProvider";
const AdminFeedModesPage = lazy(() => import("./pages/admin/AdminFeedModesPage"));
const AdminExperienceOcultoPage = lazy(() => import("./pages/admin/AdminExperienceOcultoPage"));
const AdminOcultoPlayPage = lazy(() => import("./pages/admin/AdminOcultoPlayPage"));
const OcultoPlayPage = lazy(() => import("./pages/OcultoPlayPage"));
const OcultoPlayOfflinePage = lazy(() => import("./pages/OcultoPlayOfflinePage"));
const OcultoPlayPublicItemPage = lazy(() => import("./pages/OcultoPlayPublicItemPage"));
const OcultoPlayWatchPartyPage = lazy(() => import("./pages/OcultoPlayWatchPartyPage"));
const OcultoPlayDownloadsPage = lazy(() => import("./pages/OcultoPlayDownloadsPage"));
const GlobalOcultoPlayMiniPlayer = lazy(() => import("@/components/oculto-play/OcultoPlayMiniPlayer").then((m) => ({ default: m.OcultoPlayMiniPlayer })));


const DashboardLayout = lazy(() => import("@/layouts/DashboardLayout").then(m => ({ default: m.DashboardLayout })));
const AdminLayout = lazy(() => import("@/layouts/AdminLayout").then(m => ({ default: m.AdminLayout })));
import { AuthProvider } from "@/hooks/useAuth";

import { PerformanceProvider } from "@/contexts/PerformanceContext";
import { SocialUniverseProvider } from "@/social-universe/core/SocialUniverseProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RateLimitProvider } from "@/components/RateLimitProvider";
import { useDeferredMount } from "@/hooks/useDeferredMount";

function UpdateRouteRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = window.location.search || "";
    window.location.replace(`/update.html${qs}`);
  }, []);

  return null;
}

function isPublicSharePath(pathname: string) {
  return /^\/play\/(p|share)\//i.test(pathname) || /^\/c\//i.test(pathname);
}

function WebAppUpdateModalRouteGate() {
  const { pathname } = useLocation();
  if (isPublicSharePath(pathname)) return null;
  return <WebAppUpdateModal />;
}

// ── Critical route: eager load (Landing apenas — primeira tela) ──
const Landing = lazy(() => import("./pages/Landing"));

// ── Lazy load all non-critical routes (reduces initial bundle ~60%) ──
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const SharePage = lazy(() => import("./pages/SharePage"));
const SharedContentPage = lazy(() => import("./pages/SharedContentPage"));
const LeituraPublicaPage = lazy(() => import("./pages/LeituraPublicaPage"));
const PioneirosPage = lazy(() => import("./pages/PioneirosPage"));
const SpyFeedPage = lazy(() => import("./pages/SpyFeedPage"));
const CreatorInvitePage = lazy(() => import("./pages/CreatorInvitePage"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const InviteConfirmationPage = lazy(() => import("./pages/InviteConfirmationPage"));
const AffiliateApprovedPreviewPage = lazy(() => import("./pages/dev/AffiliateApprovedPreviewPage"));

const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const CheckoutRetryPage = lazy(() => import("./pages/CheckoutRetryPage"));
const CheckoutResumePage = lazy(() => import("./pages/CheckoutResumePage"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccessPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const TrustPage = lazy(() => import("./pages/TrustPage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const AppealPage = lazy(() => import("./pages/AppealPage"));
const NovidadesPage = lazy(() => import("./pages/NovidadesPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const AdminMaintenancePage = lazy(() => import("./pages/admin/AdminMaintenancePage"));
const VitrineVipPage = lazy(() => import("./pages/VitrineVipPage"));

// ── Protected pages ──
const Index = lazy(() => import("./pages/Index"));
const TutoriaisPage = lazy(() => import("./pages/TutoriaisPage"));
const RadarPage = lazy(() => import("./pages/RadarPage"));
const RadarPingsHistoryPage = lazy(() => import("./pages/RadarPingsHistoryPage"));
const PesquisarPage = lazy(() => import("./pages/PesquisarPage"));
const PesquisarTagPage = lazy(() => import("./pages/PesquisarTagPage"));
const VisitsPage = lazy(() => import("./pages/VisitsPage"));
const LikesPage = lazy(() => import("./pages/LikesPage"));
const FollowingPage = lazy(() => import("./pages/FollowingPage"));
const FollowersPage = lazy(() => import("./pages/FollowersPage"));
const SavedPage = lazy(() => import("./pages/SavedPage"));
const RankingPage = lazy(() => import("./pages/RankingPage"));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PulsesSettingsPage = lazy(() => import("./pages/PulsesSettingsPage"));
const AttentionHistoryPage = lazy(() => import("./pages/AttentionHistoryPage"));
const ProfileDiagnosticsPage = lazy(() => import("./pages/ProfileDiagnosticsPage"));
const EarningsPage = lazy(() => import("./pages/EarningsPage"));
const EarningsBreakdownPage = lazy(() => import("./pages/EarningsBreakdownPage"));
const EarningsStatementPage = lazy(() => import("./pages/EarningsStatementPage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const CreatorWalletPage = lazy(() => import("./pages/CreatorWalletPage"));
const MyProfilePage = lazy(() => import("./pages/MyProfilePage"));
const SessoesOcultasPage = lazy(() => import("./pages/SessoesOcultasPage"));
const MySubscriptionsPage = lazy(() => import("./pages/MySubscriptionsPage"));
const AdminPartnersPage = lazy(() => import("./pages/AdminPartnersPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const MatchesPage = lazy(() => import("./pages/MatchesPage"));
const PerfectPairPage = lazy(() => import("./pages/PerfectPairPage"));
const AuraMatchPage = lazy(() => import("./pages/AuraMatchPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const GiftsHistoryPage = lazy(() => import("./pages/GiftsHistoryPage"));
const MyGiftsPage = lazy(() => import("./pages/MyGiftsPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const AuctionsPage = lazy(() => import("./pages/AuctionsPage"));
const AuctionDetailPage = lazy(() => import("./pages/AuctionDetailPage"));
const CoupleVerificationPage = lazy(() => import("./pages/CoupleVerificationPage"));
const CreatorDashboard = lazy(() => import("./pages/CreatorDashboard"));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const EarningsAnalyticsPage = lazy(() => import("./pages/EarningsAnalyticsPage"));
const AffiliateAnalyticsPage = lazy(() => import("./pages/AffiliateAnalyticsPage"));
const MadrinhaAnalyticsPage = lazy(() => import("./pages/MadrinhaAnalyticsPage"));
const CouponsManagementPage = lazy(() => import("./pages/CouponsManagementPage"));
const MyMediaPage = lazy(() => import("./pages/MyMediaPage"));
const CanalVipPage = lazy(() => import("./pages/CanalVipPage"));
const PlayChannelPage = lazy(() => import("./pages/PlayChannelPage"));
const MyChannelsPage = lazy(() => import("./pages/MyChannelsPage"));
const VipDownloadsPage = lazy(() => import("./pages/VipDownloadsPage"));
const AffiliatesPage = lazy(() => import("./pages/AffiliatesPage"));
const IndicacoesPage = lazy(() => import("./pages/IndicacoesPage"));
const ProgramaIndicacoesPage = lazy(() => import("./pages/ProgramaIndicacoesPage"));
const CreatorProfilePage = lazy(() => import("./pages/CreatorProfilePage"));
const MyInvoicesPage = lazy(() => import("./pages/user/MyInvoicesPage"));
const BankInfoPage = lazy(() => import("./pages/BankInfoPage"));

// ── Admin pages (heavy, never needed by regular users) ──
const AdminAnalyticsPage = lazy(() => import("./pages/admin/AdminAnalyticsPage"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminStaff = lazy(() => import("./pages/admin/AdminStaff"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminSupportPage = lazy(() => import("./pages/admin/AdminSupportPage"));
const AdminAuditPage = lazy(() => import("./pages/admin/AdminAuditPage"));
const AdminLGPDPage = lazy(() => import("./pages/admin/AdminLGPDPage"));
const AdminAffiliateAuditPage = lazy(() => import("./pages/admin/AdminAffiliateAuditPage"));
const AdminAffiliateManagementPage = lazy(() => import("./pages/admin/AdminAffiliateManagementPage"));
const AdminProgramaIndicacoesPage = lazy(() => import("./pages/admin/AdminProgramaIndicacoesPage"));
const AdminAddressAuditPage = lazy(() => import("./pages/admin/AdminAddressAuditPage"));
const AdminPixConfigPage = lazy(() => import("./pages/admin/AdminPixConfigPage"));
const AdminMonetizationPage = lazy(() => import("./pages/admin/AdminMonetizationPage"));
const MonetizationOnboardingPage = lazy(() => import("./pages/MonetizationOnboardingPage"));
const CreatorChannelPage = lazy(() => import("./pages/CreatorChannelPage"));
const OgCanalPreviewPage = lazy(() => import("./pages/OgCanalPreviewPage"));
const AdminVerificationsPage = lazy(() => import("./pages/admin/AdminVerificationsPage"));
const AdminPostsPage = lazy(() => import("./pages/admin/AdminPostsPage"));
const AdminFeedSettingsPage = lazy(() => import("./pages/admin/AdminFeedSettingsPage"));
const AdminDiscoveriesPage = lazy(() => import("./pages/admin/AdminDiscoveriesPage"));
const AdminAuraSettingsPage = lazy(() => import("./pages/admin/AdminAuraSettingsPage"));
const AdminAuraPulseSettingsPage = lazy(() => import("./pages/admin/AdminAuraPulseSettingsPage"));
const AdminAuraXpEconomyPage = lazy(() => import("./pages/admin/AdminAuraXpEconomyPage"));
const AdminUserXpBalancePage = lazy(() => import("./pages/admin/AdminUserXpBalancePage"));
const AdminSlideGuidesPage = lazy(() => import("./pages/admin/AdminSlideGuidesPage"));
const AdminSocialTrustPage = lazy(() => import("./pages/admin/AdminSocialTrustPage"));
const AdminUniversoSocialPage = lazy(() => import("./pages/admin/AdminUniversoSocialPage"));
const AdminRetentionPage = lazy(() => import("./pages/admin/AdminRetentionPage"));
const AdminSpecialCyclesPage = lazy(() => import("./pages/admin/AdminSpecialCyclesPage"));
const AdminRoomChatLogsPage = lazy(() => import("./pages/admin/AdminRoomChatLogsPage"));
const AdminPlansPage = lazy(() => import("./pages/admin/AdminPlansPage"));
const AdminSiteEditorPage = lazy(() => import("./pages/admin/AdminSiteEditorPage"));
const AdminSubscriptionCouponsPage = lazy(() => import("./pages/admin/AdminSubscriptionCouponsPage"));
const AdminBannedUsersPage = lazy(() => import("./pages/admin/AdminBannedUsersPage"));
const AdminCemiterioPage = lazy(() => import("./pages/admin/AdminCemiterioPage"));
const AdminAdsPage = lazy(() => import("./pages/admin/AdminAdsPage"));
const AdminMarketplaceAdsPage = lazy(() => import("./pages/admin/AdminMarketplaceAdsPage"));
const AdminSuggestionsPage = lazy(() => import("./pages/admin/AdminSuggestionsPage"));
const AdminFeedNovidadesPage = lazy(() => import("./pages/admin/AdminFeedNovidadesPage"));
const AdminStoryReportsPage = lazy(() => import("./pages/admin/AdminStoryReportsPage"));
const AdminQualityControlPage = lazy(() => import("./pages/admin/AdminQualityControlPage"));
const AdminMatchNotificationPage = lazy(() => import("./pages/admin/AdminMatchNotificationPage"));
const AdminBetaControlPage = lazy(() => import("./pages/admin/AdminBetaControlPage"));
const AdminCaixaOcultaPage = lazy(() => import("./pages/admin/AdminCaixaOcultaPage"));
const CaixaOcultaCreatorPage = lazy(() => import("./pages/CaixaOcultaCreatorPage"));
const CommunitiesPage = lazy(() => import("./pages/CommunitiesPage"));
const CommunityDetailPage = lazy(() => import("./pages/CommunityDetailPage"));
const CommunityTopicPage = lazy(() => import("./pages/CommunityTopicPage"));
const CommunityInvitePage = lazy(() => import("./pages/CommunityInvitePage"));

const AdminCommunitiesPage = lazy(() => import("./pages/admin/AdminCommunitiesPage"));
const AdminPesquisasPage = lazy(() => import("./pages/admin/AdminPesquisasPage"));
const AdminLaboratorioOcultoPage = lazy(() => import("./pages/admin/AdminLaboratorioOcultoPage"));
const AdminInterestTagsPage = lazy(() => import("./pages/admin/AdminInterestTagsPage"));
const CaixaOcultaTrackingPage = lazy(() => import("./pages/CaixaOcultaTrackingPage"));
const AdminSocialBetaModulePage = lazy(() => import("./pages/admin/AdminExperienciasOcultasPage"));
const SocialBetaModulePage = lazy(() => import("./pages/ExperienciasOcultasPage"));
const SocialBetaSlotPage = lazy(() => import("./pages/ExperienciasOcultasSlotPage"));
const BetaWelcomeModalLazy = lazy(() => import("./components/beta/BetaWelcomeModal").then(m => ({ default: m.BetaWelcomeModal })));
const RetentionRouteTrackerLazy = lazy(() => import("./components/retention/RetentionRouteTracker").then(m => ({ default: m.RetentionRouteTracker })));
const MaintenanceBannerLazy = lazy(() => import("./components/beta/MaintenanceBanner").then(m => ({ default: m.MaintenanceBanner })));
const BetaPublicBannerLazy = lazy(() => import("./components/beta/BetaPublicBanner").then(m => ({ default: m.BetaPublicBanner })));
const GlobalAdminCommentsRealtimeLazy = lazy(() => import("@/components/realtime/GlobalAdminCommentsRealtime").then(m => ({ default: m.GlobalAdminCommentsRealtime })));
const GlobalAffiliateApprovedListenerLazy = lazy(() => import("@/components/global/GlobalAffiliateApprovedListener").then(m => ({ default: m.GlobalAffiliateApprovedListener })));
const MasterOnlineAlertProviderLazy = lazy(() => import("@/components/admin/MasterOnlineAlertProvider").then(m => ({ default: m.MasterOnlineAlertProvider })));
const SurveyAttentionAlertLazy = lazy(() => import("@/components/survey/SurveyAttentionAlert").then(m => ({ default: m.SurveyAttentionAlert })));
const SurveyPendingRewardOnLoginLazy = lazy(() => import("@/components/survey/SurveyPendingRewardOnLogin").then(m => ({ default: m.SurveyPendingRewardOnLogin })));
const InsufficientXpModalLazy = lazy(() => import("@/components/aura/InsufficientXpModal").then(m => ({ default: m.InsufficientXpModal })));
const GlobalGiftModalMountLazy = lazy(() => import("@/components/GlobalGiftModalMount").then(m => ({ default: m.GlobalGiftModalMount })));
const XpBillingGlobalListenerLazy = lazy(() => import("@/components/aura/XpBillingGlobalListener").then(m => ({ default: m.XpBillingGlobalListener })));
const AdminResendConfigPage = lazy(() => import("./pages/admin/AdminResendConfigPage"));
const AdminImpersonationLogsPage = lazy(() => import("./pages/admin/AdminImpersonationLogsPage"));
const AdminCentralInvestigacaoPage = lazy(() => import("./pages/admin/AdminCentralInvestigacaoPage"));
const AdminCheckoutHealthPage = lazy(() => import("./pages/admin/AdminCheckoutHealthPage"));
const AdminWhatsAppConfigPage = lazy(() => import("./pages/admin/AdminWhatsAppConfigPage"));
const AdminUserBillingPage = lazy(() => import("./pages/admin/AdminUserBillingPage"));
const AdminRevenueMetricsPage = lazy(() => import("./pages/admin/AdminRevenueMetricsPage"));
const AdminEmailTemplatesPage = lazy(() => import("./pages/admin/AdminEmailTemplatesPage"));
const AdminPaymentTestPage = lazy(() => import("./pages/admin/AdminPaymentTestPage"));
const AdminEmailMetricsPage = lazy(() => import("./pages/admin/AdminEmailMetricsPage"));
const AdminCapacityPage = lazy(() => import("./pages/admin/AdminCapacityPage"));
const AdminHeroSettingsPage = lazy(() => import("./pages/admin/AdminHeroSettingsPage"));
const AdminNotificationLogsPage = lazy(() => import("./pages/admin/AdminNotificationLogsPage"));
const AdminAsaasWebhookLogsPage = lazy(() => import("./pages/admin/AdminAsaasWebhookLogsPage"));
const AdminAsaasStressTestPage = lazy(() => import("./pages/admin/AdminAsaasStressTestPage"));
const AdminCronJobsPage = lazy(() => import("./pages/admin/AdminCronJobsPage"));
const AdminAsaasMockSandboxPage = lazy(() => import("./pages/admin/AdminAsaasMockSandboxPage"));
const AdminMarketingAutomationPage = lazy(() => import("./pages/admin/AdminMarketingAutomationPage"));
const AdminFraudPage = lazy(() => import("./pages/admin/AdminFraudPage"));
const AdminFraudEventsPage = lazy(() => import("./pages/admin/AdminFraudEventsPage"));
const AdminBlockedCommissionsPage = lazy(() => import("./pages/admin/AdminBlockedCommissionsPage"));
const AdminABTestingPage = lazy(() => import("./pages/admin/AdminABTestingPage"));
const AdminFeedbackNPSPage = lazy(() => import("./pages/admin/AdminFeedbackNPSPage"));
const AdminGamificationPage = lazy(() => import("./pages/admin/AdminGamificationPage"));
const AdminPushCampaignsPage = lazy(() => import("./pages/admin/AdminPushCampaignsPage"));
const AdminReferralPage = lazy(() => import("./pages/admin/AdminReferralPage"));
const AdminInvoicesPage = lazy(() => import("./pages/admin/AdminInvoicesPage"));
const AdminAdvancedAnalyticsPage = lazy(() => import("./pages/admin/AdminAdvancedAnalyticsPage"));
const AdminPlayShareEditorPage = lazy(() => import("./pages/admin/AdminPlayShareEditorPage"));

const AdminWebhooksPage = lazy(() => import("./pages/admin/AdminWebhooksPage"));
const AdminWebhookEventsPage = lazy(() => import("./pages/admin/AdminWebhookEventsPage"));
const AdminBackupPage = lazy(() => import("./pages/admin/AdminBackupPage"));
const AdminMarketplacePage = lazy(() => import("./pages/admin/AdminMarketplacePage"));
const AdminModerationPage = lazy(() => import("./pages/admin/AdminModerationPage"));
const AdminWithdrawalsPage = lazy(() => import("./pages/admin/AdminWithdrawalsPage"));
const AdminDisputesPage = lazy(() => import("./pages/admin/AdminDisputesPage"));
const AdminRefundChargebackHubPage = lazy(() => import("./pages/admin/AdminRefundChargebackHubPage"));
const AdminAsaasSubscriptionsPage = lazy(() => import("./pages/admin/AdminAsaasSubscriptionsPage"));
const AdminAsaasFinanceCentralPage = lazy(() => import("./pages/admin/AdminAsaasFinanceCentralPage"));
const AdminAntifraudFinanceiroPage = lazy(() => import("./pages/admin/AdminAntifraudFinanceiroPage"));
const AdminAntifraudAuditPage = lazy(() => import("./pages/admin/AdminAntifraudAuditPage"));
const AdminAsaasOpsStatusPage = lazy(() => import("./pages/admin/AdminAsaasOpsStatusPage"));
const AdminStressTestReportPage = lazy(() => import("./pages/admin/AdminStressTestReportPage"));
const AdminSystemCachePage = lazy(() => import("./pages/admin/AdminSystemCachePage"));
const AdminPWAPage = lazy(() => import("./pages/admin/AdminPWAPage"));
const AdminVersionDebugPage = lazy(() => import("./pages/admin/AdminVersionDebugPage"));
const InstallPage = lazy(() => import("./pages/InstallPage"));
const OfflineBanner = lazy(() => import("@/components/pwa/OfflineBanner").then(m => ({ default: m.OfflineBanner })));
const PerfDiagnosticsPanelLazy = lazy(() => import("@/components/admin/PerfDiagnosticsPanel").then(m => ({ default: m.PerfDiagnosticsPanel })));
const AdminSpecialRequestsPage = lazy(() => import("./pages/admin/AdminSpecialRequestsPage"));
const AdminFinanceHubPage = lazy(() => import("./pages/admin/AdminFinanceHubPage"));
const AdminSplitConfigPage = lazy(() => import("./pages/admin/AdminSplitConfigPage"));
const AdminSplitBreakdownPage = lazy(() => import("./pages/admin/AdminSplitBreakdownPage"));
const AdminFiscalDashboardPage = lazy(() => import("./pages/admin/AdminFiscalDashboardPage"));
const AdminMonthlyTaxReportPage = lazy(() => import("./pages/admin/AdminMonthlyTaxReportPage"));
const AdminFinancialIntelligencePage = lazy(() => import("./pages/admin/AdminFinancialIntelligencePage"));
const AdminMLPage = lazy(() => import("./pages/admin/AdminMLPage"));
const AdminAntifraudMonitorPage = lazy(() => import("./pages/admin/AdminAntifraudMonitorPage"));
const AffiliateDashboardPage = lazy(() => import("./pages/AffiliateDashboardPage"));
const AdminFoundersReviewPage = lazy(() => import("./pages/admin/AdminFoundersReviewPage"));
const AdminIntegrationsStatusPage = lazy(() => import("./pages/admin/AdminIntegrationsStatusPage"));
const AdminPromotionsPage = lazy(() => import("./pages/admin/AdminPromotionsPage"));
const AdminLandingEditorPage = lazy(() => import("./pages/admin/AdminLandingEditorPage"));
const AdminAddonsPage = lazy(() => import("./pages/admin/AdminAddonsPage"));
const AdminQuickEditPage = lazy(() => import("./pages/admin/AdminQuickEditPage"));
const AdminOgDebugPage = lazy(() => import("./pages/admin/AdminOgDebugPage"));
const AdminWelcomeMessagePage = lazy(() => import("./pages/admin/AdminWelcomeMessagePage"));
const AdminExperienciaUsuarioPage = lazy(() => import("./pages/admin/AdminExperienciaUsuarioPage"));
const AdminWelcomeLogPage = lazy(() => import("./pages/admin/AdminWelcomeLogPage"));
const AdminActiveSessionsPage = lazy(() => import("./pages/admin/AdminActiveSessionsPage"));
const AdminInviteEditorPage = lazy(() => import("./pages/admin/AdminInviteEditorPage"));
const AdminShareLandingEditorPage = lazy(() => import("./pages/admin/AdminShareLandingEditorPage"));

// ── Optimized QueryClient: maximum performance for all devices ──
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,       // 3min — avoids re-fetching on every navigation
      gcTime: 1000 * 60 * 15,         // 15min cache retention (more aggressive)
      retry: 1,                        // 1 retry only — fast failure on mobile
      retryDelay: 500,                 // Faster retry
      refetchOnWindowFocus: false,     // Prevent spam-refetch on tab switch
      refetchOnReconnect: true,        // Re-fetch when network reconnects
      networkMode: 'offlineFirst',     // Serve from cache instantly when offline
    },
    mutations: {
      retry: 0,
      networkMode: 'always',
    },
  },
});

// Expose o QueryClient globalmente para que o signOut (em useAuth) possa
// limpar todo o cache de usuário/admin ao trocar de conta e evitar
// vazamento de dados entre sessões diferentes no mesmo navegador.
if (typeof window !== 'undefined') {
  (window as any).__lovableReactQueryClient = queryClient;
}

// ── Page-level fallback — esqueleto leve que detecta a rota destino
// (feed/perfil/admin/auth) e renderiza um layout aproximado. Reduz a
// percepção de tela vazia em chunks lazy lentos.
const PageFallback = () => <RouteSkeleton />;

const App = () => {
  const deferredGlobalsReady = useDeferredMount(1800);
  const deferredRealtimeReady = useDeferredMount(3200);

  // Prefetch dos chunks das rotas mais usadas (Feed, Perfil, Mensagens,
  // Notificações, Admin) em idle do browser → reduz "Failed to fetch
  // dynamically imported module" e o tempo de transição entre rotas.
  useEffect(() => {
    let cancelled = false;
    void import('@/lib/routePrefetch').then((m) => {
      if (!cancelled) m.prefetchHotRoutes();
    }).catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, []);

  // Libera scroll após modais fecharem (Radix injeta overflow:hidden e position:fixed no body)
  useEffect(() => {
    const unlockScroll = () => {
      // Só age quando nenhum modal está aberto
      if (document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]')) return;

      const b = document.body;
      const h = document.documentElement;

      // Remove overflow:hidden injetado — mas NÃO interfere quando overflow é do CSS (sem inline style)
      if (b.style.overflow === 'hidden' || b.style.overflowY === 'hidden') {
        b.style.removeProperty('overflow');
        b.style.removeProperty('overflow-y');
      }
      // Restaura posição quando body estava fixed (padrão Radix scroll-lock)
      if (b.style.position === 'fixed') {
        const scrollY = parseInt(b.style.top || '0') * -1;
        b.style.removeProperty('position');
        b.style.removeProperty('top');
        b.style.removeProperty('padding-right');
        if (scrollY > 0) window.scrollTo(0, scrollY);
      }
      if (h.style.overflow === 'hidden') {
        h.style.removeProperty('overflow');
      }
      // Remove pointer-events:none residual (bug Radix no Android)
      if (b.style.pointerEvents === 'none') {
        b.style.removeProperty('pointer-events');
      }
      // Remove atributo data-scroll-locked do Radix
      b.removeAttribute('data-scroll-locked');
    };

    // MutationObserver — só observa o body, não o html (evita loop desnecessário)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'style' || m.attributeName === 'data-scroll-locked') {
          setTimeout(unlockScroll, 150); // aguarda modal fechar completamente
          break;
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'data-scroll-locked'],
    });

    return () => observer.disconnect();
  }, []);

  // ── DB health check removido ──
  // Era um fetch extra em /auth/v1/health no boot só para logar "✅ DB Connected".
  // Não tem valor pro usuário, gerava 1 round-trip e poluía o console.


  // Rotas públicas de compartilhamento (/play/p/:id e /play/share/:id) NÃO
  // devem mostrar nenhum modal/banner global (idade, cookies, beta, manutenção,
  // username, update, XP, etc). O único modal permitido nessas rotas é o
  // GuestSignupGateModal quando o visitante clica em uma ação que exige conta.
  const isPublicShareRoute = typeof window !== 'undefined'
    && isPublicSharePath(window.location.pathname);
  const showGlobals = deferredGlobalsReady && !isPublicShareRoute;
  const showRealtimeGlobals = deferredRealtimeReady && !isPublicShareRoute;

  return (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PerformanceProvider>
          <SocialUniverseProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            {showGlobals && <Suspense fallback={null}><BetaWelcomeModalLazy /></Suspense>}
            {showGlobals && <Suspense fallback={null}><MaintenanceBannerLazy /></Suspense>}
            {showGlobals && <Suspense fallback={null}><BetaPublicBannerLazy /></Suspense>}
            <BrowserRouter>
              <AgeWarningBanner />
              {showGlobals && <Suspense fallback={null}><OfflineBanner /></Suspense>}
              <RateLimitProvider>
              <ScrollToTop />
              <RouteMeta />
              {showGlobals && <Suspense fallback={null}><RetentionRouteTrackerLazy /></Suspense>}

              {!isPublicShareRoute && <CookieConsentBanner />}
              {showGlobals && <Suspense fallback={null}><GlobalAffiliateApprovedListenerLazy /></Suspense>}
              {showRealtimeGlobals && <Suspense fallback={null}><MasterOnlineAlertProviderLazy /></Suspense>}
              {showGlobals && <Suspense fallback={null}><SurveyAttentionAlertLazy /></Suspense>}
              {showGlobals && <Suspense fallback={null}><SurveyPendingRewardOnLoginLazy /></Suspense>}
              <WebAppUpdateModalRouteGate />
              {showGlobals && <Suspense fallback={null}><GlobalOcultoPlayMiniPlayer /></Suspense>}


              {showRealtimeGlobals && <Suspense fallback={null}><GlobalAdminCommentsRealtimeLazy /></Suspense>}
              {showGlobals && <Suspense fallback={null}><InsufficientXpModalLazy /></Suspense>}
              {showGlobals && <Suspense fallback={null}><PerfDiagnosticsPanelLazy /></Suspense>}
              {showGlobals && <Suspense fallback={null}><GlobalGiftModalMountLazy /></Suspense>}

              <MaintenanceGate>
              <FeedModeProvider>
              <SafeBlurProvider>
              <Routes>
                {/* Modo Manutenção — sempre acessível */}
                <Route path="/manutencao" element={<Suspense fallback={<PageFallback />}><MaintenancePage /></Suspense>} />
                {/* ── Public routes (estritamente necessárias: auth, legal, callbacks) ── */}
                <Route path="/login" element={<Suspense fallback={<PageFallback />}><Login /></Suspense>} />
                <Route path="/signup" element={<Suspense fallback={<PageFallback />}><Signup /></Suspense>} />
                <Route path="/forgot-password" element={<Suspense fallback={<PageFallback />}><ForgotPassword /></Suspense>} />
                <Route path="/reset-password" element={<Suspense fallback={<PageFallback />}><ResetPassword /></Suspense>} />
                <Route path="/auth/callback" element={<Suspense fallback={<PageFallback />}><AuthCallbackPage /></Suspense>} />
                <Route path="/completar-cadastro" element={<ProtectedRoute><Navigate to="/feed" replace /></ProtectedRoute>} />
                <Route path="/legal/:slug" element={<Suspense fallback={<PageFallback />}><LegalPage /></Suspense>} />
                <Route path="/trust" element={<Suspense fallback={<PageFallback />}><TrustPage /></Suspense>} />
                <Route path="/seguranca" element={<Navigate to="/trust" replace />} />
                <Route path="/instalar" element={<Suspense fallback={<PageFallback />}><InstallPage /></Suspense>} />
                <Route path="/denunciar" element={<Suspense fallback={<PageFallback />}><ReportPage /></Suspense>} />
                <Route path="/contestacao" element={<Suspense fallback={<PageFallback />}><AppealPage /></Suspense>} />
                <Route path="/invite-confirmed" element={<Suspense fallback={<PageFallback />}><InviteConfirmationPage /></Suspense>} />
                <Route
                  path="/dev/preview/affiliate-approved"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <AffiliateApprovedPreviewPage />
                    </Suspense>
                  }
                />

                {/* Callbacks de pagamento (links de e-mail / gateway) — sessão validada internamente */}
                <Route path="/checkout/resume" element={<Suspense fallback={<PageFallback />}><CheckoutResumePage /></Suspense>} />
                <Route path="/checkout-resume" element={<Suspense fallback={<PageFallback />}><CheckoutResumePage /></Suspense>} />

                {/* ── Rotas antes públicas — agora exigem login ── */}
                {/* Landing pública: abre direto ao acessar o domínio, sem exigir login */}
                <Route path="/" element={<Suspense fallback={<PageFallback />}><Landing /></Suspense>} />
                <Route path="/programa-indicacoes" element={<Suspense fallback={<PageFallback />}><ProgramaIndicacoesPage /></Suspense>} />
                {/* Recovery: redireciona para o HTML estático que limpa caches/SW.
                    Em produção, o vercel.json já reescreve /update -> /update.html
                    antes da SPA — este route é fallback p/ dev e navegação interna. */}
                <Route
                  path="/update"
                  element={<UpdateRouteRedirect />}
                />
                <Route path="/pioneiros" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><PioneirosPage /></Suspense></ProtectedRoute>} />
                <Route path="/share/:shareCode" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><SharePage /></Suspense></ProtectedRoute>} />
                {/* Rota PÚBLICA de compartilhamento de post — abre sem login, com player embutido */}
                <Route path="/c/:postId" element={<SafeSuspense fallback={<PageFallback />}><SharedContentPage /></SafeSuspense>} />
                {/* Rota PÚBLICA de leitura — preview de compartilhamento, sem exigir login */}
                <Route path="/leitura/:postId" element={<Suspense fallback={<PageFallback />}><LeituraPublicaPage /></Suspense>} />
                {/* Rota PÚBLICA do OCULTO PLAY — link compartilhado abre direto, sem login */}
                <Route path="/play/p/:id" element={<SafeSuspense fallback={<PageFallback />}><OcultoPlayPublicItemPage /></SafeSuspense>} />
                <Route path="/oculto-play" element={<SafeSuspense fallback={<PageFallback />}><OcultoPlayPage /></SafeSuspense>} />
                <Route path="/oculto-play/offline" element={<SafeSuspense fallback={<PageFallback />}><OcultoPlayOfflinePage /></SafeSuspense>} />
                <Route path="/spy" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><SpyFeedPage /></Suspense></ProtectedRoute>} />
                {/* Rota pública: link de convite deve abrir sem login (cria cookie + leva ao signup). */}
                <Route path="/creator-invite/:code" element={<Suspense fallback={<PageFallback />}><CreatorInvitePage /></Suspense>} />
                <Route path="/invite/:username" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><InvitePage /></Suspense></ProtectedRoute>} />
                <Route path="/canal/:creatorId" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CreatorChannelPage /></Suspense></ProtectedRoute>} />
                <Route path="/dev/og-canal" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><OgCanalPreviewPage /></Suspense></ProtectedRoute>} />

                {/* ── Checkout routes ── */}
                <Route path="/checkout" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CheckoutPage /></Suspense></ProtectedRoute>} />
                <Route path="/payment-success" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><PaymentSuccessPage /></Suspense></ProtectedRoute>} />
                <Route path="/checkout/retry" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CheckoutRetryPage /></Suspense></ProtectedRoute>} />

                {/* ── Protected Dashboard routes ── */}
                <Route element={<ProtectedRoute><Suspense fallback={<PageFallback />}><DashboardLayout /></Suspense></ProtectedRoute>}>
                  <Route path="/feed" element={<SafeSuspense fallback={<PageFallback />}><Index /></SafeSuspense>} />
                  <Route path="/tutoriais" element={<SafeSuspense fallback={<PageFallback />}><TutoriaisPage /></SafeSuspense>} />
                  <Route path="/experiencias-ocultas" element={<SafeSuspense fallback={<PageFallback />}><SocialBetaModulePage /></SafeSuspense>} />
                  <Route path="/experiencias-ocultas/:slot" element={<SafeSuspense fallback={<PageFallback />}><SocialBetaSlotPage /></SafeSuspense>} />
                  <Route path="/vitrine-vip" element={<SafeSuspense fallback={<PageFallback />}><VitrineVipPage /></SafeSuspense>} />
                  <Route path="/radar" element={<SafeSuspense fallback={<PageFallback />}><RadarPage /></SafeSuspense>} />
                  <Route path="/comunidades" element={<SafeSuspense fallback={<PageFallback />}><CommunitiesPage /></SafeSuspense>} />
                  <Route path="/comunidades/:slug" element={<SafeSuspense fallback={<PageFallback />}><CommunityDetailPage /></SafeSuspense>} />
                  <Route path="/comunidades/:slug/topico/:topicId" element={<SafeSuspense fallback={<PageFallback />}><CommunityTopicPage /></SafeSuspense>} />
                  <Route path="/comunidades/invite/:code" element={<SafeSuspense fallback={<PageFallback />}><CommunityInvitePage /></SafeSuspense>} />

                  <Route path="/radar/pings" element={<SafeSuspense fallback={<PageFallback />}><RadarPingsHistoryPage /></SafeSuspense>} />
                  <Route path="/pesquisar" element={<SafeSuspense fallback={<PageFallback />}><PesquisarPage /></SafeSuspense>} />
                  <Route path="/pesquisar/tag/:tag" element={<SafeSuspense fallback={<PageFallback />}><PesquisarTagPage /></SafeSuspense>} />
                  <Route path="/visits" element={<Suspense fallback={<PageFallback />}><VisitsPage /></Suspense>} />
                  <Route path="/likes" element={<Suspense fallback={<PageFallback />}><LikesPage /></Suspense>} />
                  <Route path="/following" element={<Suspense fallback={<PageFallback />}><FollowingPage /></Suspense>} />
                  <Route path="/followers" element={<Suspense fallback={<PageFallback />}><FollowersPage /></Suspense>} />
                  <Route path="/saved" element={<Suspense fallback={<PageFallback />}><SavedPage /></Suspense>} />
                  <Route path="/ranking" element={<Suspense fallback={<PageFallback />}><RankingPage /></Suspense>} />
                  <Route path="/subscriptions" element={<Suspense fallback={<PageFallback />}><SubscriptionsPage /></Suspense>} />
                  <Route path="/events" element={<Suspense fallback={<PageFallback />}><EventsPage /></Suspense>} />
                  <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
                  <Route path="/settings/pulses" element={<Suspense fallback={<PageFallback />}><PulsesSettingsPage /></Suspense>} />
                  <Route path="/settings/pulses/history" element={<Suspense fallback={<PageFallback />}><AttentionHistoryPage /></Suspense>} />
                  <Route path="/debug/profile" element={<Suspense fallback={<PageFallback />}><ProfileDiagnosticsPage /></Suspense>} />
                  <Route path="/earnings" element={<Suspense fallback={<PageFallback />}><EarningsPage /></Suspense>} />
                  <Route path="/earnings/breakdown" element={<Suspense fallback={<PageFallback />}><EarningsBreakdownPage /></Suspense>} />
                  <Route path="/earnings/statement" element={<Suspense fallback={<PageFallback />}><EarningsStatementPage /></Suspense>} />
                  <Route path="/earnings/analytics" element={<Suspense fallback={<PageFallback />}><EarningsAnalyticsPage /></Suspense>} />
                  <Route path="/indicacoes" element={<Suspense fallback={<PageFallback />}><IndicacoesPage /></Suspense>} />
                  <Route path="/affiliate-analytics" element={<Navigate to="/indicacoes" replace />} />
                  <Route path="/madrinha-analytics" element={<Navigate to="/indicacoes" replace />} />
                  <Route path="/madrinhas" element={<Navigate to="/indicacoes" replace />} />
                  <Route path="/earnings/coupons" element={<Suspense fallback={<PageFallback />}><CouponsManagementPage /></Suspense>} />
                  <Route path="/wallet" element={<Suspense fallback={<PageFallback />}><WalletPage /></Suspense>} />
                  <Route path="/creator-wallet" element={<Suspense fallback={<PageFallback />}><CreatorWalletPage /></Suspense>} />
                  <Route path="/profile" element={<Suspense fallback={<PageFallback />}><MyProfilePage /></Suspense>} />
                  <Route path="/sessoes-ocultas" element={<Suspense fallback={<PageFallback />}><SessoesOcultasPage /></Suspense>} />
                  <Route path="/minhas-assinaturas" element={<Suspense fallback={<PageFallback />}><MySubscriptionsPage /></Suspense>} />
                  <Route path="/novidades" element={<Suspense fallback={<PageFallback />}><NovidadesPage /></Suspense>} />
                  <Route path="/my-media" element={<Suspense fallback={<PageFallback />}><MyMediaPage /></Suspense>} />
                  <Route path="/vip-downloads" element={<Suspense fallback={<PageFallback />}><VipDownloadsPage /></Suspense>} />
                  <Route path="/affiliates" element={<Navigate to="/indicacoes" replace />} />
                  <Route path="/notifications" element={<Suspense fallback={<PageFallback />}><NotificationsPage /></Suspense>} />
                  <Route path="/messages" element={<Suspense fallback={<PageFallback />}><MessagesPage /></Suspense>} />
                  <Route path="/matches" element={<Suspense fallback={<PageFallback />}><MatchesPage /></Suspense>} />
                  <Route path="/perfect-pair" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><PerfectPairPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/aura-match" element={<Suspense fallback={<PageFallback />}><AuraMatchPage /></Suspense>} />
                  <Route path="/transactions" element={<Suspense fallback={<PageFallback />}><TransactionsPage /></Suspense>} />
                  <Route path="/gifts-history" element={<Suspense fallback={<PageFallback />}><GiftsHistoryPage /></Suspense>} />
                  <Route path="/my-gifts" element={<Suspense fallback={<PageFallback />}><MyGiftsPage /></Suspense>} />
                  <Route path="/auctions" element={<Suspense fallback={<PageFallback />}><AuctionsPage /></Suspense>} />
                  <Route path="/auction/:id" element={<Suspense fallback={<PageFallback />}><AuctionDetailPage /></Suspense>} />
                  <Route path="/couple-verification" element={<Suspense fallback={<PageFallback />}><CoupleVerificationPage /></Suspense>} />
                  <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><CreatorDashboard /></Suspense>} />
                  <Route path="/canal-vip" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CanalVipPage /></Suspense></ProtectedRoute>} />
                  <Route path="/support" element={<Suspense fallback={<PageFallback />}><SupportPage /></Suspense>} />
                  {/* /admin/partners movido para o bloco admin abaixo */}
                  <Route path="/marketplace" element={<Suspense fallback={<PageFallback />}><MarketplacePage /></Suspense>} />
                  <Route path="/bank-info" element={<Suspense fallback={<PageFallback />}><BankInfoPage /></Suspense>} />
                  <Route path="/monetizacao" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><MonetizationOnboardingPage /></Suspense></ProtectedRoute>} />
                  <Route path="/play/party/:id" element={<SafeSuspense fallback={<PageFallback />}><OcultoPlayWatchPartyPage /></SafeSuspense>} />
                  <Route path="/play/downloads" element={<SafeSuspense fallback={<PageFallback />}><OcultoPlayDownloadsPage /></SafeSuspense>} />
                  <Route path="/meus-canais" element={<ProtectedRoute><SafeSuspense fallback={<PageFallback />}><MyChannelsPage /></SafeSuspense></ProtectedRoute>} />
                  <Route path="/play/c/:slug" element={<ProtectedRoute><SafeSuspense fallback={<PageFallback />}><PlayChannelPage /></SafeSuspense></ProtectedRoute>} />
                </Route>

                {/* ── Admin routes ──
                    Layout exige qualquer admin role; rotas MASTER ONLY são
                    re-protegidas inline com <MasterAdminRoute>. */}
                <Route element={<AdminProtectedRoute allowedRoles={['admin_master','admin_regional','moderator']}><Suspense fallback={<PageFallback />}><AdminLayout /></Suspense></AdminProtectedRoute>}>
                  {/* ─── Admin / Moderation (admin_master + admin_regional + moderator) ─── */}
                  <Route path="/admin/dashboard" element={<Suspense fallback={<PageFallback />}><AdminDashboard /></Suspense>} />
                  <Route path="/admin-dashboard" element={<Suspense fallback={<PageFallback />}><AdminDashboard /></Suspense>} />
                  <Route path="/admin/users" element={<Suspense fallback={<PageFallback />}><AdminUsers /></Suspense>} />
                  <Route path="/admin/posts" element={<Suspense fallback={<PageFallback />}><AdminPostsPage /></Suspense>} />
                  <Route path="/admin/verifications" element={<Suspense fallback={<PageFallback />}><AdminVerificationsPage /></Suspense>} />
                  <Route path="/admin/moderation" element={<Suspense fallback={<PageFallback />}><AdminModerationPage /></Suspense>} />
                  <Route path="/admin/comunidades" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminCommunitiesPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/comunidades-ocultas" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminCommunitiesPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/pesquisas" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPesquisasPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/laboratorio-oculto" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminLaboratorioOcultoPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/recursos-experimentais" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminLaboratorioOcultoPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/story-reports" element={<Suspense fallback={<PageFallback />}><AdminStoryReportsPage /></Suspense>} />
                  <Route path="/admin/support" element={<Suspense fallback={<PageFallback />}><AdminSupportPage /></Suspense>} />
                  <Route path="/admin/quality-control" element={<Suspense fallback={<PageFallback />}><AdminQualityControlPage /></Suspense>} />
                  <Route path="/admin/beta-control" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminBetaControlPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/manutencao" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminMaintenancePage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/modos-feed" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminFeedModesPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/interest-tags" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminInterestTagsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/oculto-play" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminOcultoPlayPage /></Suspense></MasterAdminRoute>} />


                  <Route path="/admin/experiencia-oculto" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminExperienceOcultoPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/experiencias-ocultas" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSocialBetaModulePage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/caixa-oculta" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminCaixaOcultaPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/caixa-oculta/criador" element={<Suspense fallback={<PageFallback />}><CaixaOcultaCreatorPage /></Suspense>} />
                  <Route path="/caixa-oculta/:id" element={<Suspense fallback={<PageFallback />}><CaixaOcultaTrackingPage /></Suspense>} />
                  <Route path="/admin/founders-review" element={<Suspense fallback={<PageFallback />}><AdminFoundersReviewPage /></Suspense>} />
                  <Route path="/admin/banned-users" element={<Suspense fallback={<PageFallback />}><AdminBannedUsersPage /></Suspense>} />
                  <Route path="/admin/cemiterio" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminCemiterioPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/special-requests" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSpecialRequestsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/quick-edit" element={<Suspense fallback={<PageFallback />}><AdminQuickEditPage /></Suspense>} />
                  <Route path="/admin/og-debug" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminOgDebugPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/welcome-message" element={<Suspense fallback={<PageFallback />}><AdminWelcomeMessagePage /></Suspense>} />
                  <Route path="/admin/welcome-log" element={<Suspense fallback={<PageFallback />}><AdminWelcomeLogPage /></Suspense>} />
                  <Route path="/admin/active-sessions" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminActiveSessionsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/system-cache" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSystemCachePage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/pwa" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPWAPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/version-debug" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminVersionDebugPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/match-notification" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminMatchNotificationPage /></Suspense></MasterAdminRoute>} />

                  {/* ─── Marketing / Conteúdo (admin + admin_regional) ─── */}
                  <Route path="/admin/feed-settings" element={<Suspense fallback={<PageFallback />}><AdminFeedSettingsPage /></Suspense>} />
                  <Route path="/admin/descobertas" element={<Suspense fallback={<PageFallback />}><AdminDiscoveriesPage /></Suspense>} />
                  <Route path="/admin/aura-settings" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAuraSettingsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/aura-pulse" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAuraPulseSettingsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/aura-xp-economy" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAuraXpEconomyPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/users-xp-balance" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminUserXpBalancePage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/slide-guides" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSlideGuidesPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/social-trust" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSocialTrustPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/universo-social" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminUniversoSocialPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/retention" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminRetentionPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/experiencia-do-usuario" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminExperienciaUsuarioPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/special-cycles" element={<Suspense fallback={<PageFallback />}><MasterAdminRoute><AdminSpecialCyclesPage /></MasterAdminRoute></Suspense>} />
                  <Route path="/admin/room-chat-logs" element={<Suspense fallback={<PageFallback />}><MasterAdminRoute><AdminRoomChatLogsPage /></MasterAdminRoute></Suspense>} />
                  <Route path="/admin/site-editor" element={<Suspense fallback={<PageFallback />}><AdminSiteEditorPage /></Suspense>} />
                  <Route path="/admin/landing-editor" element={<Suspense fallback={<PageFallback />}><AdminLandingEditorPage /></Suspense>} />
                   <Route path="/admin/invite-editor" element={<Suspense fallback={<PageFallback />}><AdminInviteEditorPage /></Suspense>} />
                   <Route path="/admin/play-share-editor" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPlayShareEditorPage /></Suspense></MasterAdminRoute>} />
                   <Route path="/admin/share-landing-editor" element={<Suspense fallback={<PageFallback />}><AdminShareLandingEditorPage /></Suspense>} />

                  <Route path="/admin/hero-settings" element={<Suspense fallback={<PageFallback />}><AdminHeroSettingsPage /></Suspense>} />
                  <Route path="/admin/ads" element={<Suspense fallback={<PageFallback />}><AdminAdsPage /></Suspense>} />
                  <Route path="/admin/marketplace-ads" element={<Suspense fallback={<PageFallback />}><AdminMarketplaceAdsPage /></Suspense>} />
                  <Route path="/admin/suggestions" element={<Suspense fallback={<PageFallback />}><AdminSuggestionsPage /></Suspense>} />
                  <Route path="/admin/feed-novidades" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminFeedNovidadesPage /></Suspense></MasterAdminRoute>} />

                  <Route path="/admin/marketing" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminMarketingAutomationPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/push-campaigns" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPushCampaignsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/promotions" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPromotionsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/whatsapp" element={<Suspense fallback={<PageFallback />}><AdminWhatsAppConfigPage /></Suspense>} />
                  <Route path="/admin/email-templates" element={<Suspense fallback={<PageFallback />}><AdminEmailTemplatesPage /></Suspense>} />
                  <Route path="/admin/email-metrics" element={<Suspense fallback={<PageFallback />}><AdminEmailMetricsPage /></Suspense>} />
                  <Route path="/admin/feedback" element={<Suspense fallback={<PageFallback />}><AdminFeedbackNPSPage /></Suspense>} />
                  <Route path="/admin/gamification" element={<Suspense fallback={<PageFallback />}><AdminGamificationPage /></Suspense>} />
                  <Route path="/admin/ab-testing" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminABTestingPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/referral" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminReferralPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/programa-indicacoes" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminProgramaIndicacoesPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/affiliates" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAffiliateManagementPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/partners" element={<Suspense fallback={<PageFallback />}><AdminPartnersPage /></Suspense>} />
                  <Route path="/admin/marketplace" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminMarketplacePage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/staff" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminStaff /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/audit" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAuditPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/address-audit" element={<Suspense fallback={<PageFallback />}><AdminAddressAuditPage /></Suspense>} />
                  <Route path="/admin/lgpd" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminLGPDPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/affiliate-audit" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAffiliateAuditPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/impersonation-logs" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminImpersonationLogsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/central-investigacao" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminCentralInvestigacaoPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/notification-logs" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminNotificationLogsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/analytics" element={<Suspense fallback={<PageFallback />}><AdminAnalyticsPage /></Suspense>} />
                  <Route path="/admin/advanced-analytics" element={<Suspense fallback={<PageFallback />}><AdminAdvancedAnalyticsPage /></Suspense>} />
                  <Route path="/admin/capacity" element={<Suspense fallback={<PageFallback />}><AdminCapacityPage /></Suspense>} />
                  <Route path="/admin/revenue-metrics" element={<Suspense fallback={<PageFallback />}><AdminRevenueMetricsPage /></Suspense>} />
                  <Route path="/admin/stress-test-report" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminStressTestReportPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/checkout-health" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminCheckoutHealthPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/fraud" element={<Suspense fallback={<PageFallback />}><AdminFraudPage /></Suspense>} />
                  <Route path="/admin/fraud/events" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminFraudEventsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/fraud/blocked" element={<Suspense fallback={<PageFallback />}><AdminBlockedCommissionsPage /></Suspense>} />
                  <Route path="/admin/antifraud-monitor" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAntifraudMonitorPage /></Suspense></MasterAdminRoute>} />

                  {/* ─── MASTER ONLY (financeiro / infra / config sensível) ─── */}
                  <Route path="/admin/pix" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPixConfigPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/asaas-finance-central" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAsaasFinanceCentralPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/asaas-webhook-logs" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAsaasWebhookLogsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/asaas-stress-test" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAsaasStressTestPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/asaas-mock-sandbox" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAsaasMockSandboxPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/asaas-subscriptions" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAsaasSubscriptionsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/asaas-ops-status" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAsaasOpsStatusPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/split-config" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSplitConfigPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/split-breakdown" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSplitBreakdownPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/finance-hub" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminFinanceHubPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/withdrawals" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminWithdrawalsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/disputes" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminDisputesPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/refund-chargeback-hub" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminRefundChargebackHubPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/antifraud-financeiro" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAntifraudFinanceiroPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/antifraud-audit" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAntifraudAuditPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/fiscal-dashboard" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminFiscalDashboardPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/fiscal-monthly" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminMonthlyTaxReportPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/financial-intelligence" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminFinancialIntelligencePage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/ml" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminMLPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/monetization" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminMonetizationPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/plans" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPlansPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/addons" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminAddonsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/subscription-coupons" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSubscriptionCouponsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/user-billing" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminUserBillingPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/invoices" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminInvoicesPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/payment-test" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminPaymentTestPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/settings" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminSettings /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/backup" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminBackupPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/cron-jobs" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminCronJobsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/webhooks" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminWebhooksPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/webhook-events" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminWebhookEventsPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/integrations" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminIntegrationsStatusPage /></Suspense></MasterAdminRoute>} />
                  <Route path="/admin/resend" element={<MasterAdminRoute><Suspense fallback={<PageFallback />}><AdminResendConfigPage /></Suspense></MasterAdminRoute>} />
                </Route>

                {/* /affiliate/dashboard movido para fora do bloco admin */}
                <Route path="/affiliate/dashboard" element={<Navigate to="/indicacoes" replace />} />


                {/* ── Standalone protected routes ── */}
                <Route path="/my-invoices" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><MyInvoicesPage /></Suspense></ProtectedRoute>} />
                <Route path="/creator/:creatorId" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CreatorProfilePage /></Suspense></ProtectedRoute>} />
                <Route path="/u/:creatorId" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CreatorProfilePage /></Suspense></ProtectedRoute>} />

                {/* ── Catch-all ── */}
                <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
              </Routes>
              {deferredRealtimeReady && <Suspense fallback={null}><XpBillingGlobalListenerLazy /></Suspense>}
              </SafeBlurProvider>

              </FeedModeProvider>
              </MaintenanceGate>
              </RateLimitProvider>
            </BrowserRouter>
          </TooltipProvider>
          </SocialUniverseProvider>
        </PerformanceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
  );
};
export default App;
