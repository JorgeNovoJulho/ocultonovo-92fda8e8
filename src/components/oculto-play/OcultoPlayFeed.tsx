/**
 * OcultoPlayFeed — feed vertical leve, controlado por filtro.
 * Mapeia o filtro UI (OcultoPlayFilterId) para os hooks existentes
 * (useOcultoPlayFeed + useOcultoPlayDerivedFeed). NÃO duplica lógica de query.
 *
 * Render só ocorre se useOcultoPlayEnabled.isEnabledForCurrentUser=true.
 * Wireia comentários (PlayCommentsSheet) e like/save padrões via useOcultoPlayActions.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import {
  useOcultoPlayFeed,
  useOcultoPlayActions,
  useOcultoPlayLiveCounts,
  type OcultoPlayKind,
  type OcultoPlayItem as OPItem,
} from '@/hooks/useOcultoPlayContent';
import { useOcultoPlayDerivedFeed } from '@/hooks/useOcultoPlayDerived';
import { useOcultoPlayEnabled } from '@/hooks/useOcultoPlayEnabled';
import { OcultoPlayItem } from './OcultoPlayItem';
import { OcultoPlaySkeleton } from './OcultoPlaySkeleton';
import { OcultoPlayEmptyState } from './OcultoPlayEmptyState';
import { PlayCommentsSheet } from './PlayCommentsSheet';
import { ReportOcultoPlayContentModal } from './ReportOcultoPlayContentModal';
import { SharePlayItemModal } from './SharePlayItemModal';
import { useShareOcultoPlayToFeed } from '@/hooks/useShareOcultoPlayToFeed';
import { ocultoPlayShareUrlWithBust } from '@/lib/ocultoPlayShareUrl';
import { OcultoPlayEditModal } from './OcultoPlayEditModal';
import { OcultoPlayDeleteConfirmDialog } from './OcultoPlayDeleteConfirmDialog';
import { LazyVisible } from './LazyVisible';
import { VideoPrefetcher } from './VideoPrefetcher';
import type { OcultoPlayFilterId } from './OcultoPlayFilters';
import { useIsMobile } from '@/hooks/use-mobile';
import { prefetchThumb } from '@/lib/ocultoPlayMediaCache';
import { useAdaptiveNetwork } from '@/hooks/useAdaptiveNetwork';

interface Props {
  filter: OcultoPlayFilterId;
  limit?: number;
  onLike?: (item: OPItem) => void;
  onDislike?: (item: OPItem) => void;
  onSave?: (item: OPItem) => void;
  onComment?: (item: OPItem) => void;
  onShare?: (item: OPItem) => void;
  onReport?: (item: OPItem) => void;
}

const KIND_FILTERS: Record<string, OcultoPlayKind | undefined> = {
  short_video: 'short_video',
  meme: 'meme',
  audio: 'audio',
  vip_teaser: 'vip_teaser',
  community_post: 'community_post',
};

export function OcultoPlayFeed({ filter, limit = 10, ...handlers }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isEnabledForCurrentUser } = useOcultoPlayEnabled();
  const actions = useOcultoPlayActions();
  const isMobile = useIsMobile();
  const net = useAdaptiveNetwork();
  const [commentsItemId, setCommentsItemId] = useState<string | null>(null);
  const [reportItemId, setReportItemId] = useState<string | null>(null);
  const [shareItem, setShareItem] = useState<OPItem | null>(null);
  const [editItem, setEditItem] = useState<OPItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<OPItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const autoAdvancingRef = useRef(false);
  // Janela adaptativa: rede ruim/device fraco encolhe drasticamente.
  // No desktop ainda mantém um colchão maior.
  const WIN_BEFORE = isMobile ? net.windowBefore : 2;
  const WIN_AFTER = isMobile ? net.windowAfter : 3;

  const kind = KIND_FILTERS[filter];
  const isDerived = filter === 'following' || filter === 'trending';

  // Em mobile, respeita o limite adaptativo (rede ruim => menos itens).
  const effectiveLimit = isMobile ? Math.min(limit, net.feedLimit) : limit;
  const base = useOcultoPlayFeed(
    'normal',
    isEnabledForCurrentUser ? kind : undefined,
    effectiveLimit,
  );
  const derived = useOcultoPlayDerivedFeed(
    (filter === 'following' ? 'following' : 'trending') as 'following' | 'trending',
  );

  const items = useMemo<OPItem[]>(() => {
    if (!isEnabledForCurrentUser) return [];
    return (isDerived ? derived.data : base.data) ?? [];
  }, [isEnabledForCurrentUser, isDerived, derived.data, base.data]);

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const itemIdsKey = itemIds.join('|');
  const liveCounts = useOcultoPlayLiveCounts(itemIds);
  const shareToFeed = useShareOcultoPlayToFeed();
  const handleShareToFeed = useCallback((it: OPItem) => {
    shareToFeed.mutate({ item: it });
  }, [shareToFeed]);

  // Prefetch persistente de TODAS as capas do feed assim que a lista é
  // conhecida. Vai para CacheStorage (L3) — ao voltar à grade, as capas
  // saem do disco em zero RTT, sem skeleton. Em Data Saver extremo,
  // ainda prefetcha as primeiras para evitar tela vazia.
  useEffect(() => {
    if (items.length === 0) return;
    const idle = (cb: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 800 });
      else setTimeout(cb, 120);
    };
    const dataSaverHard = net.saveData && net.tier === 'low';
    const slice = dataSaverHard
      ? items.slice(0, Math.max(4, net.thumbPrefetch + 1))
      : items;
    idle(() => {
      for (const it of slice) {
        const src = (it as { thumb_url?: string | null; media_url?: string | null }).thumb_url
          || (it as { thumb_url?: string | null; media_url?: string | null }).media_url;
        if (typeof src === 'string') prefetchThumb(src);
      }
    });
  }, [items, net.thumbPrefetch, net.saveData, net.tier]);


  // Realtime: INSERT/DELETE/UPDATE de oculto_play_items são tratados no canal
  // único da página /oculto-play (OcultoPlayPage). Não duplicamos aqui para
  // evitar dois canais subscritos no mesmo cliente (custo de socket + CPU).

  // Mobile fast-path: apenas o card central recebe src/autoplay; os demais
  // ficam como poster, sem decoder/rede concorrente.
  const prevItemIdsKeyRef = useRef('');
  useEffect(() => {
    const prev = prevItemIdsKeyRef.current;
    prevItemIdsKeyRef.current = itemIdsKey;
    if (!prev || !itemIdsKey) {
      setActiveIndex(0);
      return;
    }
    const prevIds = prev.split('|');
    const nextIds = itemIds;
    const onlyPrepended = nextIds.length >= prevIds.length
      && prevIds.every((id, idx) => nextIds[idx + (nextIds.length - prevIds.length)] === id);
    if (onlyPrepended) {
      setActiveIndex((idx) => idx + (nextIds.length - prevIds.length));
      return;
    }
    const activeId = items[activeIndex]?.id;
    const nextIdx = activeId ? nextIds.indexOf(activeId) : -1;
    setActiveIndex(nextIdx >= 0 ? nextIdx : 0);
  }, [itemIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!items.length || typeof IntersectionObserver === 'undefined') return;
    const ratios = new Map<Element, number>();
    const io = new IntersectionObserver((entries) => {
      // Durante auto-advance, ignorar IntersectionObserver para evitar corrida
      if (autoAdvancingRef.current) return;
      for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
      let bestIdx = activeIndex;
      let bestRatio = 0;
      itemRefs.current.forEach((el, idx) => {
        if (!el) return;
        const ratio = ratios.get(el) ?? 0;
        if (ratio > bestRatio) { bestRatio = ratio; bestIdx = idx; }
      });
      if (bestRatio >= 0.45) setActiveIndex(bestIdx);
    }, { threshold: [0, 0.25, 0.45, 0.6, 0.8], rootMargin: '-8% 0px -18% 0px' });
    itemRefs.current.forEach((el) => { if (el) io.observe(el); });
    return () => io.disconnect();
  }, [items.length, itemIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestDelete = useCallback((it: OPItem) => {
    if (!user?.id || !profile?.id) { toast.error('Faça login para excluir.'); return; }
    if (it.author_id !== profile.id) { toast.error('Você só pode excluir o próprio conteúdo.'); return; }
    setDeleteItem(it);
  }, [user?.id, profile?.id]);

  const confirmDelete = useCallback(async () => {
    const it = deleteItem;
    if (!it) return;
    setDeletingId(it.id);
    qc.setQueriesData<OPItem[] | undefined>(
      { queryKey: ['oculto-play', 'feed'] },
      (old) => (old ? old.filter((x) => x.id !== it.id) : old),
    );
    try {
      const { error } = await supabase.from('oculto_play_items').delete().eq('id', it.id);
      if (error) throw error;
      toast.success('Conteúdo excluído.');
      setDeleteItem(null);
    } catch (e: unknown) {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
      toast.error('Não foi possível excluir.', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setDeletingId(null);
    }
  }, [deleteItem, qc]);

  if (!isEnabledForCurrentUser) return null;

  const loading = isDerived ? derived.isLoading : base.isLoading;
  if (loading && items.length === 0) return <OcultoPlaySkeleton count={3} />;
  if (items.length === 0) return <OcultoPlayEmptyState />;

  const defaultLike = (it: OPItem) => actions.toggleLike.mutate(it.id);
  const defaultDislike = (it: OPItem) => actions.toggleDislike.mutate(it.id);
  const defaultSave = (it: OPItem) => actions.toggleSave.mutate(it.id);
  const defaultComment = (it: OPItem) => setCommentsItemId(it.id);
  const defaultShare = (it: OPItem) => setShareItem(it);
  const defaultReport = (it: OPItem) => setReportItemId(it.id);

  const likeVar = actions.toggleLike.isPending ? (actions.toggleLike.variables as string | undefined) : undefined;
  const dislikeVar = actions.toggleDislike.isPending ? (actions.toggleDislike.variables as string | undefined) : undefined;
  const saveVar = actions.toggleSave.isPending ? (actions.toggleSave.variables as string | undefined) : undefined;
  const shareVar = actions.registerShare.isPending ? (actions.registerShare.variables as string | undefined) : undefined;

  const shareToFeedPendingId = shareToFeed.isPending
    ? (shareToFeed.variables?.item?.id ?? shareToFeed.variables?.itemId)
    : undefined;

  const handleEnded = (it: OPItem) => {
    const idx = items.findIndex((x) => x.id === it.id);
    const nextIdx = idx + 1;
    if (nextIdx >= items.length) return;
    const next = itemRefs.current[nextIdx];
    if (next) {
      // Mobile: scroll instantâneo para iniciar o próximo vídeo imediatamente
      next.scrollIntoView({ behavior: isMobile ? 'auto' : 'smooth', block: 'start' });
    }
    // Bloqueia IntersectionObserver temporariamente para evitar corrida
    autoAdvancingRef.current = true;
    setActiveIndex(nextIdx);
    window.setTimeout(() => { autoAdvancingRef.current = false; }, 800);
  };

  return (
    <>
      <VideoPrefetcher
        urls={net.videoPrefetch === 0 ? [] : items
          .slice(activeIndex + 1, activeIndex + 1 + net.videoPrefetch + 1)
          .map((it) => (it.kind === 'short_video' || it.kind === 'vip_teaser') ? it.media_url : null)}
        max={net.videoPrefetch}
      />
      <div className="space-y-4 snap-y snap-mandatory">
        {items.map((it, idx) => {
          const inWindow = idx >= activeIndex - WIN_BEFORE && idx <= activeIndex + WIN_AFTER;
          return (
            <div
              key={it.id}
              ref={(el) => { itemRefs.current[idx] = el; }}
              className="snap-start"
              style={!inWindow ? { minHeight: 520 } : undefined}
            >
              {inWindow ? (
                <LazyVisible minHeight={520} rootMargin="200px 0px">
                  <OcultoPlayItem
                    item={it}
                    variant="tiktok"
                    preloadMeta={idx === activeIndex}
                    autoplayOnVisible={idx === activeIndex}
                    countsLoading={liveCounts.isLoading}
                    isLikePending={likeVar === it.id}
                    isDislikePending={dislikeVar === it.id}
                    isSavePending={saveVar === it.id}
                    isSharePending={shareVar === it.id}
                    canDelete={!!profile?.id && it.author_id === profile.id}
                    isDeletePending={deletingId === it.id}
                    isShareToFeedPending={shareToFeedPendingId === it.id}
                    onDelete={requestDelete}
                    onEdit={(item) => setEditItem(item)}
                    onShareToFeed={handleShareToFeed}
                    onLike={handlers.onLike ?? defaultLike}
                    onDislike={handlers.onDislike ?? defaultDislike}
                    onSave={handlers.onSave ?? defaultSave}
                    onComment={handlers.onComment ?? defaultComment}
                    onShare={handlers.onShare ?? defaultShare}
                    onReport={handlers.onReport ?? defaultReport}
                    onEnded={handleEnded}
                    onLinkCompleted={(item) => actions.registerMovieCompletion(item.id)}
                  />
                </LazyVisible>
              ) : null}
            </div>
          );
        })}
      </div>

      <PlayCommentsSheet
        itemId={commentsItemId ?? ''}
        open={!!commentsItemId}
        onClose={() => setCommentsItemId(null)}
      />

      <ReportOcultoPlayContentModal
        itemId={reportItemId}
        open={!!reportItemId}
        onClose={() => setReportItemId(null)}
      />

      <SharePlayItemModal
        open={!!shareItem}
        onOpenChange={(o) => { if (!o) setShareItem(null); }}
        url={shareItem ? ocultoPlayShareUrlWithBust(shareItem.id) : ''}
        itemId={shareItem?.id}
        title={shareItem?.title ?? shareItem?.caption ?? 'OCULTO Play'}
        abovePlayer
        onShared={() => { if (shareItem) actions.registerShare.mutate(shareItem.id); }}
      />

      <OcultoPlayEditModal
        item={editItem}
        open={!!editItem}
        onClose={() => setEditItem(null)}
      />

      <OcultoPlayDeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={(o) => { if (!o) setDeleteItem(null); }}
        onConfirm={confirmDelete}
        pending={!!deletingId}
      />
    </>
  );
}

