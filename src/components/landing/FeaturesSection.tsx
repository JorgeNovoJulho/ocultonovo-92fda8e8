import { Users, DollarSign, Radar, Lock, Shield, Sparkles, LucideIcon, Heart, Eye, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

interface FeaturesContent {
  title?: string;
  subtitle?: string;
  items?: FeatureItem[];
}

interface FeaturesSectionProps {
  content: FeaturesContent;
}

const iconMap: Record<string, LucideIcon> = {
  Users,
  DollarSign,
  Radar,
  Lock,
  Shield,
  Sparkles,
  Heart,
  Eye,
  Zap,
};

export function FeaturesSection({ content }: FeaturesSectionProps) {
  const items = content.items || [];

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px] -translate-y-1/2" />
        <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[150px] -translate-y-1/2" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 px-4 py-1.5">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Recursos Exclusivos
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            {content.title || (
              <>
                Uma plataforma,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                  infinitas possibilidades
                </span>
              </>
            )}
          </h2>
          <p className="text-lg text-muted-foreground">
            {content.subtitle || 'Criamos o espaço perfeito para quem busca liberdade, privacidade e conexões autênticas.'}
          </p>
        </div>
        
        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {items.map((feature, index) => {
            const IconComponent = iconMap[feature.icon] || Sparkles;
            
            return (
              <div
                key={index}
                className="group relative p-6 sm:p-8 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/40 transition-all duration-500 hover:shadow-[0_0_40px_rgba(255,0,127,0.1)] hover:translate-y-[-4px]"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Hover glow effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Icon */}
                <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(255,0,127,0.3)] transition-all duration-300">
                  <IconComponent className="h-7 w-7 text-primary group-hover:text-white transition-colors" />
                </div>
                
                {/* Content */}
                <h3 className="relative text-xl font-bold mb-3 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                
                <p className="relative text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>

                {/* Corner accent */}
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-primary/10 to-transparent rounded-tr-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            );
          })}
        </div>

        {/* Bottom decorative element */}
        <div className="flex justify-center mt-16">
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <div className="w-12 h-px bg-gradient-to-r from-transparent to-primary/50" />
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <div className="w-12 h-px bg-gradient-to-l from-transparent to-primary/50" />
          </div>
        </div>
      </div>
    </section>
  );
}
