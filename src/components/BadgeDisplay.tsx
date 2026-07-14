import { Badge } from "@/components/ui/badge";
import { useUserBadges } from "@/hooks/useBadges";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Award, Shield, Star, Zap, Heart, MessageCircle, Crown, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BadgeDisplayProps {
  userId?: string;
  maxDisplay?: number;
  size?: "sm" | "md" | "lg";
  showTooltips?: boolean;
}

const badgeIcons: Record<string, React.ReactNode> = {
  verified: <CheckCircle className="h-full w-full" />,
  fast_responder: <Zap className="h-full w-full" />,
  trusted_member: <Shield className="h-full w-full" />,
  popular: <Star className="h-full w-full" />,
  generous: <Heart className="h-full w-full" />,
  conversationalist: <MessageCircle className="h-full w-full" />,
  premium: <Crown className="h-full w-full" />,
  default: <Award className="h-full w-full" />,
};

const sizeClasses = {
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function BadgeDisplay({ userId, maxDisplay = 5, size = "md", showTooltips = true }: BadgeDisplayProps) {
  const { data: userBadges, isLoading } = useUserBadges(userId);

  if (isLoading || !userBadges?.length) return null;

  const displayBadges = userBadges.slice(0, maxDisplay);
  const remainingCount = userBadges.length - maxDisplay;

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider>
        {displayBadges.map((userBadge) => {
          const badge = userBadge.badge;
          if (!badge) return null;

          const icon = badgeIcons[badge.code] || badgeIcons.default;

          const badgeElement = (
            <div
              key={userBadge.id}
              className={cn(
                "rounded-full flex items-center justify-center transition-transform hover:scale-110",
                sizeClasses[size]
              )}
              style={{ 
                backgroundColor: `${badge.color}20`,
                color: badge.color 
              }}
            >
              <div className={iconSizeClasses[size]}>
                {icon}
              </div>
            </div>
          );

          if (showTooltips) {
            return (
              <Tooltip key={userBadge.id}>
                <TooltipTrigger asChild>
                  {badgeElement}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <p className="font-semibold">{badge.name}</p>
                  <p className="text-xs text-muted-foreground">{badge.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return badgeElement;
        })}
        
        {remainingCount > 0 && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
            +{remainingCount}
          </Badge>
        )}
      </TooltipProvider>
    </div>
  );
}
