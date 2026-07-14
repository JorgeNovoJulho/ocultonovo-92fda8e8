import { Ghost, Gift, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BannerContent {
  emoji?: string;
  title?: string;
  description?: string;
  price?: string;
  period?: string;
  coupon_code?: string;
  discount?: string;
  bg_gradient?: string;
}

interface BannerSectionProps {
  content: BannerContent;
  sectionKey: string;
}

export function BannerSection({ content, sectionKey }: BannerSectionProps) {
  const isGhostBanner = sectionKey === 'ghost_banner';
  const isCouponBanner = sectionKey === 'coupon_banner';

  return (
    <section className="py-8 sm:py-12 relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6">
        <div 
          className={cn(
            "relative p-6 sm:p-8 lg:p-10 rounded-2xl border overflow-hidden",
            isGhostBanner && "border-[#FF007F]/30 bg-gradient-to-r from-[#FF007F]/10 via-purple-500/5 to-transparent",
            isCouponBanner && "border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent"
          )}
        >
          {/* Background Glow */}
          <div className={cn(
            "absolute -inset-10 blur-3xl opacity-30",
            isGhostBanner && "bg-[#FF007F]",
            isCouponBanner && "bg-emerald-500"
          )} />
          
          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            {/* Icon */}
            <div className={cn(
              "w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center flex-shrink-0",
              isGhostBanner && "bg-[#FF007F]/20",
              isCouponBanner && "bg-emerald-500/20"
            )}>
              {isGhostBanner && <Ghost className="h-7 w-7 sm:h-8 sm:w-8 text-[#FF007F]" />}
              {isCouponBanner && <Gift className="h-7 w-7 sm:h-8 sm:w-8 text-emerald-500" />}
            </div>
            
            {/* Content */}
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold mb-1 sm:mb-2">
                {content.emoji} {content.title}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground">
                {content.description}
              </p>
            </div>
            
            {/* Price/Coupon */}
            <div className="text-center sm:text-right flex-shrink-0">
              {isGhostBanner && (
                <div>
                  <span className={cn(
                    "text-xl sm:text-2xl lg:text-3xl font-black",
                    isGhostBanner && "text-[#FF007F]"
                  )}>
                    {content.price}
                  </span>
                  <span className="text-xs sm:text-sm text-muted-foreground block">
                    {content.period}
                  </span>
                </div>
              )}
              
              {isCouponBanner && content.coupon_code && (
                <div className="flex flex-col items-center sm:items-end gap-2">
                  <div className="flex items-center gap-2 bg-background/50 border border-emerald-500/30 rounded-lg px-3 py-2">
                    <Ticket className="h-4 w-4 text-emerald-500" />
                    <code className="text-sm sm:text-base font-mono font-bold text-emerald-500">
                      {content.coupon_code}
                    </code>
                  </div>
                  {content.discount && (
                    <span className="text-xs sm:text-sm font-bold text-emerald-500">
                      {content.discount}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
