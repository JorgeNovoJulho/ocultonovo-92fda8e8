import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { 
  useEvents, 
  useMyRsvps, 
  useRsvpEvent, 
  useCancelRsvp 
} from "@/hooks/useEvents";
import { usePendingInvitesCount } from "@/hooks/useEventInvites";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  PartyPopper, 
  Calendar, 
  MapPin, 
  Clock, 
  Users, 
  Check, 
  Heart,
  Ticket,
  Plus,
  Crown,
  Loader2,
  Mail,
  Send,
  MessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CreateEventModal } from "@/components/events/CreateEventModal";
import { SendInvitesModal } from "@/components/events/SendInvitesModal";
import { EventInvitesTab } from "@/components/events/EventInvitesTab";
import { EventChatModal } from "@/components/events/EventChatModal";

export default function EventsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [activeTab, setActiveTab] = useState("events");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inviteModal, setInviteModal] = useState<{ open: boolean; eventId: string; eventTitle: string }>({
    open: false,
    eventId: "",
    eventTitle: "",
  });
  const [chatModal, setChatModal] = useState<{ open: boolean; eventId: string; eventTitle: string; eventDate: string; isOwner: boolean }>({
    open: false,
    eventId: "",
    eventTitle: "",
    eventDate: "",
    isOwner: false,
  });

  const { data: dbEvents, isLoading: loadingEvents } = useEvents();
  const { data: myRsvps = [], isLoading: loadingRsvps } = useMyRsvps();
  const { data: pendingInvitesCount = 0 } = usePendingInvitesCount();
  const rsvpEvent = useRsvpEvent();
  const cancelRsvp = useCancelRsvp();

  const isVip = profile?.plan_type === "vip";

  // Use only database events
  const allEvents = (dbEvents || []).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description || "",
    date: e.event_date,
    time: e.event_time,
    location: e.location,
    image: e.image_url || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800",
    attendees: e.rsvp_count || 0,
    maxAttendees: e.max_attendees || undefined,
    price: e.price || undefined,
    tags: e.tags || [],
    isFromDb: true,
    isOwner: e.creator_id === profile?.id,
  }));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const handleRsvp = (eventId: string, isInterested: boolean) => {
    if (!user) return;
    
    if (isInterested) {
      cancelRsvp.mutate(eventId);
    } else {
      rsvpEvent.mutate(eventId);
    }
  };

  const isLoading = loadingEvents || loadingRsvps;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <PartyPopper className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Eventos & Festas</h1>
              <p className="text-muted-foreground">
                Encontros exclusivos da comunidade
              </p>
            </div>
          </div>

          {/* Create Button - Only for VIP */}
          {isVip ? (
            <Button
              onClick={() => setShowCreateModal(true)}
              className="gap-2 bg-gradient-to-r from-primary to-secondary"
            >
              <Plus className="h-4 w-4" />
              Criar Evento
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
              <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
              <span>Somente VIP cria eventos</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="events" className="gap-2">
            <PartyPopper className="h-4 w-4" />
            Eventos
          </TabsTrigger>
          <TabsTrigger value="invites" className="gap-2 relative">
            <Mail className="h-4 w-4" />
            Convites VIP
            {pendingInvitesCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)]">
                {pendingInvitesCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Events Tab */}
        <TabsContent value="events">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {allEvents.length > 0 ? (
                allEvents.map((event) => {
                  const isInterested = myRsvps.includes(event.id);
                  const spotsLeft = event.maxAttendees 
                    ? event.maxAttendees - event.attendees 
                    : null;

                  return (
                    <div
                      key={event.id}
                      className="rounded-xl overflow-hidden bg-card/50 border border-border/30 hover:border-primary/30 transition-all"
                    >
                      {/* Event Banner */}
                      <div className="relative h-48 md:h-56">
                        <img loading="lazy" decoding="async"
                          src={event.image}
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
                        
                        {/* Tags */}
                        <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
                          {event.tags.map((tag) => (
                            <Badge
                              key={tag}
                              className="bg-background/80 backdrop-blur-sm text-foreground"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        {/* Price */}
                        {event.price && (
                          <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-bold text-sm">
                            {event.price}
                          </div>
                        )}

                        {/* Title Overlay */}
                        <div className="absolute bottom-4 left-4 right-4">
                          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-1">
                            {event.title}
                          </h2>
                          <p className="text-sm text-foreground/80 line-clamp-2">
                            {event.description}
                          </p>
                        </div>
                      </div>

                      {/* Event Details */}
                      <div className="p-4">
                        <div className="flex flex-wrap gap-4 mb-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span>{formatDate(event.date)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-primary" />
                            <span>{event.time}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <span>{event.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <span>{event.attendees} confirmados</span>
                            {spotsLeft && spotsLeft < 20 && (
                              <Badge variant="destructive" className="text-[10px]">
                                {spotsLeft} vagas
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleRsvp(event.id, isInterested)}
                            disabled={rsvpEvent.isPending || cancelRsvp.isPending}
                            className={cn(
                              "flex-1",
                              isInterested
                                ? "bg-muted text-foreground hover:bg-destructive hover:text-destructive-foreground"
                                : "bg-primary hover:bg-primary/90"
                            )}
                          >
                            {isInterested ? (
                              <>
                                <Check className="h-4 w-4 mr-2" />
                                Tenho Interesse
                              </>
                            ) : (
                              <>
                                <Ticket className="h-4 w-4 mr-2" />
                                Tenho Interesse
                              </>
                            )}
                          </Button>

                          {/* Invite Button - Only for event owner */}
                          {event.isOwner && event.isFromDb && (
                            <Button
                              variant="outline"
                              className="gap-2 border-[hsl(45,93%,47%)] text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10"
                              onClick={() => setInviteModal({
                                open: true,
                                eventId: event.id,
                                eventTitle: event.title,
                              })}
                            >
                              <Send className="h-4 w-4" />
                              Convidar
                            </Button>
                          )}

                          {/* Chat Button - For participants or owner */}
                          {(event.isOwner || isInterested) && event.isFromDb && (
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() => setChatModal({
                                open: true,
                                eventId: event.id,
                                eventTitle: event.title,
                                eventDate: event.date,
                                isOwner: event.isOwner,
                              })}
                            >
                              <MessageCircle className="h-4 w-4" />
                              Chat
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <PartyPopper className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Nenhum evento encontrado
                  </h3>
                  <p className="text-muted-foreground max-w-sm">
                    Não há eventos disponíveis no momento.
                  </p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Invites Tab */}
        <TabsContent value="invites">
          <EventInvitesTab />
        </TabsContent>
      </Tabs>

      {/* Create Event Modal */}
      <CreateEventModal 
        open={showCreateModal} 
        onOpenChange={setShowCreateModal} 
      />

      {/* Send Invites Modal */}
      <SendInvitesModal
        open={inviteModal.open}
        onOpenChange={(open) => setInviteModal((prev) => ({ ...prev, open }))}
        eventId={inviteModal.eventId}
        eventTitle={inviteModal.eventTitle}
      />

      {/* Event Chat Modal */}
      <EventChatModal
        open={chatModal.open}
        onOpenChange={(open) => setChatModal((prev) => ({ ...prev, open }))}
        eventId={chatModal.eventId}
        eventTitle={chatModal.eventTitle}
        eventDate={chatModal.eventDate}
        isOrganizer={chatModal.isOwner}
      />
    </div>
  );
}
