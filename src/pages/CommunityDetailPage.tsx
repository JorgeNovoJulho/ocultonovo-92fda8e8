/**
 * Detalhe da Comunidade — header + lista de tópicos + criar tópico + reações + aprovar membros.
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, Lock, ArrowLeft, MessageSquare, Pin, Plus, Flag, UserPlus, MoreVertical, PinOff, Unlock, Trash2, Pencil, Search, Info, Crown, Shield, Link2, Image as ImageIcon, FileText, BarChart3, Bell, BellOff, AtSign, Hash, Settings2, CalendarDays, Award, Video, Music } from 'lucide-react';


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import {
  useCommunityBySlug,
  useCommunityTopics,
  useMyMembership,
  useJoinCommunity,
  useLeaveCommunity,
  useAuthorsBatch,
  useReportCommunityContent,
  useMyTopicReactions,
  useTopicReactionsSummary,
  usePendingMembersCount,
  useModerateTopic,
  useCommunityActiveMembers,
  useSetCommunityNotifyLevel,
  useCommunityChannels,
  useUpdateCommunityImagePositions,
  useCommunityOwnerProfile,
} from '@/hooks/useCommunities';
import { DraggableImagePosition } from '@/components/communities/DraggableImagePosition';
import { CommunityReactionsBar } from '@/components/communities/CommunityReactionsBar';
import { CommunityPlayStrip } from '@/components/communities/CommunityPlayStrip';
import { useCommunityRealtime } from '@/hooks/useCommunityRealtime';


import { CreateTopicModal } from '@/components/communities/CreateTopicModal';
import { ModerateMembersModal } from '@/components/communities/ModerateMembersModal';
import { EditCommunityModal } from '@/components/communities/EditCommunityModal';
import { InvitesModal } from '@/components/communities/InvitesModal';
import { ManageJoinQuestionsModal } from '@/components/communities/ManageJoinQuestionsModal';
import { JoinQuestionsModal } from '@/components/communities/JoinQuestionsModal';
import { useCommunityJoinQuestions } from '@/hooks/useCommunities';
import { ClipboardList } from 'lucide-react';
import { PendingTopicsModal, usePendingTopicsCount } from '@/components/communities/PendingTopicsModal';
import { CommunityMediaGallery } from '@/components/communities/CommunityMediaGallery';
import { CommunityInsightsPanel } from '@/components/communities/CommunityInsightsPanel';
import { ManageChannelsModal } from '@/components/communities/ManageChannelsModal';
import { CommunityEventsTab } from '@/components/communities/CommunityEventsTab';
import { CommunityBadgesPanel } from '@/components/communities/CommunityBadgesPanel';
import { TopicRepliesInline } from '@/components/communities/TopicRepliesInline';
import { TopicMediaPreviewModal } from '@/components/communities/TopicMediaPreviewModal';
import { TopicLinkThumbnail, extractFirstExternalUrl } from '@/components/communities/TopicLinkThumbnail';
import { useTopicMediaSummaries } from '@/hooks/useTopicMediaSummaries';
import { ErrorBoundary } from '@/components/ErrorBoundary';




import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { CommunityCreateGateModal } from '@/components/communities/CommunityCreateGateModal';

const safeText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);

// Remove tokens de mídia do markdown do corpo para a prévia da lista —
// evita expor URLs internas (storage do Supabase) na listagem pública.
const MEDIA_MD_RE = /(?:!\[[^\]]*\]\([^)]+\))|(?:\[(?:vídeo|video|áudio|audio)\]\([^)]+\))/gi;
const stripMediaFromBody = (raw: unknown) =>
  safeText(raw).replace(MEDIA_MD_RE, '').replace(/\n{3,}/g, '\n\n').trim();

// IMPORTANTE: NÃO extraímos a URL real da mídia para a listagem.
// O listing só recebe { kind } a partir do markdown, e o cover_url vem
// de uma consulta segura ao DB (useTopicMediaSummaries). A URL real só
// é resolvida quando o modal de preview é aberto.
type ListingMediaKind = 'image' | 'video' | 'audio';
const firstMediaKindInBody = (raw: unknown): ListingMediaKind | null => {
  const s = safeText(raw);
  if (!s) return null;
  if (/!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/i.test(s)) return 'image';
  if (/\[(?:vídeo|video)\]\(https?:\/\/[^\s)]+\)/i.test(s)) return 'video';
  if (/\[(?:áudio|audio)\]\(https?:\/\/[^\s)]+\)/i.test(s)) return 'audio';
  return null;
};
/** Extrai a primeira URL de mídia do corpo (fallback p/ tópicos antigos
 *  que ainda não têm linha em oculto_community_media). Aceita markdown
 *  [vídeo](url), ![alt](url), [áudio](url) e URL crua com extensão. */
const firstMediaUrlInBody = (raw: unknown): string | null => {
  const s = safeText(raw);
  if (!s) return null;
  const md = s.match(/(?:!\[[^\]]*\]|\[(?:v[ií]deo|video|[áa]udio|audio)\])\((https?:\/\/[^\s)]+)\)/i);
  if (md?.[1]) return md[1];
  const ext = s.match(/https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|avif|bmp|mp4|webm|mov|m4v|ogv|mp3|wav|ogg|m4a|aac)(?:\?[^\s)]*)?/i);
  return ext?.[0] ?? null;
};

const safeTime = (value: unknown) => {
  const time = new Date(safeText(value)).getTime();
  return Number.isFinite(time) ? time : 0;
};

const safeDistance = (value: unknown) => {
  const time = safeTime(value);
  return time > 0 ? formatDistanceToNow(new Date(time), { addSuffix: true, locale: ptBR }) : 'agora';
};

const safeDateTimeLabel = (value: unknown) => {
  const time = safeTime(value);
  if (time <= 0) return 'data indisponível';
  return new Date(time).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};


export default function CommunityDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: community, isLoading } = useCommunityBySlug(slug);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const { data: topics = [] } = useCommunityTopics(community?.id, activeChannelId);
  const { data: channels = [] } = useCommunityChannels(community?.id);
  useCommunityRealtime(community?.id);
  const { data: membership } = useMyMembership(community?.id);
  const join = useJoinCommunity(community?.id);
  const leave = useLeaveCommunity(community?.id);
  const report = useReportCommunityContent();
  // toggle/heart legados substituídos pela CommunityReactionsBar
  const moderate = useModerateTopic(community?.id);
  const setNotifyLevel = useSetCommunityNotifyLevel(community?.id);

  const [showCreate, setShowCreate] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [showManageQuestions, setShowManageQuestions] = useState(false);
  const [showJoinQuestions, setShowJoinQuestions] = useState(false);
  const { data: joinQuestions } = useCommunityJoinQuestions(community?.id);
  const hasJoinQuestions = (joinQuestions ?? []).length > 0;
  const [showPendingTopics, setShowPendingTopics] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [activeTab, setActiveTab] = useState<'topics' | 'events' | 'media' | 'members' | 'badges' | 'about' | 'insights'>('topics');
  const [openRepliesTopicId, setOpenRepliesTopicId] = useState<string | null>(null);
  const [editingTopic, setEditingTopic] = useState<any | null>(null);
  const { user } = useAuth();


  const [search, setSearch] = useState('');


  const { data: members = [] } = useCommunityActiveMembers(community?.id, 200);



  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) =>
        safeText(t.title).toLowerCase().includes(q) ||
        stripMediaFromBody(t.body).toLowerCase().includes(q),
    );
  }, [topics, search]);

  const authorIds = useMemo(() => filteredTopics.map((t) => t.author_id), [filteredTopics]);
  const topicIds = useMemo(() => filteredTopics.map((t) => t.id), [filteredTopics]);
  const { data: authors } = useAuthorsBatch(authorIds);
  const { data: myReactions } = useMyTopicReactions(topicIds);
  const { data: topicReactionSummaries } = useTopicReactionsSummary(topicIds);
  const { data: mediaSummaries, isLoading: mediaSummariesLoading } = useTopicMediaSummaries(topicIds);
  const [previewMedia, setPreviewMedia] = useState<{ topicId: string; kind: 'image' | 'video' | 'audio'; coverUrl: string | null } | null>(null);


  const isMember = membership?.status === 'active';
  const isPending = membership?.status === 'pending';
  const isOwner = membership?.role === 'owner';
  const isMod = membership?.role === 'moderator' || isOwner;

  const { data: pendingCount = 0 } = usePendingMembersCount(community?.id, isMod);
  const { data: pendingTopicsCount = 0 } = usePendingTopicsCount(community?.id, isMod && !!community?.require_post_approval);
  const updateImagePositions = useUpdateCommunityImagePositions(community?.id);
  const { data: ownerProfile } = useCommunityOwnerProfile(community?.owner_id);
  // Privacidade: SEMPRE exibir @username, nunca o nome real (display_name/name).
  const ownerLabel = ownerProfile?.username ? `@${ownerProfile.username}` : null;


  const { profile: viewerProfile } = useProfile();
  const viewerPlan = (viewerProfile?.plan_type || 'free').toLowerCase();
  const viewerIsPaid = viewerPlan === 'premium' || viewerPlan === 'vip';

  if (isLoading) return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando…</div>;
  if (!community) return <div className="px-4 py-8 text-center text-sm text-muted-foreground">Comunidade não encontrada.</div>;

  // Comunidade congelada (beta encerrado para dono Free).
  if ((community as any).status === 'frozen' && !(isOwner && viewerIsPaid)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="inline-flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-4">
          <Crown className="h-7 w-7 text-amber-300" />
        </div>
        <h1 className="text-lg font-semibold mb-2">Comunidade congelada</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isOwner
            ? 'O período beta terminou. Para reativar e editar sua comunidade, assine Premium ou VIP.'
            : 'Esta comunidade está aguardando reativação pelo dono. Volte em breve.'}
        </p>
        <div className="flex flex-col gap-2">
          {isOwner && (
            <Button
              className="w-full bg-gradient-to-r from-amber-500 to-fuchsia-600 text-white"
              onClick={() => navigate('/subscriptions')}
            >
              <Crown className="h-4 w-4 mr-1.5" /> Assinar Premium ou VIP
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate('/comunidades')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar para Comunidades
          </Button>
        </div>
        {isOwner && (
          <CommunityCreateGateModal
            open
            onOpenChange={() => navigate('/comunidades')}
            reason="frozen_post_beta"
          />
        )}
      </div>
    );
  }


  return (
    <div className="max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="relative">
        <div className="h-28 sm:h-40 bg-gradient-to-r from-fuchsia-900/40 via-purple-900/40 to-indigo-900/40 overflow-hidden relative">
          <DraggableImagePosition
            src={community.cover_url}
            alt=""
            positionX={community.cover_position_x ?? 50}
            positionY={community.cover_position_y ?? 50}
            editable={isOwner}
            className="absolute inset-0 h-full w-full"
            onSave={async ({ x, y }) => {
              await updateImagePositions.mutateAsync({ cover_x: x, cover_y: y });
            }}
          />
        </div>
        <button
          onClick={() => navigate('/comunidades')}
          className="absolute top-2 left-2 h-9 pl-2 pr-3 rounded-full bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 text-black font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/30 z-10 active:scale-95 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>

      <div className="px-3 sm:px-4 -mt-6 relative">
        <div className="flex items-end gap-3">
          <div
            className="h-16 w-16 rounded-xl border-2 border-background overflow-hidden flex items-center justify-center relative"
            style={{ background: community.accent_color
              ? `linear-gradient(135deg, ${community.accent_color}, ${community.accent_color}cc)`
              : 'linear-gradient(135deg, #c026d3, #7e22ce)' }}
          >
            <DraggableImagePosition
              src={community.avatar_url}
              alt=""
              positionX={community.avatar_position_x ?? 50}
              positionY={community.avatar_position_y ?? 50}
              editable={isOwner}
              className="absolute inset-0 h-full w-full"
              fallback={<Users className="h-7 w-7 text-white" />}
              onSave={async ({ x, y }) => {
                await updateImagePositions.mutateAsync({ avatar_x: x, avatar_y: y });
              }}
            />
          </div>

          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1
                className="text-base sm:text-xl font-bold text-white leading-tight break-words [overflow-wrap:anywhere] line-clamp-2 max-w-full [text-shadow:0_2px_4px_rgba(0,0,0,0.95),0_0_2px_rgba(0,0,0,0.9)]"
                title={community.title}
              >
                {community.title}
              </h1>
              {community.is_official && <Badge className="bg-amber-600/30 text-amber-200 text-[9px] h-4 px-1.5">OFICIAL</Badge>}
              {community.is_adult && <Badge className="bg-rose-700/30 text-rose-200 text-[9px] h-4 px-1.5">+18</Badge>}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
              <span>{community.members_count} membros</span>
              <span>·</span>
              <span>{community.topics_count} tópicos</span>
              {ownerLabel && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Crown className="h-3 w-3 text-amber-400" />
                    por{' '}
                    {ownerProfile?.username ? (
                      <Link
                        to={`/profile/${ownerProfile.username}`}
                        className="font-semibold text-foreground/90 hover:text-amber-300 transition-colors"
                      >
                        @{ownerProfile.username}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground/90">{ownerLabel}</span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {community.description && (
          <p className="text-sm text-foreground/90 mt-3">{community.description}</p>
        )}

        {community.rules && (
          <details className="mt-2 rounded-lg border border-border bg-card/40 p-2">
            <summary className="text-xs font-semibold cursor-pointer">Regras da comunidade</summary>
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{community.rules}</p>
          </details>
        )}

        {/* Ações de membership */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {!isMember && !isPending && (
            <Button
              size="sm"
              className="flex-1 min-w-[120px]"
              onClick={() => (hasJoinQuestions ? setShowJoinQuestions(true) : join.mutate())}
              disabled={join.isPending}
            >
              {community.visibility === 'private' || community.require_join_approval ? 'Solicitar entrada' : 'Entrar'}
            </Button>
          )}
          {isPending && (
            <Button size="sm" variant="secondary" disabled className="flex-1 min-w-[120px]">
              Aguardando aprovação
            </Button>
          )}
          {isMember && !isOwner && (
            <Button
              size="sm"
              onClick={() => leave.mutate()}
              disabled={leave.isPending}
              className="bg-zinc-700 hover:bg-zinc-600 text-white border-transparent"
            >
              Sair
            </Button>
          )}
          {isMember && (
            <Button
              size="sm"
              className="flex-1 min-w-[120px] gap-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white border-transparent shadow-none"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Novo tópico
            </Button>
          )}
          {isMember && (() => {
            const lvl = membership?.notify_level || 'all';
            const Icon = lvl === 'mute' ? BellOff : lvl === 'mentions' ? AtSign : Bell;
            const label = lvl === 'mute' ? 'Silenciada' : lvl === 'mentions' ? 'Só menções' : 'Tudo';
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="gap-1 bg-sky-600 hover:bg-sky-500 text-white border-transparent"
                    title="Notificações da comunidade"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setNotifyLevel.mutate('all')}>
                    <Bell className="h-3.5 w-3.5 mr-2" /> Tudo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNotifyLevel.mutate('mentions')}>
                    <AtSign className="h-3.5 w-3.5 mr-2" /> Só menções
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNotifyLevel.mutate('mute')}>
                    <BellOff className="h-3.5 w-3.5 mr-2" /> Silenciar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}
          {isMod && (
            <Button
              size="sm"
              className="gap-1 relative bg-violet-600 hover:bg-violet-500 text-white border-transparent"
              onClick={() => setShowManage(true)}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Membros
              {pendingCount > 0 && (
                <Badge className="ml-1 h-4 px-1.5 text-[9px] bg-white text-violet-700">{pendingCount}</Badge>
              )}
            </Button>
          )}
          {isMod && (
            <Button
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
              onClick={() => setShowInvites(true)}
            >
              <Link2 className="h-3.5 w-3.5" />
              Convidar
            </Button>
          )}
          {isMod && community.require_post_approval && (
            <Button
              size="sm"
              className="gap-1 relative bg-amber-500 hover:bg-amber-400 text-zinc-900 border-transparent"
              onClick={() => setShowPendingTopics(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              Tópicos
              {pendingTopicsCount > 0 && (
                <Badge className="ml-1 h-4 px-1.5 text-[9px] bg-zinc-900 text-amber-300">{pendingTopicsCount}</Badge>
              )}
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              className="gap-1 bg-cyan-600 hover:bg-cyan-500 text-white border-transparent"
              onClick={() => setShowEdit(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              className="gap-1 bg-indigo-600 hover:bg-indigo-500 text-white border-transparent"
              onClick={() => setShowManageQuestions(true)}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Portaria
              {hasJoinQuestions && (
                <Badge className="ml-1 h-4 px-1.5 text-[9px] bg-white text-indigo-700">
                  {joinQuestions!.length}
                </Badge>
              )}
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              className="gap-1 bg-purple-600 hover:bg-purple-500 text-white border-transparent"
              onClick={() => setShowChannels(true)}
              title="Gerenciar canais"
            >
              <Hash className="h-3.5 w-3.5" />
              Canais
            </Button>
          )}

          <Button
            size="sm"
            className="px-2 bg-rose-600 hover:bg-rose-500 text-white border-transparent"
            title="Denunciar comunidade"
            onClick={() => {
              const reason = window.prompt('Motivo da denúncia:');
              if (reason) report.mutate({ community_id: community.id, reason });
            }}
          >
            <Flag className="h-4 w-4" />
          </Button>
        </div>


        {/* Tabs */}
        <div className="mt-5 sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 bg-background/85 backdrop-blur-md flex items-center gap-1.5 border-b border-border overflow-x-auto scrollbar-none">
          {([
            { k: 'topics',   label: 'Tópicos',    icon: MessageSquare, count: topics.length,  show: true,     active: 'bg-fuchsia-600 text-white',  idle: 'bg-fuchsia-600/15 text-fuchsia-200 hover:bg-fuchsia-600/25' },
            { k: 'events',   label: 'Eventos',    icon: CalendarDays,  count: null,           show: true,     active: 'bg-sky-600 text-white',      idle: 'bg-sky-600/15 text-sky-200 hover:bg-sky-600/25' },
            { k: 'media',    label: 'Mídia',      icon: ImageIcon,     count: null,           show: true,     active: 'bg-emerald-600 text-white',  idle: 'bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25' },
            { k: 'members',  label: 'Membros',    icon: Users,         count: members.length, show: true,     active: 'bg-violet-600 text-white',   idle: 'bg-violet-600/15 text-violet-200 hover:bg-violet-600/25' },
            { k: 'badges',   label: 'Conquistas', icon: Award,         count: null,           show: isMember, active: 'bg-amber-500 text-zinc-900', idle: 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25' },
            { k: 'insights', label: 'Insights',   icon: BarChart3,     count: null,           show: isMod,    active: 'bg-cyan-600 text-white',     idle: 'bg-cyan-600/15 text-cyan-200 hover:bg-cyan-600/25' },
            { k: 'about',    label: 'Sobre',      icon: Info,          count: null,           show: true,     active: 'bg-rose-600 text-white',     idle: 'bg-rose-600/15 text-rose-200 hover:bg-rose-600/25' },
          ] as const).filter(t => t.show).map(({ k, label, icon: Icon, count, active, idle }) => (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 my-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeTab === k ? active : idle
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {count !== null && <span className="text-[10px] opacity-80">({count})</span>}
            </button>
          ))}
        </div>


        {/* Tópicos */}
        {activeTab === 'topics' && (
        <div className="mt-3 space-y-2">
          {/* Chips de canais (sub-fóruns) */}
          {(channels.length > 0 || isMod) && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              <button
                onClick={() => setActiveChannelId(null)}
                className={`shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors ${
                  activeChannelId === null
                    ? 'bg-fuchsia-600/20 border-fuchsia-500/60 text-fuchsia-200'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Todos
              </button>
              {channels.filter((c) => !c.is_archived).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveChannelId(c.id)}
                  className={`shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors ${
                    activeChannelId === c.id
                      ? 'bg-fuchsia-600/20 border-fuchsia-500/60 text-fuchsia-200'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground'
                  }`}
                  title={c.description || c.name}
                >
                  <Hash className="h-3 w-3" />
                  {c.name}
                </button>
              ))}
              {isMod && (
                <button
                  onClick={() => setShowChannels(true)}
                  className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-dashed border-border text-muted-foreground hover:text-foreground"
                  title="Gerenciar canais"
                >
                  <Settings2 className="h-3 w-3" />
                  Canais
                </button>
              )}
            </div>
          )}
          {topics.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tópicos…"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm"
              />
            </div>
          )}
          <ErrorBoundary inline fallback={<div className="h-2" />}>
            <CommunityPlayStrip communityId={community.id} accentColor={community.accent_color || undefined} />
          </ErrorBoundary>
          {filteredTopics.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {search ? 'Nenhum tópico encontrado para essa busca.' : `Nenhum tópico ainda. ${isMember ? 'Seja o primeiro a iniciar uma conversa!' : ''}`}
            </div>
          )}
          {(() => {
            const pinned = filteredTopics.filter((t) => t.is_pinned);
            const regular = filteredTopics
              .filter((t) => !t.is_pinned)
              .slice()
              .sort(
                (a, b) =>
                  safeTime(b.created_at) - safeTime(a.created_at),
              );
            return (
              <>
                {pinned.length > 0 && (
                  <div className="text-[10px] uppercase font-semibold text-amber-400/80 flex items-center gap-1 px-1">
                    <Pin className="h-3 w-3" /> Fixados / Anúncios
                  </div>
                )}
                {[...pinned, ...regular].map((t, idx) => {
                  const isPinnedItem = t.is_pinned;
                  const isFirstRegular = !isPinnedItem && pinned.length > 0 && idx === pinned.length;
                  return (
                    <div key={`wrap-${t.id}`}>
                      {isFirstRegular && (
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground/60 px-1 mt-3 mb-1">
                          Tópicos recentes
                        </div>
                      )}
                      {(() => {
            const author = authors?.get(t.author_id);
            const accent = community.accent_color || '#a855f7';
            const headerStyle = !isPinnedItem
              ? {
                  background: `linear-gradient(135deg, ${accent}40 0%, ${accent}1f 55%, transparent 100%)`,
                  borderLeft: `3px solid ${accent}`,
                }
              : undefined;
            const createdTime = safeTime(t.created_at);
            const createdLabel = safeDateTimeLabel(t.created_at);
            return (
              <div
                key={t.id}
                className={`rounded-xl border p-3 ${
                  isPinnedItem
                    ? 'border-amber-500/40 bg-amber-500/[0.04]'
                    : 'border-border bg-card'
                }`}
              >
                <Link to={`/comunidades/${community.slug}/topico/${t.id}`} className="block active:opacity-70">
                  <div
                    className="flex items-start gap-2 -mx-3 -mt-3 px-3 pt-3 pb-2.5 rounded-t-xl"
                    style={headerStyle}
                  >
                    {t.is_pinned && <Pin className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />}
                    {(() => {
                      const mediaKind = firstMediaKindInBody(t.body);
                      if (!mediaKind) {
                        // Sem mídia anexada — checa link externo no corpo.
                        const externalUrl = extractFirstExternalUrl(t.body);
                        if (externalUrl) {
                          return <TopicLinkThumbnail url={externalUrl} />;
                        }
                        return null;
                      }
                      const summary = mediaSummaries?.get(t.id) ?? null;
                      // Fallback de URL direto do markdown — cobre tópicos antigos
                      // sem registro em oculto_community_media.
                      const bodyMediaUrl = !summary ? firstMediaUrlInBody(t.body) : null;
                      const cover = summary?.cover_url ?? (mediaKind === 'image' ? bodyMediaUrl : null);
                      const mediaUrl = summary?.url ?? bodyMediaUrl;
                      const isImg = mediaKind === 'image';
                      const isVid = mediaKind === 'video';
                      const badgeLabel = isImg ? 'Foto' : isVid ? 'Vídeo' : 'Áudio';
                      const badgeClass = isImg
                        ? 'bg-emerald-600/85 text-white'
                        : isVid
                          ? 'bg-fuchsia-600/85 text-white'
                          : 'bg-sky-600/85 text-white';
                      const MediaIcon = isImg ? ImageIcon : isVid ? Video : Music;
                      const isSummaryLoading = mediaSummariesLoading && !summary;
                      return (
                        <div className="shrink-0 flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPreviewMedia({ topicId: t.id, kind: mediaKind, coverUrl: cover });
                            }}
                            className="relative h-12 w-12 rounded-md overflow-hidden border border-border/60 bg-black/60 grid place-items-center active:scale-95 transition-transform"
                            aria-label={`Abrir ${badgeLabel.toLowerCase()} do tópico`}
                          >
                            {isSummaryLoading ? (
                              <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
                            ) : isImg && (cover || mediaUrl) ? (
                              <img
                                src={(cover || mediaUrl) as string}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                                onContextMenu={(e) => e.preventDefault()}
                              />
                            ) : isVid && cover ? (
                              <>
                                <img
                                  src={cover}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                  onContextMenu={(e) => e.preventDefault()}
                                />
                                <span className="absolute inset-0 grid place-items-center bg-black/35">
                                  <MediaIcon className="h-4 w-4 text-white drop-shadow" />
                                </span>
                              </>
                            ) : isVid && mediaUrl ? (
                              <>
                                <video
                                  src={`${mediaUrl}#t=0.5`}
                                  preload="metadata"
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover pointer-events-none"
                                  onContextMenu={(e) => e.preventDefault()}
                                />
                                <span className="absolute inset-0 grid place-items-center bg-black/35">
                                  <MediaIcon className="h-4 w-4 text-white drop-shadow" />
                                </span>
                              </>
                            ) : isVid ? (
                              <span
                                className="absolute inset-0 grid place-items-center"
                                style={{ background: 'linear-gradient(135deg,#3b0764 0%,#1e1b4b 60%,#0f172a 100%)' }}
                              >
                                <MediaIcon className="h-5 w-5 text-fuchsia-200/90" />
                              </span>
                            ) : (
                              <MediaIcon className="h-5 w-5 text-white/80" />
                            )}
                          </button>
                          <span className={`text-[8px] leading-none px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm font-bold leading-snug text-foreground">{safeText(t.title, 'Tópico')}</h3>
                        {t.is_adult && <Badge className="bg-rose-700/30 text-rose-200 text-[9px] h-4 px-1.5">+18</Badge>}
                        {t.is_locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      {(() => {
                        const clean = stripMediaFromBody(t.body);
                        return clean ? (
                          <p className="text-xs text-foreground/80 line-clamp-2 mt-0.5 break-words">{clean}</p>
                        ) : null;
                      })()}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-foreground/70 flex-wrap">
                        <span>por {author?.username ? `@${author.username}` : 'alguém'}</span>
                        <span>·</span>
                        <span className="font-semibold" style={{ color: accent }}>{t.replies_count} respostas</span>
                        <span>·</span>
                        <span title={createdTime > 0 ? new Date(createdTime).toISOString() : undefined}>criado em {createdLabel}</span>
                        <span>·</span>
                        <span className="text-foreground/50">{safeDistance(t.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
                <ErrorBoundary inline fallback={<div className="mt-2 pt-2 border-t border-border/60 text-[11px] text-muted-foreground">Respostas indisponíveis.</div>}>
                  <TopicRepliesInline
                    topicId={t.id}
                    repliesCount={t.replies_count}
                    communitySlug={community.slug}
                    accentColor={accent}
                    isOpen={openRepliesTopicId === t.id}
                    onToggle={(next) => setOpenRepliesTopicId(next ? t.id : null)}
                  />
                </ErrorBoundary>


                {(isMember || isMod) && (() => {
                  const viewerIds = [user?.id, viewerProfile?.id, (viewerProfile as any)?.user_id].filter(Boolean);
                  const isAuthor = viewerIds.includes(t.author_id);
                  const showMenu = isMod || isAuthor;
                  return (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/60">
                      {isMember && (
                        <CommunityReactionsBar
                          communityId={community.id}
                          topicId={t.id}
                          summary={topicReactionSummaries?.[t.id]}
                          size="xs"
                        />
                      )}
                      {showMenu && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="ml-auto h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground"
                              title="Opções"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {isAuthor && (
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); setEditingTopic(t); }}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                              </DropdownMenuItem>
                            )}
                            {isMod && (
                              <DropdownMenuItem onClick={() => moderate.mutate({ topic_id: t.id, action: t.is_pinned ? 'unpin' : 'pin' })}>
                                {t.is_pinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
                                {t.is_pinned ? 'Desafixar' : 'Fixar'}
                              </DropdownMenuItem>
                            )}
                            {isMod && (
                              <DropdownMenuItem onClick={() => moderate.mutate({ topic_id: t.id, action: t.is_locked ? 'unlock' : 'lock' })}>
                                {t.is_locked ? <Unlock className="h-3.5 w-3.5 mr-2" /> : <Lock className="h-3.5 w-3.5 mr-2" />}
                                {t.is_locked ? 'Reabrir' : 'Fechar'}
                              </DropdownMenuItem>
                            )}
                            {(isMod || isAuthor) && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (window.confirm('Remover este tópico?'))
                                    moderate.mutate({ topic_id: t.id, action: 'delete' });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Remover
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })()}

              </div>

            );
          })()}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
        )}


        {/* Eventos */}
        {activeTab === 'events' && (
          <CommunityEventsTab
            communityId={community.id}
            isMod={isMod}
            isMember={isMember}
            defaultChannelId={activeChannelId}
          />
        )}

        {/* Mídia */}
        {activeTab === 'media' && (
          <div className="mt-3">
            <CommunityMediaGallery communityId={community.id} slug={community.slug} />
          </div>
        )}

        {/* Conquistas */}
        {activeTab === 'badges' && isMember && (
          <div className="mt-3">
            <CommunityBadgesPanel communityId={community.id} />
          </div>
        )}



        {/* Membros */}
        {activeTab === 'members' && (
          <div className="mt-3 space-y-1.5">
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum membro ainda.</p>
            )}
            {members.map((m) => {
              const p = m.profile;
              const handle = p?.username ? `@${p.username}` : '';
              const name = p?.username ? `@${p.username}` : 'Usuário';
              const profileHref = p?.username ? `/u/${p.username}` : (m.user_id ? `/u/${m.user_id}` : '#');
              return (
                <Link
                  key={m.user_id}
                  to={profileHref}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/40 active:bg-accent"
                >
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 ring-1 ring-border/40">
                    {p?.avatar_url ? (
                      <img
                        src={buildSupabaseImageThumb(p.avatar_url, { width: 96, height: 96, quality: 72 }) ?? p.avatar_url}
                        alt=""
                        className="h-full w-full object-cover object-center"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <Users className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {m.role === 'owner' && (
                        <Badge className="bg-amber-600/30 text-amber-200 text-[9px] h-4 px-1.5 gap-0.5">
                          <Crown className="h-2.5 w-2.5" /> Dono
                        </Badge>
                      )}
                      {m.role === 'moderator' && (
                        <Badge className="bg-blue-600/30 text-blue-200 text-[9px] h-4 px-1.5 gap-0.5">
                          <Shield className="h-2.5 w-2.5" /> Mod
                        </Badge>
                      )}
                      {p?.is_vip && (
                        <Badge className="bg-fuchsia-600/30 text-fuchsia-200 text-[9px] h-4 px-1.5">VIP</Badge>
                      )}
                    </div>
                  </div>

                </Link>
              );
            })}
          </div>
        )}

        {/* Insights — owner/mod */}
        {activeTab === 'insights' && isMod && (
          <div className="mt-3">
            <CommunityInsightsPanel communityId={community.id} accentColor={community.accent_color || undefined} />
          </div>
        )}

        {/* Sobre */}
        {activeTab === 'about' && (
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">Descrição</p>
              <p className="mt-1 whitespace-pre-wrap">{community.description || 'Sem descrição.'}</p>
            </div>
            {community.rules && (
              <div className="rounded-xl border border-border bg-card/40 p-3">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold">Regras</p>
                <p className="mt-1 whitespace-pre-wrap text-foreground/90">{community.rules}</p>
              </div>
            )}
            <div className="rounded-xl border border-border bg-card/40 p-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Visibilidade</p>
                <p className="font-medium capitalize">{community.visibility.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Conteúdo +18</p>
                <p className="font-medium">{community.is_adult ? 'Sim' : 'Não'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Membros</p>
                <p className="font-medium">{community.members_count}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Tópicos</p>
                <p className="font-medium">{community.topics_count}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] uppercase text-muted-foreground">Criada em</p>
                <p className="font-medium">
                  {safeTime(community.created_at) > 0
                    ? new Date(safeTime(community.created_at)).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>


      <CreateTopicModal open={showCreate} onOpenChange={setShowCreate} communityId={community.id} defaultChannelId={activeChannelId} />
      {editingTopic && (
        <CreateTopicModal
          open={!!editingTopic}
          onOpenChange={(v) => { if (!v) setEditingTopic(null); }}
          communityId={community.id}
          mode="edit"
          initialTopic={{
            id: editingTopic.id,
            title: editingTopic.title,
            body: editingTopic.body,
            is_adult: editingTopic.is_adult,
            channel_id: editingTopic.channel_id ?? null,
          }}
        />
      )}
      <ManageChannelsModal open={showChannels} onOpenChange={setShowChannels} communityId={community.id} />
      <ModerateMembersModal open={showManage} onOpenChange={setShowManage} communityId={community.id} isOwner={isOwner} />
      <EditCommunityModal open={showEdit} onOpenChange={setShowEdit} community={community} />
      <InvitesModal open={showInvites} onOpenChange={setShowInvites} communityId={community.id} />
      <ManageJoinQuestionsModal
        open={showManageQuestions}
        onOpenChange={setShowManageQuestions}
        communityId={community.id}
      />
      <JoinQuestionsModal
        open={showJoinQuestions}
        onOpenChange={setShowJoinQuestions}
        communityId={community.id}
        communityTitle={community.title}
      />
      <PendingTopicsModal open={showPendingTopics} onOpenChange={setShowPendingTopics} communityId={community.id} />

      {previewMedia && (
        <TopicMediaPreviewModal
          open={!!previewMedia}
          onOpenChange={(v) => { if (!v) setPreviewMedia(null); }}
          topicId={previewMedia.topicId}
          kind={previewMedia.kind}
          coverUrl={previewMedia.coverUrl}
        />
      )}



    </div>
  );
}
