import { useState, useRef, useEffect, memo, useCallback, lazy, Suspense } from "react";
const ChatView = lazy(() => import("@/components/chat/messages/ChatView"));
import { ChatSoundToggle } from "@/components/chat/messages/ChatSoundToggle";
import { ChatSoundQuickBanner } from "@/components/chat/messages/ChatSoundQuickBanner";
import { useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useChat, Conversation, Message } from "@/hooks/useChat";
import { useMessages } from "@/hooks/useMessages";
import { useFreePlanRestrictions, useIncrementUsage } from "@/hooks/useFreePlanLimits";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { LockedMediaMessage } from "@/components/chat/LockedMediaMessage";
import { SendLockedMediaButton } from "@/components/chat/SendLockedMediaButton";
import { StoryReplyPreview } from "@/components/chat/StoryReplyPreview";
import { VipChatPaywall } from "@/components/chat/VipChatPaywall";
import { VerifiedCoupleBadge } from "@/components/VerifiedCoupleBadge";
import { UpsellModal } from "@/components/UpsellModal";
import { useVipChatAccess } from "@/hooks/useVipChatAccess";
import { useBlockContact, useIsBlocked, useUnblockContact } from "@/hooks/useBlockedContacts";
import { supabase } from "@/lib/supabaseExternal";
import { isSelfChatId, resolveChatIdentity, resolveProfileByAnyId } from '@/lib/chatIdentity';
// Mock data removed - all conversations from Supabase
import { escapeHtml } from "@/lib/sanitize";
import { toast } from "sonner";
import { AudioPlayer } from "@/components/chat/AudioPlayer";
import { ChatMediaInput } from "@/components/chat/ChatMediaInput";
import { LinkPreview, formatLastSeen } from "@/components/chat/LinkPreview";
import { ChatSafetyGuidelinesModal } from "@/components/chat/ChatSafetyGuidelinesModal";
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
  WifiOff,
  AlertCircle,
  RotateCcw,
  Lock,
  Ban,
  Trash2,
  Search,
  X,
  Zap,
  Image as ImageIcon,
  Music,
  Film,
  Volume2,
  Flag,
  Paperclip,
} from "lucide-react";
import { useMessageSearch, SearchResult } from "@/hooks/useMessageSearch";
import { isReallyOnline } from "@/lib/onlineStatus";
import { useSearchUsers, SearchedUser } from "@/hooks/useSearchUsers";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  ChatBubble,
  ChatHeaderMenu,
  ConnectionIndicator,
  createOptimisticConversation,
  formatChatTimestamp,
  formatExactLastSeen,
  uploadReportEvidence,
} from "@/components/chat/messages";
import type { ChatTargetProfile, ChatTimestampMode } from "@/components/chat/messages";
import { getPublicHandle, getHandleInitial } from "@/lib/userHandle";




export default function MessagesPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { conversations, loading, typingUsers, totalUnreadCount, connectionStatus, sendMessage, setTyping, markAsRead, markTabAsRead, archiveConversation, setActiveConversation, getOrCreateConversation, refetch: refetchConversations } = useChat();
  const blockContact = useBlockContact();
  const unblockContact = useUnblockContact();
  const [activeTab, setActiveTab] = useState<'inbox' | 'archived'>('inbox');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [blockOverrides, setBlockOverrides] = useState<Record<string, boolean>>({});
  const otherParticipantForBlock = selectedConversation?.participants[0];
  const otherProfileIdForBlock =
    otherParticipantForBlock?.profile?.id ||
    otherParticipantForBlock?.profile?.user_id ||
    otherParticipantForBlock?.user_id ||
    '';
  const { isBlocked: serverBlockedByMe } = useIsBlocked(otherProfileIdForBlock);
  const isBlockedByMe = otherProfileIdForBlock
    ? (blockOverrides[otherProfileIdForBlock] ?? serverBlockedByMe)
    : serverBlockedByMe;
  // Mock chat removed - all data from Supabase
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const { query: searchQuery, results: searchResults, searching, search: handleSearch, clearSearch, isActive: isSearchActive } = useMessageSearch();
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const { data: userSearchResults, isLoading: searchingUsers } = useSearchUsers(userSearchQuery, 8);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  const autoOpenHandledRef = useRef(false);
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

  const { canSendMessage, remainingMessages, limits, isFreePlan } = useFreePlanRestrictions();
  const { isVip: senderIsVip } = usePlanPermissions();
  const incrementUsage = useIncrementUsage();

  // Mantém a conversa aberta sincronizada com os dados mais novos da lista
  useEffect(() => {
    if (!selectedConversation) return;

    const full = conversations.find(c => c.id === selectedConversation.id);
    if (!full) return;

    const currentOther = selectedConversation.participants[0]?.profile;
    const nextOther = full.participants[0]?.profile;
    const shouldSync =
      (selectedConversation.participants?.length ?? 0) === 0 ||
      selectedConversation.updated_at !== full.updated_at ||
      currentOther?.id !== nextOther?.id ||
      currentOther?.is_online !== nextOther?.is_online ||
      currentOther?.last_seen !== nextOther?.last_seen ||
      currentOther?.show_online_status !== nextOther?.show_online_status;

    if (shouldSync) {
      setSelectedConversation(full);
    }
  }, [conversations, selectedConversation]);

  useEffect(() => {
    setActiveConversation(selectedConversation?.id ?? null);
    return () => setActiveConversation(null);
  }, [selectedConversation?.id, setActiveConversation]);

  // Auto-abre conversa via ?c=<conversation_id> (também aceita aliases legados)
  // ou ?u=<user/profile id>.
  // Só dispara quando o alvo mudou de verdade — sem isso, qualquer
  // re-render no topo (auth refresh, realtime, etc.) reabria a conversa
  // depois do usuário ter saído ("tela piscou e voltei pra conversa").
  const lastAutoOpenedCidRef = useRef<string | null>(null);
  const lastAutoOpenedUserRef = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cid = params.get('c')
      || params.get('conversation')
      || params.get('conversation_id')
      || params.get('conversationId')
      || params.get('chat')
      || params.get('chat_id');
    const targetUserParam = params.get('u')
      || params.get('user')
      || params.get('user_id')
      || params.get('sender_id')
      || params.get('profile_id');
    if (!cid) {
      lastAutoOpenedCidRef.current = null;
    }
    if (cid) {
      if (loading && conversations.length === 0) return;
      if (selectedConversation?.id === cid) return;
      if (lastAutoOpenedCidRef.current === cid) return; // já tentou abrir esse cid
      const target = conversations.find(c => c.id === cid);
      if (target) {
        lastAutoOpenedCidRef.current = cid;
        setSelectedConversation(target);
        markAsRead(target.id);
        navigate(`/messages?c=${target.id}`, { replace: true });
      } else {
        lastAutoOpenedCidRef.current = cid;
        setSelectedConversation(createOptimisticConversation(cid));
        markAsRead(cid);
        navigate(`/messages?c=${cid}`, { replace: true });
        refetchConversations();
        // A conversa pode ter sido excluída ("Excluir para todos") depois que
        // o link/notificação foi gerado. Sem esta checagem o usuário via um
        // chat vazio e a lista "Nenhuma mensagem ainda".
        void (async () => {
          try {
            const { data: rows, error: partErr } = await (supabase as any)
              .from('conversation_participants')
              .select('conversation_id')
              .eq('conversation_id', cid)
              .limit(1);
            if (partErr || (Array.isArray(rows) && rows.length > 0)) return;
            setSelectedConversation((cur) => (cur?.id === cid ? null : cur));
            toast.info('Essa conversa não está mais disponível.');
            navigate('/messages', { replace: true });
          } catch { /* mantém aberta */ }
        })();
      }
      return;
    }

    if (!targetUserParam) {
      lastAutoOpenedUserRef.current = null;
      return;
    }
    if (!user || loading) return;
    const target = conversations.find(c =>
      c.participants.some(p =>
        p.user_id === targetUserParam ||
        p.profile?.id === targetUserParam ||
        p.profile?.user_id === targetUserParam,
      ),
    );
    if (target) {
      lastAutoOpenedUserRef.current = targetUserParam;
      setSelectedConversation(target);
      markAsRead(target.id);
      navigate(`/messages?c=${target.id}`, { replace: true });
      return;
    }
    if (lastAutoOpenedUserRef.current === targetUserParam) return;
    lastAutoOpenedUserRef.current = targetUserParam;
    let cancelled = false;
    (async () => {
      try {
        const cols = 'id, user_id, name, username, avatar_url, is_online, last_seen, show_online_status, profile_type, is_verified, is_verified_couple, plan_type, is_creator, accept_super_dm, min_super_dm_price';
        const profile = await resolveProfileByAnyId<any>(targetUserParam, cols);
        if (cancelled || !profile?.user_id) return;
        const { conversation, error } = await getOrCreateConversation(profile.user_id);
        if (cancelled || error || !conversation) return;
        setSelectedConversation(createOptimisticConversation(conversation.id, profile as ChatTargetProfile));
        navigate(`/messages?c=${conversation.id}`, { replace: true });
        refetchConversations();
      } catch { /* fallback: mantém lista de mensagens */ }
    })();
    return () => { cancelled = true; };
  }, [location.search, conversations, selectedConversation?.id, user, loading, markAsRead, navigate, getOrCreateConversation, refetchConversations]);

  // Persiste conversa selecionada no URL (?c=ID). Antes este effect rodava
  // sempre que location.search mudava por qualquer motivo e podia entrar em
  // disputa com o effect acima. Agora depende SÓ do id selecionado: ao
  // selecionar/fechar conversa, escreve a URL uma única vez.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('to')) return; // não atrapalha fluxo de criar conversa
    const currentC = params.get('c');
    const targetC = selectedConversation?.id ?? null;
    if (currentC === targetC) return;
    if (targetC) {
      params.set('c', targetC);
    } else {
      params.delete('c');
    }
    const qs = params.toString();
    navigate(`/messages${qs ? `?${qs}` : ''}`, { replace: true });
  }, [selectedConversation?.id, navigate]);

  const handleBlockConversationUser = useCallback(async () => {
    if (!selectedConversation) return;

    let targetProfileId = selectedConversation.participants[0]?.profile?.id;
    const otherUserId = selectedConversation.participants[0]?.user_id;

    if (!targetProfileId && otherUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', otherUserId)
        .maybeSingle();

      targetProfileId = profile?.id;
    }

    if (!targetProfileId) {
      toast.error('Não foi possível localizar o perfil do usuário');
      return;
    }

    const overrideKeys = [otherProfileIdForBlock, targetProfileId, otherUserId].filter(Boolean) as string[];
    const setLocalBlockState = (value: boolean) => {
      setBlockOverrides(prev => {
        const next = { ...prev };
        overrideKeys.forEach(key => { next[key] = value; });
        return next;
      });
    };

    if (isBlockedByMe) {
      // Toggle: desbloqueia e mantém a conversa aberta para retomar o fluxo.
      setLocalBlockState(false);
      unblockContact.mutate(targetProfileId, { onError: () => setLocalBlockState(true) });
    } else {
      // NÃO fecha a conversa: o usuário precisa ver o menu virar "Desbloquear".
      setLocalBlockState(true);
      blockContact.mutate(
        { blockedUserId: targetProfileId, blockType: 'blocked' },
        { onError: () => setLocalBlockState(false) },
      );
    }
  }, [selectedConversation, blockContact, unblockContact, isBlockedByMe, otherProfileIdForBlock]);

  const handleClearConversation = useCallback(async () => {
    if (!selectedConversation) return;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', selectedConversation.id);

    if (error) {
      toast.error('Erro ao limpar conversa');
      return;
    }

    toast.success('Conversa limpa para ambos');
    refetchConversations();
  }, [selectedConversation, refetchConversations]);

  // Handle ?to=<profileId> URL param — open or create conversation automatically
  useEffect(() => {
    if (!user || autoOpenHandledRef.current || loading) return;
    const params = new URLSearchParams(location.search);
    const toProfileId = params.get('to');
    if (!toProfileId) return;

    autoOpenHandledRef.current = true;

    // First check if conversation already exists in loaded list
    const existingConv = conversations.find(c =>
      c.participants.some(p => p.profile?.id === toProfileId)
    );
    if (existingConv) {
      setSelectedConversation(existingConv);
      markAsRead(existingConv.id);
      navigate('/messages', { replace: true });
      return;
    }

    // Need to look up user_id from profile id and create conversation
    // Resiliente: tenta resolver tanto por profile.id quanto por profile.user_id (auth user_id)
    import('@/lib/supabaseExternal').then(async () => {
      const cols = 'id, user_id, name, username, avatar_url, is_online, last_seen, show_online_status, profile_type, is_verified, is_verified_couple, plan_type, is_creator, accept_super_dm, min_super_dm_price';
      const profile = await resolveProfileByAnyId<any>(toProfileId, cols);
      if (!profile?.user_id) {
        toast.error('Usuário não encontrado');
        navigate('/messages', { replace: true });
        return;
      }
      const { conversation, error: convErr } = await getOrCreateConversation(profile.user_id);
      if (convErr || !conversation) {
        toast.error('Erro ao abrir conversa');
        return;
      }
      navigate('/messages', { replace: true });
      setSelectedConversation(createOptimisticConversation(conversation.id, profile as ChatTargetProfile));
      refetchConversations();
    });
  }, [user, loading, location.search, conversations, getOrCreateConversation, refetchConversations, markAsRead, navigate]);

  // Auto-open conversation from navigation state (e.g., from profile page)
  // Trata corrida: se a conversa recém-criada ainda não está na lista,
  // abre otimisticamente; o sync effect popula os participantes quando o refetch chegar.
  useEffect(() => {
    const navState = (location.state as { openConversationId?: string; targetProfile?: ChatTargetProfile } | null);
    const openId = navState?.openConversationId;
    const targetProfile = navState?.targetProfile;
    if (!openId) return;
    if (selectedConversation && (selectedConversation.participants?.length ?? 0) > 0) return;

    const conv = conversations.find(c => c.id === openId);
    if (conv) {
      setSelectedConversation(conv);
      markAsRead(conv.id);
    } else if (!loading) {
      setSelectedConversation(createOptimisticConversation(openId, targetProfile));
      if (!targetProfile) refetchConversations();
    }
  }, [conversations, location.state, selectedConversation, markAsRead, loading, refetchConversations]);

  // All data from Supabase - no mock

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv);
    markAsRead(conv.id);
  }, [markAsRead]);

  const handleStartChatWithUser = useCallback(async (targetUser: SearchedUser) => {
    if (!user || startingChatWith) return;
    setStartingChatWith(targetUser.id);
    try {
      const { conversation, error } = await getOrCreateConversation(targetUser.user_id);
      if (error || !conversation) {
        toast.error('Erro ao iniciar conversa');
        return;
      }
      setUserSearchQuery('');
      clearSearch();
      setSelectedConversation(createOptimisticConversation(conversation.id, { ...targetUser, name: targetUser.username || 'usuario' }));
      refetchConversations();
    } catch {
      toast.error('Erro ao iniciar conversa');
    } finally {
      setStartingChatWith(null);
    }
  }, [user, startingChatWith, getOrCreateConversation, refetchConversations, clearSearch]);

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || !selectedConversation || isSending) return;

    const other = selectedConversation.participants[0]?.profile;
    const otherPlan = (other as any)?.plan_type;
    const otherIsVip = otherPlan === 'vip';
    const lastSenderId = (selectedConversation as any)?.last_message?.sender_id;
    const isReplyAllowed = !!lastSenderId && !isSelfChatId(lastSenderId, selfIds.length > 0 ? selfIds : (user?.id ? [user.id] : []));

    // Bloqueio: Free e Premium não podem iniciar conversa com VIP.
    // Permitido: VIP enviando, ou resposta a mensagem recebida do VIP.
    if (otherIsVip && !senderIsVip && !isReplyAllowed) {
      toast.error('Apenas usuários VIP podem iniciar conversas com criadores VIP. Faça upgrade ou envie um Super DM pago.');
      setShowUpsell(true);
      return;
    }

    // Limites do plano gratuito
    if (isFreePlan) {
      if (otherPlan === 'monthly' || otherPlan === 'premium') {
        toast.error('Faça upgrade para enviar mensagens a perfis Premium.');
        setShowUpsell(true);
        return;
      }
      if (!canSendMessage) {
        setShowUpsell(true);
        return;
      }
    }

    // UX instantânea: limpa o input imediatamente; o envio segue em background.
    const textToSend = message.trim();
    setMessage('');
    setIsSending(true);
    const result = await sendMessage(selectedConversation.id, textToSend);
    if (result.error) {
      toast.error('Erro ao enviar mensagem. Tente novamente.');
      // Restaura o texto para o usuário tentar de novo
      setMessage(textToSend);
    } else {
      if (isFreePlan) incrementUsage.mutate('messages');
    }
    setIsSending(false);
  }, [message, selectedConversation, isSending, isFreePlan, canSendMessage, sendMessage, incrementUsage, senderIsVip, user?.id]);

  const handleTyping = useCallback((value: string) => {
    setMessage(value);
    if (selectedConversation) {
      setTyping(selectedConversation.id, value.length > 0);
    }
  }, [selectedConversation, setTyping]);

  const getOtherParticipant = useCallback((conv: Conversation) => conv.participants[0]?.profile, []);

  const formatTime = useCallback((dateStr: string) => {
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
  }, []);




  const closeConversation = useCallback(() => {
    // Limpa o ?c= ANTES de zerar o estado para que o efeito de auto-abrir
    // não reabra a mesma conversa em seguida.
    const params = new URLSearchParams(location.search);
    if (params.has('c')) {
      params.delete('c');
      const qs = params.toString();
      navigate(`/messages${qs ? `?${qs}` : ''}`, { replace: true });
    }
    setSelectedConversation(null);
  }, [location.search, navigate]);

  if (selectedConversation) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-[calc(100vh-8rem)]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <ChatView
          conversation={selectedConversation}
          onBack={closeConversation}
          message={message}
          onMessageChange={handleTyping}
          onSend={handleSendMessage}
          isSending={isSending}
          typingUsers={typingUsers}
          onTypingChange={(isTyping) => setTyping(selectedConversation.id, isTyping)}
          connectionStatus={connectionStatus}
          onArchive={() => {
            archiveConversation(selectedConversation.id);
            closeConversation();
          }}
          onBlock={handleBlockConversationUser}
          isBlockedByMe={isBlockedByMe}
          onClearConversation={handleClearConversation}
          onDeleteConversation={() => {
            import('@/lib/supabaseExternal').then(async ({ supabase }) => {
              await supabase.from('messages').delete().eq('conversation_id', selectedConversation.id);
              await supabase.from('conversation_participants').delete().eq('conversation_id', selectedConversation.id);
              await supabase.from('conversations').delete().eq('id', selectedConversation.id);
              toast.success('Conversa excluída para todos');
              closeConversation();
            });
          }}
          isFreePlan={isFreePlan}
          canSendMessage={canSendMessage}
          remainingMessages={remainingMessages}
          maxMessages={limits.maxMessagesPerDay}
          onSendGiftMessage={(text) => { void sendMessage(selectedConversation.id, text); }}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)]">
      <ConnectionIndicator status={connectionStatus} />

      <ChatSoundToggle />

      <div className="flex border-b border-border/30">

        <button
          onClick={() => setActiveTab('inbox')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 min-h-[3rem]",
            activeTab === 'inbox'
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageCircle className="h-4 w-4" />
          Inbox
          {totalUnreadCount > 0 && (
            <Badge className="bg-primary text-white text-[10px] h-5 min-w-5 p-0 flex items-center justify-center">
              {totalUnreadCount}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 min-h-[3rem]",
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
          className="m-1 h-10 shrink-0 px-3 text-xs"
          onClick={() => markTabAsRead(activeTab)}
        >
          Marcar como lidas
        </Button>
      </div>

      {/* Search Bar - busca usuários E mensagens */}
      <div className="px-3 py-2 border-b border-border/20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={userSearchQuery || searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setUserSearchQuery(val);
              handleSearch(val);
            }}
            placeholder="Buscar usuário ou mensagem..."
            className="pl-9 pr-8 h-9 text-sm bg-muted/30 border-border/30"
          />
          {(userSearchQuery || isSearchActive) && (
            <button
              onClick={() => { setUserSearchQuery(''); clearSearch(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Banner fixo: ativar/desativar som de mensagens */}
      <ChatSoundQuickBanner />





      {/* User search results - nova conversa */}
      {userSearchQuery.trim().length >= 2 && (userSearchResults?.length ?? 0) > 0 && (
        <div className="border-b border-border/20 bg-muted/10">
          <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Iniciar conversa
          </p>
          {(searchingUsers ? [] : userSearchResults ?? []).map((u) => (
            <button
              key={u.id}
              onClick={() => handleStartChatWithUser(u)}
              disabled={startingChatWith === u.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/10 last:border-0 min-h-[3.5rem]"
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={u.avatar_url || ''} loading="lazy" />
                <AvatarFallback>{getHandleInitial(u as any)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate">{getPublicHandle(u as any)}</p>
                {u.username && <p className="text-xs text-muted-foreground truncate">@{u.username}</p>}

              </div>
              {startingChatWith === u.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <MessageCircle className="h-4 w-4 text-primary shrink-0" />
              )}
            </button>
          ))}
          {searchingUsers && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {/* Message Search Results */}
      {isSearchActive && !userSearchQuery.trim() ? (
        <div className="flex-1">
          {searching ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center p-4">
              <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada</p>
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
                    setUserSearchQuery('');
                  }
                }}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors border-b border-border/20 min-h-[4rem]"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={r.other_user_avatar || ''} loading="lazy" />
                  <AvatarFallback>{r.other_user_name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{r.other_user_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.content}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </span>
              </button>
            ))
          )}
        </div>
      ) : userSearchQuery.trim().length >= 2 ? (
        <div className="flex-1">
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
            <p className="text-sm text-muted-foreground">
              {(userSearchResults?.length ?? 0) === 0 && !searchingUsers ? 'Nenhum usuário encontrado' : ''}
            </p>
          </div>
        </div>
      ) : (
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-4">
            <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">
              {activeTab === 'inbox' ? 'Nenhuma mensagem ainda' : 'Nenhuma conversa arquivada'}
            </p>
          </div>
        ) : (
          conversations
            .filter(c => {
              const isArchived = c.self_is_archived;
              return activeTab === 'inbox' ? !isArchived : isArchived;
            })
              .map((conv) => {
              const other = getOtherParticipant(conv);
              const isTypingNow = (typingUsers.get(conv.id)?.length ?? 0) > 0;
              const hasSuperDm = conv.has_unread_priority && (conv.total_priority_amount || 0) > 0;

              return (
                  <div key={conv.id} className="relative">
                  <button
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 pr-14 transition-all border-b relative min-h-[4rem]",
                      hasSuperDm
                        ? "bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-amber-500/20 border-amber-400/50"
                        : "hover:bg-muted/30 border-border/20"
                    )}
                  >
                  {hasSuperDm && (
                    <div className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-400/30">
                      <Sparkles className="h-3 w-3 text-amber-400" />
                      <span className="text-[10px] font-bold text-amber-400">+{conv.total_priority_amount}</span>
                    </div>
                  )}
                  <div className="relative">
                    <Avatar className={cn("h-12 w-12", hasSuperDm && "ring-2 ring-amber-400/60")}>
                      <AvatarImage src={other?.avatar_url || ''} alt={getPublicHandle(other as any)} loading="lazy" />
                      <AvatarFallback>{getHandleInitial(other as any)}</AvatarFallback>

                    </Avatar>
                    <div
                      className={cn(
                        "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
                        isReallyOnline(other as any) ? "bg-[hsl(142,76%,46%)]" : "bg-[hsl(0,84%,60%)]"
                      )}
                      aria-label={isReallyOnline(other as any) ? "Online" : "Offline"}
                    />
                    {conv.unread_count > 0 && (
                      <span
                        className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center border-2 border-background shadow-lg"
                        aria-label={`${conv.unread_count} mensagens não lidas`}
                      >
                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        "font-medium truncate text-sm",
                        conv.unread_count > 0 ? "text-foreground" : "text-foreground/80"
                      )}>
                        {getPublicHandle(other as any)}
                        {(other as any)?.is_verified_couple && (
                          <VerifiedCoupleBadge size="sm" className="ml-1 inline-flex" />
                        )}
                      </p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {conv.last_message ? formatTime(conv.last_message.created_at) : ''}
                      </span>
                    </div>
                    <p className={cn(
                      "text-xs truncate",
                      conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {isTypingNow ? (
                        <span className="text-primary italic">Digitando...</span>
                      ) : hasSuperDm ? (
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-amber-400 inline" />
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
            })
        )}
      </div>
      )}

      <UpsellModal
        open={showUpsell}
        onOpenChange={setShowUpsell}
        restrictionType="messages"
      />
    </div>
  );
}



// Full-screen chat view for mobile
// ChatView extracted to @/components/chat/messages/ChatView for lazy loading

// Mock chat view removed - all data from Supabase
