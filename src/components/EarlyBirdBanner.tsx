import { useEarlyBirdAvailability } from '@/hooks/useEarlyBirdPromotion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, Clock, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface EarlyBirdBannerProps {
  variant?: 'compact' | 'full';
  className?: string;
  showCTA?: boolean;
  // Novos campos do CMS
  title?: string;
  emoji?: string;
  description?: string;
  ctaText?: string;
}

export function EarlyBirdBanner({ 
  variant = 'full', 
  className, 
  showCTA = false,
  title,
  emoji,
  description,
  ctaText,
}: EarlyBirdBannerProps) {
  const availability = useEarlyBirdAvailability();

  const monthlyAvailable = availability.monthly.available;
  const annualAvailable = availability.annual.available;
  const monthlyBonus = availability.monthly.bonusMonths;
  const annualBonus = availability.annual.bonusMonths;
  const monthlyActive = availability.monthly.isActive;
  const annualActive = availability.annual.isActive;

  // Se não há promoções ativas ou não há mais vagas, não mostrar
  if ((!monthlyActive && !annualActive) || (monthlyAvailable <= 0 && annualAvailable <= 0)) {
    return null;
  }

  // Determinar urgência
  const isUrgent = (monthlyActive && monthlyAvailable < 100) || (annualActive && annualAvailable < 100);
  const totalAvailable = Math.min(
    monthlyActive ? monthlyAvailable : Infinity,
    annualActive ? annualAvailable : Infinity
  );

  // Valores do CMS ou defaults
  const displayEmoji = emoji || '🚀';
  const displayTitle = title || 'Oferta de Lançamento';
  const displayDescription = description || 'Seja um dos 1000 primeiros e ganhe meses extras! Oferta exclusiva de lançamento.';
  const displayCtaText = ctaText || 'Garantir Minha Vaga';

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
          isUrgent 
            ? "bg-[#FF007F]/20 text-[#FF007F] border border-[#FF007F]/30 animate-pulse" 
            : "bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border border-[hsl(45,93%,47%)]/30",
          className
        )}
      >
        <Flame className="h-4 w-4" />
        <span className="font-medium">
          🔥 Restam {totalAvailable === Infinity ? 'vagas!' : `${totalAvailable} vagas!`}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 sm:p-6",
        "bg-gradient-to-r from-[#FF007F]/20 via-purple-500/10 to-[hsl(45,93%,47%)]/20",
        "border border-[#FF007F]/30",
        className
      )}
    >
      {/* Efeito de brilho animado */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Flame className="h-5 w-5 sm:h-6 sm:w-6 text-[#FF007F] animate-pulse" />
          <h3 className="text-lg sm:text-xl font-bold text-foreground">
            {displayEmoji} {displayTitle}
          </h3>
          {isUrgent && (
            <Badge className="bg-destructive text-destructive-foreground animate-pulse">
              ÚLTIMAS VAGAS
            </Badge>
          )}
        </div>

        {/* Contadores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {/* Mensal */}
          {availability.monthly.isActive && monthlyAvailable > 0 && (
            <div className="p-3 sm:p-4 rounded-xl bg-background/50 border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Plano Mensal</span>
                <Badge variant="outline" className="text-[#FF007F] border-[#FF007F]/50">
                  +{monthlyBonus} meses grátis
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-[#FF007F]">
                  {monthlyAvailable}
                </span>
                <span className="text-sm text-muted-foreground">vagas restantes</span>
              </div>
              {/* Barra de progresso */}
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div 
                  className="h-full bg-[#FF007F] transition-all duration-500"
                  style={{ width: `${(monthlyAvailable / availability.monthly.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Anual */}
          {availability.annual.isActive && annualAvailable > 0 && (
            <div className="p-3 sm:p-4 rounded-xl bg-background/50 border border-[hsl(45,93%,47%)]/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Plano Anual</span>
                <Badge variant="outline" className="text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/50">
                  +{annualBonus} meses grátis
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-[hsl(45,93%,47%)]">
                  {annualAvailable}
                </span>
                <span className="text-sm text-muted-foreground">vagas restantes</span>
              </div>
              {/* Barra de progresso */}
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div 
                  className="h-full bg-[hsl(45,93%,47%)] transition-all duration-500"
                  style={{ width: `${(annualAvailable / availability.annual.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Descrição */}
        <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {displayDescription}
        </p>

        {/* CTA */}
        {showCTA && (
          <div className="mt-4 flex justify-center">
            <Link to="/signup">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-[#FF007F] to-purple-600 hover:opacity-90 text-white font-bold shadow-lg shadow-[#FF007F]/25"
              >
                <Rocket className="mr-2 h-5 w-5" />
                {displayCtaText}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
