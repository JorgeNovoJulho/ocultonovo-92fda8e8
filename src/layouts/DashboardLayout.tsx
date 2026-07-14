import { Outlet } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { LeftSidebar } from "@/components/LeftSidebar";
import { MobileNavbar } from "@/components/MobileNavbar";
import { FreezeModeBanner } from "@/components/FreezeModeBanner";
import { useGiftNotifications } from "@/hooks/useGiftNotifications";
import { MobileAdBanner } from "@/components/ads/MobileAdBanner";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
// Lazy: only used during admin impersonation (rare)
const MobileSimulatorContainer = lazy(() => import("@/components/admin/MobileSimulatorContainer").then(m => ({ default: m.MobileSimulatorContainer })));
// Lazy: only renders at xl breakpoint (~1280px+) — most mobile/tablet users never load it
const RealtimeInboxSidebar = lazy(() => import("@/components/RealtimeInboxSidebar").then(m => ({ default: m.RealtimeInboxSidebar })));
const AuraRoomInviteListener = lazy(() => import("@/components/aura-match/AuraRoomInviteListener").then(m => ({ default: m.AuraRoomInviteListener })));
const AuraRoomWaitlistListener = lazy(() => import("@/components/aura-match/AuraRoomWaitlistListener").then(m => ({ default: m.AuraRoomWaitlistListener })));
import { PaymentOverdueBanner } from "@/components/PaymentOverdueBanner";
import { PaymentRequiredGuard } from "@/components/PaymentRequiredGuard";
import { MobileActivityTicker } from "@/components/activity";
import { KycBanner } from "@/components/kyc";
import { PromotionBanner } from "@/components/PromotionBanner";

import { PushSoftPrompt } from "@/components/push/PushSoftPrompt";
import { useGlobalImageFallback } from "@/hooks/useGlobalImageFallback";
import { useImpersonationStore } from "@/store/useImpersonationStore";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";
import { useIsMobile } from "@/hooks/use-mobile";
import { useImpersonationLogger } from "@/hooks/useImpersonationLogger";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { usePaymentConfirmationListener } from "@/hooks/usePaymentConfirmationListener";
import { usePresence } from "@/hooks/usePresence";
import { useViewModePreferences } from "@/hooks/useViewModePreferences";
import { useDeferredMount } from "@/hooks/useDeferredMount";
import { usePostsRealtime } from "@/hooks/usePostsRealtime";

// Lazy: modais raramente abertos no boot
const GiftReceivedModal = lazy(() => import("@/components/GiftReceivedModal").then(m => ({ default: m.GiftReceivedModal })));
const KycBlockedModal = lazy(() => import("@/components/kyc").then(m => ({ default: m.KycBlockedModal })));
const PromotionsModal = lazy(() => import("@/components/PromotionsModal").then(m => ({ default: m.PromotionsModal })));
const PaymentConfirmationModal = lazy(() => import("@/components/PaymentConfirmationModal").then(m => ({ default: m.PaymentConfirmationModal })));
const OnboardingModal = lazy(() => import("@/components/onboarding/OnboardingModal").then(m => ({ default: m.OnboardingModal })));
const PlaceholderMediaGate = lazy(() => import("@/components/profile/PlaceholderMediaGate"));
const ViewModeMigrationGate = lazy(() => import("@/components/view-mode/ViewModeMigrationGate").then(m => ({ default: m.ViewModeMigrationGate })));
const FeedGenderFilterGate = lazy(() => import("@/components/feed/FeedGenderFilterGate").then(m => ({ default: m.FeedGenderFilterGate })));

export function DashboardLayout() {
  const { giftData, isOpen, closeModal } = useGiftNotifications();
  
  const { isImpersonating, viewportMode } = useImpersonationStore();
  const { shouldShowBanner: showPaymentBanner } = usePaymentStatus();
  const isMobileDevice = useIsMobile();
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const { confirmedPayment, dismissConfirmation } = usePaymentConfirmationListener();
  const secondaryChromeReady = useDeferredMount(1200);
  const { isSectionEnabled } = useViewModePreferences();
  const showRightChat = isSectionEnabled("right_chat");

  // Global image error handler — prevents broken images from collapsing layout
  useGlobalImageFallback();

  // Ativa monitoramento de rotas sensíveis durante impersonificação
  useImpersonationLogger();

  // Auto-logout após 10 minutos de inatividade
  useInactivityLogout();

  // Heartbeat de presença: mantém is_online + last_seen atualizado
  usePresence();

  // Realtime global do feed: garante que novos posts (incl. canais VIP) sejam
  // propagados ao cache mesmo se o usuário não estiver na rota /feed.
  usePostsRealtime();

  // Check if mobile simulator should be active
  const shouldSimulateMobile = isImpersonating && !isMobileDevice && viewportMode === 'mobile';

  // Calculate top padding based on active banners
  const getTopPadding = () => {
    if (isImpersonating && showPaymentBanner) return 'pt-24'; // Both banners
    if (isImpersonating || showPaymentBanner) return 'pt-12'; // One banner
    return '';
  };

  // Main layout content
  const layoutContent = (
    <div className="bg-background" style={{ height: 'auto', minHeight: '100dvh', overflow: 'visible', display: 'block' }}>
      {/* Banner de Impersonificação - MODO TESTE (highest z-index) */}
      <ImpersonationBanner />
      
      {/* Banner de Pagamento Pendente (below impersonation banner) */}
      <div className={isImpersonating ? 'pt-12' : ''}>
        <PaymentOverdueBanner />
      </div>
      
      <Suspense fallback={null}>
        <AuraRoomInviteListener />
        <AuraRoomWaitlistListener />
        {giftData && (
          <GiftReceivedModal
            open={isOpen}
            onOpenChange={(open) => !open && closeModal()}
            senderName={giftData.senderName}
            senderUsername={giftData.senderUsername}
            senderAvatar={giftData.senderAvatar}
            senderId={giftData.senderId}
            amount={giftData.amount}
            message={giftData.message}
            notificationId={giftData.notificationId}
          />
        )}

        {/* AffiliateApprovedModal agora é global em <GlobalAffiliateApprovedListener /> (App.tsx) */}

        {confirmedPayment && (
          <PaymentConfirmationModal
            payment={confirmedPayment}
            onDismiss={dismissConfirmation}
          />
        )}
      </Suspense>

      {/* Navbar: handles both Desktop nav AND Mobile header (with search) */}
      <Navbar />
      {/* Desktop spacer only — Navbar already adds mobile spacer */}
      <div className="hidden md:block h-16" />

      {/* Banner de Conta Congelada */}
      <FreezeModeBanner />

      {/* Banner de Promoções Ativas */}
      <PromotionBanner onBannerClick={() => setPromoModalOpen(true)} />
      <Suspense fallback={null}>
        {promoModalOpen && <PromotionsModal open={promoModalOpen} onOpenChange={setPromoModalOpen} />}
      </Suspense>

      {/* KYC: Banner de validação de identidade (30 dias) */}
      {secondaryChromeReady && <KycBanner />}

      {/* KYC: Modal de bloqueio por prazo expirado */}
      {secondaryChromeReady && (
        <Suspense fallback={null}>
          <KycBlockedModal />
        </Suspense>
      )}
      
      {/* Mobile Activity Ticker - Real-time activity feed */}
      {secondaryChromeReady && <MobileActivityTicker className="mt-1" />}

      
      {/* Padding when banners are visible */}
      <div className={getTopPadding()}>
        <PaymentRequiredGuard>
          {/* 
            Grid strategy:
            - Mobile (default): single column, main = full width
            - lg: left sidebar (2) + main (10) = 12
            - xl: left sidebar (2) + main (7) + right sidebar (3) = 12
          */}
          <div className="flex w-full items-start">
            {/* Left Sidebar - Desktop only (fixed width to avoid empty gaps on wide screens) */}
            <div className="hidden lg:block lg:w-[260px] xl:w-[280px] 2xl:w-[300px] shrink-0">
              <LeftSidebar />
            </div>

            {/* Center Content — flex-1 so it grows when right sidebar collapses/resizes */}
            <main
              className="feed-coluna-central flex-1 min-w-0 md:border-x border-border/30"
              style={{
                height: 'auto',
                overflow: 'visible',
              }}
            >
              <Outlet />
            </main>

            {/* Right Sidebar - XL screens only; respeita Modo de Visualização (right_chat) */}
            {showRightChat && (
              <div className="hidden xl:block shrink-0">
                <Suspense fallback={null}>
                  <RealtimeInboxSidebar />
                </Suspense>
              </div>
            )}
          </div>
        </PaymentRequiredGuard>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNavbar />
      
      {/* Banner de Anúncio Mobile (apenas para usuários gratuitos) */}
      <MobileAdBanner />

      {/* Onboarding pós-login (auto-controlado, exibido a cada 30 dias) */}
      <Suspense fallback={null}>
        <OnboardingModal />
      </Suspense>

      {/* Aviso: foto/banner temporários (placeholder) */}
      <Suspense fallback={null}>
        <PlaceholderMediaGate />
      </Suspense>

      {/* Modal único de migração para Modos de Visualização (gate por rota+auth) */}
      {secondaryChromeReady && (
        <Suspense fallback={null}>
          <ViewModeMigrationGate />
        </Suspense>
      )}

      {/* Filtro Global de Gênero do Feed — abre 1x para novos e 1x para antigos no próximo login */}
      {secondaryChromeReady && (
        <Suspense fallback={null}>
          <FeedGenderFilterGate />
        </Suspense>
      )}
    </div>
  );

  // Wrap in mobile simulator if needed
  if (shouldSimulateMobile) {
    return (
      <Suspense fallback={layoutContent}>
        <MobileSimulatorContainer>
          {layoutContent}
        </MobileSimulatorContainer>
      </Suspense>
    );
  }

  return layoutContent;
}
