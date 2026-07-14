import { forwardRef, useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolveActorAvatarUrl, type ActorProfile } from "@/hooks/useActorProfiles";
import { getActorInitial } from "@/lib/notificationActors";

interface NotificationActorAvatarProps {
  actorProfile?: ActorProfile | null;
  fallbackAvatarUrl?: string | null;
  fallbackBg: string;
  fallbackIcon: React.ReactNode;
  sizeClassName?: string;
  iconBadgeClassName?: string;
  imageClassName?: string;
}

export const NotificationActorAvatar = forwardRef<HTMLDivElement, NotificationActorAvatarProps>(function NotificationActorAvatar({
  actorProfile,
  fallbackAvatarUrl,
  fallbackBg,
  fallbackIcon,
  sizeClassName = "h-10 w-10",
  iconBadgeClassName = "-bottom-1 -right-1 w-5 h-5",
  imageClassName = "h-full w-full object-cover",
}, ref) {
  const url = actorProfile?.avatar_url || resolveActorAvatarUrl(fallbackAvatarUrl) || null;
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>(url ? 'loading' : 'idle');

  useEffect(() => {
    setStatus(url ? 'loading' : 'idle');
  }, [url]);

  if (!actorProfile && !url) {
    return (
      <div ref={ref} className={cn("rounded-full shrink-0 flex items-center justify-center", sizeClassName, fallbackBg)}>
        {fallbackIcon}
      </div>
    );
  }

  const initial = getActorInitial(actorProfile);
  const alt = actorProfile?.username ? `@${actorProfile.username}` : "avatar";

  return (
    <div ref={ref} className="relative shrink-0">
      <div className={cn("relative rounded-full overflow-hidden bg-muted ring-1 ring-border/50", sizeClassName)}>
        {status === 'loading' && (
          <Skeleton className="absolute inset-0 h-full w-full rounded-full" />
        )}

        {url && status !== 'error' && (
          <img
            src={url}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            className={cn("transition-opacity duration-200", imageClassName, status === 'loaded' ? 'opacity-100' : 'opacity-0')}
          />
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
            <ImageOff className="h-4 w-4" aria-hidden />
            <span className="sr-only">Avatar indisponível</span>
          </div>
        )}

        {!url && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-muted-foreground">
            {initial}
          </div>
        )}
      </div>

      <span className={cn("absolute rounded-full flex items-center justify-center ring-2 ring-background", iconBadgeClassName, fallbackBg)} aria-hidden>
        {fallbackIcon}
      </span>
    </div>
  );
});