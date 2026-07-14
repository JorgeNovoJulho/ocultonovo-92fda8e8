import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Users, Loader2, UserCheck } from "lucide-react";
import { useIsFollowing, useToggleFollow, useFollowingIds } from "@/hooks/useFollows";
import { useI18n } from "@/lib/i18n";

interface Props {
  targetProfileId: string | undefined;
}

export const FollowButtonInline = memo(function FollowButtonInline({ targetProfileId }: Props) {
  const { t } = useI18n();
  const { data: isFollowingRemote, isLoading } = useIsFollowing(targetProfileId);
  // Fast-path: aproveita a lista global de seguidos (já em cache + realtime)
  // para refletir imediatamente "Seguindo" enquanto o useIsFollowing carrega.
  const { data: followingIds = [] } = useFollowingIds();
  const fastIsFollowing = useMemo(
    () => (!!targetProfileId && followingIds.includes(targetProfileId)),
    [followingIds, targetProfileId],
  );
  const isFollowing = isFollowingRemote ?? fastIsFollowing;
  const toggleFollow = useToggleFollow();

  if (!targetProfileId) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFollow.mutate({ targetProfileId, isFollowing: !!isFollowing });
  };

  const pending = toggleFollow.isPending;

  return (
    <Button
      variant="outline"
      className={isFollowing
        ? "border-primary text-primary hover:bg-primary/10 font-semibold px-8"
        : "border-secondary text-secondary hover:bg-secondary/10 font-semibold px-8"
      }
      onClick={handleClick}
      disabled={pending || isLoading}
      aria-pressed={!!isFollowing}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : isFollowing ? (
        <UserCheck className="h-4 w-4 mr-2" />
      ) : (
        <Users className="h-4 w-4 mr-2" />
      )}
      {isFollowing ? t("action.following") : t("action.follow")}
    </Button>
  );
});
