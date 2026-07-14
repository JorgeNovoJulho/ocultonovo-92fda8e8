/**
 * Tópico de Comunidade — corpo + respostas (com aninhadas) + composer + reações + moderação.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Flag, Lock, CornerDownRight, MoreVertical, Trash2, Crown, Shield, Pencil, Megaphone } from 'lucide-react';
import { publishTopicToFeed } from '@/lib/communityTopicFeedPublish';
import { toast } from 'sonner';
import { CreateTopicModal } from '@/components/communities/CreateTopicModal';
import { useModerateTopic } from '@/hooks/useCommunities';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCommunityBySlug,
  useCommunityTopic,
  useCommunityReplies,
  useCreateReply,
  useMyMembership,
  useAuthorsBatch,
  useReportCommunityContent,
  useTopicReactionsSummary,
  useReplyReactionsSummary,
  useModerateReply,
  useUpdateReply,
  useCommunityMemberRoles,
  type CommunityReply,
} from '@/hooks/useCommunities';
import { CommunityReactionsBar } from '@/components/communities/CommunityReactionsBar';
import { MentionTextarea } from '@/components/communities/MentionTextarea';
import { renderMentions } from '@/components/communities/renderMentions';
import { TopicBody } from '@/components/communities/TopicBody';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { InlineLinkMedia, hasEmbeddableLink } from '@/components/InlineLinkMedia';
import { OcultoPlayPostEmbed } from '@/components/oculto-play/OcultoPlayPostEmbed';
import { TopicPollCard } from '@/components/communities/TopicPollCard';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useCommunityTopicRealtime } from '@/hooks/useCommunityRealtime';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CommunityTopicPage() {
  const { slug, topicId } = useParams<{ slug: string; topicId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { profile: viewerProfile } = useProfile();
  const { data: community } = useCommunityBySlug(slug);
  const { data: topic } = useCommunityTopic(topicId);
  const { data: replies = [] } = useCommunityReplies(topicId);
  useCommunityTopicRealtime(topicId);
  const { data: membership } = useMyMembership(community?.id);
  const createReply = useCreateReply(topicId, community?.id);
  const report = useReportCommunityContent();
  const moderateReply = useModerateReply(topicId);
  const updateReply = useUpdateReply(topicId);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyBody, setEditingReplyBody] = useState('');
  const { data: topicSummaries } = useTopicReactionsSummary(topicId ? [topicId] : []);
  const memberRoles = useCommunityMemberRoles(community?.id);

  const replyIds = useMemo(() => replies.map((r) => r.id), [replies]);
  const { data: replySummaries } = useReplyReactionsSummary(replyIds);
  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; author: string } | null>(null);
  const [editingTopic, setEditingTopic] = useState(false);
  const moderateTopic = useModerateTopic(community?.id);

  const ids = useMemo(() => {
    const arr = replies.map((r) => r.author_id);
    if (topic?.author_id) arr.push(topic.author_id);
    return arr;
  }, [replies, topic]);
  const { data: authors } = useAuthorsBatch(ids);

  // Agrupa replies em árvore (raiz + filhos)
  const tree = useMemo(() => {
    const byParent = new Map<string | null, CommunityReply[]>();
    replies.forEach((r) => {
      const key = r.parent_reply_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(r);
    });
    return byParent;
  }, [replies]);

  useEffect(() => {
    if (!replies.length || !location.hash.startsWith('#reply-')) return;
    const replyId = location.hash.slice('#reply-'.length);
    if (!replyId) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`reply-${replyId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background');
      }, 2400);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [replies.length, location.hash]);

  if (!topic || !community) return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando…</div>;

  const author = authors?.get(topic.author_id);
  const isMember = membership?.status === 'active';
  const isOwner = membership?.role === 'owner';
  const isMod = membership?.role === 'moderator' || isOwner;
  const viewerIds = [user?.id, viewerProfile?.id, (viewerProfile as any)?.user_id].filter(Boolean);
  const isTopicAuthor = viewerIds.includes(topic.author_id);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await createReply.mutateAsync({ body: text, parent_reply_id: replyingTo?.id ?? null });
      setBody('');
      setReplyingTo(null);
    } catch {/* hook trata */}
  };

  const renderReply = (r: CommunityReply, depth = 0) => {
    const a = authors?.get(r.author_id);
    const children = tree.get(r.id) || [];
    const isMine = !!user?.id && r.author_id === user.id;
    const canModerateThis = isMod || isMine;
    const canEditThis = isMine; // só o autor edita o texto
    const isEditing = editingReplyId === r.id;
    return (
      <div id={`reply-${r.id}`} key={r.id} className="px-3 sm:px-4 py-3 scroll-mt-20 transition-shadow" style={{ paddingLeft: `${12 + depth * 24}px` }}>
        <div className="flex gap-2">
          {depth > 0 && <CornerDownRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />}
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={a?.avatar_url || undefined} />
            <AvatarFallback>{(a?.username || '?').slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold">{a?.username ? `@${a.username}` : 'Usuário'}</p>
              {memberRoles.get(r.author_id) === 'owner' && (
                <Badge className="bg-amber-600/30 text-amber-200 text-[9px] h-4 px-1 gap-0.5">
                  <Crown className="h-2.5 w-2.5" /> Dono
                </Badge>
              )}
              {memberRoles.get(r.author_id) === 'moderator' && (
                <Badge className="bg-blue-600/30 text-blue-200 text-[9px] h-4 px-1 gap-0.5">
                  <Shield className="h-2.5 w-2.5" /> Mod
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                {(r as any).updated_at && (r as any).updated_at !== r.created_at && (
                  <span className="ml-1 italic opacity-70">(editada)</span>
                )}
              </span>
              {canModerateThis && (

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="ml-auto h-6 w-6 rounded hover:bg-accent flex items-center justify-center text-muted-foreground" aria-label="Abrir menu da resposta">
                      <MoreVertical className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canEditThis && (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingReplyId(r.id);
                          setEditingReplyBody(r.body || '');
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (window.confirm('Remover esta resposta?'))
                          moderateReply.mutate({ reply_id: r.id, action: 'delete' });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {isEditing ? (
              <div className="mt-1.5 space-y-1.5">
                <Textarea
                  value={editingReplyBody}
                  onChange={(e) => setEditingReplyBody(e.target.value)}
                  rows={3}
                  className="text-sm"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setEditingReplyId(null); setEditingReplyBody(''); }}
                    disabled={updateReply.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await updateReply.mutateAsync({ reply_id: r.id, body: editingReplyBody });
                        setEditingReplyId(null);
                        setEditingReplyBody('');
                      } catch { /* hook trata */ }
                    }}
                    disabled={updateReply.isPending || !editingReplyBody.trim() || editingReplyBody.trim() === (r.body || '').trim()}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap text-foreground/90 mt-0.5 break-words">{renderMentions(r.body)}</p>
                {hasEmbeddableLink(r.body || '') ? (
                  <InlineLinkMedia text={r.body || ''} />
                ) : (
                  <LinkPreviewCard text={r.body || ''} readOnly />
                )}
              </>
            )}
            {isMember && !topic.is_locked && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <CommunityReactionsBar
                  communityId={community.id}
                  replyId={r.id}
                  summary={replySummaries?.[r.id]}
                  size="xs"
                />
                {depth < 2 && (
                  <button
                    onClick={() => {
                      setReplyingTo({ id: r.id, author: a?.username ? `@${a.username}` : 'usuário' });
                      setTimeout(() => {
                        const el = document.getElementById('community-reply-composer') as HTMLTextAreaElement | null;
                        el?.focus();
                      }, 50);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent"
                  >
                    Responder
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {children.length > 0 && (
          <div className="mt-1">
            {children.map((c) => renderReply(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootReplies = tree.get(null) || [];

  return (
    <div className="max-w-3xl mx-auto pb-[calc(env(safe-area-inset-bottom)+9rem)] md:pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-3 py-2 flex items-center gap-2">
        <button onClick={() => navigate(`/comunidades/${community.slug}`)} className="h-9 w-9 rounded-full hover:bg-accent flex items-center justify-center">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase">{community.title}</p>
          <h1 className="text-sm font-semibold truncate">{topic.title}</h1>
        </div>
        <button
          onClick={() => {
            const reason = window.prompt('Motivo da denúncia:');
            if (reason) report.mutate({ community_id: community.id, topic_id: topic.id, reason });
          }}
          className="h-9 w-9 rounded-full hover:bg-accent flex items-center justify-center"
          title="Denunciar"
        >
          <Flag className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Tópico (post inicial) */}
      <article className="px-3 sm:px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={author?.avatar_url || undefined} />
            <AvatarFallback>{(author?.username || '?').slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold truncate">{author?.username ? `@${author.username}` : 'Usuário'}</p>
              {memberRoles.get(topic.author_id) === 'owner' && (
                <Badge className="bg-amber-600/30 text-amber-200 text-[9px] h-4 px-1 gap-0.5">
                  <Crown className="h-2.5 w-2.5" /> Dono
                </Badge>
              )}
              {memberRoles.get(topic.author_id) === 'moderator' && (
                <Badge className="bg-blue-600/30 text-blue-200 text-[9px] h-4 px-1 gap-0.5">
                  <Shield className="h-2.5 w-2.5" /> Mod
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(topic.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>

          {topic.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
          {topic.is_adult && <Badge className="bg-rose-700/30 text-rose-200 text-[9px] h-4 px-1.5">+18</Badge>}
          {(isTopicAuthor || isMod) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 w-8 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground"
                  title="Opções"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {isTopicAuthor && (
                  <DropdownMenuItem onClick={() => setEditingTopic(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar tópico
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={async () => {
                    if (!user) return;
                    const tid = toast.loading('Publicando no feed…');
                    const res = await publishTopicToFeed({
                      topicId: topic.id,
                      topicTitle: topic.title,
                      topicBody: (topic as any).body ?? null,
                      communityId: community.id,
                      userId: user.id,
                      isAdult: !!topic.is_adult,
                    });
                    toast.dismiss(tid);
                    if (res.ok && res.alreadyExists) toast.info('Este tópico já está publicado no feed.');
                    else if (res.ok) toast.success('Publicado no feed principal.');
                    else toast.error('Não foi possível publicar no feed.');
                  }}
                >
                  <Megaphone className="h-3.5 w-3.5 mr-2" /> Publicar no Feed
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (window.confirm('Remover este tópico?')) {
                      moderateTopic.mutate(
                        { topic_id: topic.id, action: 'delete' },
                        { onSuccess: () => navigate(`/comunidades/${community.slug}`) },
                      );
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <h2 className="text-base font-bold leading-snug mb-1">{topic.title}</h2>
        {(topic as any).play_item_id && (
          <div className="my-2">
            <OcultoPlayPostEmbed itemId={(topic as any).play_item_id as string} />
          </div>
        )}
        {topic.body && (() => {
          // Quando o tópico veio do compartilhamento do Play, o body tem
          // marcadores legados (“🎬 Compartilhado do Oculto Play” + URL).
          // Já mostramos o embed acima, então removemos esse ruído.
          let cleaned = topic.body;
          if ((topic as any).play_item_id) {
            cleaned = cleaned
              .replace(/\n*🎬\s*Compartilhado do Oculto Play\n?/gi, '')
              .replace(/https?:\/\/\S+/g, (m) => (/\.(mp3|mp4|webm|m4a|wav|ogg|mov)(\?|$)/i.test(m) ? '' : m))
              .trim();
          }
          return cleaned ? <TopicBody body={cleaned} /> : null;
        })()}
        {isMember && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/60">
            <CommunityReactionsBar
              communityId={community.id}
              topicId={topic.id}
              summary={topicSummaries?.[topic.id]}
              size="sm"
            />
          </div>
        )}
        <TopicPollCard
          topicId={topic.id}
          topicAuthorId={topic.author_id}
          currentUserId={user?.id}
          isMember={isMember}
          isMod={isMod}
          isTopicLocked={topic.is_locked}
        />
      </article>

      {/* Respostas */}
      <div className="divide-y divide-border">
        {rootReplies.map((r) => renderReply(r, 0))}
        {replies.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">Nenhuma resposta ainda. Seja o primeiro!</div>
        )}
      </div>

      {/* Composer fixo */}
      {isMember && !topic.is_locked && (
        <div className="fixed left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-2 z-20 bottom-[calc(env(safe-area-inset-bottom,0px)+56px)] md:bottom-0 pb-[max(env(safe-area-inset-bottom),8px)]">
          <div className="max-w-3xl mx-auto">
            {replyingTo && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1 px-1">
                <CornerDownRight className="h-3 w-3" />
                <span>Respondendo a <b>{replyingTo.author}</b></span>
                <button onClick={() => setReplyingTo(null)} className="ml-auto underline">cancelar</button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <MentionTextarea
                  communityId={community.id}
                  id="community-reply-composer"
                  value={body}
                  onChange={setBody}
                  rows={1}
                  placeholder={replyingTo ? `Responder a ${replyingTo.author}…` : 'Escreva uma resposta… use @'}
                  className="min-h-[40px] max-h-32 resize-none text-sm"
                />
              </div>
              <Button size="sm" onClick={handleSend} disabled={!body.trim() || createReply.isPending} className="h-10 px-3">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {!isMember && (
        <div className="fixed left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-3 z-20 text-center text-xs text-muted-foreground bottom-[calc(env(safe-area-inset-bottom,0px)+56px)] md:bottom-0">
          Entre na comunidade para participar da conversa.
        </div>
      )}
      {topic.is_locked && isMember && (
        <div className="fixed left-0 right-0 bg-background/95 backdrop-blur border-t border-border p-3 z-20 text-center text-xs text-muted-foreground bottom-[calc(env(safe-area-inset-bottom,0px)+56px)] md:bottom-0">
          Este tópico está fechado.
        </div>
      )}
      {editingTopic && (
        <CreateTopicModal
          open={editingTopic}
          onOpenChange={setEditingTopic}
          communityId={community.id}
          mode="edit"
          initialTopic={{
            id: topic.id,
            title: topic.title,
            body: topic.body,
            is_adult: topic.is_adult,
            channel_id: (topic as any).channel_id ?? null,
          }}
        />
      )}
    </div>
  );
}
