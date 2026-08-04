import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { shouldTrackWelcomeView, useWelcomeLabels, trackWelcomeAction } from '@/hooks/useWelcomeLabels';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  FileText,
  Loader2,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { LinkPreview } from '@/components/chat/LinkPreview';
import { StoryReplyPreview } from '@/components/chat/StoryReplyPreview';
import type { Message } from '@/hooks/useChat';
import { ChatVideoPlayer } from './ChatVideoPlayer';
import { PdfMessage } from '@/components/chat/PdfMessage';
import { MediaLightbox } from '@/components/chat/MediaLightbox';
import { Maximize2 } from 'lucide-react';

type WelcomeMessage = Message & { is_auto_reply?: boolean | null };
type NavigatorWithShare = Navigator & {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
};

// Marcador do reply embutido no content (mesmo formato de ChatMediaInput).
const REPLY_MARKER_RE = /^\u200B↪\|([^\n]*)\|\u200B\n?/;
function parseReplyMarker(content: string): { quote: string | null; body: string } {
  const m = content.match(REPLY_MARKER_RE);
  if (!m) return { quote: null, body: content };
  return { quote: m[1] || '', body: content.slice(m[0].length) };
}

const getVisibleText = (value: string) =>
  value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();

export const ChatBubble = memo(function ChatBubble({ 
  msg, 
  isMine, 
  formatTime,
  onRetry,
  isFreePlan,
  onMediaBlocked,
  onDelete,
  onReply,
  selectionMode,
  selected,
  deleting,
  onToggleSelect,
  onStartSelection,
  userId,
}: { 
  msg: Message; 
  isMine: boolean; 
  formatTime: (d: string) => string;
  onRetry?: (msg: Message) => void;
  isFreePlan?: boolean;
  onMediaBlocked?: () => void;
  onDelete?: (messageId: string, forEveryone: boolean) => Promise<{ error: Error | null }> | void;
  onReply?: (msg: Message) => void;
  selectionMode?: boolean;
  selected?: boolean;
  deleting?: boolean;
  onToggleSelect?: (messageId: string) => void;
  onStartSelection?: (messageId: string) => void;
  userId?: string;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [localDeleting, setLocalDeleting] = useState(false);
  const [lightbox, setLightbox] = useState<null | 'image' | 'video'>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasError = msg._status === 'error';
  const isSending = msg._status === 'sending';
  const isDeleting = deleting || localDeleting;

  // Infer media_type from URL if null/undefined
  const inferredMediaType = (() => {
    if (msg.media_type) return msg.media_type;
    if (!msg.media_url) return null;
    const url = msg.media_url.toLowerCase();
    if (url.match(/\.pdf(\?|$)/)) return 'document';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/)) return 'image';
    if (url.match(/\.(mp4|webm|mov|avi)(\?|$)/)) return 'video';
    if (url.match(/\.(mp3|wav|ogg|webm|m4a|aac)(\?|$)/)) return 'audio';
    return 'image';
  })();

  const isSticker = msg.media_type === 'sticker';
  const isImageSticker = isSticker && !!msg.media_url;
  const isAudio = inferredMediaType === 'audio';
  const isVideo = inferredMediaType === 'video';
  const isImage = inferredMediaType === 'image' && !isImageSticker;
  const isDocument = inferredMediaType === 'document';
  const hasMedia = (isAudio || isVideo || isImage || isDocument) && !!msg.media_url;
  const mediaBlocked = false;
  const uploadProgress = typeof msg._uploadProgress === 'number' ? Math.max(0, Math.min(100, msg._uploadProgress)) : null;
  const parsedMessageContent = parseReplyMarker(msg.content || '');
  const hasRenderableText = !isImageSticker && (parsedMessageContent.quote !== null || getVisibleText(parsedMessageContent.body).length > 0);

  // Check if message is deleted
  const isDeletedForEveryone = msg.deleted_for_everyone;
  const isDeletedForMe = userId && msg.deleted_by?.includes(userId);

  const canDelete = !hasError && !isSending && !isDeleting;

  const handleSingleDelete = useCallback(async (forEveryone: boolean) => {
    setLocalDeleting(true);
    try {
      await onDelete?.(msg.id, forEveryone);
    } finally {
      setLocalDeleting(false);
    }
  }, [msg.id, onDelete]);

  // Long-press handler for mobile
  const handleTouchStart = useCallback(() => {
    if (!canDelete) return;
    longPressTimerRef.current = setTimeout(() => {
      onStartSelection?.(msg.id);
    }, 500);
  }, [canDelete, msg.id, onStartSelection]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const deletedLabel = isDeletedForMe ? 'Mensagem apagada para mim' : 'Mensagem apagada';
  const deleteButton = canDelete && !selectionMode ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShowActions(true);
      }}
      className={cn(
        "absolute top-1 z-30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-destructive shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isMine ? "right-1" : "left-1"
      )}
      aria-label="Apagar mensagem"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  ) : null;
  const deleteDialogs = (
    <>
      <AlertDialog open={showActions} onOpenChange={setShowActions}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Opções da mensagem</AlertDialogTitle>
            <AlertDialogDescription>O que deseja fazer com esta mensagem?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            {onReply && (
              <AlertDialogAction
                onClick={() => onReply(msg)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <CornerUpLeft className="h-4 w-4 mr-2" />
                Responder
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={() => handleSingleDelete(false)} className="bg-muted text-foreground hover:bg-muted/80">
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar para mim
            </AlertDialogAction>
            {isMine && (
              <AlertDialogAction onClick={() => setShowDeleteDialog(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <Ban className="h-4 w-4 mr-2" />
                Apagar para todos
              </AlertDialogAction>
            )}
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja apagar esta mensagem para todos?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction onClick={() => handleSingleDelete(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Apagar para todos
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // Render "Mensagem apagada" placeholder
  if (isDeletedForEveryone || isDeletedForMe) {
    return (
      <>
        <div className={cn("flex items-start gap-2 w-full min-w-0", isMine ? "justify-end" : "justify-start")}>
          <div className={cn("relative max-w-[calc(100%-3rem)] sm:max-w-[78%] space-y-0.5 min-w-0 break-words", isMine ? "pl-0 pr-10" : "pl-10 pr-0")}>

            {deleteButton}
            <div className={cn(
              "rounded-2xl border border-border/50 px-4 py-2 text-sm flex items-center gap-2 italic",
              isMine
                ? "bg-primary/10 text-muted-foreground rounded-tr-sm"
                : "bg-muted/60 text-muted-foreground rounded-tl-sm"
            )}>
              <Ban className="h-3.5 w-3.5 shrink-0" />
              <span>{deletedLabel}</span>
            </div>
            <div className={cn("flex items-center gap-1 mt-0.5", isMine ? "justify-end" : "justify-start")}>
              <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">{formatTime(msg.created_at)}</span>
            </div>
          </div>
        </div>
        {deleteDialogs}
      </>
    );
  }

  // Mensagem destacada de "Chamar atenção" — visualmente diferenciada
  if (msg.media_type === 'attention_ping') {
    return (
      <div className={cn("flex items-start gap-2 w-full min-w-0", isMine ? "justify-end" : "justify-start")}>
        <div className={cn("relative max-w-[calc(100%-3rem)] sm:max-w-[78%] min-w-0 break-words", isMine ? "pl-0 pr-10" : "pl-10 pr-0")}>

          <div className={cn(
            "rounded-2xl border-2 px-4 py-3 text-sm flex items-center gap-2.5 shadow-sm",
            "border-[#D4AF37] bg-gradient-to-r from-[#D4AF37]/15 via-[#FFD700]/10 to-[#D4AF37]/15",
            "text-[#7a5d10] dark:text-[#FFD700]",
            "animate-pulse-subtle"
          )}>
            <span className="text-lg leading-none" aria-hidden>📣</span>
            <span className="font-semibold">{msg.content || 'Chamada de atenção'}</span>
          </div>
          <div className={cn("flex items-center gap-1 mt-0.5", isMine ? "justify-end" : "justify-start")}>
            <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">
              {formatTime(msg.created_at)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Evita renderizar bolhas vazias: elas aparecem no histórico como uma faixa cinza.
  if (!isDeleting && !hasMedia && !isImageSticker && !hasRenderableText && !msg.story_reply_id) {
    return null;
  }

  return (
    <>
      <div className={cn("flex items-start gap-2 w-full min-w-0", isMine ? "justify-end" : "justify-start", "group")}>
        {selectionMode && !isMine && (
          <button
            type="button"
            onClick={() => onToggleSelect?.(msg.id)}
            className={cn("mt-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background", selected && "border-primary bg-primary text-primary-foreground")}
            aria-label={selected ? "Mensagem selecionada" : "Selecionar mensagem"}
          >
            {selected && <Check className="h-4 w-4" />}
          </button>
        )}
        <div 
          className={cn("relative max-w-[calc(100%-3rem)] sm:max-w-[78%] min-w-0 break-words", isMine ? "pl-0 pr-10" : "pl-10 pr-0")}

          onClick={(e) => {
            if (selectionMode) {
              onToggleSelect?.(msg.id);
              return;
            }
            // Evita abrir ao clicar em mídia/links/botões internos
            const target = e.target as HTMLElement;
            if (target.closest('button, a, video, img, input, textarea, [role="button"]')) return;
            if (canDelete && onReply) {
              setShowActions(true);
            }
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onContextMenu={(e) => {
            if (canDelete) {
              e.preventDefault();
              setShowActions(true);
            }
          }}
        >
          {deleteButton}

          {isDeleting && (
            <div className={cn(
              "rounded-2xl px-4 py-2 text-sm flex items-center gap-2",
              isMine ? "bg-primary/80 text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"
            )}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Apagando…
            </div>
          )}

          {!isDeleting && msg.story_reply_id && msg.story && (
            <div className="mb-1">
              <StoryReplyPreview
                storyThumbnail={msg.story.media_url}
                storyText={msg.story.content_text}
                authorName={msg.story.author?.name || ''}
              />
            </div>
          )}

          {/* Audio message */}
          {!isDeleting && isAudio && msg.media_url && !mediaBlocked && (
            <AudioPlayer src={msg.media_url} isMine={isMine} />
          )}
          {/* Image message — clique para fullscreen */}
          {!isDeleting && isImage && msg.media_url && !mediaBlocked && (
            <div className={cn("rounded-2xl overflow-hidden mb-1", isMine ? "rounded-tr-sm" : "rounded-tl-sm")}>
              {isSending && uploadProgress !== null && (
                <div className="mb-1 rounded-xl border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{msg._uploadLabel || 'Preparando mídia…'} {uploadProgress}%</div>
                  <div className="h-1 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setLightbox('image')}
                className="relative block w-full group"
                aria-label="Abrir imagem em tela cheia"
              >
                <img
                  src={msg.media_url}
                  alt=""
                  className="max-w-full max-h-[300px] object-contain rounded-2xl"
                  loading="lazy"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
                <span className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-90 group-hover:opacity-100">
                  <Maximize2 className="h-3.5 w-3.5" />
                </span>
              </button>
            </div>
          )}
          {/* Video message — clique no botão para fullscreen */}
          {!isDeleting && isVideo && msg.media_url && !mediaBlocked && (
            <div className="relative">
              {isSending && uploadProgress !== null && (
                <div className="mb-1 rounded-xl border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{msg._uploadLabel || 'Preparando vídeo…'} {uploadProgress}%</div>
                  <div className="h-1 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              )}
              <ChatVideoPlayer src={msg.media_url} isMine={isMine} />
              <button
                type="button"
                onClick={() => setLightbox('video')}
                className="absolute top-2 right-2 z-20 h-8 w-8 rounded-full bg-fuchsia-600/90 hover:bg-fuchsia-500 text-white flex items-center justify-center shadow-md ring-2 ring-white/15"
                aria-label="Abrir vídeo em tela cheia"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          )}
          {/* Document (PDF) — miniatura + modal viewer */}
          {!isDeleting && isDocument && msg.media_url && (
            <PdfMessage
              mediaUrl={msg.media_url}
              fileName={msg.content && msg.content.startsWith('📎') ? msg.content.replace('📎 ', '') : 'Documento PDF'}
              isMine={isMine}
            />
          )}
          {/* Sticker de IMAGEM (upload PNG/WEBP) — sem bolha, tamanho fixo grande */}
          {!isDeleting && isImageSticker && msg.media_url && (
            <div className={cn("mb-1", isMine ? "text-right" : "text-left")}>
              <img
                src={msg.media_url}
                alt="figurinha"
                className="inline-block max-h-[180px] max-w-[180px] object-contain select-none drop-shadow-sm"
                loading="lazy"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          )}
          {/* Text content (hide generic emoji for media-only) */}
          {!isDeleting && hasRenderableText && !(isAudio && msg.content === '🎤 Mensagem de áudio') && !(((isImage || isVideo) && msg.content === '📷')) && !(isDocument && msg.content?.startsWith('📎')) && (() => {
            const { quote: replyQuote, body: contentBody } = parsedMessageContent;
            const welcomeMessage = msg as WelcomeMessage;
            
            // Fallback: Se não for marcado como auto_reply, mas o conteúdo bater com o template padrão ou o texto solicitado
            const isOcultoLink = typeof contentBody === 'string' && /creator-invite\//i.test(contentBody);
            const matchesTemplate = typeof contentBody === 'string' && (
              /selecionado\(a\)/i.test(contentBody) || 
              /Plataforma de Rede Social exclusiva/i.test(contentBody) ||
              /monetizado\(a\)/i.test(contentBody) ||
              /oportunidade/i.test(contentBody)
            );

            const isWelcome = (!!welcomeMessage.is_auto_reply || (isOcultoLink && matchesTemplate)) && isOcultoLink;

            const referralLink = isWelcome
              ? (contentBody.match(/https?:\/\/\S*creator-invite\/[^\s)]+/i)?.[0] ?? null)
              : null;
            return (
            <div className="relative group/bubble">
              {/* Tag especial: agradecimento por presente XP */}
              {contentBody.startsWith('🎁❤️😘') && (
                <div className={cn("flex mb-1", isMine ? "justify-end" : "justify-start")}>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold border-0 shadow-sm">
                    🎁 Agradecimento de presente
                  </span>
                </div>
              )}
              {/* Tag especial: boas-vindas automáticas */}
              {isWelcome && (
                <WelcomeBlock
                  isMine={isMine}
                  referralLink={referralLink}
                  messageId={msg.id}
                  userId={userId}
                />
              )}
              {(() => {
                // Figurinha de TEXTO (emoji-sticker): só quando vem da aba
                // Figurinhas com media_type='sticker'. Emojis da aba Emojis
                // ficam como texto normal dentro da bolha.
                const rawBody = contentBody || '';
                const isTextSticker =
                  !isDeleting &&
                  !replyQuote &&
                  !isWelcome &&
                  isSticker &&
                  !msg.media_url;
                if (isTextSticker) {
                  const stickerBody = rawBody.replace(/^\uFEFF+/, '');
                  return (
                    <div className={cn(
                      "leading-none select-none",
                      "text-[96px] sm:text-[112px]",
                      isMine ? "text-right" : "text-left",
                      selected && "ring-2 ring-primary rounded-2xl p-1"
                    )}>
                      {stickerBody}
                    </div>
                  );
                }
                return (
                  <div className={cn(
                    "max-w-full overflow-hidden rounded-2xl px-4 py-2 text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
                    isMine
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted rounded-tl-sm",
                    hasError && "opacity-70 border border-destructive/50",
                    isSending && "opacity-60",
                    selected && "ring-2 ring-primary",
                    contentBody.startsWith('🎁❤️😘') && "ring-2 ring-amber-400/60",
                    isWelcome && "ring-1 ring-amber-400/50 bg-gradient-to-br from-amber-500/10 via-background to-background"
                  )}>
                    {replyQuote !== null && (
                      <div
                        className={cn(
                          "mb-1.5 -mx-1 flex items-start gap-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] italic",
                          isMine
                            ? "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground/80"
                            : "border-primary/70 bg-background/60 text-muted-foreground"
                        )}
                      >
                        <CornerUpLeft className="mt-[1px] h-3 w-3 shrink-0 opacity-70" />
                        <span className="line-clamp-2 break-words">{replyQuote || '— mídia —'}</span>
                      </div>
                    )}
                    {isDeleting ? 'Apagando…' : contentBody}
                    <LinkPreview text={contentBody} isMine={isMine} />
                    {isWelcome && referralLink && (
                      <WelcomeActions referralLink={referralLink} />
                    )}
                  </div>
                );
              })()}


              {!!msg.content && !isDeleting && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      await navigator.clipboard.writeText(msg.content || '');
                      toast.success('Mensagem copiada!');
                    } catch {
                      toast.error('Não foi possível copiar.');
                    }
                  }}
                  className={cn(
                    "absolute -top-2 h-7 w-7 rounded-full bg-background/95 border border-border shadow-sm flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background opacity-100 sm:opacity-0 sm:group-hover/bubble:opacity-100 transition-opacity z-10",
                    isMine ? "-left-2" : "-right-2"
                  )}
                  aria-label="Copiar mensagem"
                  title="Copiar mensagem"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            );
          })()}

          <div className={cn("flex items-center gap-1 mt-0.5", isMine ? "justify-end" : "justify-start")}>
            <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">{formatTime(msg.created_at)}</span>
            {isMine && hasError && (
              <button
                onClick={() => onRetry?.(msg)}
                className="flex items-center gap-0.5 text-destructive"
                title="Toque para reenviar"
              >
                <AlertCircle className="h-3 w-3" />
                <RotateCcw className="h-2.5 w-2.5" />
              </button>
            )}
            {isMine && isSending && (
              <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" aria-label="Enviando" />
            )}
            {isDeleting && (
              <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" aria-label="Apagando" />
            )}
            {isMine && !hasError && !isSending && (
              msg.is_read || msg._status === 'read'
                ? <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Lida" />
                : msg._status === 'delivered'
                  ? <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Entregue" />
                  : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Enviada" />
            )}
          </div>
        </div>
        {selectionMode && isMine && (
          <button
            type="button"
            onClick={() => onToggleSelect?.(msg.id)}
            className={cn("mt-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background", selected && "border-primary bg-primary text-primary-foreground")}
            aria-label={selected ? "Mensagem selecionada" : "Selecionar mensagem"}
          >
            {selected && <Check className="h-4 w-4" />}
          </button>
        )}
      </div>

      {deleteDialogs}
      {lightbox && msg.media_url && (
        <MediaLightbox
          url={msg.media_url}
          type={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
});

// =====================================================================
// Welcome message sub-components (badge + action buttons)
// Labels vêm do admin (oculto_welcome_message_settings) e cliques são
// contabilizados em oculto_welcome_message_metrics para medir indicações.
// =====================================================================

function WelcomeBlock({
  isMine,
  referralLink,
  messageId,
  userId,
}: {
  isMine: boolean;
  referralLink: string | null;
  messageId: string;
  userId?: string;
}) {
  const labels = useWelcomeLabels(true);
  useEffect(() => {
    if (referralLink && shouldTrackWelcomeView(messageId, userId)) {
      trackWelcomeAction('view');
    }
  }, [referralLink, messageId, userId]);
  return (
    <div className={cn('flex mb-1', isMine ? 'justify-end' : 'justify-start')}>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-black text-[10px] font-bold border-0 shadow-sm">
        <Sparkles className="h-3 w-3" /> {labels.badge_text}
      </span>
    </div>
  );
}

function WelcomeActions({ referralLink }: { referralLink: string }) {
  const labels = useWelcomeLabels(true);
  const navigatorWithShare = typeof navigator !== 'undefined' ? (navigator as NavigatorWithShare) : null;
  return (
    <div className="mt-3 pt-3 border-t border-amber-400/30 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(referralLink);
            trackWelcomeAction('copy');
            toast.success('Link de divulgação copiado!');
          } catch {
            toast.error('Não foi possível copiar.');
          }
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors"
      >
        <Copy className="h-3.5 w-3.5" /> {labels.copy_button_label}
      </button>
      {navigatorWithShare?.share && (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await navigatorWithShare.share?.({
                title: 'OCULTO',
                text: 'Entre no OCULTO com meu link:',
                url: referralLink,
              });
              trackWelcomeAction('share');
            } catch {/* user canceled */}
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/60 hover:bg-background border border-amber-400/40 text-amber-300 text-xs font-semibold transition-colors"
        >
          <Share2 className="h-3.5 w-3.5" /> {labels.share_button_label}
        </button>
      )}
    </div>
  );
}

