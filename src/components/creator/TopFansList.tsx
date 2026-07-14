import { memo, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import { Heart, Trophy, Medal, Award, Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFanRankings, type FanRanking } from "@/hooks/useFanRankings";
import { useToggleProfileLike, useIsProfileLiked } from "@/hooks/useToggleProfileLike";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

const STORAGE_URL = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/`;

function getThumbUrl(url: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${STORAGE_URL}avatars/${url}`;
}

const RankBadge = memo(({ position }: { position: number }) => {
  if (position === 1) return <Trophy className="h-5 w-5 text-[hsl(45,93%,47%)]" />;
  if (position === 2) return <Medal className="h-5 w-5 text-muted-foreground" />;
  if (position === 3) return <Award className="h-5 w-5 text-[hsl(25,80%,50%)]" />;
  return <span className="text-xs font-bold text-muted-foreground w-5 text-center">{position}º</span>;
});
RankBadge.displayName = "RankBadge";

const LikeButton = memo(({ targetId }: { targetId: string }) => {
  const { data: isLiked } = useIsProfileLiked(targetId);
  const { mutate: toggle, isPending } = useToggleProfileLike();
  const queryClient = useQueryClient();
  const { profile } = useProfile();

  const handleClick = useCallback(() => {
    if (isPending || !profile?.id) return;

    // Optimistic update
    queryClient.setQueryData(
      ['profile-liked', profile.id, targetId],
      (old: boolean | undefined) => !old
    );

    toggle(targetId);
  }, [isPending, profile?.id, targetId, toggle, queryClient]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={handleClick}
      disabled={isPending}
     aria-label="Curtir">
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          isLiked ? "fill-[hsl(0,84%,60%)] text-[hsl(0,84%,60%)]" : "text-muted-foreground"
        )}
      />
    </Button>
  );
});
LikeButton.displayName = "LikeButton";

const FanRow = memo(({ fan }: { fan: FanRanking }) => {
  const isTop3 = fan.rank_position <= 3;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 border-b border-border/30",
      isTop3 && "bg-primary/5"
    )}>
      <RankBadge position={fan.rank_position} />

      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage
          src={getThumbUrl(fan.fan_avatar)}
          alt={fan.fan_username || "usuario"}
          loading="lazy"
        />
        <AvatarFallback className="text-xs bg-muted text-muted-foreground">
          {(fan.fan_username || "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          @{fan.fan_username || `fa_${fan.fan_id.slice(0, 6)}`}
        </p>
      </div>

      <span className={cn(
        "text-xs font-bold tabular-nums shrink-0",
        isTop3 ? "text-primary" : "text-muted-foreground"
      )}>
        {fan.total_points.toLocaleString("pt-BR")} pts
      </span>

      <LikeButton targetId={fan.fan_id} />
    </div>
  );
});
FanRow.displayName = "FanRow";

function FanListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="p-3 rounded-full bg-primary/10 mb-4">
        <Users className="h-8 w-8 text-primary" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        Ainda não há interações
      </p>
      <p className="text-xs text-muted-foreground max-w-[220px]">
        Compartilhe seu perfil para subir no ranking! 🚀
      </p>
    </div>
  );
}

interface TopFansListProps {
  creatorId: string | undefined;
}

export default memo(function TopFansList({ creatorId }: TopFansListProps) {
  const { data: fans = [], isLoading } = useFanRankings(creatorId);

  if (isLoading) return <FanListSkeleton />;
  if (!fans.length) return <EmptyState />;

  return (
    <Virtuoso
      data={fans}
      useWindowScroll
      overscan={100}
      itemContent={(_, fan) => <FanRow fan={fan} />}
      style={{ minHeight: 200 }}
    />
  );
});
