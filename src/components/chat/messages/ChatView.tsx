import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  Copy,
  Flag,
  Loader2,
  MessageCircle,
  Paperclip,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useIncrementUsage } from "@/hooks/useFreePlanLimits";
import { useVipChatAccess } from "@/hooks/useVipChatAccess";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";
import type { Conversation, Message } from "@/hooks/useChat";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { LockedMediaMessage } from "@/components/chat/LockedMediaMessage";
import { VipChatPaywall } from "@/components/chat/VipChatPaywall";
import { ChatMediaInput, type ChatMediaInputHandle } from "@/components/chat/ChatMediaInput";
import { ChatSafetyGuidelinesModal } from "@/components/chat/ChatSafetyGuidelinesModal";
import { formatLastSeen } from "@/components/chat/LinkPreview";
import { UpsellModal } from "@/components/UpsellModal";
import { isReallyOnline } from "@/lib/onlineStatus";
import { isSelfChatId, resolveChatIdentity } from '@/lib/chatIdentity';
import { toast } from "sonner";
import {
  ChatBubble,
  ChatHeaderMenu,
  ConnectionIndicator,
  formatChatTimestamp,
  formatExactLastSeen,
  uploadReportEvidence,
} from "@/components/chat/messages";
import type { ChatTimestampMode } from "@/components/chat/messages";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { playTestSound } from "@/lib/messageSound";
import { AttentionPingButton } from "@/components/chat/AttentionPingButton";
import { SurveyTriggerInChat } from "@/components/survey/SurveyTriggerInChat";
import { getPublicHandle, getHandleInitial } from "@/lib/userHandle";


export interface ChatViewProps {
  conversation: Conversation;
  onBack: () => void;
  message: string;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  typingUsers: Map<string, string[]>;
  connectionStatus: 'connected' | 'reconnecting' | 'error';
  onArchive: () => void;
  onBlock: () => void;
  onClearConversation: () => void;
  onDeleteConversation: () => void;
  isFreePlan: boolean;
  canSendMessage: boolean;
  remainingMessages: number;
  maxMessages: number;
  onSendGiftMessage?: (text: string) => void | Promise<void>;
  /** Broadcast "Digitando..." para o destinatário (best-effort). */
  onTypingChange?: (isTyping: boolean) => void;
  /** True quando o usuário atual já bloqueou o outro — habilita "Desbloquear". */
  isBlockedByMe?: boolean;
}

export function ChatView({
  conversation,
  onBack,
  message,
  onMessageChange,
  onSend,
  isSending,
  typingUsers,
  connectionStatus,
  onArchive,
  onBlock,
  onClearConversation,
  onDeleteConversation,
  isFreePlan,
  canSendMessage,
  remainingMessages,
  maxMessages,
  onSendGiftMessage,
  onTypingChange,
  isBlockedByMe = false,
}: ChatViewProps) {
  const { user } = useAuth();
  const [giftOpen, setGiftOpen] = useState(false);
  const incrementUsage = useIncrementUsage();
  const { isBeta } = usePlatformPhase();
  const { messages, loading, loadingMore, hasMore, loadMore, deleteMessage, deleteMessages, sendOptimisticMessage, updateOptimisticMessage, removeOptimisticMessage, finalizeOptimisticMessage, refetch: refetchMessages } = useMessages(conversation.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Fallback: quando a conversa foi aberta otimisticamente sem participants,
  // busca o perfil do outro usuário para evitar "Carregando..." infinito.
  // Estratégia: tenta via conversation_participants; se falhar (RLS), usa ?to=<profileId> da URL.
  const [fallbackOther, setFallbackOther] = useState<any>(null);
  const [liveOther, setLiveOther] = useState<any>(null);
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

  useEffect(() => {
    const hasParticipant = (conversation.participants?.length ?? 0) > 0;
    if (hasParticipant || !conversation.id || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { supabase } = await import('@/lib/supabaseExternal');

      // 1) Tenta via conversation_participants
      try {
        const { data: parts } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversation.id)
          .not('user_id', 'in', `(${(selfIds.length > 0 ? selfIds : [user.id]).map(id => `"${id}"`).join(',')})`)
          .limit(1);
        const otherUserId = parts?.[0]?.user_id;
        if (otherUserId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, user_id, name, username, avatar_url, is_online, last_seen, show_online_status, profile_type, is_verified, is_verified_couple, plan_type, is_creator, accept_super_dm, min_super_dm_price')
            .eq('user_id', otherUserId)
            .maybeSingle();
          if (!cancelled && profile) {
            setFallbackOther(profile);
            return;
          }
        }
      } catch (e) {
        console.warn('[ChatView] participants lookup failed:', e);
      }

      // 2) Fallback via URL ?to=<profileId>
      const params = new URLSearchParams(location.search);
      const toProfileId = params.get('to');
      if (toProfileId && !cancelled) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, user_id, name, username, avatar_url, is_online, last_seen, show_online_status, profile_type, is_verified, is_verified_couple, plan_type, is_creator, accept_super_dm, min_super_dm_price')
          .eq('id', toProfileId)
          .maybeSingle();
        if (!cancelled && profile) setFallbackOther(profile);
      }
    })();
    return () => { cancelled = true; };
  }, [conversation.id, conversation.participants, user?.id, location.search]);

  useEffect(() => {
    setLiveOther(conversation.participants[0]?.profile || fallbackOther || null);
  }, [conversation.participants, fallbackOther]);

  useEffect(() => {
    const baseOther = conversation.participants[0]?.profile || fallbackOther;
    if (!baseOther?.id && !baseOther?.user_id) return;

    const unsub = subscribeTable('profiles', (payload: any) => {
      const row = payload?.new;
      if (!row) return;
      if (baseOther?.id && row.id !== baseOther.id) return;
      if (!baseOther?.id && baseOther?.user_id && row.user_id !== baseOther.user_id) return;
      setLiveOther((prev: any) => ({ ...(prev || {}), ...row }));
    }, { events: ['UPDATE'] });

    return unsub;
  }, [conversation.id, conversation.participants, fallbackOther]);


  const other = liveOther || conversation.participants[0]?.profile || fallbackOther;
  const otherProfileId = conversation.participants[0]?.user_id || fallbackOther?.user_id;
  const vipAccess = useVipChatAccess(other?.id || otherProfileId);
  const isTyping = (typingUsers.get(conversation.id)?.length ?? 0) > 0;
  const prevMessagesLengthRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const pendingMediaRef = useRef<Record<string, { content: string; mediaType?: string; file?: File; localPreview?: string }>>({});
  const failedUploadsRef = useRef<Record<string, { file: File; mediaType: 'image' | 'video' | 'document'; localPreview?: string }>>({});
  const chatInputRef = useRef<ChatMediaInputHandle | null>(null);
  const countedTempIdsRef = useRef<Set<string>>(new Set());
  const [showMediaUpsell, setShowMediaUpsell] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [deletingMessageIds, setDeletingMessageIds] = useState<string[]>([]);
  const [timestampMode, setTimestampMode] = useState<ChatTimestampMode>('datetime');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [isReporting, setIsReporting] = useState(false);
  const selectionMode = selectedMessageIds.length > 0;
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; senderLabel?: string | null; isMine?: boolean } | null>(null);

  const handleReplyTo = useCallback((m: Message) => {
    if (!m) return;
    // Remove o marker antigo se a mensagem já era uma resposta
    const cleanContent = (m.content || '').replace(/^\u200B↪\|[^\n]*\|\u200B\n?/, '');
    const isMineMsg = !!user?.id && (selfIds.length > 0 ? selfIds.includes(m.sender_id) : m.sender_id === user.id);
    const label = isMineMsg ? 'você' : (m.sender?.name ? `@${m.sender.name}` : 'mensagem');
    setReplyTo({ id: m.id, content: cleanContent || (m.media_type ? '📎 mídia' : ''), senderLabel: label, isMine: isMineMsg });
  }, [user?.id, selfIds]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Trava scroll do body (em qualquer viewport) enquanto a conversa está aberta
  // para impedir que o cabeçalho do chat e o campo de digitação se movam junto
  // com o scroll da página. Apenas o histórico de mensagens (ScrollArea interno) rola.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);


  const acceptedDragTypes = useMemo(() => /^image\/(jpeg|jpg|png|gif|bmp|webp)$|^video\/mp4$|^application\/pdf$/i, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragOver(true);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const valid = files.filter((f) => acceptedDragTypes.test(f.type) || /\.(jpe?g|png|gif|bmp|webp|mp4|pdf)$/i.test(f.name));
    if (valid.length === 0) {
      toast.error('Formato não suportado. Use JPG, PNG, GIF, BMP, WEBP, MP4 ou PDF.');
      return;
    }
    if (valid.length > 1) toast('Enviando o primeiro arquivo. Repita o gesto para os demais.');
    if (chatInputRef.current?.acceptExternalFile) {
      await chatInputRef.current.acceptExternalFile(valid[0]);
    }
  }, [acceptedDragTypes]);


  // Track if user is near the bottom of the scroll
  // E dispara loadMore automaticamente quando o topo do histórico fica visível
  // (scroll infinito real, sem precisar clicar em "Carregar mensagens anteriores").
  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!el) return;
    const threshold = 150;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (el.scrollTop < 120 && hasMore && !loadingMore && !loading) {
      const prevHeight = el.scrollHeight;
      loadMore();
      // Mantém a posição visual após prepend dos itens mais antigos.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newEl = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
          if (newEl) newEl.scrollTop = newEl.scrollHeight - prevHeight;
        });
      });
    }
  }, [hasMore, loadingMore, loading, loadMore]);

  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Auto-retry: quando a conexão voltar, reenvia silenciosamente mensagens
  // que ficaram em estado de erro (texto puro — mídias usam o botão).
  useEffect(() => {
    const onOnline = () => {
      const failed = messages.filter(m => m._status === 'error' && !m.media_url && (m.content || '').trim());
      failed.forEach((m) => {
        updateOptimisticMessage(m.id, { _status: 'sending' } as Partial<Message>);
        sendOptimisticMessage(m.content);
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [messages, sendOptimisticMessage, updateOptimisticMessage]);


  // Smart auto-scroll: only if user is near bottom or it's a new own message
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && !loadingMore) {
      const lastMsg = messages[messages.length - 1];
      const isOwnMessage = lastMsg?.sender_id === user?.id;
      
      if (isNearBottomRef.current || isOwnMessage) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, loadingMore, user?.id]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!loading && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [loading]);

  // Local optimistic send — ensures messages appear instantly without page reload
  const handleSendLocal = useCallback(async () => {
    const text = (message || '').trim();
    if (!text) return;
    if (isBlockedByMe) {
      toast.error('Usuário bloqueado. Desbloqueie para enviar mensagens.');
      return;
    }
    onMessageChange(''); // limpa input já
    const { error } = await sendOptimisticMessage(text);
    if (error) {
      toast.error(error.message === 'chat_blocked' ? 'Usuário bloqueado. Desbloqueie para enviar mensagens.' : 'Erro ao enviar mensagem. Tente novamente.');
      return;
    }
    // Sem consumo de cota: chat liberado igualmente para todos os planos.
  }, [message, onMessageChange, sendOptimisticMessage, isFreePlan, canSendMessage, incrementUsage, isBeta, isBlockedByMe]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendLocal();
    }
  }, [handleSendLocal]);

  const formatMessageTime = useCallback((dateStr: string) =>
    formatChatTimestamp(dateStr, timestampMode), [timestampMode]);

  // Retry failed message — se for mídia com File preservado, refaz upload mantendo o tempId.
  const handleRetry = useCallback(async (msg: Message) => {
    const failed = failedUploadsRef.current[msg.id];
    if (failed && chatInputRef.current) {
      // Volta status para "sending" enquanto refaz upload
      updateOptimisticMessage(msg.id, { _status: 'sending', _uploadLabel: 'Reenviando…', _uploadProgress: 1 } as Partial<Message>);
      await chatInputRef.current.retryUpload({
        file: failed.file,
        mediaType: failed.mediaType,
        tempId: msg.id,
        localPreview: failed.localPreview,
      });
      return;
    }
    // Texto puro (ou mídia sem File preservado): tenta reenvio direto
    const result = await sendOptimisticMessage(msg.content, msg.media_url || undefined, msg.media_type || undefined);
    if (result.error) {
      toast.error('Falha ao reenviar. Verifique sua conexão.');
    }
  }, [sendOptimisticMessage, updateOptimisticMessage]);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(prev => prev.includes(messageId)
      ? prev.filter(id => id !== messageId)
      : [...prev, messageId]
    );
  }, []);

  const startMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(prev => prev.includes(messageId) ? prev : [...prev, messageId]);
  }, []);

  const handleBatchDelete = useCallback(async (forEveryone: boolean) => {
    const ids = selectedMessageIds.filter((id) => {
      const msg = messages.find(m => m.id === id);
      return msg && !msg.deleted_for_everyone && !(user?.id && msg.deleted_by?.includes(user.id)) && (!forEveryone || msg.sender_id === user?.id);
    });

    if (ids.length === 0) {
      toast.error(forEveryone ? 'Selecione mensagens enviadas por você' : 'Selecione ao menos uma mensagem');
      return;
    }

    setDeletingMessageIds(ids);
    const result = await deleteMessages(ids, forEveryone);
    setDeletingMessageIds([]);

    if (!result.error) {
      setSelectedMessageIds([]);
    }
  }, [deleteMessages, messages, selectedMessageIds, user?.id]);

  const handleSubmitReport = useCallback(async () => {
    if (!user?.id || !other?.id || !other?.user_id || !reportReason.trim()) {
      toast.error('Informe o motivo da denúncia');
      return;
    }

    setIsReporting(true);
    try {
      const evidenceUrls = await Promise.all(reportFiles.map(file => uploadReportEvidence(file, user.id, conversation.id)));
      const { data, error } = await supabase.functions.invoke('chat-report-freeze', {
        body: {
          conversation_id: conversation.id,
          reported_profile_id: other.id,
          reason: reportReason.trim(),
          evidence_urls: evidenceUrls,
        },
      });
      if (error || data?.success === false) throw new Error(data?.error || error?.message || 'Erro ao registrar denúncia');

      toast.success('Denúncia enviada. O usuário foi congelado por 7 dias para investigação.');
      setReportOpen(false);
      setReportReason('');
      setReportFiles([]);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao enviar denúncia');
    } finally {
      setIsReporting(false);
    }
  }, [conversation.id, other, reportFiles, reportReason, user?.id]);

  return (
    <div
      className="fixed inset-x-0 top-14 bottom-16 z-30 flex flex-col w-full max-w-full overflow-hidden bg-background md:bottom-0"

      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {isDragOver && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
          <div className="rounded-xl bg-background/90 px-4 py-3 text-center shadow-lg">
            <Paperclip className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-1 text-sm font-medium">Solte para anexar</p>
            <p className="text-[11px] text-muted-foreground">JPG, PNG, GIF, BMP, WEBP, MP4 ou PDF</p>
          </div>
        </div>
      )}
      <ChatSafetyGuidelinesModal
        conversationId={conversation.id}
        recipientName={other?.name || other?.username || undefined}
      />
      {/* Connection dot is now inline in header */}


      {/* Header — fixo no topo do container do chat ao rolar o histórico */}
      <div className="shrink-0 z-30 flex items-center gap-2 p-2.5 border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onBack(); }}
          aria-label="Voltar"
          className="min-h-[2.75rem] min-w-[2.75rem] relative z-50 rounded-full bg-yellow-400 text-black hover:bg-yellow-300 hover:text-black shadow-md ring-1 ring-yellow-500/40"
        >
          <ArrowLeft className="h-5 w-5 text-black" strokeWidth={2.5} />
        </Button>
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarImage src={other?.avatar_url || ''} alt={getPublicHandle(other as any)} loading="lazy" />
            <AvatarFallback>{getHandleInitial(other as any)}</AvatarFallback>

          </Avatar>
          <div
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${
              isReallyOnline(other as any) ? 'bg-[hsl(142,76%,46%)]' : 'bg-[hsl(0,84%,60%)]'
            }`}
            aria-label={isReallyOnline(other as any) ? 'Online' : 'Offline'}
          />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-medium leading-5">
              {getPublicHandle(other as any)}
            </p>
            {connectionStatus !== 'connected' && (
              <ConnectionIndicator status={connectionStatus} />
            )}
          </div>
          <p className="truncate text-xs leading-5 text-muted-foreground">
            {isTyping ? (
              <span className="text-primary">Digitando...</span>
            ) : isReallyOnline(other as any) ? 'Online' : (
              <span title={formatExactLastSeen(other?.last_seen)}>{formatLastSeen(other?.last_seen, other?.show_online_status)}</span>
            )}
          </p>
        </div>
        {!selectionMode && (
          <>
            <AttentionPingButton
              toUserId={other?.user_id || null}
              toProfileId={other?.id || otherProfileId || null}
              conversationId={conversation.id}
            />
          </>
        )}
        {selectionMode ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="shrink-0">
              {selectedMessageIds.length}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => setSelectedMessageIds([])} disabled={deletingMessageIds.length > 0} aria-label="Cancelar seleção">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <ChatHeaderMenu
            conversationId={conversation.id}
            profileId={other?.id || otherProfileId || ''}
            userName={getPublicHandle(other as any)}
            onReport={() => setReportOpen(true)}
            onArchive={onArchive}
            onBlock={onBlock}
            isBlockedByMe={isBlockedByMe}
            timestampMode={timestampMode}
            onToggleTimestamp={() => setTimestampMode(prev => prev === 'time' ? 'datetime' : 'time')}
            onClearConversation={onClearConversation}
            onDeleteConversation={onDeleteConversation}
            onSendGift={onSendGiftMessage ? () => {
              if (!other) { toast.info('Carregando perfil do destinatário…'); return; }
              setGiftOpen(true);
            } : undefined}
          />
        )}
      </div>


      {selectionMode && (
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/30 bg-background/95 px-3 py-2 text-xs backdrop-blur">
          <span className="font-medium text-foreground">
            {selectedMessageIds.length} mensagem(ns) selecionada(s)
          </span>
          <span className="text-muted-foreground">
            {deletingMessageIds.length > 0 ? 'Apagando…' : 'Toque nas mensagens para selecionar'}
          </span>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="chat-history-scroll scrollbar-hide flex-1 min-h-0 w-full max-w-full overflow-hidden overscroll-contain px-3 py-3 sm:px-4 sm:py-4 [&_[data-orientation=horizontal]]:!hidden [&_[data-orientation=vertical]]:!hidden [&_[data-radix-scroll-area-corner]]:!hidden [&_[data-radix-scroll-area-scrollbar]]:!hidden [&_[data-radix-scroll-area-thumb]]:!hidden [&_[data-radix-scroll-area-viewport]]:scrollbar-hide [&_[data-radix-scroll-area-viewport]]:!w-full [&_[data-radix-scroll-area-viewport]]:!overflow-x-hidden [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!w-full [&_[data-radix-scroll-area-viewport]>div]:min-w-0" ref={scrollAreaRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
            <p className="text-xs text-muted-foreground">Envie a primeira mensagem!</p>
          </div>
        ) : (
          <div className="space-y-3 w-full min-w-0 max-w-full">

            {hasMore && (
              <div className="flex justify-center pb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs text-muted-foreground"
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : null}
                  Carregar mensagens anteriores
                </Button>
              </div>
            )}

            {messages.map((msg) => {
              const isMine = isSelfChatId(msg.sender_id, selfIds.length > 0 ? selfIds : (user?.id ? [user.id] : []));
              const isDeleted = msg.deleted_for_everyone || (user?.id && msg.deleted_by?.includes(user.id));

              if (isDeleted) {
                return (
                  <ChatBubble
                    key={msg.id}
                    msg={msg}
                    isMine={isMine}
                    formatTime={formatMessageTime}
                    onDelete={deleteMessage}
                    selectionMode={selectionMode}
                    userId={user?.id}
                  />
                );
              }

              if (msg.is_locked && msg.media_url) {
                return (
                  <LockedMediaMessage
                    key={msg.id}
                    messageId={msg.id}
                    senderId={msg.sender_id}
                    mediaUrl={msg.media_url}
                    mediaType={(msg.media_type === 'video' ? 'video' : 'image') as 'image' | 'video'}
                    unlockPrice={msg.unlock_price || 0}
                    isUnlocked={msg.unlocked_by?.includes(user?.id || '') || false}
                    isOwnMessage={isMine}
                    timestamp={msg.created_at}
                    formatTimestamp={formatMessageTime}
                    onDelete={deleteMessage}
                  />
                );
              }

              return (
                <ChatBubble
                  key={msg.id}
                  msg={msg}
                  isMine={isMine}
                  formatTime={formatMessageTime}
                  onRetry={handleRetry}
                  isFreePlan={isFreePlan}
                  onMediaBlocked={() => setShowMediaUpsell(true)}
                  onDelete={deleteMessage}
                  selectionMode={selectionMode}
                  selected={selectedMessageIds.includes(msg.id)}
                  deleting={deletingMessageIds.includes(msg.id)}
                  onToggleSelect={toggleMessageSelection}
                  onStartSelection={startMessageSelection}
                  onReply={handleReplyTo}
                  userId={user?.id}
                />
              );
            })}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2">
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

      {selectionMode && (
        <div className="sticky bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="flex-1 min-w-[120px] gap-2"
              onClick={async () => {
                const text = messages
                  .filter((m) => selectedMessageIds.includes(m.id))
                  .map((m) => m.content || '')
                  .filter(Boolean)
                  .join('\n\n');
                if (!text) {
                  toast.error('Nada para copiar');
                  return;
                }
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                  } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                  toast.success(
                    selectedMessageIds.length > 1
                      ? `${selectedMessageIds.length} mensagens copiadas`
                      : 'Mensagem copiada'
                  );
                } catch {
                  toast.error('Não foi possível copiar');
                }
              }}
            >
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
            <Button
              className="flex-1 min-w-[120px] gap-2"
              onClick={() => handleBatchDelete(false)}
              disabled={deletingMessageIds.length > 0}
            >
              {deletingMessageIds.length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Apagar
            </Button>
            <Button
              variant="destructive"
              className="flex-1 min-w-[120px] gap-2"
              onClick={() => handleBatchDelete(true)}
              disabled={deletingMessageIds.length > 0}
            >
              <Ban className="h-4 w-4" />
              Para todos
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {selectedMessageIds.length} selecionada(s) · Copiar funciona para qualquer mensagem · Apagar remove só para mim
          </p>
        </div>
      )}

      {/* Message Input or VIP Paywall — fixo no rodapé do container do chat */}
      {vipAccess.isVipRecipient && !vipAccess.canSendFree && !isBeta ? (
        <div className="shrink-0">
          <VipChatPaywall
            recipientName={other?.name || 'Criador'}
            recipientId={other?.id || otherProfileId || ''}
            messageCost={vipAccess.messageCost}
            onPayPerMessage={() => {
              toast.info('Sistema de pagamento em implementação');
            }}
          />
        </div>
      ) : (
        <div className="shrink-0">
          <SurveyTriggerInChat
            otherUsername={other?.username}
            otherEmail={(other as any)?.email}
          />
          <ChatMediaInput
            ref={chatInputRef}
            conversationId={conversation.id}
            onTypingChange={onTypingChange}
            attentionToUserId={other?.user_id || null}
            attentionToProfileId={other?.id || otherProfileId || null}
            attentionConversationId={conversation.id}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onOpenGift={onSendGiftMessage ? () => {
              if (!other) { toast.info('Carregando perfil do destinatário…'); return; }
              setGiftOpen(true);
            } : undefined}
            onSendMessage={async (content, mediaUrl, mediaType) => {
              if (isBlockedByMe) {
                toast.error('Usuário bloqueado. Desbloqueie para enviar mensagens.');
                return;
              }
              const result = await sendOptimisticMessage(content, mediaUrl, mediaType);
              if (result.error) {
                toast.error(result.error.message === 'chat_blocked' ? 'Usuário bloqueado. Desbloqueie para enviar mensagens.' : 'Erro ao enviar mensagem. Tente novamente.');
                return;
              }
              // Sem consumo de cota: chat liberado igualmente para todos os planos.
            }}
            onOptimisticSend={(content, localPreview, mediaType, meta, file) => {
              if (isBlockedByMe) {
                toast.error('Usuário bloqueado. Desbloqueie para enviar mensagens.');
                return '';
              }
              const tempId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              pendingMediaRef.current[tempId] = { content, mediaType, file, localPreview };
              sendOptimisticMessage(content, localPreview, mediaType, undefined, {
                tempId,
                deferInsert: true,
                uploadProgress: meta?.progress ?? 1,
                uploadLabel: meta?.label || 'Preparando mídia…',
              });
              return tempId;
            }}
            onOptimisticConfirm={(tempId, realUrl, meta) => {
              updateOptimisticMessage(tempId, {
                media_url: realUrl,
                _uploadProgress: meta?.progress,
                _uploadLabel: meta?.label,
                _status: meta?.error ? 'error' : 'sending',
              } as Partial<Message>);
              if (meta?.progress === 100 && !meta?.error) {
                const pending = pendingMediaRef.current[tempId];
                finalizeOptimisticMessage(tempId, pending?.content || '📷', realUrl, pending?.mediaType).then((result) => {
                  delete pendingMediaRef.current[tempId];
                  delete failedUploadsRef.current[tempId];
                  if (result.error) {
                    toast.error('Erro ao enviar mídia');
                    return;
                  }
                  // Sem consumo de cota por plano para envio de mídia no chat.
                });
              }
            }}
            onUploadFailed={(tempId, file, mediaType) => {
              const pending = pendingMediaRef.current[tempId];
              failedUploadsRef.current[tempId] = {
                file,
                mediaType,
                localPreview: pending?.localPreview,
              };
            }}
            onUploadCancelled={(tempId) => {
              removeOptimisticMessage(tempId);
              delete pendingMediaRef.current[tempId];
              delete failedUploadsRef.current[tempId];
              countedTempIdsRef.current.delete(tempId);
            }}
            disabled={isSending || isBlockedByMe}
            isLoading={isSending}
            onMediaBlocked={() => setShowMediaUpsell(true)}
          />
        </div>
      )}

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto scrollbar-hide sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Flag className="h-5 w-5" />
              Denunciar usuário
            </DialogTitle>
            <DialogDescription>
              A conversa será copiada para a moderação e o usuário denunciado ficará congelado por 7 dias durante a investigação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chat-report-reason">Motivo da denúncia *</Label>
              <Textarea
                id="chat-report-reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Descreva o que aconteceu nesta conversa..."
                rows={4}
                maxLength={1200}
              />
              <p className="text-right text-[10px] text-muted-foreground">{reportReason.length}/1200</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-report-files">Prints da conversa</Label>
              <label htmlFor="chat-report-files" className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground hover:bg-muted/50">
                <Paperclip className="h-4 w-4" />
                Anexar prints
              </label>
              <input id="chat-report-files" type="file" accept="image/*" multiple className="hidden" onChange={(e) => setReportFiles(Array.from(e.target.files || []).slice(0, 6))} />
              {reportFiles.length > 0 && <p className="text-xs text-muted-foreground">{reportFiles.length} print(s) anexado(s)</p>}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReportOpen(false)} disabled={isReporting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleSubmitReport} disabled={isReporting || !reportReason.trim()} className="gap-2">
              {isReporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              Enviar denúncia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media Upsell Modal */}
      <UpsellModal
        open={showMediaUpsell}
        onOpenChange={setShowMediaUpsell}
        restrictionType="chat_media"
      />

      {/* Enviar Presente XP — destinatário travado no participante do chat */}
      {other && (
        <AuraXpGiftModal
          open={giftOpen}
          onOpenChange={setGiftOpen}
          lockedReceiver={{
            id: other.id,
            user_id: other.user_id ?? otherProfileId ?? null,
            username: other.username ?? null,
            name: other.name ?? null,
            avatar_url: other.avatar_url ?? null,
          }}
          title="Enviar presente"
          contextLabel="nesta conversa"
          onSent={({ amount }) => {
            try { onSendGiftMessage?.(`🎁 Presente enviado: ${amount} XP ✨`); } catch {}
            try { playTestSound(); } catch {}
          }}
        />
      )}
    </div>

  );
}

export default ChatView;
