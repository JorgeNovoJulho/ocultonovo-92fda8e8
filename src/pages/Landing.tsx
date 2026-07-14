import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { LegalFooter } from "@/components/LegalFooter";
import { AgeWarningBanner } from "@/components/AgeWarningBanner";
import { useVisibleSiteSections } from "@/hooks/useSiteEditor";
import { HeroSectionAdvanced } from "@/components/landing/HeroSectionAdvanced";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyMount } from "@/components/aura-match/LazyMount";
import { trackLandingPublicAction } from "@/hooks/useLandingPublicMetrics";
// BetaPublicBanner now rendered globally via App.tsx

// Below-the-fold sections — lazy to slim the eager Landing chunk
const RadarTeaser = lazy(() => import("@/components/RadarTeaser").then(m => ({ default: m.RadarTeaser })));
const StoriesCarousel = lazy(() => import("@/components/StoriesCarousel").then(m => ({ default: m.StoriesCarousel })));
const SectionRenderer = lazy(() => import("@/components/landing/SectionRenderer").then(m => ({ default: m.SectionRenderer })));
const CouplesSection = lazy(() => import("@/components/landing/CouplesSection").then(m => ({ default: m.CouplesSection })));
const FounderVagasWidget = lazy(() => import("@/components/landing/FounderVagasWidget").then(m => ({ default: m.FounderVagasWidget })));
const SafetySection = lazy(() => import("@/components/landing/SafetySection").then(m => ({ default: m.SafetySection })));
const PrivacyLGPDSection = lazy(() => import("@/components/landing/PrivacyLGPDSection").then(m => ({ default: m.PrivacyLGPDSection })));
const FAQSection = lazy(() => import("@/components/landing/FAQSection").then(m => ({ default: m.FAQSection })));
const HowItWorksSection = lazy(() => import("@/components/landing/HowItWorksSection").then(m => ({ default: m.HowItWorksSection })));
const UniverseGridSection = lazy(() => import("@/components/landing/UniverseGridSection").then(m => ({ default: m.UniverseGridSection })));
const DifferenceStatsSection = lazy(() => import("@/components/landing/DifferenceStatsSection").then(m => ({ default: m.DifferenceStatsSection })));

export default function Landing() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const hasTrackedViewRef = useRef(false);
  
  const { data: sections } = useVisibleSiteSections();

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isAuthenticated || hasTrackedViewRef.current) return;
    hasTrackedViewRef.current = true;
    trackLandingPublicAction("view", "/");
  }, [isAuthenticated]);

  const handleLoginClick = () => {
    trackLandingPublicAction("login_click", "/");
    navigate("/login");
  };

  const handleSignupClick = () => {
    trackLandingPublicAction("signup_click", "/");
    navigate("/signup");
  };

  if (isAuthenticated) {
    return <Navigate to="/feed" replace />;
  }

  const heroOpacity = Math.max(0, 1 - scrollY / 600);

  // Separate hero from other sections
  const otherSections = sections?.filter(s => s.section_type !== 'hero') || [];

  return (
    <div className="min-h-dvh bg-background overflow-x-hidden">
      {/* BetaPublicBanner rendered globally in App.tsx */}
      {/* Navigation - above hero */}
      <nav className="fixed top-8 left-0 right-0 z-50 flex items-center justify-between px-3 py-3 sm:top-9 sm:p-6 md:px-12 backdrop-blur-md bg-background/30 border-b border-border/10">
        <div className="sm:hidden">
          <Logo showText={false} />
        </div>
        <div className="hidden sm:block">
          <Logo />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-4">
          <Button variant="outline" size="sm" className="px-3 sm:px-4 border-2 border-primary/70 bg-background/40 text-foreground hover:bg-primary/10 hover:border-primary font-semibold text-xs sm:text-sm shadow-[0_0_15px_rgba(255,0,127,0.25)]" onClick={handleLoginClick}>
            Entrar
          </Button>
          <Button size="sm" className="px-3 sm:px-4 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground text-xs sm:text-sm shadow-[0_0_20px_rgba(255,0,127,0.4)]" onClick={handleSignupClick}>
            Criar Conta
          </Button>
        </div>
      </nav>

      {/* Hero Section + restante do conteúdo principal envoltos em <main> para landmark de acessibilidade/SEO. */}
      <main>
      <div 
        className="relative z-10"
        style={{ opacity: heroOpacity }}
      >
        <HeroSectionAdvanced />
      </div>

      {/* How It Works — 3 steps */}
      <LazyMount minHeight={400} rootMargin="600px 0px">
        <Suspense fallback={<div className="h-96" />}>
          <HowItWorksSection />
        </Suspense>
      </LazyMount>

      {/* Universe Grid — Funções-chave do OCULTO */}
      <LazyMount minHeight={500} rootMargin="600px 0px">
        <Suspense fallback={<div className="h-[500px]" />}>
          <UniverseGridSection />
        </Suspense>
      </LazyMount>

      {/* Couples Section - Destaque Máximo */}
      <section className="relative z-10 py-16 sm:py-20 lg:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-500/10 rounded-full blur-[150px] animate-pulse" />
        
        <LazyMount minHeight={400} rootMargin="600px 0px">
          <Suspense fallback={<div className="h-96" />}>
            <CouplesSection 
              content={{
                badge: "Para casais liberais",
                title: "Conexões reais para casais",
                subtitle: "Encontre outros casais e pessoas com os mesmos interesses. Perfis verificados, eventos exclusivos e a maior comunidade liberal do Brasil.",
                tags: ["Ménage", "Voyeur", "Soft Swing", "Full Swap", "Fetiche", "BDSM"]
              }}
            />
          </Suspense>
        </LazyMount>
      </section>

      {/* Stories Carousel Section */}
      <section className="relative z-10 py-12 sm:py-16 lg:py-20 bg-gradient-to-b from-transparent via-background/80 to-background">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <Badge className="mb-3 bg-primary/10 text-primary border-primary/30">
              ✨ Perfis em Destaque
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Quem está por aqui</h2>
            <p className="text-muted-foreground">Criadores e casais verificados na plataforma</p>
          </div>
          <LazyMount minHeight={160} rootMargin="500px 0px">
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <StoriesCarousel />
            </Suspense>
          </LazyMount>
        </div>
      </section>

      {/* Creator Founders Section */}
      <LazyMount minHeight={200} rootMargin="500px 0px">
        <Suspense fallback={null}>
          <FounderVagasWidget />
        </Suspense>
      </LazyMount>

      {/* Difference / Stats — Por que OCULTO */}
      <LazyMount minHeight={400} rootMargin="500px 0px">
        <Suspense fallback={<div className="h-96" />}>
          <DifferenceStatsSection />
        </Suspense>
      </LazyMount>

      {/* Live Radar Teaser Section */}
      <section className="relative z-10 py-12 sm:py-16 lg:py-20">
        <LazyMount minHeight={260} rootMargin="500px 0px">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <RadarTeaser />
          </Suspense>
        </LazyMount>
      </section>

      {/* Dynamic Sections from CMS */}
      <LazyMount minHeight={300} rootMargin="500px 0px">
        <Suspense fallback={null}>
          {otherSections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))}
        </Suspense>
      </LazyMount>

      {/* Safety / Encontros Seguros */}
      <LazyMount minHeight={300} rootMargin="400px 0px">
        <Suspense fallback={null}>
          <SafetySection />
        </Suspense>
      </LazyMount>

      {/* Privacy / LGPD */}
      <LazyMount minHeight={300} rootMargin="400px 0px">
        <Suspense fallback={null}>
          <PrivacyLGPDSection />
        </Suspense>
      </LazyMount>

      {/* FAQ */}
      <LazyMount minHeight={300} rootMargin="400px 0px">
        <Suspense fallback={null}>
          <FAQSection />
        </Suspense>
      </LazyMount>
      </main>


      {/* Footer with Legal */}
      <footer className="relative z-10 py-8 sm:py-12 px-4 sm:px-6 border-t border-border/30 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
            <Logo />
            <p className="text-xs sm:text-sm text-muted-foreground text-center md:text-right">
              © 2025 OCULTO. Todos os direitos reservados. +18 apenas.
            </p>
          </div>
          <LegalFooter variant="landing" />
        </div>
      </footer>

      {/* Age Warning Banner é montado globalmente em App.tsx */}

    </div>
  );
}
