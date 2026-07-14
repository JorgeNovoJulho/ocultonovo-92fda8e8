/**
 * MobileCommentsModal — Modal full-screen mobile dedicado a comentários de um post.
 *
 * - 100% responsivo (h-[100dvh], safe areas iOS/Android).
 * - Lista todos os comentários com scroll vertical sem barra visível.
 * - Mostra estado vazio convidando o usuário a ser o primeiro a comentar.
 * - Composer com EmojiPicker; ao enviar fecha o modal e atualiza tudo em tempo
 *   real (hooks já invalidam ['posts'], ['posts-infinite'] e ['post-comments']).
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, ThumbsDown, Send, X, MessageCircle, Sparkles, AlertCircle, RotateCw } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmojiPicker } from '@/components/ui/EmojiPicker';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useCanPerformActions } from '@/hooks/useCanPerformActions';
import { useToast } from '@/hooks/use-toast';
import {
  usePostComments, useCreateComment, buildCommentTree, getSpamWarning, PostComment,
} from '@/hooks/usePostComments';
import { useCommentLikeStatus, useLikeComment } from '@/hooks/useCommentLikes';
import {
  useCommentDislikeStatus, useCommentDislikeCounts, useDislikeComment,
} from '@/hooks/useCommentDislikes';

interface MobileCommentsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId: string;
  commentsCount: number;
  /** Cobrar XP ao enviar comentário (mesma contrato da PostCommentsSection). */
  onBeforeSubmit?: () => Promise<boolean> | boolean;
}

function CommentRow({
  comment, isLiked, isDisliked, dislikeCount, onLike, onDislike, canLike,
}: {
  comment: PostComment;
  isLiked: boolean;
  isDisliked: boolean;
  dislikeCount: number;
  canLike: boolean;
  onLike: (id: string, isLiked: boolean) => void;
  onDislike: (id: string, isDisliked: boolean) => void;
}) {
  return (
    <div className="flex gap-2.5 px-4 py-3 border-b border-border/40 last:border-b-0">
      <Avatar className="h-9 w-9 flex-shrink-0">
        <AvatarImage src={comment.author?.avatar_url || ''} />
        <AvatarFallback className="text-xs">
          {(comment.author?.username || '?')[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">
            @{comment.author?.username || 'usuario'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
        <p className="text-sm text-foreground mt-0.5 break-words whitespace-pre-wrap leading-snug">
          {comment.content}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <button
            type="button"
            onClick={() => onLike(comment.id, isLiked)}
            disabled={!canLike}
            className={cn(
              'inline-flex items-center gap-1 text-xs transition-colors',
              isLiked ? 'text-primary' : 'text-muted-foreground active:text-primary'
            )}
          >
            <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-primary')} />
            {comment.likes_count > 0 && comment.likes_count}
          </button>
          <button
            type="button"
            onClick={() => onDislike(comment.id, isDisliked)}
            disabled={!canLike}
            className={cn(
              'inline-flex items-center gap-1 text-xs transition-colors',
              isDisliked ? 'text-destructive' : 'text-muted-foreground active:text-destructive'
            )}
          >
            <ThumbsDown className={cn('h-3.5 w-3.5', isDisliked && 'fill-destructive')} />
            {dislikeCount > 0 && dislikeCount}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileCommentsModal({
  open, onOpenChange, postId, commentsCount, onBeforeSubmit,
}: MobileCommentsModalProps) {
  const [text, setText] = useState('');
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Rastreia o teclado virtual via VisualViewport para fazer o composer
  // subir junto com o teclado em iOS/Android (corrige composer escondido).
  useEffect(() => {
    if (!open) {
      setKeyboardInset(0);
      return;
    }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

  const { data: comments, isLoading } = usePostComments(postId);
  const createComment = useCreateComment();
  const likeComment = useLikeComment();
  const dislikeComment = useDislikeComment();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { canAct } = useCanPerformActions();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Atualiza otimisticamente comments_count nos caches dos posts (feed + perfil)
  // para refletir no card sem aguardar o refetch da API.
  const bumpCommentsCount = useCallback((delta: number) => {
    const apply = (p: any) =>
      p && p.id === postId
        ? { ...p, comments_count: Math.max(0, (p.comments_count ?? 0) + delta) }
        : p;
    qc.setQueriesData({ queryKey: ['posts-infinite'] }, (old: any) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) =>
          Array.isArray(page) ? page.map(apply) : page,
        ),
      };
    });
    qc.setQueriesData({ queryKey: ['posts'] }, (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) return old.map(apply);
      return apply(old);
    });
    qc.setQueriesData({ queryKey: ['creator-posts'] }, (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) return old.map(apply);
      return old;
    });
    qc.setQueriesData({ queryKey: ['my-posts'] }, (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) return old.map(apply);
      return old;
    });
  }, [qc, postId]);

  // Lista plana — modal mostra TODOS sem cortar nada
  const allComments = useMemo(() => {
    if (!comments) return [] as PostComment[];
    const tree = buildCommentTree(comments);
    const flat: PostComment[] = [];
    const walk = (list: PostComment[]) => {
      list.forEach((c) => {
        flat.push(c);
        if (c.replies?.length) walk(c.replies);
      });
    };
    walk(tree);
    return flat;
  }, [comments]);

  const allIds = useMemo(() => allComments.map((c) => c.id), [allComments]);
  const { data: likedIds = new Set<string>() } = useCommentLikeStatus(allIds);
  const { data: dislikedIds = new Set<string>() } = useCommentDislikeStatus(allIds);
  const { data: dislikeCounts = new Map<string, number>() } = useCommentDislikeCounts(allIds);

  const handleEmoji = useCallback((emoji: string) => {
    setText((t) => t + emoji);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handleLike = (id: string, isLiked: boolean) => {
    if (!user) {
      toast({ title: 'Faça login', description: 'É preciso estar logado para curtir.', variant: 'destructive' });
      return;
    }
    likeComment.mutate({ commentId: id, isLiked }, {
      onError: (e: any) => toast({
        title: 'Não foi possível curtir',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      }),
    });
  };

  const handleDislike = (id: string, isDisliked: boolean) => {
    if (!user) {
      toast({ title: 'Faça login', description: 'É preciso estar logado para reagir.', variant: 'destructive' });
      return;
    }
    dislikeComment.mutate({ commentId: id, isDisliked });
  };

  const handleSubmit = async () => {
    if (createComment.isPending) return;
    const cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
    if (!cleaned) {
      setSubmitError('Escreva algo antes de enviar.');
      return;
    }

    if (!user) {
      setSubmitError('É preciso estar logado para comentar.');
      return;
    }

    if (!canAct) {
      setSubmitError('Conta congelada. Você não pode comentar agora.');
      return;
    }

    setSubmitError(null);

    if (onBeforeSubmit) {
      try {
        const ok = await onBeforeSubmit();
        if (!ok) {
          setSubmitError('Não foi possível enviar. Verifique seu plano ou créditos e tente novamente.');
          return;
        }
      } catch (e: any) {
        setSubmitError(e?.message || 'Erro ao validar envio. Tente novamente.');
        return;
      }
    }

    createComment.mutate(
      { postId, content: cleaned },
      {
        onSuccess: (result: any) => {
          if (result?.blocked) {
            const warning = getSpamWarning(result.reason);
            setSubmitError(warning || 'Seu comentário foi sinalizado. Ajuste o texto e tente novamente.');
            return;
          }
          bumpCommentsCount(1);
          setText('');
          setSubmitError(null);
          toast({
            title: 'Comentário publicado',
            description: 'Sua mensagem já aparece no post.',
          });
          onOpenChange(false);
          void import('@/lib/auraQuests').then(({ progressAuraQuest }) =>
            progressAuraQuest('comment_post', 1, { bypassLock: true, reason: 'comentário publicado (mobile modal)' })
          ).catch(() => {});
        },
        onError: (e: any) => {
          const msg =
            e?.message ||
            e?.error_description ||
            e?.error?.message ||
            'Não foi possível enviar seu comentário. Verifique sua conexão e tente novamente.';
          setSubmitError(msg);
        },
      }
    );
  };

  // Reset texto ao fechar + foco automático ao abrir
  useEffect(() => {
    if (!open) {
      setText('');
      setSubmitError(null);
      return;
    }
    // Aguarda animação do Sheet para focar o textarea (mobile)
    const t = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 320);
    return () => window.clearTimeout(t);
  }, [open]);

  const displayCount = comments?.length ?? commentsCount;
  const isEmpty = !isLoading && allComments.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'p-0 border-0 bg-background',
          // Full-screen sem cortes — usa dvh para barra dinâmica em iOS/Android
          'h-[100dvh] max-h-[100dvh] w-full max-w-full rounded-none',
          'flex flex-col gap-0',
          // Acima da BottomNav (z-50) para não ficar coberto pelo menu inferior
          'z-[120]',
        )}
      >
        {/* Header fixo com safe-area top */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background/95 backdrop-blur"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-sm font-semibold truncate">
              Comentários {displayCount > 0 && <span className="text-muted-foreground">({displayCount})</span>}
            </h2>
          </div>
          {/* o X de fechar é renderizado pelo SheetContent (canto sup. dir.) */}
          <span className="w-9 h-9" aria-hidden />
        </div>

        {/* Lista — scroll invisível, sem cortes */}
        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain',
            // Scrollbar invisível (cross-browser)
            'scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]',
            '[&::-webkit-scrollbar]:hidden',
          )}
        >
          {isLoading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Carregando comentários…
            </div>
          ) : isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8 py-16">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base font-semibold">Ainda sem comentários</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Seja a primeira pessoa a comentar nesta postagem.
              </p>
            </div>
          ) : (
            <div className="pb-2">
              {allComments.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  isLiked={likedIds.has(c.id)}
                  isDisliked={dislikedIds.has(c.id)}
                  dislikeCount={dislikeCounts.get(c.id) ?? c.likes_count ? 0 : 0}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  canLike={!!user}
                />
              ))}
            </div>
          )}
        </div>

        {/* Composer fixo no rodapé — sobe junto com o teclado virtual */}
        <div
          className="border-t border-border/60 bg-background/95 backdrop-blur px-3 py-2 transition-[padding] duration-150"
          style={{
            paddingBottom: keyboardInset > 0
              ? `calc(${keyboardInset}px + 0.5rem)`
              : 'max(0.5rem, env(safe-area-inset-bottom))',
          }}
        >
          {submitError && (
            <div
              role="alert"
              className="mb-2 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug break-words">{submitError}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleSubmit}
                disabled={createComment.isPending || !text.trim()}
                className="h-7 px-2 -my-1 text-xs gap-1 text-destructive hover:bg-destructive/15 hover:text-destructive"
              >
                <RotateCw className={cn('h-3.5 w-3.5', createComment.isPending && 'animate-spin')} />
                Tentar novamente
              </Button>
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <EmojiPicker onSelect={handleEmoji} disabled={createComment.isPending} />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="Escreva um comentário..."
              rows={1}
              maxLength={2000}
              disabled={createComment.isPending}
              className={cn(
                'flex-1 min-h-[40px] max-h-[120px] resize-none rounded-2xl bg-muted/50',
                'px-3 py-2 text-sm leading-snug placeholder:text-muted-foreground',
                'border focus:outline-none focus:ring-2',
                submitError
                  ? 'border-destructive/60 focus:ring-destructive/50'
                  : 'border-border/60 focus:ring-primary/50',
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSubmit}
              disabled={!text.trim() || createComment.isPending}
              className="h-10 w-10 rounded-full shrink-0"
              aria-label={createComment.isPending ? 'Enviando comentário' : 'Enviar comentário'}
            >
              {createComment.isPending ? (
                <span className="h-4 w-4 inline-block rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
