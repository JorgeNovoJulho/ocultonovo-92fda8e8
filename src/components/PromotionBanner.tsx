import { usePromotionBanners } from "@/hooks/usePromotions";
import { usePromotionTracking } from "@/hooks/usePromotionTracking";
import { Gift, X } from "lucide-react";
import { useState, memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Global promotion banner — rendered in DashboardLayout */
export const PromotionBanner = memo(function PromotionBanner({
  onBannerClick,
}: {
  onBannerClick?: () => void;
}) {
  const banners = usePromotionBanners();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { track } = usePromotionTracking();
  const trackedRef = useRef<Set<string>>(new Set());

  const visible = banners.filter((b) => !dismissed.has(b.id));

  const banner = visible[0]; // show one at a time

  // Track impression once per banner
  useEffect(() => {
    if (banner && !trackedRef.current.has(banner.id)) {
      trackedRef.current.add(banner.id);
      track(banner.id, "impression");
    }
  }, [banner?.id, track]);

  if (!visible.length) return null;
  if (!banner) return null;

  const handleClick = () => {
    track(banner.id, "click");
    onBannerClick?.();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    track(banner.id, "close");
    setDismissed((s) => new Set(s).add(banner.id));
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2 text-sm font-medium cursor-pointer",
        "bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20",
        "border-b border-primary/20 text-foreground hover:from-primary/25 hover:via-primary/15 hover:to-primary/25 transition-colors"
      )}
    >
      <Gift className="h-4 w-4 text-primary shrink-0" />
      <span className="flex-1 truncate">{banner.banner_text}</span>
      <button
        onClick={handleClose}
        className="p-1 rounded hover:bg-primary/10 transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
});
