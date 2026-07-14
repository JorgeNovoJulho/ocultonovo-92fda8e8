import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radar, Eye, Lock, Shield, Zap, Heart, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useSpyModeStore } from "@/store/useSpyModeStore";
import { useMemo } from "react";

interface HeroContent {
  badge?: string;
  badge_text?: string;
  title_line1?: string;
  title_line2?: string;
  title_line3?: string;
  subtitle?: string;
  subtitle_highlight1?: string;
  subtitle_highlight2?: string;
  subtitle_extra?: string;
  primary_cta_text?: string;
  cta_primary?: string;
  cta_primary_link?: string;
  secondary_cta_text?: string;
  cta_secondary?: string;
  cta_secondary_link?: string;
  trust_online?: string;
  trust_anonymous?: string;
  trust_verified?: string;
  trust_age?: string;
}

interface HeroSectionProps {
  content: HeroContent;
}

// Generate floating particles
const FloatingParticles = () => {
  const particles = useMemo(() => 
    [...Array(25)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${i * 0.2}s`,
      duration: `${4 + Math.random() * 6}s`,
      size: Math.random() > 0.5 ? 'w-1 h-1' : 'w-1.5 h-1.5',
      opacity: Math.random() > 0.5 ? 'opacity-20' : 'opacity-30',
    })), []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute ${p.size} bg-primary rounded-full animate-float ${p.opacity}`}
          style={{
            left: p.left,
            top: p.top,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
};

export function HeroSection({ content }: HeroSectionProps) {
  const navigate = useNavigate();
  const { enableSpyMode } = useSpyModeStore();

  const handleSpyMode = () => {
    enableSpyMode();
    navigate(content.cta_secondary_link || "/spy");
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20 pb-16 sm:pt-24 sm:pb-20 lg:pt-32 lg:pb-24">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-primary/10" />
        
        {/* Main gradient orbs */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] bg-primary/15 rounded-full blur-[120px]" />
        <div 
          className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-secondary/20 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div 
          className="absolute bottom-1/3 left-1/6 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[80px] animate-pulse"
          style={{ animationDelay: '2s' }}
        />
        
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
        
        {/* Bottom line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      </div>

      {/* Floating Particles */}
      <FloatingParticles />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div className="text-center max-w-4xl mx-auto space-y-8 sm:space-y-10">
          {/* Launch Badge */}
          <div className="flex justify-center animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <Badge 
              variant="outline" 
              className="border-primary/50 text-primary bg-primary/10 px-5 py-2.5 text-sm font-medium backdrop-blur-sm hover:bg-primary/20 transition-colors cursor-default shadow-[0_0_20px_rgba(255,0,127,0.15)]"
            >
              <Heart className="h-4 w-4 mr-2 fill-primary animate-pulse" />
              {content.badge || content.badge_text || "🚀 Lançamento 2026 • Plataforma +18"}
            </Badge>
          </div>

          {/* Main Title */}
          <h1 
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.9] space-y-2 sm:space-y-4 animate-fade-in"
            style={{ animationDelay: '0.2s' }}
          >
            {/* OCULTO. with glow */}
            <span className="text-foreground block drop-shadow-[0_0_30px_rgba(255,255,255,0.15)] glow-text-intense">
              {content.title_line1 || "OCULTO."}
            </span>
            
            {/* "Onde o desejo" in vibrant pink */}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-pink-400 to-secondary block text-4xl sm:text-5xl md:text-6xl lg:text-7xl animate-gradient-shift bg-[length:200%_200%]">
              {content.title_line2 || "Onde o desejo"}
            </span>
            
            {/* "encontra a conexão." in muted */}
            <span className="text-muted-foreground/80 block text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
              {content.title_line3 || "encontra a conexão."}
            </span>
          </h1>

          {/* Subtitle */}
          <div 
            className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-in"
            style={{ animationDelay: '0.3s' }}
          >
            <p>
              {content.subtitle || "A primeira plataforma que une"}{" "}
              <span className="text-primary font-semibold underline decoration-primary/50 underline-offset-4 decoration-2">
                {content.subtitle_highlight1 || "conteúdo exclusivo"}
              </span>
              {" "}e{" "}
              <span className="text-secondary font-semibold underline decoration-secondary/50 underline-offset-4 decoration-2">
                {content.subtitle_highlight2 || "encontros reais"}
              </span>.
            </p>
            <p className="text-base sm:text-lg mt-3 text-muted-foreground/70">
              {content.subtitle_extra || "Para criadores, casais e admiradores."}
            </p>
          </div>

          {/* CTA Buttons */}
          <div 
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 animate-fade-in"
            style={{ animationDelay: '0.4s' }}
          >
            <Link to={content.cta_primary_link || "/signup"} className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto relative overflow-hidden bg-gradient-to-r from-primary via-pink-500 to-secondary hover:opacity-90 text-primary-foreground font-bold px-10 py-7 text-lg rounded-2xl shadow-[0_0_30px_rgba(255,0,127,0.4)] hover:shadow-[0_0_40px_rgba(255,0,127,0.6)] transition-all duration-300 hover:scale-[1.02] group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <Radar className="mr-2 h-5 w-5" />
                {content.cta_primary || content.primary_cta_text || "Explorar o Radar"}
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              onClick={handleSpyMode}
              className="w-full sm:w-auto border-[hsl(45,93%,47%)]/50 bg-[hsl(45,93%,47%)]/10 hover:bg-[hsl(45,93%,47%)]/20 hover:border-[hsl(45,93%,47%)] text-[hsl(45,93%,47%)] px-10 py-7 text-lg rounded-2xl backdrop-blur-sm group transition-all duration-300 shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:shadow-[0_0_30px_rgba(234,179,8,0.5)]"
            >
              <Eye className="mr-2 h-5 w-5 text-[hsl(45,93%,47%)] group-hover:animate-pulse" />
              {content.cta_secondary || content.secondary_cta_text || "Espiar"}
              <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          {/* Trust Indicators */}
          <div 
            className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 pt-6 animate-fade-in"
            style={{ animationDelay: '0.5s' }}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-default group">
              <div className="relative">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <div className="absolute inset-0 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping opacity-50" />
              </div>
              <span className="group-hover:text-emerald-400 transition-colors">
                {content.trust_online || "2.4k online agora"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-default group">
              <Lock className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              <span>{content.trust_anonymous || "100% Anônimo"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-default group">
              <Shield className="h-4 w-4 group-hover:text-primary transition-colors" />
              <span>{content.trust_verified || content.trust_age || "+18 Verificado"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce hidden sm:block">
        <div className="w-7 h-11 border-2 border-primary/30 rounded-full flex justify-center pt-2 hover:border-primary/50 transition-colors cursor-pointer shadow-[0_0_15px_rgba(255,0,127,0.2)]">
          <div className="w-1.5 h-2.5 bg-primary/60 rounded-full animate-pulse" />
        </div>
      </div>
    </section>
  );
}
