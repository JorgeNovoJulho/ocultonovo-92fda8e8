/**
 * OcultoPlayActions — barra de ações do Oculto Play.
 * - Tooltips nativos em todos os botões (title)
 * - Em modo horizontal: layout compacto (cabe tudo em uma linha)
 * - Linha extra com tags (estilo, IA, compositor)
 */
import { Heart, Bookmark, MessageCircle, Share2, Flag, ThumbsDown, Eye, Loader2, Maximize2, Music2, Cpu, User2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddToCollectionButton } from './AddToCollectionButton';
import { PlayShareMenu } from './PlayShareMenu';
import { useEffectiveViewCount } from '@/store/useOcultoPlayCountersStore';


interface Props {
  itemId?: string;
  liked?: boolean;
  disliked?: boolean;
  saved?: boolean;
  likeCount?: number;
  dislikeCount?: number;
  commentCount?: number;
  saveCount?: number;
  shareCount?: number;
  viewCount?: number;
  onLike?: () => void;
  onDislike?: () => void;
  onSave?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onReport?: () => void;
  onExpand?: () => void;
  isLikePending?: boolean;
  isDislikePending?: boolean;
  isSavePending?: boolean;
  isSharePending?: boolean;
  countsLoading?: boolean;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
  showCollections?: boolean;
  useShareMenu?: boolean;
  shareTitle?: string | null;
  shareAuthor?: string | null;
  shareAbovePlayer?: boolean;
  /** Tags exibidas em linha abaixo das ações */
  genreTags?: string[];
  aiTool?: string | null;
  composerName?: string | null;
}


function fmt(n: number | undefined) {
  if (!n || n <= 0) return '0';
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  if (n < 1_000_000) return Math.round(n / 1000) + 'k';
  return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
}

interface PillProps {
  active?: boolean;
  pending?: boolean;
  loadingCount?: boolean;
  baseColor: string;
  activeColor: string;
  icon: React.ReactNode;
  count?: number;
  showCount?: boolean;
  label: string;
  onClick?: () => void;
  compact?: boolean;
}

function CountSkeleton({ compact }: { compact?: boolean }) {
  return (
    <span className={cn('inline-block rounded bg-white/15 animate-pulse', compact ? 'h-2.5 w-5' : 'h-3 w-6')} aria-hidden />
  );
}

function ActionPill({
  active, pending, loadingCount, baseColor, activeColor, icon, count, showCount = true, label, onClick, compact,
}: PillProps) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!pending) onClick?.();
      }}
      aria-label={label}
      title={label}
      aria-busy={pending || undefined}
      disabled={pending}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      className={cn(
        'group flex flex-col items-center gap-0.5 transition-transform active:scale-90 disabled:opacity-80',
      )}
    >
      <span
        className={cn(
          'relative inline-flex items-center justify-center rounded-full backdrop-blur-md border border-white/25 shadow-lg shadow-black/40 ring-1 ring-white/10 transition-all duration-200 group-hover:scale-110',
          compact ? 'h-8 w-8' : 'h-10 w-10',
          active ? activeColor : baseColor,
          pending && 'animate-pulse',
        )}
      >
        <span className={cn('grid place-items-center', compact ? '[&_svg]:h-4 [&_svg]:w-4' : '[&_svg]:h-5 [&_svg]:w-5')}>
          {icon}
        </span>
        {pending && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
            <Loader2 className={cn(compact ? 'h-3 w-3' : 'h-4 w-4', 'text-white animate-spin')} />
          </span>
        )}
      </span>
      {showCount && (
        loadingCount
          ? <CountSkeleton compact={compact} />
          : <span className={cn('font-semibold text-white drop-shadow-md tabular-nums', compact ? 'text-[9px]' : 'text-[10px]')}>{fmt(count)}</span>
      )}
    </button>
  );
}

function TagChip({ icon, label, title }: { icon: React.ReactNode; label: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/10 px-2 py-0.5 text-[10px] text-white/85 max-w-[140px]"
    >
      <span className="[&_svg]:h-3 [&_svg]:w-3 text-fuchsia-300 shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function OcultoPlayActions({
  itemId,
  liked, disliked, saved,
  likeCount = 0, dislikeCount = 0, commentCount = 0, saveCount = 0, shareCount = 0, viewCount = 0,
  onLike, onDislike, onSave, onComment, onShare, onReport, onExpand,
  isLikePending, isDislikePending, isSavePending, isSharePending,
  countsLoading,
  className, orientation = 'vertical',
  showCollections = true,
  useShareMenu = false,
  shareTitle,
  shareAuthor,
  shareAbovePlayer = false,
  genreTags, aiTool, composerName,
}: Props) {
  const isHorizontal = orientation === 'horizontal';
  const compact = isHorizontal;
  // Fonte única de verdade: store global (sobrescreve fallback se for maior).
  const effectiveViewCount = useEffectiveViewCount(itemId ?? null, viewCount);

  const wrap = isHorizontal
    ? 'flex flex-row gap-1.5 items-start justify-between flex-nowrap w-full'
    : 'flex flex-col gap-3 items-center';

  const hasTags =
    (genreTags && genreTags.length > 0) || !!aiTool || !!composerName;

  const Pills = (
    <div className={cn(wrap)}>
      {/* Views */}
      <div className="flex flex-col items-center gap-0.5" title="Visualizações">
        <span className={cn(
          'inline-flex items-center justify-center rounded-full bg-cyan-500/30 backdrop-blur-md border border-cyan-300/40 ring-1 ring-cyan-300/30 shadow-lg shadow-cyan-500/30',
          compact ? 'h-8 w-8' : 'h-10 w-10',
        )}>
          <Eye className={cn(compact ? 'h-4 w-4' : 'h-5 w-5', 'text-cyan-100')} />
        </span>
        {countsLoading
          ? <CountSkeleton compact={compact} />
          : <span className={cn('font-semibold text-white drop-shadow-md tabular-nums', compact ? 'text-[9px]' : 'text-[10px]')}>{fmt(effectiveViewCount)}</span>}
      </div>

      <ActionPill compact={compact} label="Curtir" active={liked} pending={isLikePending} loadingCount={countsLoading}
        baseColor="bg-rose-500/70 text-white shadow-rose-500/40" activeColor="bg-rose-500 text-white shadow-rose-500/60"
        icon={<Heart className={cn(liked && 'fill-current')} />} count={likeCount} onClick={onLike} />

      <ActionPill compact={compact} label="Não gostei" active={disliked} pending={isDislikePending} loadingCount={countsLoading}
        baseColor="bg-slate-600/70 text-white shadow-slate-700/40" activeColor="bg-slate-600 text-white shadow-slate-600/60"
        icon={<ThumbsDown className={cn(disliked && 'fill-current')} />} count={dislikeCount} onClick={onDislike} />

      <ActionPill compact={compact} label="Comentar" loadingCount={countsLoading}
        baseColor="bg-violet-500/70 text-white shadow-violet-500/40" activeColor="bg-violet-500 text-white shadow-violet-500/60"
        icon={<MessageCircle />} count={commentCount} onClick={onComment} />

      <ActionPill compact={compact} label="Salvar" active={saved} pending={isSavePending} loadingCount={countsLoading}
        baseColor="bg-amber-400/80 text-black shadow-amber-400/50" activeColor="bg-amber-400 text-black shadow-amber-400/70"
        icon={<Bookmark className={cn(saved && 'fill-current')} />} count={saveCount} onClick={onSave} />

      {useShareMenu && itemId ? (
        <div className="flex flex-col items-center gap-0.5">
          <PlayShareMenu
            itemId={itemId}
            title={shareTitle}
            author={shareAuthor}
            abovePlayer={shareAbovePlayer}
            trigger={(
              <button type="button" aria-label="Compartilhar" title="Compartilhar" className="group flex flex-col items-center gap-0.5 transition-transform active:scale-90">
                <span className={cn(
                  'relative inline-flex items-center justify-center rounded-full backdrop-blur-md border border-white/25 ring-1 ring-sky-300/30 shadow-lg shadow-sky-500/40 transition-all duration-200 group-hover:scale-110 bg-sky-500/70 text-white',
                  compact ? 'h-8 w-8' : 'h-10 w-10',
                )}>
                  <Share2 className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                </span>
                {countsLoading
                  ? <CountSkeleton compact={compact} />
                  : <span className={cn('font-semibold text-white drop-shadow-md tabular-nums', compact ? 'text-[9px]' : 'text-[10px]')}>{fmt(shareCount)}</span>}
              </button>
            )}
          />
        </div>
      ) : (
        <ActionPill compact={compact} label="Compartilhar" pending={isSharePending} loadingCount={countsLoading}
          baseColor="bg-sky-500/70 text-white shadow-sky-500/40" activeColor="bg-sky-500 text-white shadow-sky-500/60"
          icon={<Share2 />} count={shareCount} onClick={onShare} />
      )}

      {showCollections && itemId && (
        <div className="flex flex-col items-center gap-0.5" title="Adicionar à coleção">
          <AddToCollectionButton itemId={itemId} size={compact ? 'sm' : 'md'} />
          <span className={cn('font-semibold text-white drop-shadow-md', compact ? 'text-[9px]' : 'text-[10px]')}>Coleção</span>
        </div>
      )}

      {onExpand && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
          aria-label="Modo destaque"
          title="Modo destaque"
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
        >
          <span className={cn(
            'inline-flex items-center justify-center rounded-full bg-fuchsia-500/70 text-white border border-white/25 ring-1 ring-fuchsia-300/30 shadow-lg shadow-fuchsia-500/40 hover:bg-fuchsia-500',
            compact ? 'h-8 w-8' : 'h-10 w-10',
          )}>
            <Maximize2 className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
          </span>
          <span className={cn('font-semibold text-white drop-shadow-md', compact ? 'text-[9px]' : 'text-[10px]')}>Destaque</span>
        </button>
      )}

      {onReport && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReport(); }}
          aria-label="Denunciar"
          title="Denunciar"
          className="flex flex-col items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity"
        >
          <span className={cn(
            'inline-flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-white/10',
            compact ? 'h-8 w-8' : 'h-8 w-8',
          )}>
            <Flag className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </span>
          {compact && <span className="text-[9px] font-semibold text-white/70">Denunciar</span>}
        </button>
      )}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-2 w-full', className)}>
      {Pills}
      {hasTags && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {composerName && (
            <TagChip icon={<User2 />} label={composerName} title={`Compositor: ${composerName}`} />
          )}
          {aiTool && (
            <TagChip icon={<Cpu />} label={aiTool} title={`IA: ${aiTool}`} />
          )}
          {genreTags?.map((t) => (
            <TagChip key={t} icon={<Music2 />} label={t} title={`Estilo: ${t}`} />
          ))}
        </div>
      )}
    </div>
  );
}
