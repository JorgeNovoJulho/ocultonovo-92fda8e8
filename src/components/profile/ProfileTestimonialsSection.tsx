import { useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Heart, MessageSquare, MoreHorizontal, Trash2, Flag, Ban, Loader2, Reply, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useProfileTestimonials, type ProfileTestimonial } from "@/hooks/useProfileTestimonials";
import { useProfile } from "@/hooks/useProfile";
import { useBlockContact } from "@/hooks/useBlockedContacts";
import { ReportButton } from "@/components/safety/ReportButton";
import { getPublicHandle, getHandleInitial } from "@/lib/userHandle";
import { cn } from "@/lib/utils";

interface Props {
  targetProfileId: string;
  /** username/displayName do dono do perfil, só para placeholders */
  displayHandle?: string;
}

export function ProfileTestimonialsSection({ targetProfileId, displayHandle }: Props) {
  const { profile } = useProfile();
  const { data: items = [], reply, remove, toggleHeart, isLoading } = useProfileTestimonials(targetProfileId);
  const isOwner = profile?.id === targetProfileId;

  const [collapsed, setCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);

  const visibleItems = items.slice(0, visibleCount);
  const remaining = items.length - visibleItems.length;
  const canShowLess = visibleCount > 3 && items.length > 3;

  return (
    <section id="testimonials" className="mt-6 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-pink-500/25 bg-gradient-to-br from-pink-500/10 via-rose-500/5 to-transparent p-2.5 sm:p-4 scroll-mt-24 shadow-[0_0_0_1px_rgba(236,72,153,0.05)]">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
        aria-expanded={!collapsed}
      >
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Depoimentos
          <Popover>
            <PopoverTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label="O que é um depoimento?"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Saiba mais
              </span>
            </PopoverTrigger>
              <PopoverContent
              side="bottom"
              align="start"
              onClick={(e) => e.stopPropagation()}
                className="w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] text-xs leading-relaxed"
            >
              <p className="font-semibold text-sm mb-2 text-foreground">O que é um Depoimento?</p>
              <p className="text-muted-foreground mb-3">
                Um relato pessoal de alguém que já interagiu com este perfil — uma conversa,
                um encontro, uma troca. Serve para mostrar à comunidade como é a experiência real com a pessoa.
              </p>
              <p className="font-semibold text-foreground mb-1">Como deixar o seu:</p>
              <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                <li>Abra o perfil de quem deseja avaliar.</li>
                <li>Toque no menu (3 pontinhos) ao lado do nome.</li>
                <li>Selecione <span className="text-foreground">"Deixar depoimento"</span>.</li>
                <li>Escreva com respeito e verdade. Você pode editar/apagar depois.</li>
              </ol>
              <p className="mt-3 text-[10px] text-muted-foreground italic">
                Depoimentos abusivos ou falsos são removidos pela moderação.
              </p>
            </PopoverContent>
          </Popover>
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{items.length}</span>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          )}
        </div>
      </button>

      {!collapsed && (
        <>
          {isLoading && <div className="h-20 rounded bg-muted/30 animate-pulse" />}

          {!isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              Nenhum depoimento ainda. {!isOwner && `Seja o(a) primeiro(a) a deixar um sobre ${displayHandle ?? "este perfil"}.`}
            </p>
          )}

          <ul className="space-y-3 w-full max-w-full min-w-0">
            {visibleItems.map((t) => (
              <TestimonialCard
                key={t.id}
                item={t}
                isOwner={isOwner}
                onHeart={() => toggleHeart.mutate({ id: t.id, hearted: !!t.hearted_by_me })}
                onReply={(text) => reply.mutateAsync({ id: t.id, reply: text })}
                onDelete={() => remove.mutate(t.id)}
                onBlock={null}
              />
            ))}
          </ul>

          {(remaining > 0 || canShowLess) && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {remaining > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + 10)}
                  className="text-xs"
                >
                  Ver mais ({Math.min(remaining, 10)})
                </Button>
              )}
              {canShowLess && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(3)}
                  className="text-xs text-muted-foreground"
                >
                  Mostrar menos
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TestimonialCard({
  item,
  isOwner,
  onHeart,
  onReply,
  onDelete,
}: {
  item: ProfileTestimonial;
  isOwner: boolean;
  onHeart: () => void;
  onReply: (text: string) => Promise<unknown>;
  onDelete: () => void;
  onBlock: null;
}) {
  const [showReply, setShowReply] = useState(!!item.reply);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const blockContact = useBlockContact();
  const reportRef = useRef<HTMLButtonElement | null>(null);
  const triggerReport = () => window.setTimeout(() => reportRef.current?.click(), 50);

  const author = item.author;
  const handle = getPublicHandle(author as any);
  const initial = getHandleInitial(author as any);
  const ago = formatDistanceToNow(new Date(item.created_at), { locale: ptBR, addSuffix: true });

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await onReply(replyText);
      setReplying(false);
      setReplyText("");
      setShowReply(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <li className="w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-border/40 bg-background/40 p-2.5 sm:p-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <Link to={author?.username ? `/creator/${author.username}` : "#"} className="shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={author?.avatar_url || undefined} alt={handle} />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <Link
              to={author?.username ? `/creator/${author.username}` : "#"}
              className="text-sm font-semibold truncate hover:underline"
            >
              {handle}
            </Link>
            <div className="flex items-center gap-1 shrink-0 max-w-[42%] sm:max-w-none">
              <span className="text-[10px] text-muted-foreground truncate">{ago}</span>
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Mais opções">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setReplying((r) => !r); }}>
                      <Reply className="h-4 w-4 mr-2" /> Responder
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => { e.preventDefault(); onDelete(); }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        if (item.author_profile_id) {
                          blockContact.mutate({
                            blockedUserId: item.author_profile_id,
                            blockType: "blocked",
                          });
                        }
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Ban className="h-4 w-4 mr-2" /> Bloquear autor
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => { e.preventDefault(); triggerReport(); }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Flag className="h-4 w-4 mr-2" /> Denunciar autor
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <p className="text-sm mt-1 whitespace-pre-wrap break-words">{item.content}</p>

          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={onHeart}
              className={cn(
                "inline-flex items-center gap-1 text-xs transition-colors",
                item.hearted_by_me ? "text-rose-400" : "text-muted-foreground hover:text-rose-400",
              )}
              aria-label={item.hearted_by_me ? "Remover coração" : "Enviar coração"}
            >
              <Heart className={cn("h-3.5 w-3.5", item.hearted_by_me && "fill-rose-400")} />
              <span>{item.hearts}</span>
            </button>

            {(item.reply || showReply) && (
              <button
                type="button"
                onClick={() => setShowReply((s) => !s)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {item.reply ? (showReply ? "Ocultar resposta" : "Ver resposta") : null}
              </button>
            )}
          </div>

          {/* Resposta exibida */}
          {showReply && item.reply && (
            <div className="mt-2 rounded-md border-l-2 border-primary/60 bg-primary/5 px-3 py-2 text-xs">
              <div className="text-[10px] uppercase tracking-wide text-primary/80 mb-0.5">
                Resposta
              </div>
              <p className="whitespace-pre-wrap break-words">{item.reply}</p>
            </div>
          )}

          {/* Form de resposta (apenas owner) */}
          {isOwner && replying && (
            <div className="mt-2 space-y-2">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 500))}
                placeholder="Escreva uma resposta..."
                rows={2}
                maxLength={500}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setReplying(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSendReply} disabled={!replyText.trim() || sending}>
                  {sending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                  {item.reply ? "Atualizar" : "Responder"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ReportButton oculto — acionado pelo item "Denunciar autor" */}
      {item.author_profile_id && (
        <div className="sr-only" aria-hidden>
          <button
            ref={reportRef}
            type="button"
            onClick={(e) => {
              const span = (e.currentTarget.nextElementSibling as HTMLElement) || null;
              const inner = span?.querySelector<HTMLElement>("button");
              inner?.click();
            }}
          />
          <span>
            <ReportButton targetType="user" targetUserId={item.author_profile_id} variant="icon" />
          </span>
        </div>
      )}
    </li>
  );
}
