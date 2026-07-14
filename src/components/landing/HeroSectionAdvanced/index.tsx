import { useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Eye, MapPin } from "lucide-react";
import { useSpyModeStore } from "@/store/useSpyModeStore";
import { useHeroSettings, useCurrentHeroTexts, useTimeOfDay } from "@/hooks/useHeroSettings";
import { useDisplayCity } from "@/hooks/useGeoLocation";
import { useScrollProgress } from "@/hooks/useParallax";
import { useMouseParallax } from "@/hooks/useMouseParallax";
import { trackLandingPublicAction } from "@/hooks/useLandingPublicMetrics";

import { HeroBackground } from "./HeroBackground";
import { StarField } from "./StarField";
import { CrescentMoon } from "./CrescentMoon";
import { CitySkyline } from "./CitySkyline";
import { GlowOrbs } from "./GlowOrbs";
import { TrustIndicators } from "./TrustIndicators";
import { ScrollIndicator } from "./ScrollIndicator";
import { HighlightedParagraph } from "./HighlightedParagraph";
import { NeonBorderButton } from "./NeonBorderButton";

interface HeroSectionAdvancedProps {
  timeOverride?: 'day' | 'night' | null;
  cityOverride?: string | null;
}

export function HeroSectionAdvanced({ timeOverride, cityOverride }: HeroSectionAdvancedProps) {
  const navigate = useNavigate();
  const { enableSpyMode } = useSpyModeStore();
  const heroRef = useRef<HTMLElement>(null);
  const scrollProgress = useScrollProgress();
  
  const { data: settings, isLoading } = useHeroSettings();
  const timeOfDay = useTimeOfDay(settings, timeOverride);
  const texts = useCurrentHeroTexts(settings, timeOverride);
  const displayCity = useDisplayCity(
    settings?.enable_geo_replacement ?? true,
    settings?.geo_fallback_city ?? "sua cidade",
    cityOverride
  );

  const isMobile = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 768, []);

  // Mouse parallax — disabled on mobile
  const mouseOffset = useMouseParallax({
    intensity: 1,
    smoothing: 0.08,
    enabled: !isMobile
  });
  const isPulsing = false;

  // Parallax offsets — reduced on mobile
  const parallaxMultiplier = isMobile ? 0 : 400;
  const moonOffset = scrollProgress * (settings?.parallax_moon_speed ?? 0.15) * parallaxMultiplier;
  const starsOffset = scrollProgress * (settings?.parallax_stars_speed ?? 0.08) * parallaxMultiplier;
  const cityOffset = scrollProgress * (settings?.parallax_city_speed ?? 0.05) * parallaxMultiplier;
  const glowOffset = scrollProgress * 0.1 * parallaxMultiplier;

  // Replace {cidade} placeholder in geo_line
  const geoLine = (texts.geo_line || "Encontros reais em: {cidade}").replace(/{cidade}/g, displayCity);

  // Prefetch spy feed on hover
  const handleSpyHover = useCallback(() => {
    import("@/pages/SpyFeedPage");
  }, []);

  const handleSpyClick = () => {
    enableSpyMode();
    navigate("/spy");
  };

  const handleExploreClick = () => {
    trackLandingPublicAction("signup_click", "/");
    navigate("/signup");
  };

  if (isLoading) {
    return (
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background to-primary/5" />
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </section>
    );
  }

  return (
    <section 
      ref={heroRef}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20"
    >

      {/* Layer 0: Background gradient */}
      <div className="absolute inset-0 z-0">
        <HeroBackground 
          type={settings?.background_type}
          imageUrl={settings?.background_image_url}
          videoUrl={settings?.background_video_url}
        />
      </div>

      {/* Layer 4: Stars with mouse parallax */}
      <div className="absolute inset-0 z-[4]">
        <StarField 
          count={settings?.stars_count ?? 120}
          scrollOffset={starsOffset}
          mouseOffset={mouseOffset}
        />
      </div>

      {/* Layer 5: Crescent Moon - LARGE AND CENTERED with mouse parallax */}
      <div className="absolute inset-0 z-[5]">
        <CrescentMoon 
          scrollOffset={moonOffset}
          mouseOffset={mouseOffset}
          glowIntensity={0.6}
          size={260}
          positionX={88}
          positionY={6}
        />
      </div>

      {/* Layer 15: Glow Orbs - atmosphere */}
      <div className="absolute inset-0 z-[15]">
        <GlowOrbs parallaxOffset={glowOffset} />
      </div>

      {/* Layer 20: City Skyline */}
      <div className="absolute inset-0 z-[20]">
        <CitySkyline parallaxOffset={cityOffset} />
      </div>

      {/* Layer 30: Main content — Midnight Premium */}
      <div className="relative z-[30] flex flex-col items-center justify-center px-4 sm:px-6 text-center max-w-4xl mx-auto">
        {/* Premium Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff0080] animate-pulse" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-white/80 uppercase">
            {texts.badge}
          </span>
        </motion.div>

        {/* Hero Title — OCULTO */}
        <motion.h1
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-6xl sm:text-7xl md:text-8xl lg:text-[110px] font-black tracking-[-0.04em] leading-[0.9] text-white mb-8 drop-shadow-[0_0_40px_rgba(255,255,255,0.18)]"
        >
          {texts.main_title || "OCULTO — Encontros Reais e Conteúdo Adulto"}
        </motion.h1>

        {/* Paragraph with highlighted keywords */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-6 max-w-2xl"
        >
          <div className="inline-block rounded-2xl bg-black/40 backdrop-blur-md px-5 py-3 border border-white/10">
            <HighlightedParagraph
              text={texts.paragraph || "A primeira plataforma que une **conteúdo exclusivo adulto +18** e **encontros reais**. Viva seus desejos e fantasias de forma sofisticada."}
              className="text-center mx-auto text-lg md:text-xl text-white font-light leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
            />
          </div>
        </motion.div>

        {/* Geo Line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex items-center gap-2 mb-12 text-sm font-medium text-[#ff0080]/90"
        >
          <MapPin className="w-4 h-4" />
          <span>Encontros reais em:</span>
          <span className="text-white font-semibold">{displayCity}</span>
        </motion.div>

        {/* CTAs — solid pink + ghost */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-lg"
        >
          <Button
            onClick={handleExploreClick}
            className="w-full sm:flex-1 h-14 px-8 bg-[#ff0080] hover:bg-[#ff1a8d] text-white font-bold rounded-2xl transition-all shadow-[0_0_20px_rgba(255,0,128,0.4)] hover:shadow-[0_0_30px_rgba(255,0,128,0.6)] active:scale-95 uppercase tracking-wider text-sm border-0"
          >
            {texts.cta_label || "Comece 100% Grátis"}
          </Button>
          <Button
            onClick={handleSpyClick}
            onMouseEnter={handleSpyHover}
            variant="outline"
            className="w-full sm:flex-1 h-14 px-8 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/10 backdrop-blur-md transition-all active:scale-95 uppercase tracking-wider text-sm"
          >
            <Eye className="w-4 h-4 mr-2" />
            {texts.cta_secondary || "Espiar"}
          </Button>
        </motion.div>

        {/* Trust Indicators */}
        <TrustIndicators
          config={settings?.trust_indicators}
          showSignupsToday={settings?.show_signups_today ?? false}
        />
      </div>

      {/* Scroll Indicator - z-40 */}
      <div className="z-[40]">
        <ScrollIndicator 
          show={settings?.show_scroll_indicator ?? true}
          delay={settings?.scroll_indicator_delay_ms ?? 5000}
        />
      </div>
    </section>
  );
}

export default HeroSectionAdvanced;
