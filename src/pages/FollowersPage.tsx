import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useFollowers, useIsFollowing, useToggleFollow } from "@/hooks/useFollows";
import { Skeleton } from "@/components/ui/skeleton";

function FollowerRow({ follower }: { follower: { id: string; name: string; username: string | null; avatar_url: string | null; is_verified: boolean; plan_type: string } }) {
  const { data: isFollowing } = useIsFollowing(follower.id);
  const toggleFollow = useToggleFollow();

  const handleFollow = () => {
    toggleFollow.mutate({ targetProfileId: follower.id, isFollowing: !!isFollowing });
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/30 hover:bg-card transition-all">
      <Link to={`/creator/${follower.id}`} className="shrink-0">
        <Avatar className="h-12 w-12">
          <AvatarImage src={follower.avatar_url || undefined} alt={follower.name} />
          <AvatarFallback className="bg-primary/10 text-primary">{(follower.name || '?')[0]}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <Link to={`/creator/${follower.id}`}>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground hover:text-primary transition-colors truncate">
              @{follower.username || 'usuario'}
            </p>
            {follower.is_verified && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 text-[10px] shrink-0">
                ✓
              </Badge>
            )}
          </div>
        </Link>
      </div>


      <Button
        variant={isFollowing ? "secondary" : "default"}
        size="sm"
        onClick={handleFollow}
        disabled={toggleFollow.isPending}
        className={cn(
          "shrink-0 min-w-[110px] min-h-[44px]",
          isFollowing
            ? "bg-muted text-muted-foreground"
            : "bg-primary hover:bg-primary/90"
        )}
      >
        {toggleFollow.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isFollowing ? (
          <>
            <Check className="h-4 w-4 mr-1" />
            Seguindo
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4 mr-1" />
            Seguir
          </>
        )}
      </Button>
    </div>
  );
}

export default function FollowersPage() {
  const { profile } = useProfile();
  const { data: followers, isLoading } = useFollowers(profile?.id);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Seguidores</h1>
            <p className="text-muted-foreground">
              {isLoading ? '...' : `${followers?.length || 0} pessoas te seguem`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/30">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          ))
        ) : !followers || followers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum seguidor</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Compartilhe seu perfil para ganhar seus primeiros seguidores.
            </p>
          </div>
        ) : (
          followers.map((follower) => (
            <FollowerRow key={follower.id} follower={follower} />
          ))
        )}
      </div>
    </div>
  );
}
