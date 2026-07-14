// Componente de anúncio para rodapé mobile (dismissible)
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveAds, useTrackAdInteraction } from '@/hooks/useAdCampaigns';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';

interface MobileAdBannerProps {
  className?: string;
}

export function MobileAdBanner({ className }: MobileAdBannerProps) {
  const { profile } = useProfile();
  const { data: ads, isLoading } = useActiveAds('banner');
  const trackInteraction = useTrackAdInteraction();
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  // Verificar se já foi dispensado nesta sessão
  useEffect(() => {
    const wasDismissed = sessionStorage.getItem('mobile_ad_dismissed');
    if (wasDismissed) {
      setSessionDismissed(true);
    }
  }, []);

  // Somente exibir para usuários gratuitos
  const isFreePlan = profile?.plan_type === 'free';

  // Rotacionar anúncios
  useEffect(() => {
    if (!ads || ads.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentAdIndex((prev) => (prev + 1) % ads.length);
    }, 15000);

    return () => clearInterval(interval);
  }, [ads]);

  // Rastrear impressão
  useEffect(() => {
    if (!ads || ads.length === 0 || !isFreePlan || dismissed || sessionDismissed) return;
    
    const currentAd = ads[currentAdIndex];
    if (currentAd) {
      trackInteraction.mutate({ adId: currentAd.id, type: 'impression' });
    }
  }, [currentAdIndex, ads, isFreePlan, dismissed, sessionDismissed]);

  // Não exibir se usuário premium/VIP, carregando, sem anúncios ou dispensado
  if (!isFreePlan || isLoading || !ads || ads.length === 0 || dismissed || sessionDismissed) {
    return null;
  }

  const currentAd = ads[currentAdIndex];

  const handleClick = () => {
    trackInteraction.mutate({ adId: currentAd.id, type: 'click' });
    if (currentAd.target_url) {
      window.open(currentAd.target_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('mobile_ad_dismissed', 'true');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          'fixed bottom-16 inset-x-0 z-40 md:hidden px-2 pb-2',
          className
        )}
      >
        <div className="relative bg-card/95 backdrop-blur border border-border/50 rounded-lg shadow-lg overflow-hidden">
          {/* Botão de fechar */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 z-10 h-6 w-6 bg-background/80 hover:bg-background"
            onClick={handleDismiss}
           aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>

          {/* Label de publicidade */}
          <div className="absolute top-1 left-2 z-10">
            <span className="text-[9px] font-medium text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
              Anúncio
            </span>
          </div>

          {/* Conteúdo do anúncio */}
          <div
            className="flex items-center gap-3 p-3 pt-6 cursor-pointer"
            onClick={handleClick}
          >
            {/* Imagem */}
            <img loading="lazy" decoding="async"
              src={currentAd.image_url}
              alt={currentAd.title}
              className="w-14 h-14 object-cover rounded-lg shrink-0"
            />

            {/* Texto */}
            <div className="flex-1 min-w-0">
              <h5 className="font-medium text-sm text-foreground truncate">
                {currentAd.title}
              </h5>
              {currentAd.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {currentAd.description}
                </p>
              )}
            </div>

            {/* CTA */}
            <Button size="sm" variant="default" className="shrink-0 gap-1">
              {currentAd.cta_text}
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
