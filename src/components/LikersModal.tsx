import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { usePostLikers } from "@/hooks/usePostLikes";
import { Link } from "react-router-dom";
import { BadgeCheck, Heart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LikersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  likesCount: number;
}

export function LikersModal({ open, onOpenChange, postId, likesCount }: LikersModalProps) {
  const { data: likers, isLoading } = usePostLikers(open ? postId : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary fill-primary" />
            {likesCount} {likesCount === 1 ? 'Curtida' : 'Curtidas'}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : likers && likers.length > 0 ? (
            <div className="space-y-3">
              {likers.map((liker) => (
                <Link
                  key={liker.id}
                  to={`/creator/${liker.id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  onClick={() => onOpenChange(false)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={buildSupabaseImageThumb(liker.avatar_url, { width: 96, quality: 70 }) || liker.avatar_url || ''} />
                    <AvatarFallback>{(liker.username || 'u').charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-sm truncate">
                        @{liker.username || 'usuario'}
                      </span>
                      {liker.is_verified && (
                        <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 flex-shrink-0" />
                      )}
                    </div>
                    {liker.liked_at && (
                      <p className="text-[11px] text-muted-foreground/80 truncate">
                        {formatDistanceToNow(new Date(liker.liked_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    )}
                  </div>

                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>Nenhuma curtida ainda</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
