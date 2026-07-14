import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  MessageCircle,
  Send,
  User,
  Loader2,
  CheckCircle2,
  UserCheck,
  Users,
  Image,
  Star,
  Bell,
  BellOff,
} from "lucide-react";
import {
  useEventMessages,
  useSendEventMessage,
  useEventCheckins,
  useCheckInUser,
  useRemoveCheckin,
} from "@/hooks/useEventFeatures";
import { useEventPhotos } from "@/hooks/useEventPhotos";
import { useEventRatings, useCanRateEvent, useMyEventRating } from "@/hooks/useEventRatings";
import { useMyRsvps } from "@/hooks/useEvents";
import { useSentInvites } from "@/hooks/useEventInvites";
import { useProfile } from "@/hooks/useProfile";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { EventGalleryTab } from "./EventGalleryTab";
import { EventRatingModal } from "./EventRatingModal";
import { EventRatingSummary } from "./EventRatingSummary";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

interface EventChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  isOrganizer: boolean;
}

export function EventChatModal({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  eventDate,
  isOrganizer,
}: EventChatModalProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("chat");
  const [message, setMessage] = useState("");
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages, isLoading: loadingMessages } = useEventMessages(eventId);
  const { data: checkins } = useEventCheckins(eventId);
  const { data: invites } = useSentInvites(eventId);
  const { data: photos } = useEventPhotos(eventId);
  const { data: ratings } = useEventRatings(isOrganizer ? eventId : undefined);
  const { data: canRate } = useCanRateEvent(eventId);
  const { data: myRating } = useMyEventRating(eventId);
  
  const sendMessage = useSendEventMessage();
  const checkInUser = useCheckInUser();
  const removeCheckin = useRemoveCheckin();

  // Check if user has check-in
  const userHasCheckin = checkins?.some((c) => c.user_id === profile?.id) || false;

  // Get list of users who can be checked in (accepted invites + RSVPs)
  const acceptedInviteUsers = invites?.filter((i) => i.status === "accepted") || [];
  const checkedInUserIds = new Set(checkins?.map((c) => c.user_id) || []);

  // Event has passed
  const eventHasPassed = new Date(eventDate) < new Date();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load mute preference
  useEffect(() => {
    const loadMutePreference = async () => {
      if (!profile?.id || !eventId) return;
      
      const { data } = await supabase
        .from("event_rsvps")
        .select("mute_notifications")
        .eq("event_id", eventId)
        .eq("user_id", profile.id)
        .maybeSingle();
      
      if (data) {
        setIsMuted(data.mute_notifications || false);
      }
    };
    
    loadMutePreference();
  }, [profile?.id, eventId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    await sendMessage.mutateAsync({ eventId, content: message.trim() });
    setMessage("");
  };

  const handleCheckIn = (userId: string) => {
    checkInUser.mutate({ eventId, userId });
  };

  const handleRemoveCheckIn = (userId: string) => {
    removeCheckin.mutate({ eventId, userId });
  };

  const toggleMute = async () => {
    if (!profile?.id) return;
    
    const newMuteState = !isMuted;
    
    const { error } = await supabase
      .from("event_rsvps")
      .update({ mute_notifications: newMuteState })
      .eq("event_id", eventId)
      .eq("user_id", profile.id);
    
    if (!error) {
      setIsMuted(newMuteState);
      toast({
        title: newMuteState ? "Notificações silenciadas" : "Notificações ativadas",
        description: newMuteState 
          ? "Você não receberá notificações deste chat" 
          : "Você receberá notificações de novas mensagens",
      });
    }
  };

  // Determine number of tabs
  const tabCount = isOrganizer ? 4 : 3;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                {eventTitle}
              </DialogTitle>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={toggleMute}
                title={isMuted ? "Ativar notificações" : "Silenciar notificações"}
              >
                {isMuted ? (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
              </Button>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList 
              className={cn(
                "grid mx-4 mt-2",
                tabCount === 4 ? "grid-cols-4" : "grid-cols-3"
              )} 
              style={{ width: "calc(100% - 2rem)" }}
            >
              <TabsTrigger value="chat" className="gap-1 text-xs px-2">
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Chat</span>
              </TabsTrigger>
              <TabsTrigger value="gallery" className="gap-1 text-xs px-2">
                <Image className="h-4 w-4" />
                <span className="hidden sm:inline">Galeria</span>
                {photos && photos.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {photos.length}
                  </Badge>
                )}
              </TabsTrigger>
              {isOrganizer && (
                <TabsTrigger value="checkin" className="gap-1 text-xs px-2">
                  <UserCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Check-in</span>
                  {checkins && checkins.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {checkins.length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger value="ratings" className="gap-1 text-xs px-2">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">Avaliações</span>
              </TabsTrigger>
            </TabsList>

            {/* Chat Tab */}
            <TabsContent value="chat" className="flex-1 flex flex-col m-0 mt-2">
              <ScrollArea className="flex-1 p-4" style={{ maxHeight: "400px" }}>
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma mensagem ainda</p>
                    <p className="text-sm">Seja o primeiro a iniciar a conversa!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages?.map((msg) => {
                      const isOwn = msg.sender_id === profile?.id;

                      return (
                        <div
                          key={msg.id}
                          className={cn("flex gap-2", isOwn && "flex-row-reverse")}
                        >
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarImage src={msg.sender?.avatar_url || ""} />
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={cn(
                              "max-w-[70%] rounded-lg px-3 py-2",
                              isOwn
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            )}
                          >
                            {!isOwn && (
                              <p className="text-xs font-medium mb-1 opacity-70">
                                @{msg.sender?.username || "usuário"}
                              </p>
                            )}
                            <p className="text-sm break-words">{msg.content}</p>
                            <p
                              className={cn(
                                "text-[10px] mt-1",
                                isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                              )}
                            >
                              {formatDistanceToNow(new Date(msg.created_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!message.trim() || sendMessage.isPending}
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* Gallery Tab */}
            <TabsContent value="gallery" className="flex-1 m-0 mt-2">
              <EventGalleryTab
                eventId={eventId}
                canUpload={userHasCheckin}
                isOrganizer={isOrganizer}
                eventDate={eventDate}
              />
            </TabsContent>

            {/* Check-in Tab (Organizer Only) */}
            {isOrganizer && (
              <TabsContent value="checkin" className="flex-1 m-0 mt-2">
                <ScrollArea className="p-4" style={{ maxHeight: "450px" }}>
                  <div className="space-y-4">
                    {/* Checked In */}
                    {checkins && checkins.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2 text-green-500">
                          <CheckCircle2 className="h-4 w-4" />
                          Presentes ({checkins.length})
                        </h4>
                        {checkins.map((checkin) => (
                          <div
                            key={checkin.id}
                            className="flex items-center gap-3 p-2 rounded-lg bg-green-500/10 border border-green-500/30"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={checkin.user?.avatar_url || ""} />
                              <AvatarFallback>
                                <User className="h-5 w-5" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="font-medium text-sm">
                                @{checkin.user?.username || "usuário"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Check-in:{" "}
                                {formatDistanceToNow(new Date(checkin.checked_in_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRemoveCheckIn(checkin.user_id)}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pending Check-in */}
                    {acceptedInviteUsers.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          Aguardando Check-in
                        </h4>
                        {acceptedInviteUsers
                          .filter((i) => !checkedInUserIds.has(i.recipient_id))
                          .map((invite) => (
                            <div
                              key={invite.id}
                              className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                            >
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={invite.recipient?.avatar_url || ""} />
                                <AvatarFallback>
                                  <User className="h-5 w-5" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="font-medium text-sm">
                                  @{invite.recipient?.username || "usuário"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Convite aceito
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleCheckIn(invite.recipient_id)}
                                disabled={checkInUser.isPending}
                              >
                                {checkInUser.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Check-in"
                                )}
                              </Button>
                            </div>
                          ))}
                      </div>
                    )}

                    {checkins?.length === 0 && acceptedInviteUsers.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <UserCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhum participante para check-in</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            )}

            {/* Ratings Tab */}
            <TabsContent value="ratings" className="flex-1 m-0 mt-2">
              <ScrollArea className="p-4" style={{ maxHeight: "450px" }}>
                <div className="space-y-4">
                  {/* Rate button for participants with check-in */}
                  {eventHasPassed && canRate && (
                    <div className="text-center">
                      <Button 
                        onClick={() => setShowRatingModal(true)}
                        className="gap-2"
                      >
                        <Star className="h-4 w-4" />
                        {myRating ? "Editar Avaliação" : "Avaliar Evento"}
                      </Button>
                      {myRating && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Você avaliou com {myRating.rating} estrelas
                        </p>
                      )}
                    </div>
                  )}

                  {/* Message for non-participants */}
                  {eventHasPassed && !canRate && !isOrganizer && (
                    <div className="text-center py-4 text-muted-foreground">
                      <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        Apenas participantes com check-in podem avaliar
                      </p>
                    </div>
                  )}

                  {/* Event not finished message */}
                  {!eventHasPassed && (
                    <div className="text-center py-4 text-muted-foreground">
                      <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        As avaliações estarão disponíveis após o evento
                      </p>
                    </div>
                  )}

                  {/* Ratings Summary (for organizer) */}
                  {isOrganizer && ratings && (
                    <EventRatingSummary ratings={ratings} />
                  )}

                  {/* User's own rating view */}
                  {!isOrganizer && myRating && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/30 border">
                      <h4 className="text-sm font-medium mb-2">Sua avaliação</h4>
                      <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              "h-5 w-5",
                              star <= myRating.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground/30"
                            )}
                          />
                        ))}
                      </div>
                      {myRating.feedback && (
                        <p className="text-sm text-muted-foreground">
                          "{myRating.feedback}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Rating Modal */}
      <EventRatingModal
        open={showRatingModal}
        onOpenChange={setShowRatingModal}
        eventId={eventId}
        eventTitle={eventTitle}
      />
    </>
  );
}
