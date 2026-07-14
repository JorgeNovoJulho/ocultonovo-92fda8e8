import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useChat, Conversation, Message } from "@/hooks/useChat";
import { isSelfChatId, resolveChatIdentity } from '@/lib/chatIdentity';
import { useMessages } from "@/hooks/useMessages";
import { useProfile } from "@/hooks/useProfile";
import { ChatSoundToggle } from "@/components/chat/messages/ChatSoundToggle";
import { ChatSoundIconButton } from "@/components/chat/messages/ChatSoundIconButton";
import { AttentionPingButton } from "@/components/chat/AttentionPingButton";

import { LockedMediaMessage } from "@/components/chat/LockedMediaMessage";
import { SendLockedMediaButton } from "@/components/chat/SendLockedMediaButton";
import { StoryReplyPreview } from "@/components/chat/StoryReplyPreview";
import { ChatMediaPlayer } from "@/components/chat/ChatMediaPlayer";
import { ChatMediaInput } from "@/components/chat/ChatMediaInput";
import { ChatMediaErrorBoundary } from "@/components/chat/ChatMediaErrorBoundary";
import { LinkPreview, formatLastSeen } from "@/components/chat/LinkPreview";
import { VerifiedCoupleBadge } from "./VerifiedCoupleBadge";
import { LimitBadge } from "@/components/FreePlanRestrictions";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { UpsellModal } from "@/components/UpsellModal";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { useFreePlanRestrictions, useIncrementUsage } from "@/hooks/useFreePlanLimits";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";
import { playTestSound } from "@/lib/messageSound";
import {
  MessageCircle,
  Archive,
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  MoreVertical,
  Loader2,
  Sparkles,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Gift,
  UserCircle2,
} from "lucide-react";
import { useMessageSearch } from "@/hooks/useMessageSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Ban, Trash2 } from "lucide-react";
import { useBlockContact } from "@/hooks/useBlockedContacts";
import { isReallyOnline } from "@/lib/onlineStatus";
import { supabase as supabaseExternal } from "@/lib/supabaseExternal";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
// Mock data removed - all conversations from Supabase

export function RealtimeInboxSidebar() {
  const { user } = useAuth();
  const [selfIds, setSelfIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setSelfIds([]);
      return;
    }
    resolveChatIdentity(user.id).then((identity) => {
      if (!cancelled) {
        setSelfIds(identity.selfIds.length > 0 ? identity.selfIds : [user.id]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  const navigate = useNavigate();
  const { conversations, loading, typingUsers, totalUnreadCount, sendMessage, setTyping, markAsRead, markTabAsRead, setActiveConversation, archiveConversation } = useChat();
  const [activeTab, setActiveTab] = useState<'inbox' | 'archived'>('inbox');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const { query: searchQuery, results: searchResults, searching, search: handleSearchInput, clearSearch, isActive: isSearchActive } = useMessageSearch();

  // Resize + collapse persistence
  const MIN_W = 260;
  const MAX_W = 560;
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 320;
    const saved = parseInt(localStorage.getItem('inbox.sidebar.width') || '', 10);
    return Number.isFinite(saved) && saved >= MIN_W && saved <= MAX_W ? saved : 320;
  });
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('inbox.sidebar.collapsed') === '1';
  });
  const isResizingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem('inbox.sidebar.width', String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    localStorage.setItem('inbox.sidebar.collapsed', isCollapsed ? '1' : '0');
  }, [isCollapsed]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Free plan restrictions
  const { canSendMessage, remainingMessages, limits, isFreePlan } = useFreePlanRestrictions();
  const incrementUsage = useIncrementUsage();
  const { isBeta } = usePlatformPhase();

  // Beta perk: durante o beta, qualquer usuário (incl. Free) pode enviar
  // mensagens livremente para usuários VIP e para o ocultomaster, sem cota.
  const isBetaUnlimitedRecipient = (profile: any | null | undefined) => {
    if (!isBeta || !profile) return false;
    const plan = (profile.plan_type || '').toLowerCase();
    const uname = (profile.username || '').toLowerCase();
    return plan === 'vip' || uname === 'ocultomaster' || uname === 'oculto_master';
  };

  const useMockData = false;
  
  const displayConversations = conversations;

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    markAsRead(conv.id);
  };

  useEffect(() => {
    setActiveConversation(selectedConversation?.id ?? null);
    return () => setActiveConversation(null);
  }, [selectedConversation?.id, setActiveConversation]);

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedConversation || isSending) return;

    const recipientProfile = selectedConversation.participants?.[0]?.profile;
    const bypassLimit = isBetaUnlimitedRecipient(recipientProfile);

    setIsSending(true);
    await sendMessage(selectedConversation.id, message.trim());
    
    setMessage('');
    setIsSending(false);
  };

  // Debounced typing: 2s timeout, throttled to avoid spam
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(false);

  const handleTyping = useCallback((value: string) => {
    setMessage(value);
    if (!selectedConversation) return;

    // Send typing=true only once per burst
    if (value.length > 0 && !lastTypingSentRef.current) {
      lastTypingSentRef.current = true;
      setTyping(selectedConversation.id, true);
    }

    // Reset the 2s debounce
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      lastTypingSentRef.current = false;
      if (selectedConversation) {
        setTyping(selectedConversation.id, false);
      }
    }, 2000);
  }, [selectedConversation, setTyping]);

  const getOtherParticipant = (conv: Conversation) => {
    return conv.participants[0]?.profile;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  return (
    <>
      <aside
        className="hidden xl:flex flex-col sticky top-16 border-l border-border/30 self-start relative shrink-0"
        style={{ height: 'calc(100dvh - 4rem)', width: isCollapsed ? 48 : sidebarWidth }}
      >
        {!isCollapsed && (
          <div
            onMouseDown={startResize}
            onDoubleClick={() => setSidebarWidth(320)}
            className="absolute left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-col-resize z-20 group"
            title="Arraste para redimensionar (duplo clique para resetar)"
          >
            <div className="absolute inset-y-0 left-1/2 w-px bg-border/30 group-hover:bg-primary/60 transition-colors" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-primary" />
            </div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          aria-label={isCollapsed ? 'Expandir mensagens' : 'Recolher mensagens'}
          className="absolute -left-3 top-3 z-30 h-6 w-6 rounded-full border border-border/50 bg-background shadow-md flex items-center justify-center hover:bg-muted transition-colors"
        >
          {isCollapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {isCollapsed && (
          <div className="flex flex-col items-center gap-3 pt-12 px-2">
            <button
              onClick={() => setIsCollapsed(false)}
              className="relative h-10 w-10 rounded-full hover:bg-muted/40 flex items-center justify-center"
              aria-label="Abrir mensagens"
            >
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
              {totalUnreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">
                  {totalUnreadCount}
                </span>
              )}
            </button>
          </div>
        )}
        {!isCollapsed && (<div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">

        <ChatSoundToggle />

        {/* Header Tabs */}
        <div className="flex border-b border-border/30">
          <button
            onClick={() => setActiveTab('inbox')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2",
              activeTab === 'inbox'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageCircle className="h-4 w-4" />
            Inbox
            {totalUnreadCount > 0 && (
              <Badge className="bg-red-500 text-white text-[10px] h-5 min-w-5 p-0 flex items-center justify-center">
                {totalUnreadCount}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2",
              activeTab === 'archived'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Archive className="h-4 w-4" />
            Arquivadas
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="m-1 h-9 shrink-0 px-2 text-[11px]"
            onClick={() => markTabAsRead(activeTab)}
          >
            Marcar lidas
          </Button>
        </div>

        {/* Search Bar */}
        <div className="px-3 py-2 border-b border-border/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="Buscar mensagens..."
              className="pl-9 pr-8 h-8 text-sm bg-muted/30 border-border/30"
            />
            {isSearchActive && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Search Results or Conversations List */}
        {isSearchActive ? (
          <ScrollArea className="flex-1">
            {searching ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <p className="text-xs text-muted-foreground">Nenhuma mensagem encontrada</p>
              </div>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.message_id}
                  onClick={() => {
                    const conv = conversations.find(c => c.id === r.conversation_id);
                    if (conv) {
                      handleSelectConversation(conv);
                      clearSearch();
                    }
                  }}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors border-b border-border/20"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={r.other_user_avatar || ''} loading="lazy" />
                    <AvatarFallback>{r.other_user_name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-medium truncate">{r.other_user_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.content}</p>
                  </div>


                </button>
              ))
            )}
          </ScrollArea>
        ) : (
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <MessageCircle className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                {activeTab === 'inbox' ? 'Nenhuma mensagem' : 'Nenhuma conversa arquivada'}
              </p>
            </div>
          ) : (
            <div>
              {/* Real conversations display */}
              {conversations.filter(c => {
                  const isArchived = c.self_is_archived;
                  return activeTab === 'inbox' ? !isArchived : isArchived;
                }).map((conv) => {
                  const other = getOtherParticipant(conv);
                  const isTyping = typingUsers.get(conv.id)?.length ?? 0 > 0;
                  
                  const hasSuperDm = conv.has_unread_priority && (conv.total_priority_amount || 0) > 0;
                  
                  return (
                    <div
                      key={conv.id}
                      className="relative"
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '72px' } as React.CSSProperties}
                    >
                    <button
                      onClick={() => handleSelectConversation(conv)}
                      className={cn(
                        "w-full flex items-center gap-3 pl-3 pr-14 py-3 transition-all border-b relative overflow-hidden",
                        hasSuperDm
                          ? "bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-amber-500/20 border-2 border-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.25)] pr-16"
                          : "hover:bg-muted/30 border-border/20"
                      )}
                    >
                      {/* Super DM indicator */}
                      {hasSuperDm && (
                        <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-400/30 max-w-[60px]">
                          <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
                          <span className="text-[10px] font-bold text-amber-400 truncate">+{conv.total_priority_amount}</span>
                        </div>
                      )}

                      <div className="relative shrink-0">
                        <Avatar className={cn(
                          "h-12 w-12",
                          hasSuperDm && "ring-2 ring-amber-400/60"
                        )}>
                          <AvatarImage src={buildSupabaseImageThumb(other?.avatar_url, { width: 128, quality: 72 }) || other?.avatar_url || ''} alt={other?.username || 'usuário'} />
                          <AvatarFallback>{(other?.username || '?')[0]}</AvatarFallback>
                        </Avatar>
                        <OnlineDot user={other} size="md" />
                        {!hasSuperDm && conv.unread_count > 0 && (
                          <span
                            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center border-2 border-background shadow-lg"
                            aria-label={`${conv.unread_count} mensagens não lidas`}
                          >
                            {conv.unread_count > 99 ? '99+' : conv.unread_count}
                          </span>
                        )}

                      </div>
                      <div className="flex-1 min-w-0 text-left overflow-hidden">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <p className={cn(
                            "font-medium truncate text-sm min-w-0 flex-1",
                            conv.unread_count > 0 ? "text-foreground" : "text-foreground/80",
                            hasSuperDm && "text-amber-100"
                          )}>
                            {other?.username ? `@${other.username}` : 'Usuário'}
                            {other?.is_verified_couple ? (
                              <VerifiedCoupleBadge size="sm" className="ml-1 inline-flex" />
                            ) : other?.profile_type === 'couple' ? (
                              <span className="ml-1 text-pink-400 text-xs">👫</span>
                            ) : null}
                          </p>

                          <span className={cn(
                            "text-[10px] shrink-0 whitespace-nowrap tabular-nums",
                            hasSuperDm ? "text-amber-400/80" : "text-muted-foreground"
                          )}>
                            {conv.last_message ? formatTime(conv.last_message.created_at) : ''}
                          </span>
                        </div>
                        <p className={cn(
                          "text-xs truncate min-w-0 max-w-full",
                          conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground",
                          hasSuperDm && "text-amber-200/80"
                        )}>
                          {isTyping ? (
                            <span className="text-primary italic">Digitando...</span>
                          ) : hasSuperDm ? (
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-amber-400 inline shrink-0" />
                              Super DM
                            </span>
                          ) : (
                            conv.last_message?.content || 'Iniciar conversa'
                          )}
                        </p>
                      </div>
                    </button>
                    {conv.unread_count > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2"
                        onClick={() => markAsRead(conv.id)}
                        aria-label="Marcar conversa como lida"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    )}
                    </div>
                  );
                })}
            </div>
          )}
        </ScrollArea>
        )}
        </div>)}
      </aside>

      {/* Chat Dialog */}
      <Dialog open={!!selectedConversation} onOpenChange={(open) => !open && setSelectedConversation(null)}>
        <DialogContent className="sm:max-w-md h-[600px] flex flex-col p-0 gap-0">
          <ChatDialogContent
            conversation={selectedConversation}
            onClose={() => setSelectedConversation(null)}
            onSendMessage={sendMessage}
            isSending={isSending}
            typingUsers={typingUsers}
            onArchive={() => {
              if (selectedConversation) {
                archiveConversation(selectedConversation.id);
                setSelectedConversation(null);
              }
            }}
            isFreePlan={isFreePlan}
            canSendMessage={canSendMessage}
            remainingMessages={remainingMessages}
            maxMessages={limits.maxMessagesPerDay}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

const RealtimeMessageBubble = memo(function RealtimeMessageBubble({
  msg,
  isMe,
  userId,
  formatMessageTime,
  onDelete,
}: {
  msg: Message;
  isMe: boolean;
  userId?: string;
  formatMessageTime: (dateStr: string) => string;
  onDelete: (messageId: string, forEveryone: boolean) => Promise<{ error: Error | null }> | void;
}) {
  const [showDeleteActions, setShowDeleteActions] = useState(false);
  const [showDeleteForEveryone, setShowDeleteForEveryone] = useState(false);
  const [localDeleting, setLocalDeleting] = useState(false);

  const isDeleted = msg.deleted_for_everyone || (!!userId && msg.deleted_by?.includes(userId));
  const canDelete = !localDeleting;
  const isSticker = msg.media_type === 'sticker';
  const isImageSticker = isSticker && !!msg.media_url;
  const isTextSticker = isSticker && !msg.media_url && !!msg.content;

  const handleDelete = useCallback(async (forEveryone: boolean) => {
    setLocalDeleting(true);
    try {
      await onDelete(msg.id, forEveryone);
    } finally {
      setLocalDeleting(false);
      setShowDeleteActions(false);
      setShowDeleteForEveryone(false);
    }
  }, [msg.id, onDelete]);

  const deleteButton = canDelete ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShowDeleteActions(true);
      }}
      className={cn(
        "absolute top-1 z-30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-destructive shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isMe ? "right-1" : "left-1"
      )}
      aria-label="Apagar mensagem"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  ) : null;

  if (isDeleted) {
    return (
      <>
        <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
          <div className={cn("relative max-w-[86%]", isMe ? "pl-0 pr-10" : "pl-10 pr-0")}>
            {deleteButton}
            <div className={cn(
              "rounded-2xl border border-border/50 px-4 py-2 text-sm italic text-muted-foreground",
              isMe ? "bg-primary/10 rounded-tr-sm" : "bg-muted/60 rounded-tl-sm"
            )}>
              <div className="flex items-center gap-2">
                <Ban className="h-3.5 w-3.5 shrink-0" />
                <span>{msg.deleted_for_everyone ? 'Mensagem apagada' : 'Mensagem apagada para mim'}</span>
              </div>
            </div>
            <div className={cn("mt-1 flex items-center gap-1", isMe ? "justify-end" : "justify-start")}>
              <span className="text-[10px] opacity-70">{formatMessageTime(msg.created_at)}</span>
            </div>
          </div>
        </div>

        <AlertDialog open={showDeleteActions} onOpenChange={setShowDeleteActions}>
          <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Opções da mensagem</AlertDialogTitle>
              <AlertDialogDescription>O que deseja fazer com esta mensagem?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <AlertDialogAction onClick={() => handleDelete(false)} className="bg-muted text-foreground hover:bg-muted/80" disabled={localDeleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                Apagar para mim
              </AlertDialogAction>
              {isMe && (
                <AlertDialogAction onClick={() => setShowDeleteForEveryone(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={localDeleting}>
                  <Ban className="h-4 w-4 mr-2" />
                  Apagar para todos
                </AlertDialogAction>
              )}
              <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeleteForEveryone} onOpenChange={setShowDeleteForEveryone}>
          <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar mensagem</AlertDialogTitle>
              <AlertDialogDescription>Tem certeza que deseja apagar esta mensagem para todos?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <AlertDialogAction onClick={() => handleDelete(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={localDeleting}>
                Apagar para todos
              </AlertDialogAction>
              <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (msg.is_locked && msg.media_url) {
    return (
      <LockedMediaMessage
        messageId={msg.id}
        senderId={msg.sender_id}
        mediaUrl={msg.media_url}
        mediaType={(msg.media_type as 'image' | 'video') || 'image'}
        unlockPrice={msg.unlock_price || 0}
        isUnlocked={msg.unlocked_by?.includes(userId || '') || false}
        isOwnMessage={isMe}
        caption={msg.content}
        timestamp={msg.created_at}
        formatTimestamp={formatMessageTime}
        onDelete={onDelete}
      />
    );
  }

  return (
    <>
      <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
        <div className={cn("relative max-w-[86%]", isMe ? "pl-0 pr-10" : "pl-10 pr-0")}>
          {deleteButton}
          <div
            className={cn(
              isTextSticker || isImageSticker
                ? "px-0 py-0"
                : "rounded-2xl px-4 py-2",
              !(isTextSticker || isImageSticker) && (isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"),
              msg.story_reply_id && msg.story && !(isTextSticker || isImageSticker) && "rounded-t-none",
              msg.media_url && !msg.is_locked && !isImageSticker && "px-1.5 py-1.5"
            )}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowDeleteActions(true);
            }}
          >
            {msg.story_reply_id && msg.story && (
              <StoryReplyPreview
                storyThumbnail={msg.story.media_url}
                storyText={msg.story.content_text}
                authorName={msg.story.author?.username || msg.story.author?.name || 'Usuário'}
                isOwnMessage={isMe}
              />
            )}
            {msg.media_url && !msg.is_locked && (
              <div className="mb-1">
                {isImageSticker ? (
                  <img
                    src={msg.media_url}
                    alt="figurinha"
                    className="inline-block max-h-[180px] max-w-[180px] object-contain select-none drop-shadow-sm"
                    loading="lazy"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                ) : (
                  <ChatMediaErrorBoundary>
                    <ChatMediaPlayer
                      mediaUrl={msg.media_url}
                      mediaType={msg.media_type || 'image'}
                      isOwnMessage={isMe}
                    />
                  </ChatMediaErrorBoundary>
                )}
              </div>
            )}
            {msg.content && (
              <div className={cn(
                isTextSticker ? "text-[96px] leading-none select-none" : "text-sm whitespace-pre-wrap break-words",
                msg.media_url && !msg.is_locked && !isImageSticker && "px-2"
              )}>
                {msg.content}
                <LinkPreview text={msg.content} isMine={isMe} />
              </div>
            )}
            <div className={cn(
              "flex items-center gap-1 mt-1",
              isMe ? "justify-end" : "justify-start",
              msg.media_url && !msg.is_locked && "px-2"
            )}>
              <span className="text-[10px] opacity-70">{formatMessageTime(msg.created_at)}</span>
              {isMe && (
                msg.is_read ? <CheckCheck className="h-3 w-3 text-blue-400" /> : <Check className="h-3 w-3 opacity-70" />
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteActions} onOpenChange={setShowDeleteActions}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Opções da mensagem</AlertDialogTitle>
            <AlertDialogDescription>O que deseja fazer com esta mensagem?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={() => handleDelete(false)} className="bg-muted text-foreground hover:bg-muted/80" disabled={localDeleting}>
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar para mim
            </AlertDialogAction>
            {isMe && (
              <AlertDialogAction onClick={() => setShowDeleteForEveryone(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={localDeleting}>
                <Ban className="h-4 w-4 mr-2" />
                Apagar para todos
              </AlertDialogAction>
            )}
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteForEveryone} onOpenChange={setShowDeleteForEveryone}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja apagar esta mensagem para todos?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={() => handleDelete(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={localDeleting}>
              Apagar para todos
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

interface ChatDialogContentProps {
  conversation: Conversation | null;
  onClose: () => void;
  onSendMessage: (conversationId: string, content: string, mediaUrl?: string, mediaType?: string) => Promise<unknown>;
  isSending: boolean;
  typingUsers: Map<string, string[]>;
  onArchive: () => void;
  // Free plan restrictions
  isFreePlan: boolean;
  canSendMessage: boolean;
  remainingMessages: number;
  maxMessages: number;
}

function ChatDialogContent({
  conversation,
  onClose,
  onSendMessage,
  isSending,
  typingUsers,
  onArchive,
  isFreePlan,
  canSendMessage,
  remainingMessages,
  maxMessages,
}: ChatDialogContentProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selfIds, setSelfIds] = useState<string[]>([]);
  const { messages, loading, deleteMessage } = useMessages(conversation?.id || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const blockContact = useBlockContact();
  const queryClient = useQueryClient();
  // Virtual scroll: show only the last VISIBLE_MESSAGES messages to save RAM
  const VISIBLE_MESSAGES = 40;
  const [visibleCount, setVisibleCount] = useState(VISIBLE_MESSAGES);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setSelfIds([]);
      return;
    }
    resolveChatIdentity(user.id).then((identity) => {
      if (!cancelled) {
        setSelfIds(identity.selfIds.length > 0 ? identity.selfIds : [user.id]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const otherFromConv = conversation?.participants[0]?.profile;
  const otherUserId = otherFromConv?.user_id;

  // Polling do perfil do outro usuário a cada 15s para refletir is_online/last_seen em tempo real
  const [livePresence, setLivePresence] = useState<{ is_online?: boolean | null; last_seen?: string | null; show_online_status?: boolean | null } | null>(null);

  useEffect(() => {
    if (!otherUserId) { setLivePresence(null); return; }
    let cancelled = false;
    const fetchPresence = async () => {
      const { data } = await supabaseExternal
        .from('profiles')
        .select('is_online, last_seen, show_online_status')
        .eq('user_id', otherUserId)
        .maybeSingle();
      if (!cancelled && data) setLivePresence(data);
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [otherUserId]);

  const other = useMemo(() => {
    if (!otherFromConv) return otherFromConv;
    if (!livePresence) return otherFromConv;
    return { ...otherFromConv, ...livePresence } as typeof otherFromConv;
  }, [otherFromConv, livePresence]);

  const isTyping = conversation ? (typingUsers.get(conversation.id)?.length ?? 0) > 0 : false;

  // Block free users from replying to premium/vip users
  const otherPlanType = (other?.plan_type || 'free').toLowerCase();
  const otherUsername = ((other as any)?.username || '').toLowerCase();
  const otherIsPaidUser = otherPlanType === 'premium' || otherPlanType === 'vip' || otherPlanType === 'monthly';
  // Beta perk: Free pode responder VIP e ocultomaster sem bloqueio.
  const { isBeta } = usePlatformPhase();
  const betaUnlimitedRecipient = isBeta && (
    otherPlanType === 'vip' || otherUsername === 'ocultomaster' || otherUsername === 'oculto_master'
  );
  const isBlockedByPlan = false;

  // Slice messages to only render what's needed
  const visibleMessages = useMemo(() => {
    if (messages.length <= visibleCount) return messages;
    return messages.slice(messages.length - visibleCount);
  }, [messages, visibleCount]);

  const hasMoreMessages = messages.length > visibleCount;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset visible count when conversation changes
  useEffect(() => {
    setVisibleCount(VISIBLE_MESSAGES);
  }, [conversation?.id]);

  const handleSendWithMedia = useCallback((content: string, mediaUrl?: string, mediaType?: string) => {
    if (!conversation) return;
    if (isBlockedByPlan) { setShowUpsell(true); return; }
    onSendMessage(conversation.id, content, mediaUrl, mediaType);
  }, [conversation, isBlockedByPlan, onSendMessage]);

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!conversation) return null;

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/30">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarImage src={buildSupabaseImageThumb(other?.avatar_url, { width: 96, quality: 72 }) || other?.avatar_url || ''} alt={other?.username || 'usuário'} />
            <AvatarFallback>{(other?.username || '?')[0]}</AvatarFallback>
          </Avatar>
          <OnlineDot user={other} size="sm" />

        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{other?.username ? `@${other.username}` : 'Usuário'}</p>

          <p className="text-xs text-muted-foreground">
            {isTyping ? (
              <span className="text-primary">Digitando...</span>
            ) : isReallyOnline(other) ? (
              'Online'
            ) : (
              formatLastSeen(other?.last_seen, other?.show_online_status)
            )}
          </p>
        </div>
        <ChatSoundIconButton className="shrink-0" />
        <AttentionPingButton
          toUserId={(other as any)?.user_id || null}
          toProfileId={other?.id || null}
          conversationId={conversation?.id || null}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais opções">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                const slug = ((other as any)?.username || '').trim().replace(/^@/, '');
                const target = slug || other?.id;
                if (!target) return;
                navigate(`/u/${encodeURIComponent(target)}`);
              }}
            >
              <UserCircle2 className="h-4 w-4 mr-2" />
              Ver perfil
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (!other?.id) {
                  toast.info('Carregando perfil do destinatário…');
                  return;
                }
                setGiftOpen(true);
              }}
            >
              <Gift className="h-4 w-4 mr-2" />
              Enviar Presente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="h-4 w-4 mr-2" />
              Arquivar conversa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowClearDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar conversa
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowBlockDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="h-4 w-4 mr-2" />
              Bloquear usuário
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Confirmação: Limpar conversa (apaga p/ ambos) */}
        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Limpar conversa?</AlertDialogTitle>
              <AlertDialogDescription>
                Todas as mensagens enviadas e recebidas serão apagadas permanentemente para você e para {other?.username ? `@${other.username}` : 'o outro usuário'}. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!conversation?.id) return;
                  try {
                    const { error } = await supabaseExternal
                      .from('messages')
                      .delete()
                      .eq('conversation_id', conversation.id);
                    if (error) throw error;
                    toast.success('Conversa limpa para ambos os usuários');
                    queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : 'desconhecido';
                    toast.error('Erro ao limpar conversa: ' + message);
                  } finally {
                    setShowClearDialog(false);
                  }
                }}
              >
                Limpar para ambos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmação: Bloquear usuário */}
        <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bloquear {other?.username ? `@${other.username}` : 'usuário'}?</AlertDialogTitle>
              <AlertDialogDescription>
                Vocês não poderão mais trocar mensagens nem se ver no aplicativo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!other?.id) return;
                  blockContact.mutate(
                    { blockedUserId: other.id, blockType: 'blocked' },
                    {
                      onSuccess: () => {
                        setShowBlockDialog(false);
                        onClose();
                      },
                    }
                  );
                }}
              >
                Bloquear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {other && (
          <AuraXpGiftModal
            open={giftOpen}
            onOpenChange={setGiftOpen}
            lockedReceiver={{
              id: other.id,
              user_id: other.user_id ?? null,
              username: other.username ?? null,
              name: other.name ?? null,
              avatar_url: other.avatar_url ?? null,
            }}
            title="Enviar presente"
            contextLabel="nesta conversa"
            onSent={({ amount }) => {
              void onSendMessage(conversation.id, `🎁 Presente enviado: ${amount} XP ✨`);
              try { playTestSound(); } catch {}
            }}
          />
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Inicie uma conversa com {other?.username ? `@${other.username}` : 'este usuário'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Load more older messages */}
            {hasMoreMessages && (
              <div className="text-center py-1">
                <button
                  onClick={() => setVisibleCount(c => c + VISIBLE_MESSAGES)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Ver mensagens anteriores ({messages.length - visibleCount} ocultas)
                </button>
              </div>
            )}
            {visibleMessages.map((msg) => {
              const isMe = isSelfChatId(msg.sender_id, selfIds.length > 0 ? selfIds : (user?.id ? [user.id] : []));

              return (
                <RealtimeMessageBubble
                  key={msg.id}
                  msg={msg}
                  isMe={isMe}
                  userId={user?.id}
                  formatMessageTime={formatMessageTime}
                  onDelete={deleteMessage}
                />
              );
            })}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Blocked reply banner for free users trying to reply to premium/vip */}
      {/* Input - Full media support */}
      <ChatMediaInput
        onSendMessage={handleSendWithMedia}
        disabled={isSending}
        isLoading={isSending}
        onMediaBlocked={() => setShowUpsell(true)}
      />

      {/* Upsell Modal */}
      <UpsellModal
        open={showUpsell}
        onOpenChange={setShowUpsell}
        restrictionType="messages"
        remainingUses={remainingMessages}
        maxUses={maxMessages}
      />
    </>
  );
}
