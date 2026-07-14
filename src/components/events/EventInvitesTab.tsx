import { useReceivedInvites, useRespondToInvite } from "@/hooks/useEventInvites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Calendar, 
  MapPin, 
  Clock, 
  User, 
  Check, 
  X, 
  Crown,
  Loader2,
  Mail
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function EventInvitesTab() {
  const { data: invites, isLoading } = useReceivedInvites();
  const respondToInvite = useRespondToInvite();

  const pendingInvites = invites?.filter((i) => i.status === "pending") || [];
  const respondedInvites = invites?.filter((i) => i.status !== "pending") || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invites || invites.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <Mail className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Nenhum convite</h3>
        <p className="text-muted-foreground">
          Você ainda não recebeu convites VIP para eventos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
            Convites Pendentes ({pendingInvites.length})
          </h3>
          {pendingInvites.map((invite) => (
            <Card key={invite.id} className="overflow-hidden border-[hsl(45,93%,47%)]/30">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {/* Event Image */}
                  {invite.event?.image_url && (
                    <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                      <img loading="lazy" decoding="async"
                        src={invite.event.image_url}
                        alt={invite.event.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Event Title */}
                    <h4 className="font-semibold text-foreground truncate">
                      {invite.event?.title}
                    </h4>

                    {/* Event Details */}
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {invite.event?.event_date && formatDate(invite.event.event_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {invite.event?.event_time}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {invite.event?.location}
                      </span>
                    </div>

                    {/* Sender */}
                    <div className="flex items-center gap-2 mt-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={invite.sender?.avatar_url || ""} />
                        <AvatarFallback>
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        Convite de @{invite.sender?.username || "usuário"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>

                    {/* Message */}
                    {invite.message && (
                      <p className="text-sm text-muted-foreground mt-2 italic">
                        "{invite.message}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    className="flex-1 gap-2 bg-gradient-to-r from-primary to-secondary"
                    onClick={() =>
                      respondToInvite.mutate({ inviteId: invite.id, status: "accepted" })
                    }
                    disabled={respondToInvite.isPending}
                  >
                    <Check className="h-4 w-4" />
                    Aceitar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() =>
                      respondToInvite.mutate({ inviteId: invite.id, status: "declined" })
                    }
                    disabled={respondToInvite.isPending}
                  >
                    <X className="h-4 w-4" />
                    Recusar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Responded Invites */}
      {respondedInvites.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-muted-foreground">
            Histórico ({respondedInvites.length})
          </h3>
          {respondedInvites.map((invite) => (
            <Card key={invite.id} className="overflow-hidden opacity-70">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {invite.event?.image_url && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                      <img loading="lazy" decoding="async"
                        src={invite.event.image_url}
                        alt={invite.event.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">
                      {invite.event?.title}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      De @{invite.sender?.username}
                    </span>
                  </div>
                  <Badge
                    variant={invite.status === "accepted" ? "default" : "secondary"}
                    className={cn(
                      invite.status === "accepted" && "bg-green-500/20 text-green-500"
                    )}
                  >
                    {invite.status === "accepted" ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Aceito
                      </>
                    ) : (
                      <>
                        <X className="h-3 w-3 mr-1" />
                        Recusado
                      </>
                    )}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
