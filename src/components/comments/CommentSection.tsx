import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, MessageCircle, Crown, Heart, ThumbsDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useCanPerformActions } from '@/hooks/useCanPerformActions';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';
import { usePostComments, useCreateComment, useDeleteComment, type PostComment } from '@/hooks/usePostComments';
import {
  useCommentReactions,
  useReactToComment,
  type CommentReactionState,
} from '@/hooks/useCommentReactions';
import { useQueryClient } from '@tanstack/react-query';
import { sanitizeMessage } from '@/lib/sanitize';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { toast } from 'sonner';

const MAX_COMMENT_LENGTH = 500;
const INITIAL_VISIBLE = 5;

// Module-level draft cache: keeps typed text per postId across modal close/reopen
const commentDrafts = new Map<string, string>();
const commentFocusFlags = new Set<string>();

interface CommentSectionProps {
  postId: string;
  className?: string;
  /** Quando true, ocupa toda a altura do pai com lista rolável e input fixo no rodapé. */
  fillHeight?: boolean;
}

const EMPTY_REACTION: CommentReactionState = { likes: 0, dislikes: 0, myReaction: null };

const CommentItem = memo(function CommentItem({
  comment,
  isOwn,
  onDelete,
  reaction,
  onReact,
  reactDisabled,
}: {
  comment: PostComment;
  isOwn: boolean;
  onDelete: (id: string) => void;
  reaction: CommentReactionState;
  onReact: (commentId: string, type: 'like' | 'dislike', current: 'like' | 'dislike' | null) => void;
  reactDisabled: boolean;
}) {
  const isPending = (comment as any)._pending;
  const isLiked = reaction.myReaction === 'like';
  const isDisliked = reaction.myReaction === 'dislike';

  return (
    <div
      className={cn(
        'flex gap-2 py-2',
        isPending && 'opacity-60'
      )}
      style={{ contain: 'layout style' }}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage
          src={comment.author?.avatar_url || ''}
          className="object-cover"
          decoding="async"
        />
        <AvatarFallback className="text-xs bg-muted">
          {(comment.author?.username || comment.author?.name || '?').charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-medium text-sm truncate">
            {comment.author?.username ? `@${comment.author.username}` : 'anônimo'}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {isPending
              ? 'enviando...'
              : formatDistanceToNow(new Date(comment.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
          </span>
        </div>
        <p className="text-sm break-words">{comment.content}</p>

        {/* Reações (like / dislike) */}
        {!isPending && (
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onReact(comment.id, 'like', reaction.myReaction)}
              disabled={reactDisabled}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                'text-muted-foreground hover:text-primary hover:bg-primary/10',
                isLiked && 'text-primary bg-primary/10',
                reactDisabled && 'opacity-50 cursor-not-allowed',
              )}
              aria-label={isLiked ? 'Remover curtida' : 'Curtir comentário'}
            >
              <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-current')} />
              {reaction.likes > 0 && <span>{reaction.likes}</span>}
            </button>
            <button
              type="button"
              onClick={() => onReact(comment.id, 'dislike', reaction.myReaction)}
              disabled={reactDisabled}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
                'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                isDisliked && 'text-destructive bg-destructive/10',
                reactDisabled && 'opacity-50 cursor-not-allowed',
              )}
              aria-label={isDisliked ? 'Remover dislike' : 'Não curtir comentário'}
            >
              <ThumbsDown className={cn('h-3.5 w-3.5', isDisliked && 'fill-current')} />
              {reaction.dislikes > 0 && <span>{reaction.dislikes}</span>}
            </button>
          </div>
        )}
      </div>
      {isOwn && !isPending && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(comment.id)}
          className="h-6 px-2 text-xs text-destructive shrink-0 self-center"
        >
          Excluir
        </Button>
      )}
    </div>
  );
});

function CommentSectionInner({ postId, className, fillHeight = false }: CommentSectionProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { canAct } = useCanPerformActions();
  const { freeGetsPremiumSocial } = usePlatformPhase();
  const queryClient = useQueryClient();

  const { data: comments, isLoading, isError, refetch } = usePostComments(postId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const reactToComment = useReactToComment();

  const [showAll, setShowAll] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<PostComment[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore draft for this post (preserves typed text across modal close/reopen)
  const [newComment, setNewCommentRaw] = useState<string>(() => commentDrafts.get(postId) || '');
  const setNewComment = useCallback((value: string) => {
    setNewCommentRaw(value);
    if (value) commentDrafts.set(postId, value);
    else commentDrafts.delete(postId);
  }, [postId]);

  // Restore focus if user had it before unmount
  useEffect(() => {
    if (commentFocusFlags.has(postId) && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      try { inputRef.current.setSelectionRange(len, len); } catch {}
    }
  }, [postId]);

  // Durante BETA, FREE recebe Premium social (libera comentários).
  const isPremiumOrVip =
    profile?.plan_type === 'monthly' || profile?.plan_type === 'vip' || freeGetsPremiumSocial;

  // Real-time subscription
  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
    const unsub = subscribeTable('post_comments', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.post_id !== postId) return;
      const evt = payload?.eventType;
      if (evt === 'INSERT' || evt === 'DELETE') invalidate();
    });
    return () => { unsub(); };
  }, [postId, queryClient]);


  // Clear optimistic comments when real data arrives
  useEffect(() => {
    if (comments && optimisticComments.length > 0) {
      setOptimisticComments([]);
    }
  }, [comments]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = sanitizeMessage(newComment).slice(0, MAX_COMMENT_LENGTH);
      if (!trimmed || !canAct || !user || !profile) return;

      const tempId = `temp-${Date.now()}`;
      const optimistic: PostComment = {
        id: tempId,
        post_id: postId,
        user_id: profile.id,
        content: trimmed,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_seed: false,
        parent_id: null,
        mentioned_users: [],
        depth: 0,
        likes_count: 0,
        author: {
          id: profile.id,
          name: profile.username ? `@${profile.username}` : 'Você',
          avatar_url: profile.avatar_url,
          username: profile.username,
        },
        _pending: true,
      } as PostComment & { _pending: boolean };

      setOptimisticComments((prev) => [...prev, optimistic]);
      setNewComment('');
      setShowAll(true);

      createComment
        .mutateAsync({ postId, content: trimmed })
        .then(() => {
          void import('@/lib/auraQuests').then(({ progressAuraQuest }) =>
            progressAuraQuest('comment_post', 1, {
              bypassLock: true,
              reason: 'comentário publicado',
            }),
          );
        })
        .catch((err: any) => {
          setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
          toast.error(err?.message || 'Falha ao enviar comentário');
        });
    },
    [newComment, canAct, user, profile, postId, createComment]
  );

  const handleDelete = useCallback(
    (commentId: string) => {
      deleteComment.mutate({ commentId, postId });
    },
    [deleteComment, postId]
  );

  const allComments = useMemo(
    () => [...(comments || []), ...optimisticComments],
    [comments, optimisticComments],
  );
  const visibleComments = showAll
    ? allComments
    : allComments.slice(-INITIAL_VISIBLE);
  const hiddenCount = allComments.length - visibleComments.length;

  // Reações para os comentários visíveis (ignora comentários otimistas com id "temp-")
  const visibleIds = useMemo(
    () => visibleComments.map((c) => c.id).filter((id) => !id.startsWith('temp-')),
    [visibleComments],
  );
  const { data: reactionsMap } = useCommentReactions(visibleIds);

  const handleReact = useCallback(
    (commentId: string, type: 'like' | 'dislike', current: 'like' | 'dislike' | null) => {
      if (!user) {
        toast.error('Faça login para reagir');
        return;
      }
      if (!canAct) {
        toast.error('Você não pode reagir enquanto sua conta está congelada');
        return;
      }
      reactToComment.mutate({ commentId, reaction: type, current });
    },
    [user, canAct, reactToComment],
  );

  if (isError) {
    return (
      <div className={cn('px-4 py-6 text-center', className)}>
        <p className="text-sm text-muted-foreground mb-2">
          Erro ao carregar comentários
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const rootClass = fillHeight
    ? 'flex flex-col h-full min-h-0'
    : 'flex flex-col';
  const listClass = fillHeight
    ? 'px-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide'
    : 'px-4 max-h-[300px] overflow-y-auto scrollbar-hide';

  return (
    <div className={cn(rootClass, className)}>
      {/* Comments list */}
      <div ref={listRef} className={listClass}>
        {isLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : allComments.length > 0 ? (
          <>
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAll(true)}
                className="text-sm text-primary py-2 w-full text-left"
              >
                Ver mais {hiddenCount} comentário{hiddenCount > 1 ? 's' : ''}
              </button>
            )}
            {visibleComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                isOwn={!!user && comment.user_id === (profile?.id || '')}
                onDelete={handleDelete}
                reaction={reactionsMap?.[comment.id] ?? EMPTY_REACTION}
                onReact={handleReact}
                reactDisabled={!user || !canAct || reactToComment.isPending}
              />
            ))}
          </>
        ) : (
          <div className="py-6 text-center text-muted-foreground">
            <MessageCircle className="h-6 w-6 mx-auto mb-1 opacity-20" />
            <p className="text-sm">Nenhum comentário</p>
          </div>
        )}
      </div>

      {/* Input — sempre visível (shrink-0). Respeita safe-area em mobile. */}
      {user && isPremiumOrVip ? (
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t flex gap-2 shrink-0 bg-background"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Input
            ref={inputRef}
            placeholder="Comentar..."
            value={newComment}
            onChange={(e) =>
              setNewComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))
            }
            onFocus={() => commentFocusFlags.add(postId)}
            onBlur={() => commentFocusFlags.delete(postId)}
            className="flex-1 h-9 text-sm"
            disabled={!canAct}
            maxLength={MAX_COMMENT_LENGTH}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!newComment.trim() || !canAct}
          >
            {createComment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      ) : user ? (
        <div
          className="p-3 border-t text-center shrink-0 bg-background"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Crown className="h-4 w-4 text-[hsl(var(--primary))]" />
            Comentários para Premium e VIP
          </p>
        </div>
      ) : (
        <div
          className="p-3 border-t text-center text-sm text-muted-foreground shrink-0 bg-background"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Link to="/login" className="text-primary hover:underline">
            Entre
          </Link>{' '}
          para comentar
        </div>
      )}
    </div>
  );
}

export function CommentSection(props: CommentSectionProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Erro ao carregar comentários
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </Button>
        </div>
      }
    >
      <CommentSectionInner {...props} />
    </ErrorBoundary>
  );
}
