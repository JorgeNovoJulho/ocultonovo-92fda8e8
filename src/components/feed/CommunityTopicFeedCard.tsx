import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users2,
  ArrowRight,
  MessageSquare,
  MoreVertical,
  Flag,
  Pencil,
  Trash2,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
} from 'lucide-react';
import { CachedImage } from '@/components/common/CachedImage';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { extractFirstLink } from '@/lib/postMediaUtils';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import {
  useReportCommunityContent,
  useCommunityTopic,
} from '@/hooks/useCommunities';
import { useTopicReplyCount } from '@/hooks/useTopicReplyCount';
import { useDeletePost } from '@/hooks/usePosts';
import { CreateTopicModal } from '@/components/communities/CreateTopicModal';
import { isImageCached, markImageCached, isVideoMetadataCached, markVideoMetadataCached } from '@/lib/imageLoadCache';

interface TopicSnapshot {
  v: number;
  kind: 'community_topic';
  community_id: string;
  community_title: string;
  community_slug: string;
  community_cover_url: string | null;
  community_avatar_url: string | null;
  accent_color: string | null;
  topic_id: string;
  topic_title: string;
  topic_body: string | null;
  /** Campos opcionais (snapshot v≥2) — preenchidos no momento da criação
   *  para evitar uma 2ª consulta ao banco por card no feed. */
  first_media_kind?: 'image' | 'video' | 'audio' | null;
  first_media_url?: string | null;
  first_media_cover_url?: string | null;
}

export function parseCommunityTopicSnapshot(text: unknown): TopicSnapshot | null {
  if (typeof text !== 'string') return null;
  if (!text.startsWith('__COMMUNITY_TOPIC__')) return null;
  try {
    const json = text.slice('__COMMUNITY_TOPIC__'.length).trim();
    const parsed = JSON.parse(json);
    if (parsed?.kind !== 'community_topic') return null;
    return parsed as TopicSnapshot;
  } catch {
    return null;
  }
}

interface Props {
  post: any;
}

/** Skeleton elegante (gradiente + shimmer) usado enquanto a mídia carrega. */
function MediaSkeleton({
  kind,
  accent,
  className = '',
}: { kind: 'image' | 'video' | 'audio'; accent: string; className?: string }) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? VideoIcon : MusicIcon;
  return (
    <div
      className={cn(
        'absolute inset-0 grid place-items-center overflow-hidden',
        'bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40',
        className,
      )}
    >
      <span
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/8 to-transparent"
        style={{ animation: 'shimmer 1.4s infinite' }}
      />
      <Icon className="h-7 w-7 opacity-60" style={{ color: accent }} />
      <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
    </div>
  );
}

export const CommunityTopicFeedCard = memo(function CommunityTopicFeedCard({ post }: Props) {
  const snap = useMemo(() => parseCommunityTopicSnapshot(post?.content_text), [post?.content_text]);
  const { user } = useAuth();
  const { data: isMaster } = useIsMasterAdmin();
  const report = useReportCommunityContent();
  
  const deletePost = useDeletePost();

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(() => isImageCached((post as any)?.media_url));
  const [vidLoaded, setVidLoaded] = useState(() => isVideoMetadataCached((post as any)?.media_url));
  const [audLoaded, setAudLoaded] = useState(false);

  // Carrega o tópico apenas quando o modal de edição abre, para ter is_adult/channel_id/body atualizados.
  const { data: fullTopic } = useCommunityTopic(editOpen ? snap?.topic_id : undefined);

  if (!snap) return null;

  const accent = snap.accent_color || '#7c3aed';
  const href = `/comunidades/${snap.community_slug}/topico/${snap.topic_id}`;
  const cover = snap.community_cover_url || snap.community_avatar_url;

  // ===== Extração de mídia (zero-fetch: usa snapshot + parse do corpo) =====
  const rawBody = snap.topic_body || '';
  const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)(\?[^\s)]*)?$/i;
  const VID_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?[^\s)]*)?$/i;
  const AUD_EXT = /\.(mp3|wav|ogg|m4a|aac)(\?[^\s)]*)?$/i;
  // URLs internas (qualquer host *.supabase.co) NUNCA viram link-preview público.
  const INTERNAL_URL = /(supabase\.co|supabase\.in)/i;

  let postedImageUrl: string | null = null;
  let postedVideoUrl: string | null = null;
  let postedAudioUrl: string | null = null;
  let videoCoverUrl: string | null = null;

  // 1) Prioridade: dados embutidos no snapshot do post (snapshot v≥2).
  if (snap.first_media_kind && snap.first_media_url) {
    if (snap.first_media_kind === 'image') {
      postedImageUrl = snap.first_media_cover_url ?? snap.first_media_url;
    } else if (snap.first_media_kind === 'video') {
      postedVideoUrl = snap.first_media_url;
      videoCoverUrl = snap.first_media_cover_url ?? null;
    } else if (snap.first_media_kind === 'audio') {
      postedAudioUrl = snap.first_media_url;
    }
  }


  // 2) Fallback: parse do markdown do corpo (posts antigos sem registro em DB).
  if (!postedImageUrl && !postedVideoUrl && !postedAudioUrl) {
    const mdImg = rawBody.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
    if (mdImg?.[1]) postedImageUrl = mdImg[1];
    const mdVid = rawBody.match(/\[(?:v[ií]deo|video)\]\((https?:\/\/[^\s)]+)\)/i);
    if (mdVid?.[1]) postedVideoUrl = mdVid[1];
    const mdAud = rawBody.match(/\[(?:[áa]udio|audio)\]\((https?:\/\/[^\s)]+)\)/i);
    if (mdAud?.[1]) postedAudioUrl = mdAud[1];

    if (!postedImageUrl || !postedVideoUrl || !postedAudioUrl) {
      const urlMatch = rawBody.match(/https?:\/\/[^\s)]+/gi) || [];
      if (!postedImageUrl) postedImageUrl = urlMatch.find((u) => IMG_EXT.test(u)) || null;
      if (!postedVideoUrl) postedVideoUrl = urlMatch.find((u) => VID_EXT.test(u)) || null;
      if (!postedAudioUrl) postedAudioUrl = urlMatch.find((u) => AUD_EXT.test(u)) || null;
    }
  }

  // ===== Teaser: limpa qualquer URL do supabase ou de mídia =====
  const cleanBody = rawBody
    .replace(/!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/gi, '')
    .replace(/\[(?:v[ií]deo|video|[áa]udio|audio)\]\(https?:\/\/[^\s)]+\)/gi, '')
    .replace(/https?:\/\/\S+/gi, (u) =>
      IMG_EXT.test(u) || VID_EXT.test(u) || AUD_EXT.test(u) || INTERNAL_URL.test(u) ? '' : u,
    )
    .replace(/\s+/g, ' ')
    .trim();
  const teaser = cleanBody.length > 220 ? `${cleanBody.slice(0, 220)}…` : cleanBody;

  // Link-preview só para URLs externas que não sejam do storage.
  const candidateLink = !postedImageUrl && !postedVideoUrl && !postedAudioUrl
    ? extractFirstLink(cleanBody)
    : null;
  const previewLink = candidateLink && !INTERNAL_URL.test(candidateLink) ? candidateLink : null;

  const isOwner = !!user?.id && user.id === post?.author_id;
  const canEdit = isOwner || !!isMaster;
  const canDelete = isOwner || !!isMaster;

  // Contagem de respostas em tempo real (atualiza sem reload).
  const { data: replyCount = 0 } = useTopicReplyCount(snap.topic_id);
  const replyLabel =
    replyCount === 0
      ? 'Seja o primeiro a responder'
      : replyCount === 1
      ? '1 resposta'
      : `${replyCount.toLocaleString('pt-BR')} respostas`;

  const handleReport = () => {
    setMenuOpen(false);
    const reason = window.prompt('Motivo da denúncia (ex.: conteúdo impróprio, spam, abuso):');
    if (!reason || !reason.trim()) return;
    report.mutate({
      community_id: snap.community_id,
      topic_id: snap.topic_id,
      reason: reason.trim(),
    });
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!window.confirm('Remover esta publicação do feed? O tópico continuará disponível dentro da comunidade.')) return;
    try {
      await deletePost.mutateAsync({ id: post.id, media_url: post.media_url ?? null });
      const { toast } = await import('sonner');
      toast.success('Publicação removida do feed.');
    } catch (e: any) {
      const { toast } = await import('sonner');
      toast.error(e?.message || 'Não foi possível remover (permissão negada).');
    }
  };

  return (
    <article
      className="relative overflow-hidden rounded-2xl border bg-card"
      style={{
        borderColor: `${accent}40`,
        boxShadow: `inset 4px 0 0 ${accent}`,
      }}
    >
      {/* Menu 3 pontos — absoluto sobre o header, fora do <Link> */}
      <div className="absolute top-2 right-2 z-20">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-9 w-9 rounded-full bg-background/70 backdrop-blur hover:bg-accent flex items-center justify-center text-muted-foreground"
              title="Opções"
              aria-label="Opções do tópico"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={handleReport}>
              <Flag className="h-3.5 w-3.5 mr-2" /> Denunciar
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" /> Editar tópico
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover do feed
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cabeçalho: badge da comunidade */}
      <Link
        to={`/comunidades/${snap.community_slug}`}
        className="flex items-center gap-3 px-4 pt-4 pb-2 pr-14 group"
      >
        {cover ? (
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
            <CachedImage src={cover} alt={snap.community_title} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div
            className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
            style={{ background: `${accent}26`, color: accent }}
          >
            <Users2 className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold" style={{ color: accent }}>
            <Users2 className="h-3 w-3" />
            <span>Comunidade</span>
          </div>
          <div className="truncate text-sm font-semibold text-foreground group-hover:underline">
            {snap.community_title}
          </div>
        </div>
      </Link>

      {/* Mídia principal: imagem > vídeo > áudio > preview de link >
          (último recurso) capa da comunidade. Proporção 16/9 padronizada. */}
      {postedImageUrl ? (
        <Link to={href} className="block px-4">
          <div
            className="relative aspect-video w-full overflow-hidden rounded-xl ring-1 bg-muted/30"
            style={{ ['--tw-ring-color' as any]: `${accent}40` }}
          >
            {!imgLoaded && <MediaSkeleton kind="image" accent={accent} />}
            <img
              src={postedImageUrl}
              alt={snap.topic_title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className={cn(
                'h-full w-full object-cover transition-opacity duration-300',
                imgLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={() => { markImageCached(postedImageUrl); setImgLoaded(true); }}
              onError={() => setImgLoaded(true)}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </Link>
      ) : postedVideoUrl ? (
        <div className="px-4">
          <div
            className="relative aspect-video w-full overflow-hidden rounded-xl ring-1 bg-black"
            style={{ ['--tw-ring-color' as any]: `${accent}40` }}
          >
            {!vidLoaded && <MediaSkeleton kind="video" accent={accent} />}
            <video
              src={postedVideoUrl}
              poster={videoCoverUrl ?? undefined}
              controls
              preload="metadata"
              playsInline
              className={cn(
                'h-full w-full bg-black object-contain transition-opacity duration-300',
                vidLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoadedMetadata={() => { markVideoMetadataCached(postedVideoUrl); setVidLoaded(true); }}
              onLoadedData={() => { markVideoMetadataCached(postedVideoUrl); setVidLoaded(true); }}
              onError={() => setVidLoaded(true)}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </div>
      ) : postedAudioUrl ? (
        <div className="px-4">
          <div
            className="relative rounded-xl ring-1 bg-muted/30 px-3 py-3 min-h-[64px]"
            style={{ ['--tw-ring-color' as any]: `${accent}40` }}
          >
            {!audLoaded && <MediaSkeleton kind="audio" accent={accent} className="rounded-xl" />}
            <audio
              src={postedAudioUrl}
              controls
              preload="metadata"
              className={cn('w-full transition-opacity duration-300', audLoaded ? 'opacity-100' : 'opacity-0')}
              onLoadedMetadata={() => setAudLoaded(true)}
              onError={() => setAudLoaded(true)}
            />
          </div>
        </div>
      ) : previewLink ? (
        <div className="px-4">
          <LinkPreviewCard text={previewLink} readOnly />
        </div>
      ) : snap.community_cover_url ? (
        <Link to={href} className="block px-4">
          <div
            className="relative aspect-video w-full overflow-hidden rounded-xl ring-1"
            style={{ ['--tw-ring-color' as any]: `${accent}40` }}
          >
            <CachedImage
              src={snap.community_cover_url}
              alt={snap.community_title}
              className="h-full w-full object-cover"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `linear-gradient(180deg, transparent 40%, ${accent}55 100%)` }}
            />
          </div>
        </Link>
      ) : null}

      {/* Título + corpo do tópico */}
      <Link to={href} className="block px-4 pt-3 pb-1">
        <h3 className="text-base sm:text-lg font-bold leading-snug text-foreground line-clamp-2">
          {snap.topic_title}
        </h3>
        {teaser && (
          <p className="mt-1.5 text-sm text-muted-foreground line-clamp-3">{teaser}</p>
        )}
      </Link>

      {/* CTA */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          <span aria-live="polite">{replyLabel}</span>
        </div>
        <Button
          asChild
          size="sm"
          className={cn('h-8 gap-1.5 font-semibold text-white hover:opacity-90')}
          style={{ background: accent }}
        >
          <Link to={href}>
            Entrar no tópico
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {/* Modal de edição (lazy) */}
      {editOpen && fullTopic && (
        <CreateTopicModal
          open={editOpen}
          onOpenChange={setEditOpen}
          communityId={snap.community_id}
          mode="edit"
          initialTopic={{
            id: fullTopic.id,
            title: fullTopic.title,
            body: (fullTopic as any).body ?? null,
            is_adult: (fullTopic as any).is_adult ?? false,
            channel_id: (fullTopic as any).channel_id ?? null,
          }}
        />
      )}
    </article>
  );
});
