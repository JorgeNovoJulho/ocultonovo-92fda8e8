/**
 * OcultoPlayItem — card unificado de um item do Play.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
import { useOcultoPlayActions, type OcultoPlayItem as OPItem } from '@/hooks/useOcultoPlayContent';
import { OcultoPlayVideoItem } from './OcultoPlayVideoItem';
import { OcultoPlayImageItem } from './OcultoPlayImageItem';
import { OcultoPlayAudioItem } from './OcultoPlayAudioItem';
import { OcultoPlayLinkPlayer } from './OcultoPlayLinkPlayer';

import { playSharedAudio, getAudioState, ocultoPlayMetaFromItem } from '@/lib/ocultoPlayAudioSession';
import { OcultoPlayActions } from './OcultoPlayActions';
import { PlayOutboundCTAs } from './PlayOutboundCTAs';
import { OcultoPlayFocusModal } from './OcultoPlayFocusModal';
import { OcultoPlayItemMenu } from './OcultoPlayItemMenu';
import { useEffectiveViewCount } from '@/store/useOcultoPlayCountersStore';


interface Props {
  item: OPItem;
  preloadMeta?: boolean;
  variant?: 'card' | 'tiktok';
  rank?: number;
  onLike?: (item: OPItem) => void;
  onDislike?: (item: OPItem) => void;
  onSave?: (item: OPItem) => void;
  onComment?: (item: OPItem) => void;
  onShare?: (item: OPItem) => void;
  onReport?: (item: OPItem) => void;
  onDelete?: (item: OPItem) => void;
  onEdit?: (item: OPItem) => void;
  onShareToFeed?: (item: OPItem) => void;
  canDelete?: boolean;
  isDeletePending?: boolean;
  isShareToFeedPending?: boolean;
  isLikePending?: boolean;
  isDislikePending?: boolean;
  isSavePending?: boolean;
  isSharePending?: boolean;
  countsLoading?: boolean;
  onEnded?: (item: OPItem) => void;
  onLinkCompleted?: (item: OPItem) => void;
  autoplayOnVisible?: boolean;
}

function formatCount(n: number | undefined) {
  if (!n || n <= 0) return '0';
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  if (n < 1_000_000) return Math.round(n / 1000) + 'k';
  return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
}

export function OcultoPlayItem({
  item, preloadMeta, variant = 'card', rank,
  onLike, onDislike, onSave, onComment, onShare, onReport,
  onDelete, onEdit, onShareToFeed, canDelete, isDeletePending, isShareToFeedPending,
  isLikePending, isDislikePending, isSavePending, isSharePending,
  countsLoading, onEnded, onLinkCompleted, autoplayOnVisible,
}: Props) {
  const [focusOpen, setFocusOpen] = useState(false);
  const actions = useOcultoPlayActions();
  const isVideo = item.kind === 'short_video' || item.kind === 'vip_teaser';
  const isMeme = item.kind === 'meme';
  const isAudio = item.kind === 'audio';
  const isLink = item.kind === 'link';
  const isTikTok = variant === 'tiktok';

  const canManage = !!canDelete;
  const handleEditClick = onEdit ? () => onEdit(item) : undefined;
  const handleDeleteClick = onDelete ? () => onDelete(item) : undefined;
  const handleShareToFeedClick = onShareToFeed ? () => onShareToFeed(item) : undefined;
  // Fonte da verdade compartilhada entre sessões Áudios/Vídeos
  const effectiveViews = useEffectiveViewCount(item.id, item.view_count);


  if (isAudio) {
    const openFocus = (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('button,input,a,[role="slider"],[role="listbox"],[role="option"],[role="menu"],[role="menuitem"]')) return;
      // Inicia reprodução se ainda não estiver tocando, e abre o modal de destaque
      if (item.audio_url && !getAudioState(item.id).playing) {
        playSharedAudio(item.id, item.audio_url, ocultoPlayMetaFromItem(item)).catch(() => { /* noop */ });
      }
      setFocusOpen(true);
    };
    return (
      <>
        <article
          onClick={openFocus}
          className="relative rounded-2xl overflow-hidden bg-card/40 border border-border/40 p-2 cursor-pointer hover:border-fuchsia-500/40 transition-colors"
        >
          {(canManage || handleShareToFeedClick) && (
            <div className="absolute top-2 right-2 z-20">
              <OcultoPlayItemMenu
                canManage={canManage}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onShareToFeed={handleShareToFeedClick}
                isDeletePending={isDeletePending}
                isShareToFeedPending={isShareToFeedPending}
              />
            </div>
          )}
          <OcultoPlayAudioItem item={item} />
          <div className="px-1 pt-2">
            <div className="text-[11px] text-muted-foreground truncate mb-2">
              {item.caption ?? ''}
            </div>
            <OcultoPlayActions
              orientation="horizontal"
              itemId={item.id}
              liked={item.liked_by_me}
              disliked={item.disliked_by_me}
              saved={item.saved_by_me}
              likeCount={item.like_count}
              dislikeCount={item.dislike_count}
              saveCount={item.save_count}
              shareCount={item.share_count}
              viewCount={effectiveViews}
              commentCount={item.comment_count}
              onLike={onLike ? () => onLike(item) : undefined}
              onDislike={onDislike ? () => onDislike(item) : undefined}
              onSave={onSave ? () => onSave(item) : undefined}
              onComment={onComment ? () => onComment(item) : undefined}
              onShare={onShare ? () => onShare(item) : undefined}
              onExpand={() => setFocusOpen(true)}
              isLikePending={isLikePending}
              isDislikePending={isDislikePending}
              isSavePending={isSavePending}
              isSharePending={isSharePending}
              countsLoading={countsLoading}
              onReport={onReport ? () => onReport(item) : undefined}
              genreTags={item.genre_tags}
              aiTool={item.ai_tool}
              composerName={item.composer_name}
            />
          </div>
        </article>
        <OcultoPlayFocusModal
          item={item}
          open={focusOpen}
          onClose={() => setFocusOpen(false)}
          onLike={onLike}
          onDislike={onDislike}
          onSave={onSave}
          onComment={onComment}
          onShare={onShare}
          onReport={onReport}
        />
      </>
    );
  }


  return (
    <>
    <article
      className={isTikTok
        ? 'relative h-[calc(100dvh-8.5rem)] min-h-[420px] max-h-[860px] overflow-hidden rounded-[22px] bg-black border border-border/40 shadow-[0_10px_34px_-18px_rgba(0,0,0,0.85)] group snap-center'
        : 'relative rounded-3xl overflow-hidden bg-card/40 border border-border/40 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.6)] hover:shadow-[0_10px_40px_-12px_rgba(236,72,153,0.35)] transition-shadow duration-300 group'}
    >

      {/* Gradiente sutil no border via overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />

      <div className={isTikTok ? 'relative h-full' : 'relative'}>
        {isLink && (item.source_url || item.media_url) ? (
          <div className={isTikTok ? 'h-full' : 'aspect-video w-full'}>
            <OcultoPlayLinkPlayer
              sourceUrl={(item.source_url || item.media_url) as string}
              thumbUrl={item.thumb_url}
              className={isTikTok ? 'h-full' : 'h-full w-full'}
              itemId={item.id}
              onCompleted={() => {
                if (onLinkCompleted) onLinkCompleted(item);
                else actions.registerMovieCompletion(item.id);
              }}
            />
          </div>
        ) : isVideo && item.media_url ? (
          <OcultoPlayVideoItem
            src={item.media_url}
            poster={item.thumb_url}
            preloadMeta={preloadMeta}
            variant={isTikTok ? 'tiktok' : 'inline'}
            className={isTikTok ? 'h-full rounded-none' : undefined}
            autoplayOnVisible={autoplayOnVisible ?? isTikTok}
            onEnded={onEnded ? () => onEnded(item) : undefined}
          />
        ) : item.media_url || item.thumb_url ? (
          <OcultoPlayImageItem
            src={(item.media_url ?? item.thumb_url) as string}
            alt={item.title ?? item.caption ?? ''}
            meme={isMeme}
          />
        ) : (
          <div className={isTikTok ? 'h-full bg-muted/30 grid place-items-center text-xs text-muted-foreground' : 'aspect-[9/14] sm:aspect-video bg-muted/30 grid place-items-center text-xs text-muted-foreground'}>
            sem mídia
          </div>
        )}


        {/* Rank badge (canto superior esquerdo) */}
        {typeof rank === 'number' && rank > 0 && (
          <div className="absolute top-3 left-3 z-10">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500 text-white text-[11px] font-bold shadow-lg shadow-rose-500/30">
              #{rank}
            </div>
          </div>
        )}

        {/* View counter chip + menu do autor (3 pontos) */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <OcultoPlayItemMenu
            canManage={canManage}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            onShareToFeed={handleShareToFeedClick}
            isDeletePending={isDeletePending}
            isShareToFeedPending={isShareToFeedPending}
          />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white text-[11px] font-semibold">
            <Eye className="h-3.5 w-3.5 text-cyan-300" />
            {countsLoading
              ? <span className="inline-block h-3 w-7 rounded bg-white/20 animate-pulse" aria-hidden />
              : <span className="tabular-nums">{formatCount(effectiveViews)}</span>}
          </div>
        </div>

        {/* Ações laterais (apenas em telas maiores; em mobile aparecem embaixo) */}
        <div className={isTikTok ? 'absolute right-3 bottom-28 z-20' : 'hidden sm:block absolute right-3 bottom-20 z-10'}>
          <OcultoPlayActions
            itemId={item.id}
            liked={item.liked_by_me}
            disliked={item.disliked_by_me}
            saved={item.saved_by_me}
            likeCount={item.like_count}
            dislikeCount={item.dislike_count}
            saveCount={item.save_count}
            shareCount={item.share_count}
            viewCount={effectiveViews}
            commentCount={item.comment_count}
            onLike={onLike ? () => onLike(item) : undefined}
            onDislike={onDislike ? () => onDislike(item) : undefined}
            onSave={onSave ? () => onSave(item) : undefined}
            onComment={onComment ? () => onComment(item) : undefined}
            onShare={onShare ? () => onShare(item) : undefined}
            onExpand={() => setFocusOpen(true)}
            isLikePending={isLikePending}
            isDislikePending={isDislikePending}
            isSavePending={isSavePending}
            isSharePending={isSharePending}
            countsLoading={countsLoading}
            onReport={onReport ? () => onReport(item) : undefined}
          />
        </div>


        {/* Legenda + autor (sobrepostos no inferior) */}
        <div className={isTikTok ? 'absolute left-0 right-16 bottom-0 p-4 pb-5 bg-gradient-to-t from-black/90 via-black/45 to-transparent text-white' : 'absolute left-0 right-0 sm:right-16 bottom-0 p-3 pb-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white'}>
          <Link
            to={`/u/${item.author_username ?? item.author_id}`}
            className="flex items-center gap-2 mb-1.5 w-fit"
          >
            <Avatar className="h-8 w-8 ring-2 ring-fuchsia-400/40">
              {item.author_avatar_url && <AvatarImage src={item.author_avatar_url} />}
              <AvatarFallback className="text-[10px] bg-fuchsia-500/30">
                {(item.author_display_name ?? item.author_username ?? '?').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-bold drop-shadow">
                {item.author_display_name ?? item.author_username ?? '—'}
              </span>
              <span className="text-[10px] text-white/70">
                @{item.author_username ?? '—'}
              </span>
            </div>
          </Link>
          {(item.title || item.caption) && (
            <p className="text-xs sm:text-sm line-clamp-2 drop-shadow">
              {item.title || item.caption}
            </p>
          )}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="outline" className="text-[9px] border-white/30 text-white/85 bg-white/5">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
          <PlayOutboundCTAs item={item} className="mt-2" />
        </div>
      </div>

      {/* Barra de ações horizontal (mobile) */}
      {!isTikTok && <div className="sm:hidden px-3 py-3 bg-card/60 border-t border-border/30">
        <OcultoPlayActions
          orientation="horizontal"
          itemId={item.id}
          liked={item.liked_by_me}
          disliked={item.disliked_by_me}
          saved={item.saved_by_me}
          likeCount={item.like_count}
          dislikeCount={item.dislike_count}
          saveCount={item.save_count}
          shareCount={item.share_count}
          viewCount={effectiveViews}
          commentCount={item.comment_count}
          onLike={onLike ? () => onLike(item) : undefined}
          onDislike={onDislike ? () => onDislike(item) : undefined}
          onSave={onSave ? () => onSave(item) : undefined}
          onComment={onComment ? () => onComment(item) : undefined}
          onShare={onShare ? () => onShare(item) : undefined}
          onReport={onReport ? () => onReport(item) : undefined}
          onExpand={() => setFocusOpen(true)}
          isLikePending={isLikePending}
          isDislikePending={isDislikePending}
          isSavePending={isSavePending}
          isSharePending={isSharePending}
          countsLoading={countsLoading}
          className="justify-between w-full"
        />
      </div>}
    </article>
    <OcultoPlayFocusModal
      item={item}
      open={focusOpen}
      onClose={() => setFocusOpen(false)}
      onLike={onLike}
      onDislike={onDislike}
      onSave={onSave}
      onComment={onComment}
      onShare={onShare}
      onReport={onReport}
    />
    </>
  );
}


