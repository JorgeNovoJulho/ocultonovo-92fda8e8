/**
 * TopicRepliesInline — menu de respostas recolhido por padrão.
 * Controlado pelo pai (isOpen/onToggle) para garantir que apenas um esteja aberto por vez.
 * Quando aberto, lista TODAS as respostas com scroll invisível.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, ChevronDown, ChevronUp, Loader2, MessageCircle } from 'lucide-react';
import { useCommunityReplies, useAuthorsBatch } from '@/hooks/useCommunities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolveAvatarUrl } from '@/lib/avatarUrl';

interface Props {
  topicId: string;
  repliesCount: number;
  communitySlug: string;
  accentColor?: string;
  isOpen?: boolean;
  onToggle?: (next: boolean) => void;
}

export function TopicRepliesInline({
  topicId,
  repliesCount,
  communitySlug,
  accentColor,
  isOpen = false,
  onToggle,
}: Props) {
  const accent = accentColor || '#a855f7';

  // Carrega apenas quando aberto, para economizar requisições.
  const { data: replies, isLoading } = useCommunityReplies(isOpen ? topicId : undefined);

  const authorIds = useMemo(() => (replies ?? []).map((r: any) => r.author_id), [replies]);
  const { data: authors } = useAuthorsBatch(authorIds);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle?.(!isOpen);
  };

  if (repliesCount === 0) {
    return (
      <div className="mt-2 pt-2 border-t border-border/60 flex justify-end">
        <Link
          to={`/comunidades/${communitySlug}/topico/${topicId}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <MessageCircle className="h-3 w-3" /> Responder
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/60 min-w-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 active:scale-[0.99] transition"
        style={{ borderLeft: `2px solid ${accent}66` }}
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/85">
          <MessageSquare className="h-3.5 w-3.5" style={{ color: accent }} />
          {isOpen ? 'Ocultar respostas' : `Ver respostas (${repliesCount})`}
        </span>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div
          className={
            'mt-2 flex flex-col gap-1.5 min-w-0 max-h-[55vh] overflow-y-auto pr-1 ' +
            '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
          }
        >
          {isLoading && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-1">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando respostas…
            </div>
          )}
          {!isLoading &&
            (replies ?? []).map((r: any) => {
              const a = authors?.get(r.author_id);
              const handle = a?.username ? `@${a.username}` : 'alguém';
              const avatar = resolveAvatarUrl(a?.avatar_url);
              const initial = (a?.username || '?').slice(0, 1).toUpperCase();
              return (
                <Link
                  key={r.id}
                  to={`/comunidades/${communitySlug}/topico/${topicId}#reply-${r.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-md bg-muted/30 hover:bg-muted/60 active:opacity-80 transition px-2 py-1.5 text-xs min-w-0 break-words flex gap-2"
                  style={{ borderLeft: `2px solid ${accent}66` }}
                >
                  {a?.username ? (
                    <span
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.location.assign(`/${a.username}`); }}
                      className="shrink-0"
                    >
                      <Avatar className="h-7 w-7">
                        {avatar ? <AvatarImage src={avatar} alt={handle} /> : null}
                        <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                      </Avatar>
                    </span>
                  ) : (
                    <Avatar className="h-7 w-7 shrink-0">
                      {avatar ? <AvatarImage src={avatar} alt={handle} /> : null}
                      <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5 flex-wrap">
                      {a?.username ? (
                        <span
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); window.location.assign(`/${a.username}`); }}
                          className="font-medium text-foreground/80 hover:text-primary truncate max-w-[60%] cursor-pointer"
                        >
                          {handle}
                        </span>
                      ) : (
                        <span className="font-medium text-foreground/80">{handle}</span>
                      )}
                      <span>·</span>
                      <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</span>
                    </div>
                    <p className="text-foreground/90 whitespace-pre-wrap break-words leading-snug">
                      {r.body}
                    </p>
                  </div>
                </Link>
              );
            })}

          <div className="flex justify-end pt-1">
            <Link
              to={`/comunidades/${communitySlug}/topico/${topicId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-3 w-3" /> Responder
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default TopicRepliesInline;
