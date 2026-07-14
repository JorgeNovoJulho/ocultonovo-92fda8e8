import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  MessageCircle, Send, Trash2, ChevronDown, ChevronUp,
  Snowflake, Reply, CornerDownRight, Heart, Pencil,
  Check, X, History, Lock, ShieldAlert, ThumbsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import { Input } from '@/components/ui/input';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { MentionInput, renderMentions } from '@/components/ui/MentionInput';
import {
  usePostComments, useCreateComment, useDeleteComment,
  useEditComment, buildCommentTree, getSpamWarning, PostComment,
} from '@/hooks/usePostComments';
import { useCommentLikeStatus, useLikeComment } from '@/hooks/useCommentLikes';
import {
  useCommentDislikeStatus, useCommentDislikeCounts, useDislikeComment,
} from '@/hooks/useCommentDislikes';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useCanPerformActions } from '@/hooks/useCanPerformActions';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { EditCountdown, DeleteConfirmation, EditHistoryModal } from '@/components/comments';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';

// Comentários carregam em lotes (scroll infinito)
const COMMENTS_PER_PAGE = 8;

interface PostCommentsSectionProps {
  postId: string;
  commentsCount: number;
  isBlocked?: boolean;
  /** Cobrar XP ao expandir (Ler comentários). Deve retornar true se permitido. */
  onBeforeExpand?: () => Promise<boolean> | boolean;
  /** Cobrar XP ao enviar comentário. Deve retornar true se permitido. */
  onBeforeSubmit?: () => Promise<boolean> | boolean;
}

interface CommentItemProps {
  comment: PostComment;
  postId: string;
  currentProfileId: string | undefined;
  onReply: (commentId: string, username: string) => void;
  onDelete: (commentId: string) => void;
  onLike: (commentId: string, isLiked: boolean) => void;
  onDislike: (commentId: string, isDisliked: boolean) => void;
  onEdit: (comment: PostComment) => void;
  onViewHistory: (comment: PostComment) => void;
  isLiked: boolean;
  isDisliked: boolean;
  dislikeCount: number;
  depth?: number;
  isPremiumOrVip: boolean;
  canLike: boolean;
}

function CommentItem({
  comment,
  postId,
  currentProfileId,
  onReply,
  onDelete,
  onLike,
  onDislike,
  onEdit,
  onViewHistory,
  isLiked,
  isDisliked,
  dislikeCount,
  depth = 0,
  isPremiumOrVip,
  canLike,
}: CommentItemProps) {
  const [canEdit, setCanEdit] = useState(true);
  const username = comment.author?.username || '';
  const isOwner = currentProfileId === comment.user_id;

  const canEditComment = useCallback(() => {
    if (!isOwner) return false;
    return (Date.now() - new Date(comment.created_at).getTime()) / (1000 * 60) <= 5;
  }, [isOwner, comment.created_at]);

  const handleEditExpire = useCallback(() => setCanEdit(false), []);

  return (
    <div className={cn('flex gap-2 group', depth > 0 && 'ml-8 pl-3 border-l border-border/50')}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={buildSupabaseImageThumb(comment.author?.avatar_url, { width: 96, quality: 70 }) || comment.author?.avatar_url || ''} />
        <AvatarFallback className="text-xs">
          {(comment.author?.username || '?')[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="bg-muted/30 rounded-lg p-2 relative">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium text-sm truncate">
              {comment.author?.username ? `@${comment.author.username}` : 'Usuário'}
            </span>

            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
            </span>
            {comment.updated_at && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-[10px] text-muted-foreground/70 italic hover:text-primary"
                onClick={() => onViewHistory(comment)}
              >
                <History className="h-3 w-3 mr-0.5" />
                editado
              </Button>
            )}
          </div>
          <p className="text-sm break-words">{renderMentions(comment.content, comment.mentioned_users)}</p>

          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(comment.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-6 px-2 text-xs', isLiked ? 'text-primary' : 'text-muted-foreground hover:text-primary')}
            onClick={() => onLike(comment.id, isLiked)}
            disabled={!canLike}
          >
            <Heart className={cn('h-3 w-3 mr-1', isLiked && 'fill-primary')} />
            {comment.likes_count > 0 && comment.likes_count}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={cn('h-6 px-2 text-xs', isDisliked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive')}
            onClick={() => onDislike(comment.id, isDisliked)}
            disabled={!canLike}
            title="Não gostei"
          >
            <ThumbsDown className={cn('h-3 w-3 mr-1', isDisliked && 'fill-destructive')} />
            {dislikeCount > 0 && dislikeCount}
          </Button>

          {isOwner && canEditComment() && canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(comment)}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Editar
            </Button>
          )}

          {isPremiumOrVip && depth === 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
              onClick={() => onReply(comment.id, username)}
            >
              <Reply className="h-3 w-3 mr-1" />
              Responder
            </Button>
          )}
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {comment.replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                postId={postId}
                currentProfileId={currentProfileId}
                onReply={onReply}
                onDelete={onDelete}
                onLike={onLike}
                onDislike={onDislike}
                onEdit={onEdit}
                onViewHistory={onViewHistory}
                isLiked={false}
                isDisliked={false}
                dislikeCount={0}
                depth={depth + 1}
                isPremiumOrVip={isPremiumOrVip}
                canLike={canLike}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal de aviso de spam ──────────────────────────────────────────────
function SpamWarningModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Atividade incomum detectada</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Para comentar livremente, valide sua identidade ou aguarde o intervalo mínimo.
        </p>
        <Button className="w-full" size="sm" onClick={onClose}>
          Entendi
        </Button>
      </div>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────
export function PostCommentsSection({
  postId,
  commentsCount,
  isBlocked = false,
  onBeforeExpand,
  onBeforeSubmit,
}: PostCommentsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [mentionedUsers, setMentionedUsers] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [editingComment, setEditingComment] = useState<PostComment | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [historyComment, setHistoryComment] = useState<PostComment | null>(null);
  const [spamWarning, setSpamWarning] = useState<string | null>(null);
  // ── Paginação lazy: quantos comentários exibir ──────────────────────
  const [visibleCount, setVisibleCount] = useState(COMMENTS_PER_PAGE);

  const { data: comments, isLoading, refetch } = usePostComments(postId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const editComment = useEditComment();
  const likeComment = useLikeComment();
  const dislikeComment = useDislikeComment();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { canAct, isFrozen } = useCanPerformActions();
  const { toast } = useToast();

  // Durante o BETA, usuários FREE recebem Premium social — comentários liberados.
  const { freeGetsPremiumSocial } = usePlatformPhase();
  const isPremiumOrVip =
    profile?.plan_type === 'monthly' ||
    profile?.plan_type === 'vip' ||
    profile?.plan_type === 'premium' ||
    freeGetsPremiumSocial;

  // Árvore já priorizada: verificados/VIP no topo, bots ocultos no DB
  const commentTree = useMemo(() => (comments ? buildCommentTree(comments) : []), [comments]);

  // Scroll infinito: carrega progressivamente via IntersectionObserver
  const visibleComments = useMemo(() => commentTree.slice(0, visibleCount), [commentTree, visibleCount]);
  const hasMore = visibleCount < commentTree.length;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => c + COMMENTS_PER_PAGE);
        }
      },
      { root: null, rootMargin: '120px', threshold: 0 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, visibleComments.length]);

  const allCommentIds = useMemo(() => (comments || []).map(c => c.id), [comments]);
  const { data: likedCommentIds = new Set<string>() } = useCommentLikeStatus(allCommentIds);
  const { data: dislikedCommentIds = new Set<string>() } = useCommentDislikeStatus(allCommentIds);
  const { data: dislikeCounts = new Map<string, number>() } = useCommentDislikeCounts(allCommentIds);

  const handleSubmit = async () => {
    const cleaned = newComment.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
    if (!cleaned) return;

    if (!canAct) {
      toast({ title: 'Conta congelada', description: 'Você não pode comentar enquanto sua conta estiver congelada.', variant: 'destructive' });
      return;
    }

    if (onBeforeSubmit) {
      const allowed = await onBeforeSubmit();
      if (!allowed) return;
    }

    createComment.mutate(
      {
        postId,
        content: cleaned,
        parentId: replyingTo?.id,
        mentionedUsers: mentionedUsers.length > 0 ? mentionedUsers : undefined,
      },
      {
        onSuccess: (result) => {
          if (result?.blocked) {
            const warning = getSpamWarning(result.reason);
            if (warning) setSpamWarning(warning);
          } else {
            void import('@/lib/auraQuests').then(({ progressAuraQuest }) =>
              progressAuraQuest('comment_post', 1, { bypassLock: true, reason: 'comentário publicado' })
            ).catch(() => {});
            setNewComment('');
            setMentionedUsers([]);
            setReplyingTo(null);
          }
        },
      }
    );
  };

  const handleReply = (commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    setNewComment(`@${username} `);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
    setNewComment('');
    setMentionedUsers([]);
  };

  const handleDeleteClick = (commentId: string) => setDeletingCommentId(commentId);

  const handleConfirmDelete = useCallback(() => {
    if (!deletingCommentId) return;
    deleteComment.mutate(
      { commentId: deletingCommentId, postId },
      { onSuccess: () => setDeletingCommentId(null), onError: () => setDeletingCommentId(null) }
    );
  }, [deletingCommentId, deleteComment, postId]);

  const handleCancelDelete = useCallback(() => {
    setDeletingCommentId(null);
    refetch();
  }, [refetch]);

  const handleEdit = (comment: PostComment) => {
    setEditingComment(comment);
    setEditContent(comment.content);
  };

  const handleSaveEdit = () => {
    if (!editingComment || !editContent.trim()) return;
    editComment.mutate(
      { commentId: editingComment.id, postId, content: editContent.trim(), createdAt: editingComment.created_at },
      { onSuccess: () => { setEditingComment(null); setEditContent(''); } }
    );
  };

  const handleCancelEdit = () => { setEditingComment(null); setEditContent(''); };

  const handleEditExpire = useCallback(() => {
    setEditingComment(null);
    setEditContent('');
    toast({ title: 'Tempo esgotado', description: 'O período de edição expirou.', variant: 'destructive' });
  }, [toast]);

  const handleViewHistory = (comment: PostComment) => setHistoryComment(comment);

  const handleLike = (commentId: string, isLiked: boolean) => {
    if (!user) {
      toast({ title: 'Faça login', description: 'Você precisa estar logado para curtir comentários.', variant: 'destructive' });
      return;
    }
    likeComment.mutate(
      { commentId, isLiked },
      {
        onError: (e: any) => {
          toast({
            title: 'Não foi possível curtir',
            description: e?.message || 'Tente novamente em instantes.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleDislike = (commentId: string, isDisliked: boolean) => {
    if (!user) {
      toast({ title: 'Faça login', description: 'Você precisa estar logado para reagir aos comentários.', variant: 'destructive' });
      return;
    }
    dislikeComment.mutate({ commentId, isDisliked });
  };

  const handleCommentChange = (value: string, mentioned: string[]) => {
    setNewComment(value);
    setMentionedUsers(mentioned);
  };

  const displayCount = comments?.length ?? commentsCount;

  return (
    <div className="border-t border-border/50 pt-3 mt-3">
      {/* Spam Warning Modal */}
      {spamWarning && (
        <SpamWarningModal message={spamWarning} onClose={() => setSpamWarning(null)} />
      )}

      {/* Delete Confirmation with Undo */}
      <DeleteConfirmation
        isOpen={!!deletingCommentId}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        undoTimeSeconds={5}
      />

      {/* Edit History Modal */}
      <EditHistoryModal
        commentId={historyComment?.id || null}
        currentContent={historyComment?.content || ''}
        onClose={() => setHistoryComment(null)}
      />

      {/* Edit Modal */}
      {editingComment && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={handleCancelEdit}
        >
          <div
            className="bg-card rounded-lg p-4 w-full max-w-md space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Editar Comentário</h3>
              <EditCountdown createdAt={editingComment.created_at} onExpire={handleEditExpire} />
            </div>
            <Input
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder="Editar comentário..."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={editComment.isPending || !editContent.trim()}>
                <Check className="h-4 w-4 mr-1" />
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between text-muted-foreground hover:text-foreground"
        onClick={async () => {
          // Se vai expandir e há gate de XP, cobra antes
          if (!expanded && onBeforeExpand) {
            const ok = await onBeforeExpand();
            if (!ok) return;
          }
          setExpanded(v => !v);
          setVisibleCount(COMMENTS_PER_PAGE);
        }}
        disabled={isBlocked}
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          {displayCount} {displayCount === 1 ? 'comentário' : 'comentários'}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {/* Expanded Comments Section */}
      {expanded && !isBlocked && (
        <div className="mt-3 space-y-3">
          {/* Comments List — lazy: apenas COMMENTS_PER_PAGE por vez */}
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : visibleComments.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto overscroll-contain pr-1">
              {visibleComments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  postId={postId}
                  currentProfileId={profile?.id}
                  onReply={handleReply}
                  onDelete={handleDeleteClick}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onEdit={handleEdit}
                  onViewHistory={handleViewHistory}
                  isLiked={likedCommentIds.has(comment.id)}
                  isDisliked={dislikedCommentIds.has(comment.id)}
                  dislikeCount={dislikeCounts.get(comment.id) || 0}
                  isPremiumOrVip={isPremiumOrVip}
                  canLike={!!user}
                />
              ))}

              {/* Sentinela para carregar mais via IntersectionObserver (scroll infinito) */}
              {hasMore && (
                <div ref={loadMoreRef} className="flex items-center justify-center py-2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-4">
              Nenhum comentário ainda. Seja o primeiro a comentar!
            </p>
          )}

          {/* New Comment Form */}
          {user && isPremiumOrVip ? (
            <div className="space-y-2">
              {replyingTo && (
                <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CornerDownRight className="h-4 w-4" />
                    Respondendo a <span className="text-primary font-medium">@{replyingTo.username}</span>
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleCancelReply}>
                    Cancelar
                  </Button>
                </div>
              )}

              {/* ── Campo responsivo ao teclado mobile (360px+) ──────────── */}
              <div className="flex gap-2 items-center sticky bottom-0 bg-card/95 backdrop-blur-sm pb-1 pt-1">
                {isFrozen && (
                  <div className="flex items-center gap-1 text-blue-500 text-xs">
                    <Snowflake className="h-3 w-3" />
                  </div>
                )}
                <EmojiPicker
                  onSelect={emoji => setNewComment(prev => prev + emoji)}
                  disabled={createComment.isPending || isFrozen}
                />
                <div className="flex-1 bg-muted/30 rounded-lg px-3 py-2 min-w-0">
                  <MentionInput
                    value={newComment}
                    onChange={handleCommentChange}
                    placeholder={isFrozen ? 'Conta congelada...' : replyingTo ? 'Escreva sua resposta...' : 'Escreva um comentário...'}
                    disabled={createComment.isPending || isFrozen}
                    onSubmit={handleSubmit}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  className="flex-shrink-0"
                  disabled={createComment.isPending || !newComment.trim() || !canAct}
                  onClick={handleSubmit}
                 aria-label="Enviar">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : user ? (
            <div className="text-center py-3 border-t border-border/30">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Upgrade necessário para comentar
              </p>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-2">
              Faça login para comentar
            </p>
          )}
        </div>
      )}
    </div>
  );
}
