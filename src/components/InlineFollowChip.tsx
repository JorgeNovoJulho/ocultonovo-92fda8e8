import { memo } from "react";
import { UserPlus, Check, Loader2 } from "lucide-react";
import { useIsFollowing, useToggleFollow } from "@/hooks/useFollows";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";

interface Props {
  targetProfileId: string | undefined;
  isOwner?: boolean;
}

export const InlineFollowChip = memo(function InlineFollowChip({ targetProfileId, isOwner }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: isFollowing } = useIsFollowing(targetProfileId);
  const toggleFollow = useToggleFollow();

  // Hide if not logged in, no target, owner of the post, or self (profile id match)
  const isSelf = !!profile?.id && !!targetProfileId && profile.id === targetProfileId;
  if (!user || !targetProfileId || isOwner || isSelf) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (toggleFollow.isPending) return;
    toggleFollow.mutate({ targetProfileId, isFollowing: !!isFollowing });
  };

  if (isFollowing) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30"
        title="Você segue este perfil"
      >
        <Check className="h-3 w-3" />
        Seguindo
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={toggleFollow.isPending}
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
        "bg-gradient-to-r from-primary to-secondary text-primary-foreground",
        "hover:opacity-90 transition-opacity shadow-sm",
        "disabled:opacity-60"
      )}
    >
      {toggleFollow.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <UserPlus className="h-3 w-3" />
      )}
      Seguir
    </button>
  );
});
