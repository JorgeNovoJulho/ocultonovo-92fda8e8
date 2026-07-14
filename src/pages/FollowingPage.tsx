import { useState } from "react";
import { Link } from "react-router-dom";
import { UserCheck, MoreVertical, User, UserMinus, Ban, Calendar } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedCoupleBadge } from "@/components/VerifiedCoupleBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProfile } from "@/hooks/useProfile";
import { useFollowing, useToggleFollow } from "@/hooks/useFollows";
import { useBlockContact } from "@/hooks/useBlockedContacts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function FollowingPage() {
  const { profile } = useProfile();
  const { data: following, isLoading } = useFollowing(profile?.id);
  const toggleFollow = useToggleFollow();
  const blockContact = useBlockContact();
  
  const [confirmUnfollow, setConfirmUnfollow] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<string | null>(null);

  const handleUnfollow = async (profileId: string) => {
    try {
      await toggleFollow.mutateAsync({ targetProfileId: profileId, isFollowing: true });
      toast.success("Você deixou de seguir este perfil");
      setConfirmUnfollow(null);
    } catch (error) {
      toast.error("Erro ao deixar de seguir");
    }
  };

  const handleBlock = async (profileId: string) => {
    try {
      await blockContact.mutateAsync({ blockedUserId: profileId, blockType: 'blocked' });
      toast.success("Perfil bloqueado");
      setConfirmBlock(null);
    } catch (error) {
      toast.error("Erro ao bloquear perfil");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <UserCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Seguindo</h1>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card/50">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const followingList = following || [];

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Seguindo</h1>
        </div>
        <Badge variant="secondary" className="text-sm">
          {followingList.length} {followingList.length === 1 ? 'perfil' : 'perfis'}
        </Badge>
      </div>

      {/* Empty State */}
      {followingList.length === 0 && (
        <div className="text-center py-12">
          <UserCheck className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Você ainda não segue ninguém
          </h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Explore o feed e encontre perfis interessantes para seguir
          </p>
          <Button asChild className="mt-4">
            <Link to="/feed">Explorar</Link>
          </Button>
        </div>
      )}

      {/* Following List */}
      <div className="space-y-3">
        {followingList.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/50 hover:bg-card transition-colors"
          >
            {/* Avatar */}
            <Link to={`/creator/${user.id}`}>
              <Avatar className="h-14 w-14 ring-2 ring-primary/20 hover:ring-primary/40 transition-all">
                <AvatarImage src={user.avatar_url || undefined} alt={user.name} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Link>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link 
                  to={`/creator/${user.id}`}
                  className="font-semibold text-foreground hover:text-primary transition-colors truncate"
                >
                  @{user.username || 'usuario'}
                </Link>
                {user.is_verified_couple && <VerifiedCoupleBadge size="sm" />}
                {user.is_verified && !user.is_verified_couple && (
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    ✓
                  </Badge>
                )}
                {user.plan_type === 'vip' && (
                  <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-[10px] px-1.5">
                    VIP
                  </Badge>
                )}
              </div>

              {(user as any).followed_at && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/70">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Seguindo há {formatDistanceToNow(new Date((user as any).followed_at), { 
                      locale: ptBR, 
                      addSuffix: false 
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="hidden sm:flex"
              >
                <Link to={`/creator/${user.id}`}>
                  <User className="h-4 w-4 mr-1" />
                  Ver Perfil
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais opções">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild className="sm:hidden">
                    <Link to={`/creator/${user.id}`} className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Ver Perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="sm:hidden" />
                  <DropdownMenuItem
                    onClick={() => setConfirmUnfollow(user.id)}
                    className="text-orange-500 focus:text-orange-500"
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    Deixar de Seguir
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setConfirmBlock(user.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Bloquear Perfil
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Unfollow Dialog */}
      <AlertDialog open={!!confirmUnfollow} onOpenChange={() => setConfirmUnfollow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deixar de seguir?</AlertDialogTitle>
            <AlertDialogDescription>
              Você não verá mais as publicações deste perfil no seu feed. Você pode segui-lo novamente a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmUnfollow && handleUnfollow(confirmUnfollow)}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Deixar de Seguir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Block Dialog */}
      <AlertDialog open={!!confirmBlock} onOpenChange={() => setConfirmBlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              Este perfil não poderá mais ver seu conteúdo, enviar mensagens ou interagir com você. Você também deixará de seguir automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmBlock && handleBlock(confirmBlock)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Bloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}