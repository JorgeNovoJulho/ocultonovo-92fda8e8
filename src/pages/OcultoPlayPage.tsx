/**
 * OcultoPlayPage — Etapa 4: UI do feed Play + upload, atrás do gate.
 *
 * - Tudo bloqueado por `useOcultoPlayAccess()`.
 * - Quem não passa pelo gate é redirecionado pra home. Nada vaza.
 * - Tabs: Para Você / Hoje / Volte para Ver, e filtros por tipo de mídia.
 * - Botão "Enviar" abre modal de upload (vídeo curto, meme, áudio) com visibility.
 */
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Play, Loader2, Upload, Heart, Bookmark, Eye, ArrowLeft, MessageCircle,
  Video, Image as ImageIcon, Music, Crown, Users, Trophy, CalendarClock, FileText,
  Library, RotateCcw, CheckCircle2, ListVideo, LayoutGrid, Rows3, Trash2, Pause, WifiOff, Link2,
  ChevronDown, X, Flame, Headphones, Clapperboard, Film, ShieldAlert,
} from 'lucide-react';
import { usePlayLinkViews, formatViewsCompact } from '@/hooks/usePlayLinkViews';
import { OcultoPlayShortsScroller } from '@/components/oculto-play/OcultoPlayShortsScroller';
import { MobileNavbar } from '@/components/MobileNavbar';
import { LazyVisible } from '@/components/oculto-play/LazyVisible';
import type { AudioRepeatMode } from '@/components/oculto-play/OcultoPlayFocusModal';
import {
  configureSharedAudioQueue,
  ocultoPlayMetaFromItem,
  pauseSharedAudio,
  playNextSharedAudio,
  playPrevSharedAudio,
  playSharedAudio,
  prewarmAudio,
  seekSharedAudio,
} from '@/lib/ocultoPlayAudioSession';
import { pauseAllPreviews } from '@/lib/ocultoPlayPreviewCoordinator';
import { parseEmbeddedVideo } from '@/lib/embeddedVideoUrl';
import { OcultoPlayLinkPlayer } from '@/components/oculto-play/OcultoPlayLinkPlayer';

import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useMyPlayChannels, useSetPlayItemFrozen, type PlayChannelKind, type PlayChannelSection } from '@/hooks/usePlayChannels';
import { usePlayRealtimeSync } from '@/hooks/usePlayRealtimeSync';
import { CreateChannelDialog } from '@/components/oculto-play/channels/CreateChannelDialog';
import { PlayChannelsStrip } from '@/components/oculto-play/channels/PlayChannelsStrip';
import { useOcultoPlayAccess, useOcultoPlayConfig, type OcultoPlayConfig } from '@/hooks/useOcultoPlayAccess';
import {
  useOcultoPlayFeed, useOcultoPlayActions, uploadOcultoPlayFile,
  upsertOcultoPlayFeedItem, normalizeOcultoPlayItem,
  type OcultoPlayKind, type OcultoPlaySection, type OcultoPlayVisibility,
  type OcultoPlayItem,
} from '@/hooks/useOcultoPlayContent';
import { useRegisterOcultoPlayCardView } from '@/hooks/useRegisterOcultoPlayCardView';
import { useOcultoPlayVisitTracker } from '@/hooks/useOcultoPlayVisitTracker';
import { useEffectiveViewCount } from '@/store/useOcultoPlayCountersStore';
import { useRealtimeOcultoPlayViews } from '@/hooks/useRealtimeOcultoPlayViews';
import { useOcultoPlayAudioSettingsStore } from '@/store/useOcultoPlayAudioSettingsStore';
import { resolveActorId } from '@/lib/ensureProfile';
import { uploadOcultoPlayFileProgress, UploadAbortedError } from '@/hooks/useOcultoPlayUpload';
import { createAudioPreviewClip } from '@/lib/audioPreviewClip';
import { VideoTrimAndCoverPicker, type VideoCoverResult } from '@/components/oculto-play/VideoTrimAndCoverPicker';
import { PlayTrailerComposer, TRAILER_MAX_SECONDS } from '@/components/oculto-play/PlayTrailerComposer';
import { OcultoPlayLinkComposer } from '@/components/oculto-play/OcultoPlayLinkComposer';
import { normalizeSubtitleFileToVtt } from '@/hooks/useOcultoPlayTracks';

import { Progress } from '@/components/ui/progress';
import { useOcultoPlayDerivedFeed, type DerivedSection } from '@/hooks/useOcultoPlayDerived';
import { supabase } from '@/lib/supabaseExternal';
import { useProfile } from '@/hooks/useProfile';
import { PlayXpBadge } from '@/components/oculto-play/PlayXpBadge';
import { PlayTrendingTagsStrip } from '@/components/oculto-play/PlayTrendingTagsStrip';
import { PlayTrending24hStrip } from '@/components/oculto-play/PlayTrending24hStrip';
import { openPlayItemDeepLink } from '@/components/oculto-play/PlayItemDeepLinkSheet';
import { AddToCollectionButton } from '@/components/oculto-play/AddToCollectionButton';
import { InPlaylistBadge } from '@/components/oculto-play/InPlaylistBadge';
import { PlayReactionsBar } from '@/components/oculto-play/PlayReactionsBar';
import { WatchLaterButton } from '@/components/oculto-play/WatchLaterButton';
import { PlayCommentsSheet } from '@/components/oculto-play/PlayCommentsSheet';
import { PlayShareMenu } from '@/components/oculto-play/PlayShareMenu';
import {
  PlayKindSectionFilters,
  applyPlaySectionFilters,
  type PlaySectionFilterState,
} from '@/components/oculto-play/PlayKindSectionFilters';
import { SharePlayItemModal } from '@/components/oculto-play/SharePlayItemModal';
import { ocultoPlayShareUrlWithBust } from '@/lib/ocultoPlayShareUrl';
import { preparePreviewAudioForPlayback, primePreviewClipBlob, warmPreviewAudioWindow } from '@/lib/ocultoPlayPreviewCache';
import { requestServerPreviewClip, regenerateServerPreviewClip } from '@/lib/ocultoPlayServerPreview';
import { prefetchThumb } from '@/lib/ocultoPlayMediaCache';

const PLAY_CAPTION_MAX_CHARS = 15_000;
import { ReportOcultoPlayContentModal } from '@/components/oculto-play/ReportOcultoPlayContentModal';
import { AudioTagPicker } from '@/components/oculto-play/AudioTagPicker';
import { OcultoPlayItemMenu } from '@/components/oculto-play/OcultoPlayItemMenu';
import { useShareOcultoPlayToFeed } from '@/hooks/useShareOcultoPlayToFeed';
import { OcultoPlayEditModal } from '@/components/oculto-play/OcultoPlayEditModal';
import { OcultoPlayDeleteConfirmDialog } from '@/components/oculto-play/OcultoPlayDeleteConfirmDialog';
import { bumpAudioTagUsage, type AudioTag } from '@/hooks/useOcultoPlayAudioTags';
import { useOcultoPlayMovieGenres, useUpsertMovieGenre, readLocalMovieGenresCache } from '@/hooks/useOcultoPlayMovieGenres';
import { useOcultoPlayContinueWatching, usePlaybackProgressAutoSave } from '@/hooks/useOcultoPlayContinueWatching';
import { useOcultoPlayXpActions } from '@/hooks/useOcultoPlayGamification';
import { CachedThumbImg } from '@/components/oculto-play/CachedThumbImg';
import outroAsset from '@/assets/oculto-play-outro.png.asset.json';
import { OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS, processOcultoPlayVideoForUpload } from '@/lib/ocultoPlayVideoProcessor';
import { stopOcultoPlayMedia } from '@/lib/ocultoPlayMediaStop';
import { registerOcultoPlayWatchdog } from '@/lib/ocultoPlayWatchdog';
import { enableOcultoPlayMiniPlayer } from '@/lib/ocultoPlayMiniPlayerState';

// Modais e painéis pesados — code-split. Não pesam no bundle inicial nem
// disparam queries até o usuário abrir.
const OcultoPlayFocusModal = lazy(() =>
  import('@/components/oculto-play/OcultoPlayFocusModal').then((m) => ({ default: m.OcultoPlayFocusModal })),
);
const PlayDraftsModal = lazy(() =>
  import('@/components/oculto-play/PlayDraftsModal').then((m) => ({ default: m.PlayDraftsModal })),
);
const PlayCollectionsModal = lazy(() =>
  import('@/components/oculto-play/PlayCollectionsModal').then((m) => ({ default: m.PlayCollectionsModal })),
);
const PlayItemDeepLinkSheet = lazy(() =>
  import('@/components/oculto-play/PlayItemDeepLinkSheet').then((m) => ({ default: m.PlayItemDeepLinkSheet })),
);
const PlayCreatorInsightsPanel = lazy(() =>
  import('@/components/oculto-play/PlayCreatorInsightsPanel').then((m) => ({ default: m.PlayCreatorInsightsPanel })),
);

// Strips pesadas (somente desktop) — code-split + montagem condicional.
const PlayComebackStrip = lazy(() => import('@/components/oculto-play/PlayComebackStrip').then((m) => ({ default: m.PlayComebackStrip })));
const HojeNoOcultoPanel = lazy(() => import('@/components/oculto-play/HojeNoOcultoPanel').then((m) => ({ default: m.HojeNoOcultoPanel })));
const VolteParaVerPanel = lazy(() => import('@/components/oculto-play/VolteParaVerPanel').then((m) => ({ default: m.VolteParaVerPanel })));
const PlayActiveChallengeCard = lazy(() => import('@/components/oculto-play/PlayActiveChallengeCard').then((m) => ({ default: m.PlayActiveChallengeCard })));
const PlayForYouStrip = lazy(() => import('@/components/oculto-play/PlayForYouStrip').then((m) => ({ default: m.PlayForYouStrip })));
const PlayActivePlaylistsStrip = lazy(() => import('@/components/oculto-play/PlayActivePlaylistsStrip').then((m) => ({ default: m.PlayActivePlaylistsStrip })));
const CreatorSurgeBanner = lazy(() => import('@/components/oculto-play/CreatorSurgeBanner').then((m) => ({ default: m.CreatorSurgeBanner })));
const CreatorMilestonesBanner = lazy(() => import('@/components/oculto-play/CreatorMilestonesBanner').then((m) => ({ default: m.CreatorMilestonesBanner })));
const PlayPersonalMixStrip = lazy(() => import('@/components/oculto-play/PlayPersonalMixStrip').then((m) => ({ default: m.PlayPersonalMixStrip })));
const PlayWatchLaterStrip = lazy(() => import('@/components/oculto-play/PlayWatchLaterStrip').then((m) => ({ default: m.PlayWatchLaterStrip })));
const PlayContinueWatchingStrip = lazy(() => import('@/components/oculto-play/PlayContinueWatchingStrip').then((m) => ({ default: m.PlayContinueWatchingStrip })));
const PlayWeeklyChallengeCard = lazy(() => import('@/components/oculto-play/PlayWeeklyChallengeCard').then((m) => ({ default: m.PlayWeeklyChallengeCard })));
const PlayTopByKindStrip = lazy(() => import('@/components/oculto-play/PlayTopByKindStrip').then((m) => ({ default: m.PlayTopByKindStrip })));
const OcultoPlayMiniPlayer = lazy(() => import('@/components/oculto-play/OcultoPlayMiniPlayer').then((m) => ({ default: m.OcultoPlayMiniPlayer })));

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  LYRICS_MAX_CHARS,
  validateLyricsFile,
  validateLyricsText,
  readLyricsFile,
  pickLyricsFileFromDataTransfer,
} from '@/lib/ocultoPlayLyricsValidation';

import { cn } from '@/lib/utils';

type PlaySectionStorageKey = 'audios' | 'videos' | 'links' | 'links_adult' | 'memes' | 'comunidades' | 'challenges';

function storageKeyForPlayItem(item: Partial<OcultoPlayItem> & Record<string, unknown>): PlaySectionStorageKey | null {
  if (item.kind === 'audio') return 'audios';
  if (item.kind === 'short_video' || item.kind === 'vip_teaser') return 'videos';
  if (item.kind === 'link') return item.is_adult === true ? 'links_adult' : 'links';
  if (item.kind === 'meme') return 'memes';
  if (item.kind === 'community_post') return 'comunidades';
  if (item.kind === 'challenge') return 'challenges';
  return null;
}

function forceOpenPlaySection(key: PlaySectionStorageKey | null) {
  if (!key || typeof window === 'undefined') return;
  const sectionStorageKey = `ocultoplay:section-open:v2:${key}`;
  try {
    localStorage.setItem(sectionStorageKey, '1');
    window.dispatchEvent(new CustomEvent('ocultoplay:section-open-change', {
      detail: { storageKey: sectionStorageKey, open: true },
    }));
  } catch { /* noop */ }
}

// Preview do card: SEMPRE preferir o clip dedicado de ~30s (audio_preview_url)
// quando existir — ele é ~10-20× menor que o MP3 completo e começa a tocar em
// ms após o clique. Só recai para o audio_url completo se o clip não existir
// (faixas antigas sem snippet recortado).
const audioPreviewSrc = (item: Pick<OcultoPlayItem, 'audio_url'> & { audio_preview_url?: string | null }) => item.audio_preview_url || item.audio_url;

const KIND_META: Record<OcultoPlayKind, { label: string; icon: React.ElementType }> = {
  short_video: { label: 'Vídeos', icon: Video },
  meme: { label: 'Memes', icon: ImageIcon },
  audio: { label: 'Áudios', icon: Music },
  vip_teaser: { label: 'Teasers VIP', icon: Crown },
  community_post: { label: 'Comunidades', icon: Users },
  challenge: { label: 'Desafios', icon: Trophy },
  link: { label: 'Links', icon: Link2 },
};


type SectionTab = OcultoPlaySection | DerivedSection | 'insights';

export default function OcultoPlayPage() {
  const { canAccess, loading } = useOcultoPlayAccess();
  const config = useOcultoPlayConfig();
  const navigate = useNavigate();
  const { user } = useAuth();
  useOcultoPlayVisitTracker();
  // Kill switch ao sair da rota /oculto-play: pausa + zera src de TODOS os
  // <video>/<audio> da árvore e remove `<link rel=preload as=video>`. Sem
  // isso, em mobile o vídeo travado/lento continuava baixando após o usuário
  // sair e podia retomar o áudio em outra tela do app.
  useEffect(() => {
    // Watchdog global: pausa/limpa mídia ao perder foco, ir para background,
    // ser descarregada (pagehide) ou congelada (Page Lifecycle freeze).
    const release = registerOcultoPlayWatchdog();
    return () => {
      release();
      try { stopOcultoPlayMedia(document, { pauseSharedAudio: false }); } catch { /* noop */ }
    };
  }, []);

  const [section, setSection] = useState<SectionTab>('normal');
  const [kindFilter, setKindFilter] = useState<OcultoPlayKind | undefined>(undefined);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [focusItem, setFocusItem] = useState<OcultoPlayItem | null>(null);
  const focusItemRef = useRef<OcultoPlayItem | null>(null);
  const [focusCommentsItem, setFocusCommentsItem] = useState<OcultoPlayItem | null>(null);
  const [focusShareItem, setFocusShareItem] = useState<OcultoPlayItem | null>(null);
  const [focusReportItem, setFocusReportItem] = useState<OcultoPlayItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'vertical'>('grid');
  const audioShuffle = useOcultoPlayAudioSettingsStore((s) => s.shuffle);
  const [audioRepeatMode, setAudioRepeatModeState] = useState<AudioRepeatMode>(() => {
    try {
      const v = localStorage.getItem('oculto-play:audio-repeat');
      // Migração: valor antigo 'one' (repetir uma) agora vira 'all' (tocar todas em sequência).
      if (v === 'off') return 'off';
      return 'all';
    } catch { return 'all'; }
  });
  const setAudioRepeatMode = useCallback((v: AudioRepeatMode | ((prev: AudioRepeatMode) => AudioRepeatMode)) => {
    setAudioRepeatModeState((prev) => {
      const next = typeof v === 'function' ? (v as (p: AudioRepeatMode) => AudioRepeatMode)(prev) : v;
      try { localStorage.setItem('oculto-play:audio-repeat', next); } catch { /* noop */ }
      return next;
    });
  }, []);
  const [settingAudioBio, setSettingAudioBio] = useState(false);
  const { data: isMaster } = useIsMasterAdmin();
  // Canais Play: qualquer usuário logado publica no próprio canal.
  const canUpload = !!user?.id;
  const { data: myChannels } = useMyPlayChannels();
  // Canais e envios novos aparecem sozinhos (sem recarregar a página).
  usePlayRealtimeSync(!!user?.id);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [createChannelKind, setCreateChannelKind] = useState<PlayChannelKind>('video');
  const [uploadChannelId, setUploadChannelId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // /oculto-play?upload=1&channel=<id> (vindo da página do canal) abre o envio.
  useEffect(() => {
    if (searchParams.get('upload') !== '1' || !user?.id) return;
    setUploadChannelId(searchParams.get('channel'));
    setUploadOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('upload'); next.delete('channel');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, user?.id]);
  const openMyChannel = () => {
    const list = myChannels ?? [];
    const own = list.find((c) => !c.is_official) ?? list[0];
    if (own) navigate(`/play/c/${own.slug}`);
    else navigate('/meus-canais');
  };
  const isMobile = useIsMobile();
  const pageActions = useOcultoPlayActions();
  const qcPage = useQueryClient();
  const previewBackfillRunningRef = useRef(false);
  const backfillFailedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { focusItemRef.current = focusItem; }, [focusItem]);

  // Ao fechar o modal de foco (focusItem volta a null), garante que o player
  // fullscreen não continue baixando/tocando em segundo plano.
  const prevFocusItemRef = useRef<OcultoPlayItem | null>(null);
  useEffect(() => {
    if (prevFocusItemRef.current && !focusItem) {
      try { stopOcultoPlayMedia(document, { pauseSharedAudio: false }); } catch { /* noop */ }
    }
    prevFocusItemRef.current = focusItem;
  }, [focusItem]);


  useEffect(() => {
    if (!canAccess || !user?.id || isMaster !== true) return;
    // Backfill é PESADO (baixa arquivo inteiro + decodeAudioData no thread
    // principal). NÃO roda automático no load — saturava banda/CPU e causava
    // 10-15s de delay no primeiro play e travamentos. Só roda via evento
    // manual (`oculto-play:preview-backfill-run`), 1 job por vez, pausando
    // se houver áudio do usuário tocando.
    let cancelled = false;
    const runOnce = async (limit = 1) => {
      if (previewBackfillRunningRef.current) return;
      previewBackfillRunningRef.current = true;
      try {
        const { data } = await (supabase as any).rpc('oculto_play_audio_preview_backfill_list', { p_limit: Math.max(1, Math.min(3, limit)) });
        let jobs: any[] = Array.isArray(data) ? data : [];
        // A fila de jobs só foi preenchida uma vez (no SQL de 15/06). Músicas
        // publicadas depois sem clip não entram nela — busca direto na tabela.
        if (jobs.length === 0) {
          const { data: missing } = await supabase
            .from('oculto_play_items')
            .select('id, audio_url, preview_start_seconds, preview_end_seconds')
            .eq('kind', 'audio')
            .not('audio_url', 'is', null)
            .is('audio_preview_url', null)
            .order('created_at', { ascending: false })
            .limit(10);
          jobs = ((missing ?? []) as any[])
            .filter((r) => !backfillFailedIdsRef.current.has(r.id))
            .slice(0, Math.max(1, Math.min(3, limit)))
            .map((r) => {
              const st = Math.max(0, Number(r.preview_start_seconds ?? 0) || 0);
              const en = Number(r.preview_end_seconds ?? 0) || 0;
              return { item_id: r.id, audio_url: r.audio_url, start_seconds: st, end_seconds: en > st ? Math.min(en, st + 30) : st + 30 };
            });
        }
        jobs = jobs.filter((j) => !backfillFailedIdsRef.current.has(j.item_id));
        for (const job of jobs) {
          if (cancelled) break;
          try {
            const mod = await import('@/lib/ocultoPlayAudioSession');
            const active = mod.getActiveAudioState();
            if (active?.playing) break;
          } catch { /* noop */ }
          try {
            const res = await fetch(String(job.audio_url).split('#')[0], { mode: 'cors', cache: 'force-cache' });
            if (!res.ok) throw new Error(`download_${res.status}`);
            const blob = await res.blob();
            const start = Math.max(0, Number(job.start_seconds ?? 0));
            const end = Math.max(start + 5, Number(job.end_seconds ?? start + 30));
            const previewBlob = await createAudioPreviewClip(blob, start, Math.min(30, end - start));
            if (!previewBlob) throw new Error('preview_generation_failed');
            const up = await uploadOcultoPlayFileProgress(previewBlob, user.id, 'audio', `backfill_preview_${job.item_id}.wav`);
            await (supabase as any).rpc('oculto_play_audio_preview_backfill_done', {
              p_item_id: job.item_id,
              p_audio_preview_url: up.publicUrl,
              p_error_message: null,
            });
            // O RPC zera a janela para 0–30s; devolve o trecho real escolhido
            // (o editor reabre no ponto certo). Melhor esforço.
            await supabase
              .from('oculto_play_items')
              .update({ preview_start_seconds: Number(start.toFixed(2)), preview_end_seconds: Number(Math.min(end, start + 30).toFixed(2)) } as any)
              .eq('id', job.item_id);
          } catch (err: any) {
            backfillFailedIdsRef.current.add(job.item_id);
            await (supabase as any).rpc('oculto_play_audio_preview_backfill_done', {
              p_item_id: job.item_id,
              p_audio_preview_url: null,
              p_error_message: err?.message ?? 'failed',
            }).catch(() => null);
          }
        }
        if (jobs.length > 0) qcPage.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
      } finally {
        previewBackfillRunningRef.current = false;
      }
    };
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{ limit?: number }>;
      runOnce(ce?.detail?.limit ?? 1);
    };
    window.addEventListener('oculto-play:preview-backfill-run', handler as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('oculto-play:preview-backfill-run', handler as EventListener);
    };
  }, [canAccess, isMaster, user?.id, qcPage]);

  // Listener global: cards de qualquer strip chamam openPlayItemDeepLink()
  // e nós interceptamos para abrir o focus modal rico, com vídeo/áudio reais.
  useEffect(() => {
    const handler = async (ev: Event) => {
      const ce = ev as CustomEvent<{ id?: string; autoplay?: boolean }>;
      const id = ce?.detail?.id;
      if (!id) return;
      ev.preventDefault();
      try {
        try { pauseAllPreviews(); } catch { /* noop */ }
        const { data } = await supabase
          .from('oculto_play_items' as never)
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (data) {
          const item = normalizeOcultoPlayItem(data as any);
          setFocusItem(item);
          if (item.kind === 'audio' && item.audio_url) playSharedAudio(item.id, item.audio_url ?? undefined, ocultoPlayMetaFromItem(item)).catch(() => { /* noop */ });
        }
      } catch { /* noop */ }
    };
    window.addEventListener('oculto-play:open-focus', handler as EventListener);
    return () => window.removeEventListener('oculto-play:open-focus', handler as EventListener);
  }, []);

  // Deep-link via querystring: /oculto-play?item=ID — abre o focus modal do item.
  // Também aceita ?kind=short_video|meme|audio|... para pré-selecionar o filtro.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const itemId = params.get('item');
      const kindParam = params.get('kind') as OcultoPlayKind | null;
      if (kindParam) {
        setKindFilter(kindParam);
        params.delete('kind');
      }
      if (itemId) params.delete('item');
      if (itemId || kindParam) {
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
      if (itemId) openPlayItemDeepLink(itemId);
    } catch { /* noop */ }
  }, []);

  // Atualiza em tempo real o contador de comentários do item em destaque
  // quando um comentário é adicionado em PlayCommentsSheet.
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{ id?: string }>;
      const id = ce?.detail?.id;
      if (!id) return;
      setFocusItem((prev) => prev && prev.id === id
        ? { ...prev, comment_count: (prev.comment_count ?? 0) + 1 }
        : prev);
    };
    window.addEventListener('oculto-play:comment-added', handler as EventListener);
    return () => window.removeEventListener('oculto-play:comment-added', handler as EventListener);
  }, []);




  const isDerived = section === 'following' || section === 'trending';
  const baseFeed = useOcultoPlayFeed(
    isDerived ? 'normal' : (section as OcultoPlaySection),
    kindFilter,
    viewMode === 'vertical' ? 10 : isMobile ? 18 : 30,
  );
  const derivedFeed = useOcultoPlayDerivedFeed(
    (isDerived ? section : 'trending') as DerivedSection,
  );
  const feed = isDerived
    ? { data: derivedFeed.data, isLoading: derivedFeed.isLoading, refetch: derivedFeed.refetch }
    : { data: baseFeed.data, isLoading: baseFeed.isLoading, refetch: baseFeed.refetch };
  const audioFeed = useOcultoPlayFeed('normal', 'audio', 60);

  const enabledKinds = useMemo<OcultoPlayKind[]>(() => {
    const c = config.data;
    const audioOn = (c?.audios_on !== false) && (c?.allow_audio_mp3 !== false);
    const all: { key: OcultoPlayKind; on?: boolean }[] = [
      { key: 'short_video', on: c?.short_videos_on },
      { key: 'meme', on: c?.memes_on },
      { key: 'audio', on: audioOn },
      { key: 'vip_teaser', on: c?.vip_teasers_on },
      { key: 'community_post', on: c?.communities_on },
      { key: 'challenge', on: c?.challenges_on },
      { key: 'link', on: true },
    ];
    return all.filter((x) => x.on !== false).map((x) => x.key);
  }, [config.data]);


  // Realtime: novos itens e exclusões aparecem instantaneamente
  useEffect(() => {
    if (!canAccess) return;
    const openPublishedSection = (raw: Record<string, unknown>) => {
      const key = storageKeyForPlayItem(raw as Partial<OcultoPlayItem> & Record<string, unknown>);
      forceOpenPlaySection(key);
    };
    const ch = supabase
      .channel('oculto-play-page-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'oculto_play_items' },
        (payload: { new: Record<string, unknown> }) => {
          if (payload.new) {
            upsertOcultoPlayFeedItem(qcPage, payload.new as any);
            openPublishedSection(payload.new);
          }
          qcPage.invalidateQueries({ queryKey: ['oculto-play', 'trending-24h'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'oculto_play_items' },
        (payload: { old: { id?: string } }) => {
          const removedId = payload.old?.id;
          if (removedId) {
            qcPage.setQueriesData<OcultoPlayItem[] | undefined>(
              { queryKey: ['oculto-play', 'feed'] },
              (old) => (old ? old.filter((it) => it.id !== removedId) : old),
            );
            qcPage.setQueriesData<OcultoPlayItem[] | undefined>(
              { queryKey: ['oculto-play', 'direct-links'] },
              (old) => (old ? old.filter((it) => it.id !== removedId) : old),
            );
            qcPage.invalidateQueries({ queryKey: ['oculto-play', 'trending-24h'] });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'oculto_play_items' },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as Partial<OcultoPlayItem> & { id?: string };
          if (!updated?.id) return;
          // Patch in place: sincroniza contadores (likes/dislikes/saves/views/shares/comments) ao vivo
          qcPage.setQueriesData<OcultoPlayItem[] | undefined>(
            { queryKey: ['oculto-play', 'feed'] },
            (old) => {
              if (!old) return old;
              return old.map((it) =>
                it.id === updated.id
                  ? {
                      ...it,
                      like_count: (updated.like_count as number) ?? it.like_count,
                      dislike_count: (updated.dislike_count as number) ?? it.dislike_count,
                      save_count: (updated.save_count as number) ?? it.save_count,
                      share_count: (updated.share_count as number) ?? it.share_count,
                      view_count: (updated.view_count as number) ?? it.view_count,
                      comment_count: (updated.comment_count as number) ?? (it as any).comment_count,
                    }
                  : it,
              );
            },
          );
          qcPage.setQueriesData<OcultoPlayItem[] | undefined>(
            { queryKey: ['oculto-play', 'direct-links'] },
            (old) => {
              if (!old) return old;
              return old.map((it) =>
                it.id === updated.id
                  ? {
                      ...it,
                      like_count: (updated.like_count as number) ?? it.like_count,
                      dislike_count: (updated.dislike_count as number) ?? it.dislike_count,
                      save_count: (updated.save_count as number) ?? it.save_count,
                      share_count: (updated.share_count as number) ?? it.share_count,
                      view_count: (updated.view_count as number) ?? it.view_count,
                      comment_count: (updated.comment_count as number) ?? (it as any).comment_count,
                      title: (updated.title as string) ?? it.title,
                      caption: (updated.caption as string) ?? it.caption,
                      thumb_url: (updated.thumb_url as string) ?? it.thumb_url,
                      source_url: (updated.source_url as string) ?? it.source_url,
                      media_url: (updated.media_url as string) ?? it.media_url,
                      link_provider: (updated.link_provider as string) ?? it.link_provider,
                      genre_tags: (updated.genre_tags as string[]) ?? it.genre_tags,
                      is_adult: (updated.is_adult as boolean) ?? it.is_adult,
                      trailer_url: (updated.trailer_url as string) ?? it.trailer_url,
                      trailer_trim_start_seconds: (updated.trailer_trim_start_seconds as number) ?? it.trailer_trim_start_seconds,
                      trailer_trim_end_seconds: (updated.trailer_trim_end_seconds as number) ?? it.trailer_trim_end_seconds,
                    }
                  : it,
              );
            },
          );
          qcPage.invalidateQueries({ queryKey: ['oculto-play', 'trending-24h'] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canAccess, qcPage]);

  // Hash scroll: rola até a seção apontada pelo hash (#trending-24h, #filmes, #filmes-adult, …)
  useEffect(() => {
    if (!canAccess) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const targetId = hash.slice(1);
    // Garante que a seção esteja aberta (storageKey mapeado)
    try {
      const map: Record<string, PlaySectionStorageKey> = {
        filmes: 'links',
        'filmes-adult': 'links_adult',
      };
      const sk = map[targetId];
      if (sk) forceOpenPlaySection(sk);
    } catch { /* noop */ }
    const tryScroll = (attempt = 0) => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (attempt < 30) {
        setTimeout(() => tryScroll(attempt + 1), 150);
      }
    };
    tryScroll();
  }, [canAccess]);

  const handleAudioEnded = useCallback((current: OcultoPlayItem) => {
    if (!current?.audio_url) return;
    playNextSharedAudio('ended').catch(() => { /* noop */ });
  }, []);

  // Pool de áudios (mais novo -> mais velho) para navegação prev/next no modal
  const audioPool = useMemo<OcultoPlayItem[]>(() => {
    const source = (((audioFeed.data ?? []).length ? audioFeed.data : feed.data) ?? []) as OcultoPlayItem[];
    return source
      .filter((it) => it.kind === 'audio' && !!audioPreviewSrc(it))
      .slice()
      .sort((a, b) => {
        const ta = new Date((a as any).created_at ?? (a as any).published_at ?? 0).getTime();
        const tb = new Date((b as any).created_at ?? (b as any).published_at ?? 0).getTime();
        return tb - ta;
      });
  }, [audioFeed.data, feed.data]);
  const audioPoolSignature = useMemo(
    () => audioPool
      .map((it) => `${it.id}:${it.audio_preview_url ?? ''}:${it.audio_url ?? ''}:${it.thumb_url ?? ''}:${it.published_at ?? ''}`)
      .join('|'),
    [audioPool],
  );

  useEffect(() => {
    configureSharedAudioQueue(
      audioPool.map((it) => ({ id: it.id, src: it.audio_url || audioPreviewSrc(it)!, meta: ocultoPlayMetaFromItem(it), item: it })),
      {
        shuffle: audioShuffle,
        repeatOne: false,
        repeatAll: audioRepeatMode === 'all',
        onTrackChange: (queued) => {
          const next = queued.item as OcultoPlayItem | undefined;
          if (!next || next.kind !== 'audio') return;
          const current = focusItemRef.current;
          if (!current || current.kind !== 'audio') return;
          // Só substitui se a faixa REALMENTE mudou — evita re-render/flicker
          // do modal quando o usuário só dá play/pause/seek na mesma música.
          if (current.id === next.id) return;
          setFocusItem(next);
        },
      },
    );
  }, [audioPoolSignature, audioRepeatMode, audioShuffle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pré-aquece apenas capas. Áudio NÃO é baixado em lote: vários MP3/WAV em
  // paralelo eram o gargalo que atrasava e travava o play clicado.
  useEffect(() => {
    if (!audioPool.length) return;
    const idle = (cb: () => void) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(cb, { timeout: 1500 });
      } else {
        setTimeout(cb, 200);
      }
    };
    // Capas: dispara em paralelo (browser limita concorrência sozinho).
    idle(() => {
      audioPool.slice(0, 24).forEach((it, i) => {
        if (!it.thumb_url) return;
        setTimeout(() => { try { prefetchThumb(it.thumb_url); } catch { /* noop */ } }, i * 30);
      });
    });
  }, [audioPoolSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clips dedicados de ~30s são pequenos; pré-carregar só eles elimina o delay
  // do botão amarelo sem voltar ao problema antigo de baixar MP3s completos.
  useEffect(() => {
    if (!audioPool.length) return;
    const clips = audioPool
      .filter((it) => !!it.audio_preview_url)
      .slice(0, isMobile ? 4 : 8);
    if (!clips.length) return;
    const timers = clips.map((it, i) => window.setTimeout(() => {
      try { void primePreviewClipBlob(it.audio_preview_url, 0, null); } catch { /* noop */ }
    }, i * (isMobile ? 220 : 120)));
    return () => { timers.forEach((id) => window.clearTimeout(id)); };
  }, [audioPoolSignature, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToAudio = useCallback((current: OcultoPlayItem, dir: 1 | -1) => {
    if (!current?.audio_url || audioPool.length < 2) return;
    const action = dir === 1 ? playNextSharedAudio('manual') : playPrevSharedAudio();
    action.catch(() => { /* noop */ });
  }, [audioPool.length]);

  const handleAudioPrev = useCallback((current: OcultoPlayItem) => goToAudio(current, -1), [goToAudio]);
  const handleAudioNext = useCallback((current: OcultoPlayItem) => goToAudio(current, 1), [goToAudio]);

  const handleSetAsAudioBio = useCallback(async (current: OcultoPlayItem) => {
    if (!user?.id) {
      toast.error('Faça login para usar como bio em áudio.');
      return;
    }
    if (!current.audio_url) {
      toast.error('Esta música não tem prévia de áudio disponível.');
      return;
    }
    // Usa SOMENTE o trecho marcado como prévia (não a música inteira).
    const startRaw = (current as any).preview_start_seconds;
    const endRaw   = (current as any).preview_end_seconds;
    const start = Number.isFinite(Number(startRaw)) ? Math.max(0, Number(startRaw)) : 0;
    const fullDur = Number.isFinite(Number(current.duration_sec)) ? Number(current.duration_sec) : null;
    const fallbackEnd = Math.min(start + 20, fullDur ?? start + 20);
    const endCandidate = Number.isFinite(Number(endRaw)) ? Math.max(start + 1, Number(endRaw)) : fallbackEnd;
    // Limite de 30s (mesmo limite da voice bio padrão).
    const end = Math.min(endCandidate, start + 30);
    const previewDur = Math.max(1, Math.round(end - start));

    setSettingAudioBio(true);
    try {
      // 1) Baixa o áudio original e recorta SOMENTE o trecho da prévia.
      const baseUrl = current.audio_url.split('#')[0];
      const resp = await fetch(baseUrl, { mode: 'cors' });
      if (!resp.ok) throw new Error(`Falha ao baixar áudio (${resp.status})`);
      const srcBlob = await resp.blob();

      const { trimAudioBlob } = await import('@/lib/audioTrim');
      const { blob: trimmedBlob, duration: trimmedDur } = await trimAudioBlob(
        srcBlob,
        start,
        previewDur,
      );

      // 2) Upload do trecho recortado para o bucket voice-bio.
      const fileName = `${user.id}/voice-bio-${Date.now()}.wav`;
      const BUCKET = 'voice-bio';
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, trimmedBlob, {
          contentType: 'audio/wav',
          upsert: true,
          cacheControl: '3600',
        });
      if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

      const { EXTERNAL_SUPABASE_URL: SUPABASE_URL } = await import('@/lib/appConfig');
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;

      // 3) Atualiza o perfil com a URL do trecho recortado.
      const { error } = await supabase
        .from('profiles')
        .update({
          voice_bio_url: publicUrl,
          voice_bio_duration: Math.max(1, Math.round(trimmedDur)),
        } as any)
        .eq('id', user.id);
      if (error) throw error;

      toast.success('Prévia definida como sua bio em áudio.', {
        description: `${current.title ?? 'Áudio'} · trecho de ${Math.round(trimmedDur)}s`,
      });
    } catch (err: any) {
      toast.error('Não foi possível definir a bio em áudio.', { description: err?.message });
    } finally {
      setSettingAudioBio(false);
    }
  }, [user?.id]);



  const videoHistoryRef = useRef<string[]>([]);
  const videoPool = useMemo<OcultoPlayItem[]>(() => {
    const source = (feed.data ?? []) as OcultoPlayItem[];
    return source
      .filter((it) => (it.kind === 'short_video' || it.kind === 'vip_teaser') && !!it.media_url)
      .slice()
      .sort((a, b) => {
        const ta = new Date((a as any).created_at ?? 0).getTime();
        const tb = new Date((b as any).created_at ?? 0).getTime();
        return tb - ta;
      });
  }, [feed.data]);

  const pickRandomVideo = useCallback((current: OcultoPlayItem): OcultoPlayItem | null => {
    if (!videoPool.length) return null;
    if (videoPool.length === 1) return videoPool[0].id === current.id ? null : videoPool[0];
    const others = videoPool.filter((it) => it.id !== current.id);
    if (!others.length) return null;
    return others[Math.floor(Math.random() * others.length)];
  }, [videoPool]);

  const handleVideoNext = useCallback((current: OcultoPlayItem) => {
    const next = pickRandomVideo(current);
    if (!next) return;
    videoHistoryRef.current.push(current.id);
    if (videoHistoryRef.current.length > 30) videoHistoryRef.current.shift();
    setFocusItem(next);
  }, [pickRandomVideo]);

  const handleVideoPrev = useCallback((_current: OcultoPlayItem) => {
    const prevId = videoHistoryRef.current.pop();
    if (!prevId) return;
    const prev = videoPool.find((it) => it.id === prevId);
    if (prev) setFocusItem(prev);
  }, [videoPool]);

  const returnToMainFeed = useCallback(() => {
    try { enableOcultoPlayMiniPlayer(); } catch { /* noop */ }
    videoHistoryRef.current = [];
    setUploadOpen(false);
    setDraftsOpen(false);
    setCollectionsOpen(false);
    setFocusItem(null);
    setFocusCommentsItem(null);
    setFocusShareItem(null);
    setFocusReportItem(null);
    navigate('/feed', { replace: true });
  }, [navigate]);

  const navigateToFeedKeepingAudio = useCallback(() => {
    try { enableOcultoPlayMiniPlayer(); } catch { /* noop */ }
    videoHistoryRef.current = [];
    setUploadOpen(false);
    setDraftsOpen(false);
    setCollectionsOpen(false);
    setFocusItem(null);
    setFocusCommentsItem(null);
    setFocusShareItem(null);
    setFocusReportItem(null);
    navigate('/feed');
  }, [navigate]);





  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user?.id) return <OcultoPlayGuestPage />;
  if (!canAccess) return <Navigate to="/feed" replace />;

  return (
    <>
    <div
      className="container max-w-5xl py-3 md:py-6 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-6"
      style={{
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
      }}
    >
      {/* Header — ícones, título e nível alinhados no mesmo eixo */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 mb-2 w-full min-w-0">
        <Button
          variant="default"
          size="icon"
          onClick={returnToMainFeed}
          aria-label="Voltar ao feed"
          title="Voltar ao feed"
          className="shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 text-white shadow-lg shadow-fuchsia-500/40 hover:from-fuchsia-400 hover:via-pink-400 hover:to-amber-300 hover:text-white border border-white/20"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={3} />
        </Button>
        <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-primary/30 text-fuchsia-200 border border-fuchsia-400/60 shadow-[0_0_12px_rgba(232,121,249,0.65),0_0_24px_rgba(232,121,249,0.35),inset_0_0_8px_rgba(232,121,249,0.35)] animate-pulse">
          <Play className="h-5 w-5 drop-shadow-[0_0_6px_rgba(255,128,255,0.9)]" />
        </div>
        <div className="min-w-0 flex h-11 items-center gap-1.5 overflow-hidden">
          <h1 className="min-w-0 truncate text-[15px] xs:text-[16px] sm:text-[18px] md:text-xl font-bold leading-none whitespace-nowrap">
            OCULTO PLAY
          </h1>
          <span className="shrink-0 text-[8px] sm:text-[9px] md:text-[10px] uppercase tracking-wider bg-fuchsia-500/25 text-fuchsia-200 px-1 sm:px-1.5 py-0.5 rounded">
              beta
          </span>
        </div>
        <div className="shrink-0 self-center max-w-[38vw] overflow-hidden">
          <PlayXpBadge className="h-8 max-w-full px-2 text-[10px]" />
        </div>
      </div>

      {/* Linha de ações: Coleções / Rascunhos / Visualizações / Enviar */}
      <div className="flex items-center gap-1.5 mb-2 w-full overflow-hidden">
        <button
          type="button"
          onClick={() => setCollectionsOpen(true)}
          title="Minhas coleções"
          aria-label="Coleções"
          className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-semibold bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-400/40 hover:bg-fuchsia-500/30 transition-colors"
        >
          <Library className="h-3.5 w-3.5" />
          <span className="hidden xs:inline sm:inline">Coleções</span>
        </button>
        <button
          type="button"
          onClick={() => setDraftsOpen(true)}
          title="Rascunhos e agendamentos"
          aria-label="Rascunhos"
          className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-100 border border-amber-400/40 hover:bg-amber-500/30 transition-colors"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="hidden xs:inline sm:inline">Rascunhos</span>
        </button>
        <Link
          to="/oculto-play/offline"
          title="Ouvir músicas baixadas (funciona sem internet)"
          aria-label="Modo offline"
          className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-semibold bg-cyan-500/20 text-cyan-100 border border-cyan-400/40 hover:bg-cyan-500/30 transition-colors"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span className="hidden xs:inline sm:inline">Offline</span>
        </Link>
        {section !== 'insights' && (
          <div
            className="shrink-0 inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/15 p-0.5"
            title="Modo de visualização"
          >
            <button
              onClick={() => setViewMode('grid')}
              title="Grade"
              aria-label="Visualização em grade"
              className={cn(
                "grid place-items-center h-7 w-7 rounded-full transition-all",
                viewMode === 'grid'
                  ? "bg-cyan-400 text-black"
                  : "text-cyan-100 hover:text-white"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('vertical')}
              title="Vertical"
              aria-label="Visualização vertical"
              className={cn(
                "grid place-items-center h-7 w-7 rounded-full transition-all",
                viewMode === 'vertical'
                  ? "bg-cyan-400 text-black"
                  : "text-cyan-100 hover:text-white"
              )}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={openMyChannel}
          disabled={!user?.id}
          title={(myChannels ?? []).length ? 'Abrir meu canal' : 'Criar meu canal'}
          aria-label="Meu canal"
          className="min-w-0 shrink-0 inline-flex items-center justify-center gap-1 h-8 px-3 rounded-full text-[11px] font-bold bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15 disabled:opacity-40"
        >
          <Clapperboard className="h-3.5 w-3.5" />
          <span>{(myChannels ?? []).length ? 'Meu canal' : 'Criar canal'}</span>
        </button>
        <button
          type="button"
          onClick={() => { setUploadChannelId(null); setUploadOpen(true); }}
          disabled={!canUpload}
          title={canUpload ? 'Enviar conteúdo' : 'Entre na sua conta para publicar'}
          aria-label="Enviar"
          className="min-w-0 flex-1 inline-flex items-center justify-center gap-1 h-8 px-3 rounded-full text-[11px] font-bold bg-gradient-to-r from-fuchsia-500 to-primary text-white shadow hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Enviar</span>
        </button>
      </div>

      {/* Linha única: seções (Para Você/Seguindo/...) + filtros de tipo (Tudo/Vídeos/...) */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { id: 'normal' as const, label: 'Para Você' },
          { id: 'following' as const, label: 'Seguindo' },
          { id: 'trending' as const, label: 'Em Alta' },
          { id: 'today' as const, label: 'Hoje no Oculto', show: config.data?.today_section_on !== false },
          { id: 'comeback' as const, label: 'Volte para Ver', show: config.data?.comeback_section_on !== false },
          { id: 'insights' as const, label: 'Insights' },
        ] as const).filter((t) => (t as any).show !== false).map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id as SectionTab)}
            title={t.label}
            className={cn(
              "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-all",
              section === t.id
                ? "bg-fuchsia-500/30 text-fuchsia-50 border-fuchsia-400/70"
                : "bg-card text-muted-foreground border-border/40 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
        {section !== 'insights' && (
          <>
            <span className="shrink-0 self-center mx-1 h-4 w-px bg-border/60" />
            <FilterPill active={!kindFilter} onClick={() => setKindFilter(undefined)} label="Tudo" />
            {enabledKinds.map((k) => {
              const Icon = KIND_META[k].icon;
              return (
                <FilterPill
                  key={k}
                  active={kindFilter === k}
                  onClick={() => setKindFilter(kindFilter === k ? undefined : k)}
                  label={KIND_META[k].label}
                  icon={<Icon className="h-3 w-3" />}
                />
              );
            })}
          </>
        )}
      </div>

      {/* Tags em alta (Etapa 31) — filtro client-side por hashtag */}
      {section !== 'insights' && (
        <PlayTrendingTagsStrip value={tagFilter} onChange={setTagFilter} />
      )}

      {/* Em Alta nas Últimas 24h — SEMPRE visível (inclusive mobile) */}
      {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
        <div id="trending-24h" className="mb-3 scroll-mt-20">
          <PlayTrending24hStrip onOpen={(it) => openPlayItemDeepLink(it.id)} />
        </div>
      )}


      {/* Áudios — cards grandes, somente áudios */}
      {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
        <PlayKindLargeCardsSection
          kind="audio"
          channelSection="audio"
          layout="spotify"
          title="Áudios"
          icon={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-purple-300/15 ring-1 ring-purple-200/30"><Headphones className="h-7 w-7 text-purple-50 drop-shadow" strokeWidth={2.6} /></span>}
          onOpenFocus={(it) => setFocusItem(it)}
          storageKey="audios"
          headerClassName="bg-gradient-to-r from-purple-950/90 via-fuchsia-950/70 to-violet-950/55 text-purple-50 ring-purple-300/35 hover:ring-purple-100/55 hover:from-purple-900/90"
          wrapperClassName="mb-4 rounded-2xl bg-gradient-to-br from-purple-950/90 via-fuchsia-950/60 to-violet-950/45 border border-purple-300/35 ring-1 ring-purple-200/10 p-3 md:p-4 shadow-[0_0_28px_-18px_rgba(216,180,254,0.9)] text-purple-50"
        />
      )}

      {/* Vídeos — cards grandes: somente vídeos enviados diretamente pelo
          sistema (short_video + vip_teaser). Links externos têm seção própria. */}
      {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
        <PlayKindLargeCardsSection
          kinds={['short_video', 'vip_teaser']}
          channelSection="shorts"
          layout="youtube"
          title="Vídeos"
          icon={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-yellow-950/15 ring-1 ring-yellow-950/25"><Clapperboard className="h-7 w-7 text-yellow-950 drop-shadow" strokeWidth={2.6} /></span>}
          onOpenFocus={(it) => setFocusItem(it)}
          storageKey="videos"
          headerClassName="bg-gradient-to-r from-yellow-200 via-amber-300 to-orange-400 text-yellow-950 ring-yellow-950/25 hover:ring-yellow-950/45 hover:from-yellow-100"
          wrapperClassName="mb-4 rounded-2xl bg-gradient-to-br from-yellow-300/95 via-amber-500/80 to-orange-700/65 border border-yellow-100/50 ring-1 ring-yellow-950/10 p-3 md:p-4 shadow-[0_0_28px_-18px_rgba(250,204,21,0.95)] text-yellow-950"
        />
      )}

      {/* Filmes — links externos não marcados como +18. */}
      {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
        <PlayLinksSection
          title="Filmes"
          channelSection="links"
          layout="netflix"
          icon={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-300/15 ring-1 ring-cyan-200/30"><Film className="h-7 w-7 text-cyan-50 drop-shadow" strokeWidth={2.6} /></span>}
          onOpenFocus={(it) => setFocusItem(it)}
          storageKey="links"
          adultOnly={false}
          wrapperId="filmes"
          wrapperStyle={{ scrollMarginTop: '88px' }}
          wrapperClassName="mb-4 rounded-2xl bg-gradient-to-br from-sky-950/80 via-blue-950/60 to-cyan-950/35 border border-sky-400/35 ring-1 ring-sky-200/10 p-3 md:p-4 shadow-[0_0_28px_-18px_rgba(56,189,248,0.8)]"
        />
      )}

      {/* Filmes +18 — apenas itens marcados como +18. */}
      {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
        <PlayLinksSection
          title="Filmes +18"
          channelSection="links_adult"
          layout="youtube"
          icon={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-300/15 ring-1 ring-red-200/30"><ShieldAlert className="h-7 w-7 text-red-50 drop-shadow" strokeWidth={2.6} /></span>}
          onOpenFocus={(it) => setFocusItem(it)}
          storageKey="links_adult"
          adultOnly={true}
          wrapperId="filmes-adult"
          wrapperStyle={{ scrollMarginTop: '88px' }}
          wrapperClassName="mb-4 rounded-2xl bg-gradient-to-br from-red-950/85 via-rose-950/65 to-red-900/30 border border-red-400/40 ring-1 ring-red-200/10 p-3 md:p-4 shadow-[0_0_30px_-18px_rgba(248,113,113,0.9)]"
        />
      )}

      {/* Memes — cards grandes, somente memes */}
      {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
        <PlayKindLargeCardsSection
          kind="meme"
          channelSection="memes"
          title="Memes"
          icon={<ImageIcon className="h-4 w-4 text-amber-300" />}
          onOpenFocus={(it) => setFocusItem(it)}
          storageKey="memes"
          wrapperClassName="mb-4 rounded-2xl bg-gradient-to-br from-amber-950/40 via-orange-950/30 to-background border border-amber-500/10 p-3 md:p-4"
        />
      )}

      {/* Comunidades — posts vindos das comunidades */}
      {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
        <PlayKindLargeCardsSection
          kind="community_post"
          title="Comunidades"
          icon={<Users className="h-4 w-4 text-emerald-300" />}
          onOpenFocus={(it) => setFocusItem(it)}
          storageKey="comunidades"
          wrapperClassName="mb-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-teal-950/30 to-background border border-emerald-500/10 p-3 md:p-4"
        />
      )}


      {/* Desafios — removida a pedido do usuário */}



      {/* Strips pesadas — só montadas em DESKTOP (mobile = corte 100% no custo
          de queries, listeners e DOM). Também ficam atrás de Suspense para
          não bloquear o first paint do feed. */}
      {!isMobile && (
        <div className="hidden md:block">
          <Suspense fallback={null}>
            {viewMode === 'grid' && section === 'normal' && !kindFilter && !tagFilter && (
              <>
                <CreatorSurgeBanner />
                <CreatorMilestonesBanner />
                <PlayPersonalMixStrip />
                <PlayContinueWatchingStrip />
                <PlayWatchLaterStrip />
                <PlayActivePlaylistsStrip />
                <PlayForYouStrip />
                <PlayWeeklyChallengeCard onOpenItem={(id) => openPlayItemDeepLink(id)} />
              </>
            )}
            {viewMode === 'grid' && kindFilter === 'meme' && !tagFilter && (
              <PlayTopByKindStrip kind="meme" onOpen={(id) => openPlayItemDeepLink(id)} />
            )}
            {viewMode === 'grid' && section === 'normal' && !tagFilter && (
              <>
                <HojeNoOcultoPanel className="mb-3" />
                <VolteParaVerPanel className="mb-3" />
                <PlayActiveChallengeCard className="mb-3" />
                {config.data?.comeback_section_on !== false && (
                  <PlayComebackStrip onPick={() => setSection('comeback')} />
                )}
              </>
            )}
          </Suspense>
        </div>
      )}


      {/* Conteúdo principal */}
      {section === 'insights' ? (
        <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
          <PlayCreatorInsightsPanel days={14} />
        </Suspense>
      ) : feed.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (() => {
        // Tipos que possuem SEÇÕES DEDICADAS na aba "normal" (Áudios / Vídeos).
        // Quando estamos na aba normal sem filtro de tipo, removemos esses
        // tipos da grade geral para evitar duplicação visual — áudios só
        // aparecem na seção "Áudios", vídeos curtos / teasers VIP / links só
        // aparecem na seção "Vídeos".
        const dedicatedKinds = new Set<string>(['audio', 'short_video', 'vip_teaser', 'link', 'meme', 'community_post', 'challenge']);
        const hasDedicatedSections = section === 'normal' && !kindFilter && !tagFilter;
        const items = (feed.data ?? []).filter((it: any) => {
          // Links têm card especial — só aparecem na grade geral quando o
          // filtro estiver explicitamente em "Links".
          if (it.kind === 'link' && kindFilter !== 'link') return false;
          if (hasDedicatedSections && dedicatedKinds.has(it.kind)) return false;
          if (!tagFilter) return true;
          const tags: string[] = Array.isArray(it.tags) ? it.tags : [];
          return tags.some((t) => (t ?? '').toLowerCase().trim() === tagFilter);
        });

        if (items.length === 0) {
          return tagFilter ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhum item com <span className="text-fuchsia-300">#{tagFilter}</span> nesta aba.
            </div>
          ) : (
            <EmptyState onUpload={() => setUploadOpen(true)} />
          );
        }
        if (viewMode === 'vertical') {
          const verticalItems = items.filter(
            (it) => (it.kind === 'short_video' || it.kind === 'vip_teaser') && !!it.media_url,
          );
          const seed = verticalItems[0]?.id;
          if (!seed) {
            return (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhum vídeo disponível nesta aba.
              </div>
            );
          }
          return (
            <div className="mx-auto w-full max-w-[430px] h-[calc(100dvh-8.5rem)] min-h-[520px] overflow-hidden rounded-[22px] bg-black">
              <OcultoPlayShortsScroller
                items={verticalItems}
                seedId={seed}
                onClose={() => setViewMode('grid')}
                onComment={(it) => setFocusCommentsItem(it)}
                onShare={(it) => setFocusShareItem(it)}
                onReport={(it) => setFocusReportItem(it)}
              />
            </div>
          );
        }
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
            {items.map((item, idx) => {
              // Pré-aquece a próxima faixa de áudio da lista (não importa a posição)
              const nextAudioItem = items.slice(idx + 1).find((it) => it.kind === 'audio' && !!audioPreviewSrc(it)) ?? null;
              const nextAudio = nextAudioItem ? audioPreviewSrc(nextAudioItem) : null;
              return (
                <LazyVisible
                  key={item.id}
                  minHeight={item.kind === 'audio' ? 96 : 260}
                  rootMargin={idx < 8 ? '1200px 0px' : '600px 0px'}
                  className="contain-paint"
                >
                  {item.kind === 'audio'
                    ? <AudioGridCard item={item} nextAudioUrl={nextAudio} onOpenFocus={() => setFocusItem(item)} />
                    : <PlayCard item={item} onPlayQueue={() => setFocusItem(item)} />}
                </LazyVisible>
              );
            })}
          </div>
        );
      })()}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        enabledKinds={enabledKinds}
        config={config.data}
        initialChannelId={uploadChannelId}
        onCreateChannel={(k) => { setCreateChannelKind(k); setCreateChannelOpen(true); }}
        onDone={() => {
          setUploadOpen(false);
        }}
      />

      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
        defaultKind={createChannelKind}
        onCreated={(ch) => {
          setUploadChannelId(ch.id);
          if (!uploadOpen) navigate(`/play/c/${ch.slug}`);
        }}
      />


      {/* Modais montados sob demanda — não pesam no first paint nem disparam
          fetches antes de o usuário abrir. */}
      {draftsOpen && (
        <Suspense fallback={null}>
          <PlayDraftsModal open={draftsOpen} onOpenChange={setDraftsOpen} />
        </Suspense>
      )}
      {collectionsOpen && (
        <Suspense fallback={null}>
          <PlayCollectionsModal open={collectionsOpen} onOpenChange={setCollectionsOpen} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <PlayItemDeepLinkSheet />
      </Suspense>
      {focusItem && (
        <Suspense fallback={null}>
          <OcultoPlayFocusModal
            item={focusItem}
            open={!!focusItem}
            onClose={() => {
              if (focusItem.kind === 'audio') {
                try { pauseSharedAudio(focusItem.id); } catch { /* noop */ }
              }
              setFocusItem(null);
            }}
            onNavigateHome={navigateToFeedKeepingAudio}
            onLike={(it) => pageActions.toggleLike.mutate(it.id)}
            onDislike={(it) => pageActions.toggleDislike.mutate(it.id)}
            onSave={(it) => pageActions.toggleSave.mutate(it.id)}
            onComment={(it) => setFocusCommentsItem(it)}
            onShare={(it) => setFocusShareItem(it)}
            onReport={(it) => setFocusReportItem(it)}
            onAudioEnded={handleAudioEnded}
            onVideoEnded={handleVideoNext}
            onSwipeNextVideo={handleVideoNext}
            onSwipePrevVideo={handleVideoPrev}
            audioRepeatMode={audioRepeatMode}
            onAudioRepeatModeChange={setAudioRepeatMode}
            onAudioPrev={handleAudioPrev}
            onAudioNext={handleAudioNext}
            onSetAsAudioBio={handleSetAsAudioBio}
            settingAudioBio={settingAudioBio}
            videoQueue={videoPool}
            onSelectLinkSuggestion={(it) => setFocusItem(it)}
          />

        </Suspense>
      )}

      {focusCommentsItem && (
        <PlayCommentsSheet
          itemId={focusCommentsItem.id}
          open={!!focusCommentsItem}
          onClose={() => setFocusCommentsItem(null)}
        />
      )}

      {focusShareItem && (
        <SharePlayItemModal
          open={!!focusShareItem}
          onOpenChange={(o) => { if (!o) setFocusShareItem(null); }}
          url={ocultoPlayShareUrlWithBust(focusShareItem.id)}
          itemId={focusShareItem.id}
          title={focusShareItem.title ?? focusShareItem.caption ?? 'OCULTO Play'}
          author={(focusShareItem as any).author_username ?? null}
          abovePlayer={!!focusItem}
          onShared={() => { if (focusShareItem) pageActions.registerShare.mutate(focusShareItem.id); }}
        />
      )}

      {focusReportItem && (
        <ReportOcultoPlayContentModal
          itemId={focusReportItem.id}
          open={!!focusReportItem}
          onClose={() => setFocusReportItem(null)}
        />
      )}

    </div>
    <MobileNavbar />
    </>

  );
}


function OcultoPlayGuestPage() {
  return (
    <div className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto max-w-md space-y-5 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-300">
          <Play className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">OCULTO PLAY</h1>
          <p className="text-sm text-muted-foreground">
            Entre para acessar o feed completo, coleções, comentários e conteúdos Premium/VIP.
          </p>
        </div>
        <div className="grid gap-2">
          <Link to="/signup?from=oculto-play">
            <Button className="w-full bg-gradient-to-r from-fuchsia-500 to-primary">Criar conta grátis</Button>
          </Link>
          <Link to="/login?from=oculto-play">
            <Button variant="outline" className="w-full">Entrar</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active, onClick, label, icon,
}: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap border transition-all flex items-center gap-1.5",
        active
          ? "bg-primary/20 text-primary border-primary/50"
          : "bg-card text-muted-foreground border-border/40 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300 mb-3">
        <Play className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">Nada por aqui ainda.</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Seja o primeiro a publicar conteúdo no PLAY.
      </p>
      <Button onClick={onUpload} variant="outline">
        <Upload className="h-4 w-4 mr-2" /> Enviar conteúdo
      </Button>
    </div>
  );
}

// Coordenador compartilhado: apenas um preview de áudio toca por vez em todo o feed.
import {
  claimPreviewSlot,
  releasePreviewSlot,
  useCachedThumb,
} from '@/lib/ocultoPlayPreviewCoordinator';

/**
 * VideoThumb — poster estável com skeleton para evitar layout shift enquanto
 * a imagem chega. Usa `useCachedThumb` para mostrar instantaneamente quando
 * já cacheada por outro card.
 */
function VideoThumb({ src, alt }: { src: string; alt: string }) {
  const loaded = useCachedThumb(src);
  return (
    <>
      {!loaded && (
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(110deg,rgba(168,85,247,0.18)_0%,rgba(217,70,239,0.18)_50%,rgba(168,85,247,0.18)_100%)]"
        />
      )}
      <CachedThumbImg
        src={src}
        alt={alt}
        showSkeleton={false}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </>
  );
}

function AudioPreviewCard({ item, onView, nextAudioUrl }: { item: OcultoPlayItem; onView?: () => void; nextAudioUrl?: string | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const qcCard = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const suppressNextClickRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [muted, setMuted] = useState(true);
  const viewedRef = useRef(false);
  const start = Math.max(0, Number(item.preview_start_seconds ?? 0));
  const rawEnd = Number(item.preview_end_seconds ?? 0);
  const end = rawEnd > start ? Math.min(rawEnd, start + 30) : start + 30;
  const previewSrc = audioPreviewSrc(item);
  // Se previewSrc é o áudio COMPLETO (audio_url), precisamos respeitar a janela
  // preview_start/end definida pelo criador. Só quando estamos usando um clip
  // dedicado (audio_preview_url, sem audio_url) é que tocamos do começo ao fim
  // do arquivo (que já É o trecho recortado).
  const usingDedicatedPreviewClip = !!item.audio_preview_url;
  const previewStart = usingDedicatedPreviewClip ? 0 : start;
  const previewEnd = usingDedicatedPreviewClip ? Number.POSITIVE_INFINITY : end;
  const thumbLoaded = useCachedThumb(item.thumb_url);

  // Refs estáveis para start/end e nextAudioUrl — evita reexecução de efeitos
  // (e parada do áudio) quando re-renderizações trocam essas referências.
  const startRef = useRef(start);
  const endRef = useRef(end);
  const nextAudioUrlRef = useRef(nextAudioUrl);
  useEffect(() => { startRef.current = previewStart; }, [previewStart]);
  useEffect(() => { endRef.current = previewEnd; }, [previewEnd]);
  useEffect(() => { nextAudioUrlRef.current = nextAudioUrl ?? null; }, [nextAudioUrl]);

  // Reaproveita o <audio> do cache LRU compartilhado. A mesma instância
  // é mantida no audioRef durante todo o ciclo de vida do card — re-renders
  // NÃO recriam o elemento, evitando rebuffer ao alternar entre cards.
  const ensureAudio = useCallback((): HTMLAudioElement | null => {
    if (!previewSrc) return null;
    if (usingDedicatedPreviewClip) void primePreviewClipBlob(previewSrc, 0, null);
    const existing = audioRef.current;
    if (existing) {
      const currentSrc = existing.currentSrc || existing.src;
      let targetSrc = previewSrc;
      try { targetSrc = new URL(previewSrc, window.location.href).href; } catch { /* noop */ }
      if (currentSrc && currentSrc.split('#')[0] === targetSrc.split('#')[0]) return existing;
      audioRef.current = null;
    }
    const a = warmPreviewAudioWindow(previewSrc, startRef.current, endRef.current);
    const marker = `__previewHandlers_${item.id}`;
    if (!(a as any)[marker]) {
      const onTime = () => {
        if (a.currentTime >= endRef.current) {
          try { a.pause(); a.currentTime = startRef.current; } catch { /* noop */ }
          setPlaying(false);
        }
      };
      const onPause = () => setPlaying(false);
      const onEnded = () => setPlaying(false);
      a.addEventListener('timeupdate', onTime);
      a.addEventListener('pause', onPause);
      a.addEventListener('ended', onEnded);
      (a as any)[marker] = { onTime, onPause, onEnded };
    }
    audioRef.current = a;
    return a;
  }, [previewSrc, item.id, usingDedicatedPreviewClip]);

  const ensurePlayableAudio = useCallback((): HTMLAudioElement | null => {
    if (!previewSrc) return null;
    if (usingDedicatedPreviewClip) void primePreviewClipBlob(previewSrc, 0, null, { priority: true });
    const a = preparePreviewAudioForPlayback(previewSrc, startRef.current, endRef.current);
    const seekPreviewStart = () => {
      try {
        const s = startRef.current;
        if (a.paused && Math.abs((a.currentTime || 0) - s) > 0.35) a.currentTime = s;
      } catch { /* noop */ }
    };
    if (a.readyState >= 1) seekPreviewStart();
    else a.addEventListener('loadedmetadata', seekPreviewStart, { once: true });
    const marker = `__previewHandlers_${item.id}`;
    if (!(a as any)[marker]) {
      const onTime = () => {
        if (a.currentTime >= endRef.current) {
          try { a.pause(); a.currentTime = startRef.current; } catch { /* noop */ }
          setPlaying(false);
        }
      };
      const onPause = () => setPlaying(false);
      const onEnded = () => setPlaying(false);
      a.addEventListener('timeupdate', onTime);
      a.addEventListener('pause', onPause);
      a.addEventListener('ended', onEnded);
      (a as any)[marker] = { onTime, onPause, onEnded };
    }
    audioRef.current = a;
    return a;
  }, [previewSrc, item.id, usingDedicatedPreviewClip]);

  useEffect(() => {
    if (!previewSrc) return;
    if (!ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      if (e.isIntersecting) {
        // Música sem clip curto: pede ao servidor para gerar (vale para todos
        // os usuários a partir daí). Enquanto isso, o play usa o MP3 completo.
        if (!usingDedicatedPreviewClip && item.audio_url) {
          void requestServerPreviewClip(qcCard, item.id);
        }
        if (usingDedicatedPreviewClip) {
          const run = () => { try { void primePreviewClipBlob(previewSrc, 0, null); ensureAudio(); } catch { /* noop */ } };
          if (typeof (window as any).requestIdleCallback === 'function') (window as any).requestIdleCallback(run, { timeout: 500 });
          else window.setTimeout(run, 80);
        }
      } else {
        const a = audioRef.current;
        if (a && !a.paused) { try { a.pause(); } catch { /* noop */ } }
      }
    }, { threshold: 0, rootMargin: '400px 0px' });
    io.observe(el);
    return () => {
      io.disconnect();
      const a = audioRef.current;
      if (a) {
        // Não cancelar preview ativo em desmontagens transitórias da grade
        // (refetch/realtime/virtualização). O próprio handler encerra em 30s.
        if (!a.paused) return;
        try { a.pause(); } catch { /* noop */ }
        const marker = `__previewHandlers_${item.id}`;
        const h = (a as any)[marker] as
          | { onTime: () => void; onPause: () => void; onEnded: () => void }
          | undefined;
        if (h) {
          try { a.removeEventListener('timeupdate', h.onTime); } catch { /* noop */ }
          try { a.removeEventListener('pause', h.onPause); } catch { /* noop */ }
          try { a.removeEventListener('ended', h.onEnded); } catch { /* noop */ }
          delete (a as any)[marker];
        }
      }
      releasePreviewSlot(a);
      audioRef.current = null;
    };
  }, [previewSrc, item.id, item.audio_url, usingDedicatedPreviewClip, ensureAudio, qcCard]);





  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMuted((m) => {
      const next = !m;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Áudio já vem do cache LRU (pré-carregado no mount). Garante elemento
    // pronto para reprodução; play() é chamado SÍNCRONO no gesto (iOS-safe).
    const a = ensurePlayableAudio();
    if (!a) return;

    if (!a.paused) {
      try { a.pause(); } catch { /* noop */ }
      return;
    }

    a.muted = false;
    a.preload = 'auto';
    setMuted(false);
    claimPreviewSlot(a);

    // Se o preview começa em offset > 0 (item sem audio_preview_url dedicado,
    // apenas com preview_start/end no MP3 original), o play() inicia ANTES
    // do seek conseguir aplicar — o usuário ouviria o começo da música.
    // Silenciamos o elemento via volume=0 (sem mexer no estado de mute do UI)
    // até o currentTime entrar na janela do preview. Depois restauramos.
    const startOffset = startRef.current;
    const needsOffsetSeek = startOffset > 0.25;
    const originalVolume = (() => {
      try { return Number.isFinite(a.volume) && a.volume > 0 ? a.volume : 1; } catch { return 1; }
    })();

    // Reforça a janela de preview sempre que possível. Em mobile, setar
    // currentTime ANTES do metadata chegar costuma ser ignorado (ou faz
    // seek para 0) — por isso reaplicamos em loadedmetadata e após o play.
    const canSeekNow = () => a.readyState >= 1 && Number.isFinite(a.duration) && a.seekable.length > 0;
    const enforceWindow = () => {
      try {
        if (!canSeekNow()) return;
        const s = startRef.current;
        const e2 = endRef.current;
        if (a.currentTime < s - 0.05 || a.currentTime >= e2) {
          a.currentTime = s;
        }
      } catch { /* noop */ }
    };

    let restored = false;
    const inWindow = () => {
      try {
        const s = startRef.current;
        return a.currentTime >= s - 0.05 && a.currentTime < endRef.current;
      } catch { return false; }
    };
    const restoreVolume = () => {
      if (restored) return;
      restored = true;
      try { a.volume = originalVolume; } catch { /* noop */ }
      a.removeEventListener('timeupdate', onTimeCheck);
      a.removeEventListener('seeked', onSeekedCheck);
    };
    const onTimeCheck = () => {
      if (!needsOffsetSeek) { restoreVolume(); return; }
      if (inWindow()) { restoreVolume(); return; }
      if (canSeekNow() && a.currentTime < startOffset - 0.05) {
        try { a.currentTime = startOffset; } catch { /* noop */ }
      }
    };
    const onSeekedCheck = () => {
      if (!needsOffsetSeek || inWindow()) restoreVolume();
    };
    if (needsOffsetSeek) {
      try { a.volume = 0; } catch { /* noop */ }
      a.addEventListener('timeupdate', onTimeCheck);
      a.addEventListener('seeked', onSeekedCheck);
      // Failsafe: garante restauração mesmo se algo falhar.
      window.setTimeout(restoreVolume, 1500);
    }

    if (a.readyState >= 1) {
      enforceWindow();
    } else {
      const onMeta = () => { enforceWindow(); };
      a.addEventListener('loadedmetadata', onMeta, { once: true });
      a.addEventListener('loadeddata', onMeta, { once: true });
      // SÓ dispara load() se nada estiver bufferizado E sem download em curso.
      // Chamar load() em readyState>=1 RESETA o buffer parcial e re-inicia o
      // download — exatamente o que causava o delay de ~3s no clique.
      if (a.readyState === 0 && a.networkState !== 2) {
        try { a.load(); } catch { /* noop */ }
      }
    }

    // UI otimista: marca como tocando IMEDIATAMENTE. Se o play() falhar,
    // revertemos. Spinner só aparece se o buffer realmente não chegar rápido.
    setPlaying(true);
    // Não mostra spinner no clique: só liga depois do threshold se o browser
    // ainda não iniciou reprodução. Evita sensação de travamento em previews
    // que começam em poucos ms após o gesto.
    setLoadingPlay(false);
    const spinnerGuard = window.setTimeout(() => {
      if (a.paused) setLoadingPlay(true);
    }, 280);

    const handlePlaySuccess = () => {
      window.clearTimeout(spinnerGuard);
      enforceWindow();
      setPlaying(true);
      setLoadingPlay(false);
      if (!viewedRef.current) { viewedRef.current = true; onView?.(); }
    };

    // play() SÍNCRONO no gesto — preserva permissão de autoplay no iOS.
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(handlePlaySuccess).catch(() => {
        // Primeira tentativa falhou (geralmente readyState 0 + buffer vazio).
        // Aguardamos `canplay` e re-tentamos — a permissão do gesto ainda
        // vale para esta mesma fonte/elemento.
        const retry = () => {
          a.removeEventListener('canplay', retry);
          a.removeEventListener('canplaythrough', retry);
          enforceWindow();
          const p2 = a.play();
          if (p2 && typeof p2.then === 'function') {
            p2.then(handlePlaySuccess).catch(() => {
              window.clearTimeout(spinnerGuard);
              setPlaying(false);
              setLoadingPlay(false);
            });
          } else {
            handlePlaySuccess();
          }
        };
        a.addEventListener('canplay', retry, { once: true });
        a.addEventListener('canplaythrough', retry, { once: true });
        // Segurança: se nenhum evento chegar em 4s, libera o spinner.
        window.setTimeout(() => {
          if (a.paused) {
            a.removeEventListener('canplay', retry);
            a.removeEventListener('canplaythrough', retry);
            setPlaying(false);
            setLoadingPlay(false);
          }
        }, 4000);
      });
    } else {
      handlePlaySuccess();
    }
  };





  return (
    <div
      ref={ref}
      className="absolute inset-0"
      onTouchStart={() => {
        // Celular: o primeiro toque no card (antes de chegar no play) já
        // coloca o clip desta música na frente da fila de download.
        if (usingDedicatedPreviewClip && previewSrc) {
          try { void primePreviewClipBlob(previewSrc, 0, null, { priority: true }); } catch { /* noop */ }
        } else if (item.audio_url) {
          void requestServerPreviewClip(qcCard, item.id, { priority: true });
        }
      }}
      onPointerEnter={() => {
        // Desktop: hover sobre o card já dispara o warm-up — quando o
        // usuário chegar ao botão play, o áudio normalmente já está pronto.
        if (usingDedicatedPreviewClip && previewSrc) {
          try { void primePreviewClipBlob(previewSrc, 0, null, { priority: true }); } catch { /* noop */ }
        } else if (item.audio_url) {
          void requestServerPreviewClip(qcCard, item.id, { priority: true });
        }
        try {
          const a = ensureAudio();
          if (a) {
            if (a.preload !== 'auto') a.preload = 'auto';
            if (a.readyState === 0 && a.networkState !== 2) { try { a.load(); } catch { /* noop */ } }
          }
        } catch { /* noop */ }
      }}
    >
      {item.thumb_url ? (
        <>
          {/* Skeleton estável: ocupa exatamente o mesmo espaço da img (absolute
              inset-0). Sem animação custosa em mobile — gradiente leve apenas. */}
          {!thumbLoaded && (
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(110deg,rgba(168,85,247,0.18)_0%,rgba(217,70,239,0.18)_50%,rgba(168,85,247,0.18)_100%)]"
            />
          )}
          <CachedThumbImg
            src={item.thumb_url}
            alt={item.title ?? 'Capa da música'}
            showSkeleton={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-purple-500/30 to-fuchsia-500/30">
          <Music className="h-12 w-12 text-fuchsia-200" />
        </div>
      )}
      {/* Vinheta + badge de preview */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/30 pointer-events-none" />
      <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
        <button
          onPointerEnter={() => {
            // Desktop: aquece o buffer ANTES do clique. NÃO chama load() se
            // já há um carregamento em andamento ou se já há buffer — load()
            // reseta o buffer e re-iniciaria o download do zero.
            try {
              const a = ensureAudio();
              if (a) {
                if (a.preload !== 'auto') a.preload = 'auto';
                if (a.readyState === 0 && a.networkState !== 2 /* NETWORK_LOADING */) {
                  try { a.load(); } catch { /* noop */ }
                }
              }
            } catch { /* noop */ }
          }}
          onFocus={() => {
            try {
              const a = ensureAudio();
              if (a && a.readyState === 0 && a.networkState !== 2) {
                try { a.load(); } catch { /* noop */ }
              }
            } catch { /* noop */ }
          }}
          onPointerDown={(e) => {
            suppressNextClickRef.current = true;
            e.preventDefault();
            e.stopPropagation();
            togglePlay(e as unknown as React.MouseEvent);
          }}
          onClick={(e) => {
            if (suppressNextClickRef.current) {
              suppressNextClickRef.current = false;
              e.stopPropagation();
              e.preventDefault();
              return;
            }
            togglePlay(e);
          }}
          aria-busy={loadingPlay}
          className="grid place-items-center h-7 w-7 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 hover:brightness-110 text-black shadow ring-1 ring-amber-200/60 disabled:opacity-80 touch-manipulation"
          title={loadingPlay ? 'Carregando…' : playing ? 'Pausar música' : 'Tocar música'}
        >


          {loadingPlay ? (
            <span className="h-3 w-3 rounded-full border-2 border-black/70 border-t-transparent animate-spin" />
          ) : playing ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" fill="currentColor" />
          )}
        </button>
        <button
          onClick={toggleMute}
          className="grid place-items-center h-7 w-7 rounded-full bg-black/60 hover:bg-black/80 text-white shadow"
          title={muted ? 'Ativar som' : 'Silenciar'}
        >
          <span className="text-[10px] font-bold">{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>
      {/* Indicador de preview */}
      {playing && (
        <div className="absolute bottom-10 left-1.5 z-10">
          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide bg-fuchsia-500/85 text-white px-1.5 py-0.5 rounded backdrop-blur-sm font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            Música
          </span>
        </div>
      )}
    </div>
  );
}

function AudioGridCard({ item, nextAudioUrl, onOpenFocus }: { item: OcultoPlayItem; nextAudioUrl?: string | null; onOpenFocus?: () => void }) {
  const actions = useOcultoPlayActions();
  const navigate = useNavigate();
  const registerCardView = useRegisterOcultoPlayCardView();
  const { profile } = useProfile();
  const qc = useQueryClient();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const suppressOpenClickRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isOwner = !!profile?.id && item.author_id === profile.id;

  const handleDelete = async (it: OcultoPlayItem) => {
    if (!isOwner) return;
    if (!window.confirm('Excluir este conteúdo? Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    qc.setQueriesData<OcultoPlayItem[] | undefined>(
      { queryKey: ['oculto-play', 'feed'] },
      (old) => (old ? old.filter((x) => x.id !== it.id) : old),
    );
    try {
      const { error } = await supabase.from('oculto_play_items').delete().eq('id', it.id);
      if (error) throw error;
      toast.success('Conteúdo excluído.');
    } catch (err: any) {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
      toast.error('Não foi possível excluir.', { description: err?.message });
    } finally {
      setDeleting(false);
    }
  };

  const openPlayer = () => {
    if (onOpenFocus) onOpenFocus();
    else setPlayerOpen(true);
    seekSharedAudio(item.id, 0);
    playSharedAudio(item.id, item.audio_url ?? undefined, ocultoPlayMetaFromItem(item)).catch(() => { /* noop */ });
    window.setTimeout(() => { try { pauseAllPreviews(); } catch { /* noop */ } }, 0);
    registerCardView(item.id);
  };

  const navigateToFeedKeepingAudio = () => {
    try { enableOcultoPlayMiniPlayer(); } catch { /* noop */ }
    setPlayerOpen(false);
    navigate('/feed');
  };

  return (
    <div ref={cardRef} className="relative">
      <PlayCard item={item} nextAudioUrl={nextAudioUrl} />
      {/* Botão central — abre o player completo no modal */}
      <button
        type="button"
        aria-label="Abrir player"
        onPointerDown={(e) => {
          suppressOpenClickRef.current = true;
          e.preventDefault();
          e.stopPropagation();
          openPlayer();
        }}
        onPointerEnter={() => { try { if (item.audio_url) prewarmAudio(item.id, item.audio_url); } catch { /* noop */ } }}
        onFocus={() => { try { if (item.audio_url) prewarmAudio(item.id, item.audio_url); } catch { /* noop */ } }}
        onClick={(e) => {
          if (suppressOpenClickRef.current) {
            suppressOpenClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          openPlayer();
        }}
        className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
      >
        <span className="pointer-events-auto grid place-items-center h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-fuchsia-500/95 hover:bg-fuchsia-500 active:scale-95 text-white shadow-xl shadow-fuchsia-500/40 ring-2 ring-fuchsia-300/40 transition-transform">
          <Play className="h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" />
        </span>

      </button>

      {playerOpen && (
        <Suspense fallback={null}>
          <OcultoPlayFocusModal
            item={item}
            open={playerOpen}
            onClose={() => { setPlayerOpen(false); pauseSharedAudio(item.id); }}
            onNavigateHome={navigateToFeedKeepingAudio}
            onLike={(it) => actions.toggleLike.mutate(it.id)}
            onDislike={(it) => actions.toggleDislike.mutate(it.id)}
            onSave={(it) => actions.toggleSave.mutate(it.id)}
            onComment={() => setCommentsOpen(true)}
            onShare={() => setShareOpen(true)}
            onReport={() => setReportOpen(true)}
          />
        </Suspense>
      )}

      <ReportOcultoPlayContentModal
        itemId={reportOpen ? item.id : null}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      <PlayCommentsSheet
        itemId={item.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
      <SharePlayItemModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={ocultoPlayShareUrlWithBust(item.id)}
        itemId={item.id}
        title={item.title ?? item.caption ?? 'OCULTO Play'}
        abovePlayer
        onShared={() => actions.registerShare.mutate(item.id)}
      />
    </div>
  );
}

function PlayCard({ item, onPlayQueue, nextAudioUrl, variant = 'default' }: {
  item: OcultoPlayItem;
  onPlayQueue?: () => void;
  nextAudioUrl?: string | null;
  /** 'youtube' = capa arredondada + linha com foto do canal, título, views e tempo */
  variant?: 'default' | 'youtube';
}) {
  const actions = useOcultoPlayActions();
  const freezeCard = useSetPlayItemFrozen();
  const registerCardView = useRegisterOcultoPlayCardView();
  const { grant } = useOcultoPlayXpActions();
  const { profile } = useProfile();
  const qc = useQueryClient();
  const Icon = KIND_META[item.kind]?.icon ?? Play;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const commentCount = (item as any).comment_count ?? 0;
  const isVideoKind = item.kind === 'short_video' || item.kind === 'vip_teaser';
  const effectiveViews = useEffectiveViewCount(item.id, item.view_count);
  // Subscribe a UPDATEs em tempo real do view_count deste item — propaga
  // incrementos disparados por outros usuários para o badge sem refresh.
  useRealtimeOcultoPlayViews(item.id, item.view_count);
  const openPlayer = () => {
    try { pauseAllPreviews(); } catch { /* noop */ }
    setPlayerOpen(true);
    // NÃO conta view aqui — só abrir o modal não é visualização.
    // O contador será incrementado quando o vídeo/áudio realmente tocar
    // (via OcultoPlayVideoItem.onFirstPlay e OcultoPlayAudioItem.toggle).
  };

  const isOwner = !!profile?.id && item.author_id === profile.id;
  const shareToFeed = useShareOcultoPlayToFeed();
  const handleDelete = async () => {
    if (!isOwner) return;
    setDeleting(true);
    qc.setQueriesData<OcultoPlayItem[] | undefined>(
      { queryKey: ['oculto-play', 'feed'] },
      (old) => (old ? old.filter((x) => x.id !== item.id) : old),
    );
    try {
      const { error } = await supabase.from('oculto_play_items').delete().eq('id', item.id);
      if (error) throw error;
      toast.success('Conteúdo excluído.');
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
      toast.error('Não foi possível excluir.', { description: err?.message });
    } finally {
      setDeleting(false);
    }
  };
  const { progressMap, resetProgress, markCompleted } = useOcultoPlayContinueWatching({ limit: 60 });
  const savedProgress = progressMap.get(item.id);
  const attachAutoSave = usePlaybackProgressAutoSave(item.id);
  const videoRef = (el: HTMLVideoElement | null) => {
    attachAutoSave(el);
    if (el && savedProgress && el.dataset.ocultoPlaySeeked !== '1' && savedProgress.progressSeconds > 5) {
      el.dataset.ocultoPlaySeeked = '1';
      try { el.currentTime = savedProgress.progressSeconds; } catch {}
    }
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col cursor-pointer',
        variant === 'youtube' ? '' : 'rounded-xl overflow-hidden bg-card border border-border/40 aspect-[3/4]',
      )}
      onClick={isVideoKind ? (e) => {
        const t = e.target as HTMLElement;
        if (t.closest('button,a,[role="menu"],[role="menuitem"],[role="dialog"]')) return;
        openPlayer();
      } : undefined}
    >
      {/* Media */}
      <div className={cn('relative bg-black/30 overflow-hidden', variant === 'youtube' ? 'aspect-[9/16] rounded-xl' : 'flex-1')}>
        {item.kind === 'short_video' && item.media_url ? (
          item.thumb_url ? (
            // Mobile fast-path: render apenas o poster como <img>. O <video> só carrega
            // ao abrir o player modal — economiza banda e CPU em telefones modestos.
            <VideoThumb src={item.thumb_url} alt={item.title ?? ''} />
          ) : (
            <>
              {/* Skeleton estável reserva o frame antes do vídeo carregar */}
              <div
                aria-hidden
                className="absolute inset-0 bg-[linear-gradient(110deg,rgba(168,85,247,0.18)_0%,rgba(217,70,239,0.18)_50%,rgba(168,85,247,0.18)_100%)]"
              />
              <video
                ref={videoRef}
                src={item.media_url}
                poster={item.thumb_url ?? undefined}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                // View NÃO é registrada aqui. Só conta após 10s reais de
                // reprodução dentro do player (OcultoPlayShortsScroller).
              />
            </>
          )




        ) : item.kind === 'audio' ? (
          // Preview de áudio só conta view quando o usuário clica em Play (interação real).
          <AudioPreviewCard item={item} nextAudioUrl={nextAudioUrl} onView={() => { registerCardView(item.id); grant('view', item.id); }} />
        ) : item.thumb_url || item.media_url ? (
          // Capa estática (meme/community) — apenas exibir não conta view.
          <CachedThumbImg
            src={item.thumb_url || item.media_url!}
            alt={item.title ?? ''}
            showSkeleton={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Icon className="h-10 w-10" />
          </div>
        )}

        {/* Barra + ações "Continuar/Reiniciar/Assistido" — quando há progresso salvo */}
        {savedProgress && savedProgress.progressSeconds > 5 && (
          <>
            {savedProgress.ratio != null && (
              <div className="absolute inset-x-0 top-0 h-1 bg-black/40 z-10">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${Math.round((savedProgress.ratio ?? 0) * 100)}%` }}
                />
              </div>
            )}
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const v = (e.currentTarget.closest('.group')?.querySelector('video') ?? null) as HTMLVideoElement | null;
                  if (v) {
                    try { v.currentTime = savedProgress.progressSeconds; } catch {}
                    v.play().catch(() => {});
                  }
                }}
                className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-emerald-500/90 hover:bg-emerald-500 text-white text-[10px] font-semibold uppercase tracking-wide shadow"
                title={`Continuar de ${Math.floor(savedProgress.progressSeconds)}s`}
              >
                <Play className="h-3 w-3" fill="currentColor" />
                Continuar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resetProgress.mutate(item.id);
                  const v = (e.currentTarget.closest('.group')?.querySelector('video') ?? null) as HTMLVideoElement | null;
                  if (v) { try { v.currentTime = 0; } catch {} }
                }}
                className="grid place-items-center h-6 w-6 rounded-full bg-black/65 hover:bg-black/85 text-white shadow"
                title="Reiniciar do começo"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markCompleted.mutate(item.id);
                }}
                className="grid place-items-center h-6 w-6 rounded-full bg-emerald-500/30 hover:bg-emerald-500/55 text-emerald-100 border border-emerald-400/50"
                title="Marcar como assistido"
              >
                <CheckCircle2 className="h-3 w-3" />
              </button>
            </div>
          </>
        )}




        {/* Top badges */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {(() => {
            const isAudio = item.kind === 'audio';
            const isVideo = item.kind === 'short_video' || item.kind === 'vip_teaser';
            const tagClass = isAudio
              ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 text-black border border-amber-500/70 shadow ring-1 ring-amber-300/60 font-extrabold'
              : isVideo
                ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 text-white border border-blue-300/70 shadow ring-1 ring-sky-300/60 font-extrabold'
                : 'bg-black/55 text-white backdrop-blur-sm font-semibold';
            return (
              <span className={cn('text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1', tagClass)}>
                <Icon className="h-2.5 w-2.5" />
                {KIND_META[item.kind]?.label ?? item.kind}
              </span>
            );
          })()}

          {item.visibility === 'vip' && (
            <span className="text-[9px] bg-amber-500/80 text-black px-1.5 py-0.5 rounded font-bold">
              VIP
            </span>
          )}
          {item.visibility === 'premium' && (
            <span className="text-[9px] bg-fuchsia-500/80 text-white px-1.5 py-0.5 rounded font-bold">
              PREMIUM
            </span>
          )}
          <InPlaylistBadge itemId={item.id} />
        </div>

        {/* Top-right actions: Tocar todas + Excluir (autor) */}
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          {onPlayQueue && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlayQueue(); }}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-fuchsia-500/85 hover:bg-fuchsia-500 text-white text-[10px] font-semibold uppercase tracking-wide shadow"
              title="Tocar todas em sequência"
            >
              <ListVideo className="h-3 w-3" />
              Tocar todas
            </button>
          )}
          <OcultoPlayItemMenu
            canManage={isOwner}
            onEdit={isOwner ? () => setEditOpen(true) : undefined}
            onDelete={isOwner ? () => setDeleteConfirmOpen(true) : undefined}
            onToggleFreeze={isOwner ? () => {
              freezeCard.mutate({ itemId: item.id, frozen: !item.is_frozen }, {
                onSuccess: () => toast.success(item.is_frozen ? 'Descongelado: visível para todos.' : 'Congelado: só você vê, no seu canal.'),
                onError: (e: any) => toast.error(e?.message ?? 'Não foi possível congelar.'),
              });
            } : undefined}
            frozen={!!item.is_frozen}
            isFreezePending={freezeCard.isPending}
            onShareToFeed={() => shareToFeed.mutate({ item })}
            isShareToFeedPending={shareToFeed.isPending}
            isDeletePending={deleting}
            className="h-6 w-6"
          />
        </div>

        {/* Bottom overlay actions */}
        <div className="absolute bottom-0 inset-x-0 p-1.5 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex items-center gap-2 text-[10px] text-white/90">
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" /> {effectiveViews}
            </span>
            <span className="flex items-center gap-0.5">
              <Heart className={cn("h-3 w-3", item.liked_by_me && "fill-rose-400 text-rose-400")} />
              {item.like_count}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => { actions.toggleLike.mutate(item.id); if (!item.liked_by_me) grant('like', item.id); }}
              className="grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white hover:bg-rose-500/70"
              title="Curtir"
            >
              <Heart className={cn("h-3 w-3", item.liked_by_me && "fill-rose-400 text-rose-400")} />
            </button>
            <button
              onClick={() => setCommentsOpen(true)}
              className="grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white hover:bg-sky-500/70 relative"
              title="Comentar"
            >
              <MessageCircle className="h-3 w-3" />
              {commentCount > 0 && (
                <span className="absolute -top-1 -right-1 text-[8px] bg-sky-500 text-white rounded-full px-1 min-w-[12px] text-center leading-3">
                  {commentCount > 99 ? '99+' : commentCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { actions.toggleSave.mutate(item.id); if (!item.saved_by_me) grant('save', item.id); }}
              className="grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white hover:bg-amber-500/70"
              title="Salvar"
            >
              <Bookmark className={cn("h-3 w-3", item.saved_by_me && "fill-amber-300 text-amber-300")} />
            </button>
            <WatchLaterButton itemId={item.id} />
            <AddToCollectionButton itemId={item.id} />
            <PlayShareMenu itemId={item.id} title={item.title} author={item.author_username} />
          </div>
        </div>

        {/* Reações rápidas (Etapa 34) */}
        <div className="absolute bottom-9 left-1.5 right-1.5">
          <PlayReactionsBar itemId={item.id} />
        </div>
      </div>

      {/* Footer */}
      {variant === 'youtube' ? (
        <div className="pt-2 px-0.5"><PlayYoutubeMeta item={item} views={effectiveViews} /></div>
      ) : (item.title || item.author_username || (item.genre_tags && item.genre_tags.length > 0)) && (
        <div className="p-2">
          {item.title && (
            <p className="text-[11px] font-medium line-clamp-2">{item.title}</p>
          )}
          {item.author_username && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              @{item.author_username}
            </p>
          )}
          {item.genre_tags && item.genre_tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.genre_tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-500/30"
                >
                  {tag}
                </span>
              ))}
              {/* Tag IA removida intencionalmente — solicitação do owner */}

            </div>
          )}
        </div>
      )}

      <PlayCommentsSheet
        itemId={item.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />

      {playerOpen && isVideoKind && (
        <Suspense fallback={null}>
          <OcultoPlayFocusModal
            item={item}
            open={playerOpen}
            onClose={() => setPlayerOpen(false)}
            onLike={(it) => actions.toggleLike.mutate(it.id)}
            onDislike={(it) => actions.toggleDislike.mutate(it.id)}
            onSave={(it) => actions.toggleSave.mutate(it.id)}
            onComment={() => setCommentsOpen(true)}
            onShare={() => setShareOpen(true)}
            onReport={() => setReportOpen(true)}
          />
        </Suspense>
      )}
      <SharePlayItemModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={ocultoPlayShareUrlWithBust(item.id)}
        itemId={item.id}
        title={item.title ?? item.caption ?? 'OCULTO Play'}
        abovePlayer
        onShared={() => actions.registerShare.mutate(item.id)}
      />
      <ReportOcultoPlayContentModal
        itemId={reportOpen ? item.id : null}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
      <OcultoPlayEditModal
        item={editOpen ? item : null}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <OcultoPlayDeleteConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(o) => { if (!deleting) setDeleteConfirmOpen(o); }}
        onConfirm={handleDelete}
        pending={deleting}
      />
    </div>
  );
}


/* ---------------- Upload modal ---------------- */

const channelKindForItem = (k: OcultoPlayKind): PlayChannelKind => (k === 'audio' ? 'audio' : 'video');
const MASTER_ONLY_KINDS: OcultoPlayKind[] = ['challenge', 'community_post', 'vip_teaser'];
type ContentOrigin = '' | 'original' | 'ai' | 'licensed';

function UploadModal({
  open, onClose, enabledKinds, onDone, config, initialChannelId, onCreateChannel,
}: {
  open: boolean;
  onClose: () => void;
  enabledKinds: OcultoPlayKind[];
  onDone: () => void;
  config?: OcultoPlayConfig | null;
  initialChannelId?: string | null;
  onCreateChannel?: (kind: PlayChannelKind) => void;
}) {
  const { user } = useAuth();
  const { profile } = useProfile();
  // ---- Canais Play: publicar sempre num canal do próprio usuário ----
  const { data: myChannelsData, isLoading: channelsLoading } = useMyPlayChannels();
  const { data: isMasterRole } = useIsMasterAdmin();
  const isMasterUser = isMasterRole === true;
  const viewerVerified = isMasterUser || !!(profile as any)?.is_verified || !!(profile as any)?.is_verified_couple;
  const myChannels = myChannelsData ?? [];
  const [channelId, setChannelId] = useState<string | null>(initialChannelId ?? null);
  const [origin, setOrigin] = useState<ContentOrigin>('');
  const [originTool, setOriginTool] = useState('');
  useEffect(() => {
    if (open && initialChannelId) setChannelId(initialChannelId);
  }, [open, initialChannelId]);
  const selectedChannel = myChannels.find((c) => c.id === channelId) ?? null;
  const qc = useQueryClient();
  const { grant } = useOcultoPlayXpActions();
  const DRAFT_KEY = 'ocultoplay:upload-modal:v1';
  type PersistShape = {
    kind: OcultoPlayKind;
    visibility: OcultoPlayVisibility;
    section: OcultoPlaySection;
    title: string;
    caption: string;
    lyrics: string;
    rightsConfirmed: boolean;
    mode: 'now' | 'draft' | 'schedule';
    scheduleAt: string;
    linkGenreTags: string[];
    trailer_trim_start_seconds?: number | null;
    trailer_trim_end_seconds?: number | null;
  };
  const loadPersisted = (): Partial<PersistShape> => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as Partial<PersistShape>) : {};
    } catch { return {}; }
  };
  const persisted = useRef<Partial<PersistShape>>(loadPersisted()).current;

  const [kind, setKind] = useState<OcultoPlayKind>(persisted.kind ?? 'meme');
  // Tipos permitidos pelo canal escolhido:
  //  canal de vídeo → Vídeos + Links · canal de áudio → Áudios.
  //  (o master ainda vê Memes/Teasers/Comunidades/Desafios no canal de vídeo)
  const uploadKinds = useMemo(() => {
    const base = enabledKinds.length > 0 ? enabledKinds : (Object.keys(KIND_META) as OcultoPlayKind[]);
    if (selectedChannel?.kind === 'audio') return ['audio'] as OcultoPlayKind[];
    if (selectedChannel?.kind === 'video') {
      const core = (['short_video', 'link'] as OcultoPlayKind[]).filter((k) => base.includes(k) || k === 'short_video');
      const extra = isMasterUser ? base.filter((k) => !['audio', 'short_video', 'link'].includes(k)) : [];
      return [...core, ...extra];
    }
    return isMasterUser ? base : base.filter((k) => !MASTER_ONLY_KINDS.includes(k) && k !== 'meme');
  }, [enabledKinds, isMasterUser, selectedChannel?.kind]);
  useEffect(() => {
    if (isMasterRole === undefined) return; // espera saber se é master
    if (!uploadKinds.includes(kind) && uploadKinds.length > 0) {
      setKind(uploadKinds.includes('short_video') ? 'short_video' : uploadKinds[0]);
    }
  }, [uploadKinds, kind, isMasterRole]);
  // Mantém o canal coerente com o tipo (vídeo ↔ áudio nunca se misturam).
  useEffect(() => {
    if (myChannels.length === 0) return;
    const need = channelKindForItem(kind);
    if (selectedChannel && selectedChannel.kind === need) return;
    const compat = myChannels.find((c) => c.kind === need && !c.is_official) ?? myChannels.find((c) => c.kind === need);
    if (compat) setChannelId(compat.id);
    else if (!selectedChannel) setChannelId(myChannels[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myChannels, kind]);
  const channelMismatch = !!selectedChannel && selectedChannel.kind !== channelKindForItem(kind);
  // Visibilidade paga e seções de curadoria são só do master (Fase 1).
  useEffect(() => {
    if (isMasterRole === undefined || isMasterUser) return;
    if (visibility !== 'public') setVisibility('public');
    if (section !== 'normal') setSection('normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMasterRole, isMasterUser]);
  const [visibility, setVisibility] = useState<OcultoPlayVisibility>(persisted.visibility ?? 'public');
  const [section, setSection] = useState<OcultoPlaySection>(persisted.section ?? 'normal');
  const [title, setTitle] = useState(persisted.title ?? '');
  const [caption, setCaption] = useState(persisted.caption ?? '');
  const [lyrics, setLyrics] = useState(persisted.lyrics ?? '');
  const [lyricsDragOver, setLyricsDragOver] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [outroFile, setOutroFile] = useState<File | null>(null);
  const [outroPreviewUrl, setOutroPreviewUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [previewStart, setPreviewStart] = useState<number>(0);
  const [previewLength, setPreviewLength] = useState<number>(30);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [genreTags, setGenreTags] = useState<AudioTag[]>([]);
  const [aiTags, setAiTags] = useState<AudioTag[]>([]);
  const [composerName, setComposerName] = useState('');
  const [videoMeta, setVideoMeta] = useState<VideoCoverResult | null>(null);
  const [linkComposer, setLinkComposer] = useState<{
    sourceUrl: string;
    provider: string | null;
    coverBlob: Blob | null;
    coverRemoteUrl: string | null;
  }>({ sourceUrl: '', provider: null, coverBlob: null, coverRemoteUrl: null });
  const [srtFile, setSrtFile] = useState<File | null>(null);
  // Trailer (opcional) — usado nas páginas de compartilhamento externo no lugar do vídeo/link completo.
  const [trailer, setTrailer] = useState<import('@/components/oculto-play/PlayTrailerComposer').TrailerValue | null>(null);
  const movieGenresQuery = useOcultoPlayMovieGenres();
  const adultMovieGenresQuery = useOcultoPlayMovieGenres('adult');
  const upsertMovieGenre = useUpsertMovieGenre();
  const linkGenreCustomList = (movieGenresQuery.data ?? readLocalMovieGenresCache().map((n) => ({ name: n } as any)))
    .map((g: any) => g.name as string);
  const linkAdultGenreCustomList = (adultMovieGenresQuery.data ?? readLocalMovieGenresCache('adult').map((n) => ({ name: n } as any)))
    .map((g: any) => g.name as string);
  const [linkGenreTags, setLinkGenreTags] = useState<string[]>(persisted.linkGenreTags ?? []);
  const [linkGenreInput, setLinkGenreInput] = useState('');
  const [isAdult, setIsAdult] = useState<boolean>(false);
  const [linkAdultGenreTags, setLinkAdultGenreTags] = useState<string[]>([]);
  const [linkAdultGenreInput, setLinkAdultGenreInput] = useState('');

  const [rightsConfirmed, setRightsConfirmed] = useState<boolean>(persisted.rightsConfirmed ?? false);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadStage, setUploadStage] = useState<'idle' | 'video' | 'cover' | 'finalize' | 'done'>('idle');
  type StepStatus = 'pending' | 'uploading' | 'processing' | 'done';
  const [videoStatus, setVideoStatus] = useState<StepStatus>('pending');
  const [videoPct, setVideoPct] = useState(0);
  const [coverStatus, setCoverStatus] = useState<StepStatus>('pending');
  const [coverPct, setCoverPct] = useState(0);
  const [finalizeStatus, setFinalizeStatus] = useState<StepStatus>('pending');
  const abortRef = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<'now' | 'draft' | 'schedule'>(persisted.mode ?? 'now');
  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    if (persisted.scheduleAt) return persisted.scheduleAt;
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
  });

  // Persistência automática (sobrevive ao fechar o modal e ao recarregar a página)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  useEffect(() => {
    try {
      const payload: PersistShape = {
        kind, visibility, section, title, caption, lyrics,
        rightsConfirmed, mode, scheduleAt, linkGenreTags,
        trailer_trim_start_seconds: trailer?.reusedFromPrimary ? trailer.trimStart : null,
        trailer_trim_end_seconds: trailer?.reusedFromPrimary ? trailer.trimEnd : null,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      setLastSavedAt(Date.now());
    } catch { /* storage cheio/bloqueado */ }
  }, [kind, visibility, section, title, caption, lyrics, rightsConfirmed, mode, scheduleAt, linkGenreTags, trailer?.reusedFromPrimary, trailer?.trimStart, trailer?.trimEnd]);

  // Texto humano "salvo há Xs"
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const savedLabel = (() => {
    if (!lastSavedAt) return null;
    const diff = Math.max(0, Math.floor((Date.now() - lastSavedAt) / 1000));
    void nowTick;
    if (diff < 5) return 'salvo agora';
    if (diff < 60) return `salvo há ${diff}s`;
    const m = Math.floor(diff / 60);
    return `salvo há ${m}min`;
  })();

  // Defaults jurídicos/limites do áudio (com fallback se config não trouxer)
  const audioMaxMb = config?.max_audio_size_mb ?? 35;
  const audioMaxSec = config?.max_audio_duration_seconds ?? 600;
  const audioRequireRights = config?.require_audio_rights_confirmation !== false;
  const audioLegalText =
    config?.audio_legal_text?.trim() ||
    'Ao publicar este áudio, você declara possuir os direitos de uso, reprodução e distribuição deste conteúdo, ou autorização expressa para publicá-lo no Oculto.';

  const reset = () => {
    setKind('meme'); setVisibility('public'); setSection('normal');
    setTitle(''); setCaption(''); setLyrics(''); setFile(null); setCoverFile(null);
    setCoverPreviewUrl(null); setOutroFile(null); setOutroPreviewUrl(null);
    setAudioDuration(0); setPreviewStart(0); setPreviewLength(30);
    try { previewAudioRef.current?.pause(); } catch { /* noop */ }
    previewAudioRef.current = null;
    setPreviewPlaying(false);
    setVideoMeta(null); setUploadPct(0); setUploadStage('idle');
    setLinkComposer({ sourceUrl: '', provider: null, coverBlob: null, coverRemoteUrl: null });
    setSrtFile(null);
    setTrailer(null);
    setLinkGenreTags([]); setLinkGenreInput('');
    setIsAdult(false); setLinkAdultGenreTags([]); setLinkAdultGenreInput('');

    setVideoStatus('pending'); setVideoPct(0);
    setCoverStatus('pending'); setCoverPct(0);
    setFinalizeStatus('pending');
    setRightsConfirmed(false); setBusy(false); setMode('now');
    setOrigin(''); setOriginTool('');
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  // Preview da capa (objectURL)
  useEffect(() => {
    if (!coverFile) { setCoverPreviewUrl(null); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [coverFile]);

  // Preview da imagem final (outro) custom
  useEffect(() => {
    if (!outroFile) { setOutroPreviewUrl(null); return; }
    const url = URL.createObjectURL(outroFile);
    setOutroPreviewUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [outroFile]);


  // Probe duração do áudio + reset trecho
  useEffect(() => {
    if (kind !== 'audio' || !file) {
      setAudioDuration(0); setPreviewStart(0); setPreviewLength(30);
      try { previewAudioRef.current?.pause(); } catch { /* noop */ }
      previewAudioRef.current = null; setPreviewPlaying(false);
      return;
    }
    let cancelled = false;
    probeAudioDuration(file).then((d) => {
      if (cancelled) return;
      setAudioDuration(d);
      setPreviewStart(0);
      setPreviewLength(Math.min(30, Math.max(5, d || 30)));
    });
    return () => { cancelled = true; };
  }, [file, kind]);

  // Para preview ao desmontar
  useEffect(() => () => {
    try { previewAudioRef.current?.pause(); } catch { /* noop */ }
    previewAudioRef.current = null;
  }, []);

  // Refs vivos para evitar closure stale em listeners do <audio>
  const previewStartRef = useRef(previewStart);
  const previewLengthRef = useRef(previewLength);
  useEffect(() => { previewStartRef.current = previewStart; }, [previewStart]);
  useEffect(() => { previewLengthRef.current = previewLength; }, [previewLength]);

  const togglePreview = () => {
    if (!file) return;
    let a = previewAudioRef.current;
    if (!a) {
      a = new Audio(URL.createObjectURL(file));
      a.preload = 'metadata';
      a.addEventListener('timeupdate', () => {
        if (!a) return;
        const end = previewStartRef.current + previewLengthRef.current;
        if (a.currentTime >= end) {
          try { a.pause(); } catch { /* noop */ }
          setPreviewPlaying(false);
        }
      });
      a.addEventListener('ended', () => setPreviewPlaying(false));
      a.addEventListener('pause', () => setPreviewPlaying(false));
      previewAudioRef.current = a;
    }
    if (previewPlaying) {
      try { a.pause(); } catch { /* noop */ }
      setPreviewPlaying(false);
    } else {
      try { a.currentTime = previewStart; } catch { /* noop */ }
      a.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false));
    }
  };

  // Lê duração do áudio sem download pesado (preload=metadata)
  const probeAudioDuration = (f: File): Promise<number> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.src = url;
      a.onloadedmetadata = () => {
        const d = a.duration || 0;
        URL.revokeObjectURL(url);
        resolve(d);
      };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    });

  const handleSubmit = async () => {
    if (!user?.id) {
      toast.error('Faça login pra publicar.');
      return;
    }
    if (!profile?.id) {
      toast.error('Perfil ainda carregando, tente em 1s.');
      return;
    }
    if (!isMasterUser) {
      if (!selectedChannel) {
        toast.error('Crie seu canal antes de publicar.');
        return;
      }
      if (channelMismatch) {
        toast.error(`Este conteúdo vai num canal de ${channelKindForItem(kind) === 'audio' ? 'áudio' : 'vídeo'}.`);
        return;
      }
      if (!origin) {
        toast.error('Informe a origem do conteúdo (original, criado com IA ou licenciado).');
        return;
      }
    }
    if (isAdult && !viewerVerified) {
      toast.error('Conteúdo +18 só pode ser publicado por perfis verificados.');
      return;
    }
    if (!file && kind !== 'challenge' && kind !== 'link' && mode !== 'draft') {
      toast.error('Selecione um arquivo.');
      return;
    }
    if (kind === 'link') {
      if (!linkComposer.sourceUrl || !linkComposer.provider) {
        toast.error('Cole um link válido (YouTube, Vimeo, TikTok, magnet, embed ou .mp4).');
        return;
      }
    }
    if (srtFile) {
      if (kind !== 'link') {
        toast.error('Legenda SRT/VTT está disponível apenas para links/vídeos da seção Filmes.');
        return;
      }
      if (!/\.(srt|vtt)$/i.test(srtFile.name)) {
        toast.error('A legenda precisa estar no formato .srt ou .vtt.');
        return;
      }
      if (srtFile.size > 2 * 1024 * 1024) {
        toast.error('A legenda pode ter no máximo 2 MB.');
        return;
      }
    }

    if ((kind === 'short_video' || kind === 'link') && trailer) {
      const trailerStart = Math.max(0, Number(trailer.trimStart || 0));
      const trailerEnd = Math.max(0, Number(trailer.trimEnd || trailer.duration || 0));
      if (trailer.reusedFromPrimary) {
        if (trailer.file) {
          toast.error('O recorte do trailer deve ser feito apenas a partir do vídeo/link principal, nunca do trailer enviado.');
          return;
        }
        const hasValidPrimaryVideoSource = kind === 'short_video' && !!file && !!trailer.sourceFile && trailer.sourceFile === file;
        const hasValidPrimaryLinkSource = kind === 'link' && !!linkComposer.sourceUrl && trailer.sourceUrl === linkComposer.sourceUrl;
        if (!hasValidPrimaryVideoSource && !hasValidPrimaryLinkSource) {
          toast.error('Selecione novamente o recorte usando a mídia principal atual antes de publicar.');
          return;
        }
        if (trailerEnd <= trailerStart) {
          toast.error('O recorte do trailer precisa ter fim maior que o início.');
          return;
        }
        if (trailerEnd - trailerStart > TRAILER_MAX_SECONDS + 0.01) {
          toast.error('O trailer pode ter no máximo 1m30s. Ajuste o recorte do vídeo/link principal antes de publicar.');
          return;
        }
      } else if (trailer.file && trailer.duration > TRAILER_MAX_SECONDS + 0.01) {
        toast.error('O arquivo enviado como trailer pronto precisa ter no máximo 1m30s. Para recortar, use o vídeo/link principal.');
        return;
      }
    }

    if (caption.length > PLAY_CAPTION_MAX_CHARS) {
      toast.error('A legenda pode ter no máximo 15.000 caracteres.');
      return;
    }


    // Validações específicas de áudio (Etapa 7)
    if (kind === 'audio' && file) {
      const isMp3 = /audio\/(mpeg|mp3|mp4|m4a|aac|wav|ogg|webm)/i.test(file.type);
      if (!isMp3) {
        toast.error('Formato de áudio não permitido. Use MP3.');
        return;
      }
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > audioMaxMb) {
        toast.error(`Áudio acima do limite (${audioMaxMb} MB).`);
        return;
      }
      if (!title.trim()) {
        toast.error('Título é obrigatório para áudios.');
        return;
      }
      if (audioRequireRights && !rightsConfirmed) {
        toast.error('Você precisa confirmar a declaração de direitos.');
        return;
      }
      const dur = await probeAudioDuration(file);
      if (dur > audioMaxSec) {
        toast.error(`Duração acima do limite (${Math.floor(audioMaxSec / 60)} min).`);
        return;
      }
    }

    if (kind === 'short_video' && file && videoMeta) {
      const ts = Math.max(0, videoMeta.trimStart);
      const te = Math.max(ts + 0.1, videoMeta.trimEnd || videoMeta.duration);
      if (te - ts > OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS + 0.05) {
        toast.error(`Vídeos do PLAY devem ter até ${OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS}s para tocar sem travar.`);
        return;
      }
    }

    if (mode === 'schedule') {
      const when = new Date(scheduleAt);
      if (isNaN(when.getTime()) || when <= new Date()) {
        toast.error('Escolha uma data/hora futura.');
        return;
      }
    }
    setBusy(true);
    setUploadPct(0);
    setUploadStage('idle');
    setVideoStatus('pending'); setVideoPct(0);
    setCoverStatus('pending'); setCoverPct(0);
    setFinalizeStatus('pending');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const actorId = await resolveActorId(profile?.id || null);
      const folder: 'video' | 'image' | 'audio' =
        kind === 'short_video' ? 'video' : kind === 'audio' ? 'audio' : 'image';
      let mediaUrl: string | null = null;
      let audioUrl: string | null = null;
      let audioPreviewUrl: string | null = null;
      let thumbUrl: string | null = null;
      if (file) {
        setUploadStage('video');
        let fileToUpload: Blob = file;
        let fileNameToUpload: string | undefined = file.name;

        if (kind === 'short_video') {
          if (!videoMeta?.duration) {
            throw new Error('Aguarde o vídeo carregar para aplicar o corte antes de publicar.');
          }
          setVideoStatus('processing');
          setVideoPct(0);
          setUploadPct(0);
          const customOutroUrl = outroFile ? URL.createObjectURL(outroFile) : null;
          try {
            const processed = await processOcultoPlayVideoForUpload(file, {
              trimStart: Math.max(0, videoMeta.trimStart),
              trimEnd: Math.max(videoMeta.trimStart + 0.2, videoMeta.trimEnd || videoMeta.duration),
              duration: videoMeta.duration,
              outroImageUrl: customOutroUrl ?? outroAsset.url,
              outroSeconds: 2,
              qualityPreset: videoMeta.qualityPreset,
              onProgress: (pct) => { setVideoPct(pct); setUploadPct(pct); },
            });
            fileToUpload = processed;
            fileNameToUpload = processed.name;
          } finally {
            if (customOutroUrl) URL.revokeObjectURL(customOutroUrl);
          }
        }

        setUploadPct(0);
        setVideoStatus('uploading');
        const up = await uploadOcultoPlayFileProgress(
          fileToUpload, user.id, folder, fileNameToUpload,
          (pct) => { setUploadPct(pct); setVideoPct(pct); },
          controller.signal,
        );
        if (folder === 'audio') audioUrl = up.publicUrl;
        else mediaUrl = up.publicUrl;
        setVideoPct(100);
        setVideoStatus('done');
        if (folder === 'audio' && file) {
          const start = audioDuration > 0 ? Math.max(0, Math.min(previewStart, Math.max(0, audioDuration - 1))) : Math.max(0, previewStart);
          const len = Math.max(5, Math.min(30, previewLength));
          const previewBlob = await createAudioPreviewClip(file, start, len);
          if (previewBlob) {
            const previewUp = await uploadOcultoPlayFileProgress(
              previewBlob, user.id, 'audio', `preview_${Date.now()}.wav`,
              undefined,
              controller.signal,
            );
            audioPreviewUrl = previewUp.publicUrl;
          }
        }
      }
      // Capa: vídeo (gerada ou custom), áudio ou link (frame/upload custom)
      const finalCover: Blob | null =
        kind === 'short_video'
          ? (videoMeta?.coverBlob ?? null)
          : kind === 'audio' && coverFile
            ? coverFile
            : kind === 'link'
              ? (linkComposer.coverBlob ?? null)
              : null;
      if (finalCover) {
        setUploadStage('cover');
        setUploadPct(0);
        setCoverStatus('uploading');
        const upCover = await uploadOcultoPlayFileProgress(
          finalCover, user.id, 'image',
          kind === 'short_video' ? `cover_${Date.now()}.jpg`
            : kind === 'link' ? `link_cover_${Date.now()}.jpg`
            : (coverFile?.name ?? 'cover.jpg'),
          (pct) => { setUploadPct(pct); setCoverPct(pct); },
          controller.signal,
        );
        thumbUrl = upCover.publicUrl;
        setCoverPct(100);
        setCoverStatus('done');
      } else if (kind === 'link' && linkComposer.coverRemoteUrl) {
        // Sem upload — guarda a thumb remota oficial (ex.: YouTube)
        thumbUrl = linkComposer.coverRemoteUrl;
      }

      // Trailer (opcional) — upload pronto OU janela de recorte do vídeo/link principal.
      let trailerUrl: string | null = null;
      let trailerStart: number | null = null;
      let trailerEnd: number | null = null;
      if ((kind === 'short_video' || kind === 'link') && trailer) {
        trailerStart = Number((trailer.trimStart || 0).toFixed(2));
        trailerEnd = Number((trailer.trimEnd || trailer.duration || 0).toFixed(2));

        if (trailer.reusedFromPrimary) {
          if (trailer.file) {
            throw new Error('Recorte inválido: o trecho do trailer deve vir da mídia principal, não do trailer enviado.');
          }
          const hasValidPrimaryVideoSource = kind === 'short_video' && !!file && !!trailer.sourceFile && trailer.sourceFile === file;
          const hasValidPrimaryLinkSource = kind === 'link' && !!linkComposer.sourceUrl && trailer.sourceUrl === linkComposer.sourceUrl;
          if (!hasValidPrimaryVideoSource && !hasValidPrimaryLinkSource) {
            throw new Error('Recorte inválido: selecione novamente o trecho usando a mídia principal atual.');
          }
          // Recorte de trailer agora é persistido como janela da mídia principal.
          // A página pública aplica start/end sobre media_url/source_url, nunca sobre um trailer enviado.
          trailerUrl = null;
        } else if (trailer.file) {
          // Upload de trailer pronto: não recorta esse arquivo. Ele já deve ter até 1m30s.
          setUploadStage('finalize');
          const up = await uploadOcultoPlayFileProgress(
            trailer.file, user.id, 'video',
            `trailer_${Date.now()}.${(trailer.file.name.split('.').pop() || 'mp4').toLowerCase()}`,
            (pct) => setUploadPct(pct),
            controller.signal,
          );
          trailerUrl = up.publicUrl;
          trailerStart = 0;
          trailerEnd = Number(Math.min(TRAILER_MAX_SECONDS, trailer.duration || TRAILER_MAX_SECONDS).toFixed(2));
        } else if (trailer.sourceUrl) {
          // Trailer informado como URL/embed externo. Salva direto em trailer_url.
          trailerUrl = trailer.sourceUrl;
          trailerStart = null;
          trailerEnd = null;
        }

      }

      setUploadStage('finalize');
      setFinalizeStatus('processing');


      if (mode === 'now') {
        const clientItemId = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const insertPayload: Record<string, unknown> = {
          id: clientItemId,
          author_id: actorId,
          kind, section, visibility,
          title: title.trim() || null,
          caption: caption.trim() || null,
          media_url: kind === 'link' ? linkComposer.sourceUrl : mediaUrl,
          audio_url: audioUrl,
        };
        if (selectedChannel && !channelMismatch) insertPayload.channel_id = selectedChannel.id;
        if (origin) insertPayload.content_origin = origin;
        if (origin === 'ai' && originTool.trim() && kind !== 'audio') insertPayload.ai_tool = originTool.trim().slice(0, 80);
        if (kind === 'link') {
          insertPayload.source_url = linkComposer.sourceUrl;
          insertPayload.link_provider = linkComposer.provider;
          const effectiveTags = isAdult ? linkAdultGenreTags : linkGenreTags;
          if (effectiveTags.length > 0) insertPayload.genre_tags = effectiveTags;
          insertPayload.is_adult = !!isAdult;
        }
        if (audioPreviewUrl) insertPayload.audio_preview_url = audioPreviewUrl;
        if (thumbUrl) insertPayload.thumb_url = thumbUrl;

        if (kind === 'audio') {
          insertPayload.rights_confirmed = rightsConfirmed;
          if (composerName.trim()) insertPayload.composer_name = composerName.trim();
          {
            const tools = [...aiTags.map((t) => t.name), ...(origin === 'ai' && originTool.trim() ? [originTool.trim()] : [])];
            if (tools.length > 0) insertPayload.ai_tool = tools.join(', ').slice(0, 200);
          }
          if (genreTags.length > 0) insertPayload.genre_tags = genreTags.map((t) => t.name);
          if (lyrics.trim()) insertPayload.lyrics = lyrics.trim();
          // Preview snippet (até 30s) — tocado automaticamente ao passar pelo card
          // Grava o trecho REAL escolhido na música (início/fim). Com clip
          // dedicado os players tocam o clip do 0 e usam só a duração (fim −
          // início); assim o modal de edição reabre no trecho certo e o
          // backfill/voice-bio recortam a mesma janela.
          if (audioPreviewUrl && audioDuration <= 0) {
            insertPayload.preview_start_seconds = 0;
            insertPayload.preview_end_seconds = Math.max(5, Math.min(30, previewLength));
          } else if (audioDuration > 0) {
            const start = Math.max(0, Math.min(previewStart, Math.max(0, audioDuration - 1)));
            const len = Math.max(5, Math.min(30, previewLength));
            const end = Math.min(audioDuration, start + len);
            insertPayload.preview_start_seconds = Number(start.toFixed(2));
            insertPayload.preview_end_seconds = Number(end.toFixed(2));
          }
        }
        if (kind === 'short_video' && videoMeta) {
          const ts = Math.max(0, videoMeta.trimStart);
          const te = Math.min(
            Math.max(ts + 0.1, videoMeta.trimEnd || videoMeta.duration),
            ts + OCULTO_PLAY_MAX_SHORT_VIDEO_SECONDS,
          );
          insertPayload.duration_sec = Math.max(1, Math.round((te - ts) + 2));
          // O arquivo já sobe fisicamente cortado + outro OCULTO de 2s.
          // Portanto não salvamos trim_start/trim_end para evitar corte duplo na reprodução.
        }
        // Trailer (opcional) — usado nas páginas /play/p/:id de compartilhamento
        if ((kind === 'short_video' || kind === 'link') && (trailerUrl || trailerStart != null)) {
          if (trailerUrl) insertPayload.trailer_url = trailerUrl;
          if (trailerStart != null) insertPayload.trailer_trim_start_seconds = trailerStart;
          if (trailerEnd != null) insertPayload.trailer_trim_end_seconds = trailerEnd;
        }
        const { error } = await supabase
          .from('oculto_play_items')
          .insert(insertPayload);
        if (error) throw error;
        if (kind === 'link' && srtFile) {
          setUploadStage('finalize');
          const vttFile = await normalizeSubtitleFileToVtt(srtFile);
          const path = `${user.id}/tracks/${clientItemId}_${Date.now()}.vtt`;
          const { error: storageError } = await supabase.storage
            .from('oculto-play-media')
            .upload(path, vttFile, { upsert: false, contentType: 'text/vtt' });
          if (storageError) throw storageError;
          const { data: publicData } = supabase.storage.from('oculto-play-media').getPublicUrl(path);
          const { error: trackError } = await (supabase as any).rpc('oculto_play_track_upsert', {
            p_id: null,
            p_item_id: clientItemId,
            p_kind: 'subtitles',
            p_lang: 'pt-BR',
            p_label: 'Português',
            p_vtt_url: publicData.publicUrl,
            p_is_default: true,
          });
          if (trackError) throw trackError;
        }
        forceOpenPlaySection(storageKeyForPlayItem(insertPayload as Partial<OcultoPlayItem> & Record<string, unknown>));
        if (kind === 'link' && isAdult) window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#filmes-adult`);
        else if (kind === 'link') window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#filmes`);
        upsertOcultoPlayFeedItem(qc, {
          ...insertPayload,
          published_at: new Date().toISOString(),
          tags: kind === 'audio' ? genreTags.map((t) => t.name) : kind === 'link' ? (isAdult ? linkAdultGenreTags : linkGenreTags) : [],
          author_username: profile?.username ?? null,
          author_display_name: profile?.display_name ?? profile?.name ?? null,
          author_avatar_url: profile?.avatar_url ?? null,
        } as any);
        qc.invalidateQueries({ queryKey: ['oculto-play-derived'] });
        if (kind === 'audio') {
          // Clip da prévia recortado no servidor (MP3 pequeno) — melhor esforço.
          void regenerateServerPreviewClip(qc, clientItemId);
          if (genreTags.length) void bumpAudioTagUsage('genre', genreTags.map((t) => t.slug));
          if (aiTags.length) void bumpAudioTagUsage('ai', aiTags.map((t) => t.slug));
        }
        try { await grant('upload'); } catch { /* xp opcional */ }
        toast.success('Publicado no PLAY!');
      } else {
        const scheduledFor = mode === 'schedule'
          ? new Date(scheduleAt).toISOString()
          : null;
        const draftPayload: Record<string, unknown> = {
          author_id: actorId,
          kind, section, visibility,
          title: title.trim() || null,
          caption: caption.trim() || null,
          media_url: kind === 'link' ? linkComposer.sourceUrl : mediaUrl,
          audio_url: audioUrl,
          is_draft: mode === 'draft',
          is_published: false,
          scheduled_for: scheduledFor,
        };
        if (selectedChannel && !channelMismatch) draftPayload.channel_id = selectedChannel.id;
        if (origin) draftPayload.content_origin = origin;
        if (origin === 'ai' && originTool.trim()) draftPayload.ai_tool = originTool.trim().slice(0, 80);
        if (thumbUrl) draftPayload.thumb_url = thumbUrl;
        if (kind === 'link') {
          draftPayload.source_url = linkComposer.sourceUrl;
          draftPayload.link_provider = linkComposer.provider;
          draftPayload.is_adult = !!isAdult;
          const effectiveTags = isAdult ? linkAdultGenreTags : linkGenreTags;
          if (effectiveTags.length > 0) {
            draftPayload.genre_tags = effectiveTags;
            draftPayload.tags = effectiveTags;
          }
        }
        if (kind === 'audio') {
          if (audioPreviewUrl) draftPayload.audio_preview_url = audioPreviewUrl;
          if (genreTags.length > 0) draftPayload.genre_tags = genreTags.map((t) => t.name);
          if (lyrics.trim()) draftPayload.lyrics = lyrics.trim();
        }
        if ((kind === 'short_video' || kind === 'link') && (trailerUrl || trailerStart != null)) {
          if (trailerUrl) draftPayload.trailer_url = trailerUrl;
          if (trailerStart != null) draftPayload.trailer_trim_start_seconds = trailerStart;
          if (trailerEnd != null) draftPayload.trailer_trim_end_seconds = trailerEnd;
        }
        const { error } = await supabase.from('oculto_play_items').insert(draftPayload);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ['oculto-play', 'drafts'] });
        qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
        toast.success(mode === 'draft' ? 'Rascunho salvo.' : 'Agendado!');
      }

      abortRef.current = null;
      setFinalizeStatus('done');
      setUploadStage('done');
      reset();
      onDone();
    } catch (e: any) {
      abortRef.current = null;
      if (e instanceof UploadAbortedError) {
        toast.info('Upload cancelado.');
        setUploadPct(0);
        setUploadStage('idle');
        setVideoStatus('pending'); setVideoPct(0);
        setCoverStatus('pending'); setCoverPct(0);
        setFinalizeStatus('pending');
        setBusy(false);
        return;
      }
      console.error('[ocultoplay] upload', e);
      toast.error(e?.message ?? 'Falha ao publicar.');
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent
        className="p-0 gap-0 w-[calc(100vw-1rem)] sm:w-full max-w-md max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-2 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Enviar para o PLAY</span>
            {savedLabel && (
              <span className="flex items-center gap-1 text-[10px] font-normal text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {savedLabel}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 space-y-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Publicar em — canal do próprio usuário */}
          {!channelsLoading && myChannels.length === 0 ? (
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 space-y-2">
              <p className="text-sm font-semibold">Para publicar, crie seu canal</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Você pode ter 1 canal de vídeo e 1 de áudio gratuitamente.
                {isMasterUser ? ' (Master: sem canal, o envio vai para o Oculto Oficial.)' : ''}
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => onCreateChannel?.('video')}>Canal de vídeo</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onCreateChannel?.('audio')}>Canal de áudio</Button>
              </div>
            </div>
          ) : myChannels.length > 0 ? (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Publicar em</label>
              <Select
                value={selectedChannel?.id ?? ''}
                onValueChange={(v) => {
                  setChannelId(v);
                  const ch = myChannels.find((c) => c.id === v);
                  if (ch && channelKindForItem(kind) !== ch.kind) {
                    const next = ch.kind === 'audio'
                      ? 'audio'
                      : (uploadKinds.includes('short_video') ? 'short_video' : uploadKinds.find((k) => k !== 'audio'));
                    if (next) setKind(next as OcultoPlayKind);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Escolha o canal" /></SelectTrigger>
                <SelectContent className="z-[200] bg-popover text-popover-foreground">
                  {myChannels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.kind === 'audio' ? '🎵 ' : '🎬 '}{c.name}{c.is_official ? ' (oficial)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {channelMismatch && (
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
                  <span>Este tipo vai num canal de {channelKindForItem(kind) === 'audio' ? 'áudio' : 'vídeo'}.</span>
                  {!myChannels.some((c) => c.kind === channelKindForItem(kind)) && (
                    <button type="button" className="font-semibold underline" onClick={() => onCreateChannel?.(channelKindForItem(kind))}>
                      Criar canal
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
            <Select value={kind} onValueChange={(v) => setKind(v as OcultoPlayKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-[200] bg-popover text-popover-foreground">
                {uploadKinds.map((k) => (
                  <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Origem do conteúdo — prioridade a conteúdo próprio e criado com IA */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Origem do conteúdo{isMasterUser ? ' (opcional)' : ''}</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'original', label: 'Original meu' },
                { id: 'ai', label: 'Criado com IA' },
                { id: 'licensed', label: 'Terceiros c/ licença' },
              ] as const).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOrigin(origin === o.id ? '' : o.id)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-[11px] font-semibold leading-tight transition',
                    origin === o.id ? 'border-primary bg-primary/15 text-foreground' : 'border-border/60 text-muted-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {origin === 'ai' && kind !== 'audio' && (
              <Input
                className="mt-1.5 h-9 text-xs"
                value={originTool}
                onChange={(e) => setOriginTool(e.target.value.slice(0, 80))}
                placeholder="Ferramenta usada (opcional): Sora, Runway, Suno…"
              />
            )}
            {origin === 'licensed' && (
              <p className="mt-1 text-[10.5px] text-amber-200/90 leading-snug">
                Publique só o que você tem licença para usar. Músicas e filmes de terceiros sem autorização serão removidos.
              </p>
            )}
            {origin === 'ai' && (
              <p className="mt-1 text-[10.5px] text-muted-foreground leading-snug">
                Proibido imitar pessoas reais sem consentimento ou qualquer conteúdo que aparente envolver menores.
              </p>
            )}
          </div>

          {isMasterUser && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Visibilidade</label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as OcultoPlayVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[200] bg-popover text-popover-foreground">
                  <SelectItem value="public">Público</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Seção</label>
              <Select value={section} onValueChange={(v) => setSection(v as OcultoPlaySection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[200] bg-popover text-popover-foreground">
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="today">Hoje no Oculto</SelectItem>
                  <SelectItem value="comeback">Volte para Ver</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Título (opcional)</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{kind === 'link' ? 'Sinopse' : 'Legenda'}</label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, PLAY_CAPTION_MAX_CHARS))}
              rows={2}
              maxLength={PLAY_CAPTION_MAX_CHARS}
            />
          </div>

          {kind !== 'link' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Arquivo</label>
              <Input
                type="file"
                accept={
                  kind === 'short_video' ? 'video/*'
                  : kind === 'audio' ? 'audio/mpeg,audio/mp3,audio/*'
                  : 'image/*'
                }
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setVideoMeta(null);
                }}
              />
              {file && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
          )}

          {/* Link externo: composer de URL + preview + capa (frames/upload) */}
          {kind === 'link' && (
            <OcultoPlayLinkComposer
              value={{ url: linkComposer.sourceUrl }}
              onChange={setLinkComposer}
            />
          )}

          {kind === 'link' && (
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
              <label className="text-xs font-semibold text-sky-100 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Legenda SRT/VTT sincronizada (opcional)
              </label>
              <Input
                type="file"
                accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain"
                onChange={(e) => setSrtFile(e.target.files?.[0] ?? null)}
                className="h-9 text-[11px] file:text-[11px]"
              />
              <p className="text-[10px] text-sky-100/75 leading-snug">
                Arquivos .srt são convertidos automaticamente para legenda do player quando o vídeo/link for reproduzível no navegador.
              </p>
              {srtFile && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {srtFile.name} — {(srtFile.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          )}

          {/* Link: trailer opcional (recorte do link principal ou upload pronto) */}
          {kind === 'link' && (
            <PlayTrailerComposer
              primaryLinkUrl={linkComposer.sourceUrl}
              allowReuseFromPrimary
              value={trailer}
              onChange={setTrailer}
            />
          )}

          {/* Link: gêneros (tags fixas + custom) */}
          {kind === 'link' && (() => {
            const FIXED: string[] = [
              'Ação', 'Ficção', 'Comédia', 'Fantasia', 'Drama',
              'Terror', 'Documentário', 'Podcast', 'Animação',
            ];
            const all = Array.from(new Set([...FIXED, ...linkGenreCustomList]));
            const isFixed = (t: string) => FIXED.some((f) => f.toLowerCase() === t.toLowerCase());
            const toggle = (name: string) => {
              setLinkGenreTags((prev) => {
                if (prev.some((p) => p.toLowerCase() === name.toLowerCase())) {
                  return prev.filter((t) => t.toLowerCase() !== name.toLowerCase());
                }
                if (prev.length >= 8) {
                  toast.error('Máximo de 8 gêneros por publicação.');
                  return prev;
                }
                return [...prev, name];
              });
            };
            const removeSelected = (name: string) => {
              setLinkGenreTags((prev) => prev.filter((t) => t.toLowerCase() !== name.toLowerCase()));
            };
            const removeCustom = (name: string) => {
              // Catálogo de tags é compartilhado e vive no banco; aqui apenas
              // tiramos da seleção atual da publicação.
              setLinkGenreTags((prev) => prev.filter((t) => t.toLowerCase() !== name.toLowerCase()));
            };
            const addCustom = () => {
              const v = linkGenreInput.trim();
              if (!v) return;
              if (v.length > 24) { toast.error('Tag muito longa (máx. 24).'); return; }
              const existing = all.find((t) => t.toLowerCase() === v.toLowerCase());
              if (existing) {
                if (linkGenreTags.some((t) => t.toLowerCase() === existing.toLowerCase())) {
                  toast.info(`"${existing}" já está selecionada.`);
                } else {
                  toast.info(`"${existing}" já existe — selecionada.`);
                  toggle(existing);
                }
                setLinkGenreInput('');
                return;
              }
              if (!linkGenreTags.some((t) => t.toLowerCase() === v.toLowerCase()) && linkGenreTags.length < 8) {
                setLinkGenreTags((prev) => [...prev, v]);
              }
              setLinkGenreInput('');
              upsertMovieGenre.mutate(v, {
                onSuccess: () => toast.success(`Tag "${v}" salva no catálogo.`),
                onError: () => toast.error('Não foi possível salvar a tag no servidor.'),
              });
            };
            return (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                <label className="text-xs font-semibold text-emerald-100 block">
                  Gêneros do conteúdo (opcional)
                </label>

                {linkGenreTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1 border-b border-emerald-500/20">
                    {linkGenreTags.map((tag) => (
                      <span
                        key={`sel-${tag}`}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-[11px] font-medium bg-emerald-500/80 text-black border border-emerald-300 shadow"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeSelected(tag)}
                          className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-black/20"
                          aria-label={`Remover ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {all.map((tag) => {
                    const active = linkGenreTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                    const custom = !isFixed(tag);
                    return (
                      <span key={tag} className="relative inline-flex">
                        <button
                          type="button"
                          onClick={() => toggle(tag)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition',
                            custom ? 'pr-6' : '',
                            active
                              ? 'bg-emerald-500/80 text-black border-emerald-300 shadow'
                              : 'bg-muted/40 text-foreground border-border/50 hover:border-emerald-400/60',
                          )}
                        >
                          {tag}
                        </button>
                        {custom && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeCustom(tag); }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-rose-500/80"
                            aria-label={`Excluir tag personalizada ${tag}`}
                            title="Excluir tag personalizada"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={linkGenreInput}
                    onChange={(e) => setLinkGenreInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
                    }}
                    placeholder="Outro gênero (ex.: suspense)"
                    maxLength={24}
                    className="flex-1 h-8 px-2 rounded-md bg-background border border-border/50 text-xs"
                  />
                  <button
                    type="button"
                    onClick={addCustom}
                    disabled={!linkGenreInput.trim()}
                    className="h-8 px-3 rounded-md bg-emerald-500/80 text-black text-xs font-semibold disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                </div>
                {linkGenreTags.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {linkGenreTags.length} selecionada(s) · clique no × para remover
                  </p>
                )}
              </div>
            );
          })()}

          {/* Link: Toggle +18 + picker de gêneros exclusivos +18 */}
          {kind === 'link' && (
            <div className="rounded-lg border border-rose-500/40 bg-gradient-to-br from-rose-900/40 via-rose-950/30 to-black p-3 space-y-3">
              <button
                type="button"
                onClick={() => setIsAdult((v) => !v)}
                className="w-full flex items-center justify-between gap-3"
                aria-pressed={isAdult}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-rose-500/20 grid place-items-center border border-rose-400/40">
                    <Flame className="h-4 w-4 text-rose-200" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-rose-50">Conteúdo +18</p>
                    <p className="text-[11px] text-rose-200/80">
                      Marque para enviar apenas para a seção +18.
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    'relative inline-flex h-6 w-11 rounded-full transition-colors border',
                    isAdult ? 'bg-rose-500 border-rose-300' : 'bg-rose-900/40 border-rose-500/40',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      isAdult ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                  />
                </span>
              </button>

              {isAdult && (() => {
                const FIXED_ADULT: string[] = [
                  'Amador', 'Casal', 'Fetiche', 'Massagem', 'Roleplay', 'Sensual', 'Solo',
                ];
                const all = Array.from(new Set([...FIXED_ADULT, ...linkAdultGenreCustomList]));
                const isFixed = (t: string) => FIXED_ADULT.some((f) => f.toLowerCase() === t.toLowerCase());
                const toggle = (name: string) => {
                  setLinkAdultGenreTags((prev) => {
                    if (prev.some((p) => p.toLowerCase() === name.toLowerCase())) {
                      return prev.filter((t) => t.toLowerCase() !== name.toLowerCase());
                    }
                    if (prev.length >= 8) {
                      toast.error('Máximo de 8 gêneros por publicação.');
                      return prev;
                    }
                    return [...prev, name];
                  });
                };
                const removeSelected = (name: string) =>
                  setLinkAdultGenreTags((prev) => prev.filter((t) => t.toLowerCase() !== name.toLowerCase()));
                const addCustom = () => {
                  const v = linkAdultGenreInput.trim();
                  if (!v) return;
                  if (v.length > 24) { toast.error('Tag muito longa (máx. 24).'); return; }
                  const existing = all.find((t) => t.toLowerCase() === v.toLowerCase());
                  if (existing) {
                    if (linkAdultGenreTags.some((t) => t.toLowerCase() === existing.toLowerCase())) {
                      toast.info(`"${existing}" já está selecionada.`);
                    } else {
                      toggle(existing);
                    }
                    setLinkAdultGenreInput('');
                    return;
                  }
                  if (!linkAdultGenreTags.some((t) => t.toLowerCase() === v.toLowerCase()) && linkAdultGenreTags.length < 8) {
                    setLinkAdultGenreTags((prev) => [...prev, v]);
                  }
                  setLinkAdultGenreInput('');
                  upsertMovieGenre.mutate(
                    { name: v, variant: 'adult' },
                    {
                      onSuccess: () => toast.success(`Tag +18 "${v}" salva no catálogo.`),
                      onError: () => toast.error('Não foi possível salvar a tag +18 no servidor.'),
                    },
                  );
                };
                return (
                  <div className="space-y-2 border-t border-rose-500/30 pt-3">
                    <label className="text-xs font-semibold text-rose-100 block">
                      Gêneros +18 (exclusivos desta seção)
                    </label>

                    {linkAdultGenreTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pb-1 border-b border-rose-500/20">
                        {linkAdultGenreTags.map((tag) => (
                          <span
                            key={`asel-${tag}`}
                            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-[11px] font-medium bg-rose-500 text-white border border-rose-300 shadow"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeSelected(tag)}
                              className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-black/30"
                              aria-label={`Remover ${tag}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {all.map((tag) => {
                        const active = linkAdultGenreTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                        const custom = !isFixed(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggle(tag)}
                            className={cn(
                              'px-2.5 py-1 rounded-full text-[11px] font-medium border transition',
                              active
                                ? 'bg-rose-500 text-white border-rose-300 shadow'
                                : custom
                                  ? 'bg-rose-950/40 text-rose-100 border-rose-500/40 hover:border-rose-300'
                                  : 'bg-muted/40 text-foreground border-border/50 hover:border-rose-400/60',
                            )}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        value={linkAdultGenreInput}
                        onChange={(e) => setLinkAdultGenreInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                        placeholder="Outro gênero +18"
                        maxLength={24}
                        className="flex-1 h-8 px-2 rounded-md bg-background border border-rose-500/40 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addCustom}
                        disabled={!linkAdultGenreInput.trim()}
                        className="h-8 px-3 rounded-md bg-rose-500 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        Adicionar
                      </button>
                    </div>
                    <p className="text-[10px] text-rose-200/70">
                      A capa selecionada acima também será usada na seção +18.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}



          {/* Vídeo: corte + capa (frames / upload) */}
          {kind === 'short_video' && file && (
            <VideoTrimAndCoverPicker file={file} onChange={setVideoMeta} />
          )}

          {/* Trailer (curto vídeo) */}
          {kind === 'short_video' && file && (
            <PlayTrailerComposer
              primaryVideoFile={file}
              allowReuseFromPrimary
              value={trailer}
              onChange={setTrailer}
            />
          )}




          {/* Vídeo: imagem final (outro) — opcional. Se vazio, usa o logo OCULTO padrão. */}
          {kind === 'short_video' && file && (
            <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-fuchsia-100 block">
                  Imagem final do vídeo (2s) — opcional
                </label>
                {outroFile && (
                  <button
                    type="button"
                    onClick={() => setOutroFile(null)}
                    className="text-[10px] text-rose-300 hover:text-rose-100 underline"
                  >
                    Remover
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Por padrão, todo vídeo recebe o card OCULTO no final. Envie uma imagem
                para usar a sua no lugar (apenas neste vídeo).
              </p>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setOutroFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-3 pt-1">
                <div className="relative h-16 w-28 rounded-md overflow-hidden border border-border/40 bg-gradient-to-br from-fuchsia-900 via-purple-950 to-black shrink-0 flex items-center justify-center">
                  <img
                    src={outroPreviewUrl ?? outroAsset.url}
                    alt="Prévia da imagem final"
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 h-full w-full object-contain"
                    onError={(e) => {
                      const el = e.currentTarget;
                      // Fallback inline (SVG) — evita ícone de imagem quebrada no mobile
                      // se o asset do outro padrão falhar (rede instável, cache CORS, etc).
                      const svg =
                        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 112 64'>` +
                        `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
                        `<stop offset='0%' stop-color='%23581c87'/>` +
                        `<stop offset='100%' stop-color='%23000000'/>` +
                        `</linearGradient></defs>` +
                        `<rect width='112' height='64' fill='url(%23g)'/>` +
                        `<text x='56' y='38' text-anchor='middle' font-family='Inter,Arial,sans-serif' ` +
                        `font-weight='900' font-size='18' fill='%23fde68a'>OCULTO</text>` +
                        `</svg>`;
                      el.onerror = null;
                      el.src = `data:image/svg+xml;utf8,${svg}`;
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  {outroFile
                    ? `${outroFile.name} — ${(outroFile.size / 1024 / 1024).toFixed(2)} MB`
                    : 'Usando imagem final padrão do OCULTO.'}
                </p>
              </div>
            </div>
          )}


          {/* Indicador de progresso e status do upload */}
          {(busy || uploadStage === 'done') && (() => {
            const hasCoverStep =
              (kind === 'short_video' && !!videoMeta?.coverBlob) ||
              (kind === 'audio' && !!coverFile);
            const StatusIcon = ({ s }: { s: StepStatus }) =>
              s === 'done' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
              ) : s === 'uploading' || s === 'processing' ? (
                <Loader2 className="h-3.5 w-3.5 text-fuchsia-200 animate-spin shrink-0" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0 ml-[3px]" />
              );
            const labelOf = (s: StepStatus, uploadingLabel: string, processingLabel = 'Processando…') =>
              s === 'done' ? 'Concluído ✓' : s === 'uploading' ? uploadingLabel : s === 'processing' ? processingLabel : 'Aguardando';
            const overall = uploadStage === 'done'
              ? 'Publicação concluída'
              : uploadStage === 'finalize'
                ? 'Processando publicação…'
                : uploadStage === 'cover'
                  ? 'Enviando capa…'
                  : uploadStage === 'video'
                    ? (videoStatus === 'processing' ? 'Processando vídeo no dispositivo…' : 'Enviando vídeo…')
                    : 'Preparando…';
            return (
              <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-fuchsia-100">{overall}</span>
                  {(uploadStage === 'video' || uploadStage === 'cover') && (
                    <span className="text-fuchsia-100 tabular-nums">{uploadPct}%</span>
                  )}
                </div>

                {/* Passo 1 — Vídeo / mídia */}
                {file && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-foreground/90">
                      <StatusIcon s={videoStatus} />
                      <span className="flex-1">
                        {kind === 'audio' ? 'Áudio' : kind === 'short_video' ? 'Vídeo' : 'Mídia'}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {videoStatus === 'processing'
                          ? `Processando local… ${videoPct}%`
                          : labelOf(videoStatus, `Enviando… ${videoPct}%`)}
                      </span>
                    </div>
                    {(videoStatus === 'uploading' || videoStatus === 'processing') && (
                      <Progress value={videoPct} className="h-1" />
                    )}
                  </div>
                )}

                {/* Passo 2 — Capa */}
                {hasCoverStep && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-foreground/90">
                      <StatusIcon s={coverStatus} />
                      <span className="flex-1">Capa</span>
                      <span className="text-muted-foreground tabular-nums">
                        {labelOf(coverStatus, `Enviando… ${coverPct}%`)}
                      </span>
                    </div>
                    {coverStatus === 'uploading' && (
                      <Progress value={coverPct} className="h-1" />
                    )}
                  </div>
                )}

                {/* Passo 3 — Finalização (gravar no banco) */}
                <div className="flex items-center gap-1.5 text-[11px] text-foreground/90">
                  <StatusIcon s={finalizeStatus} />
                  <span className="flex-1">Publicação</span>
                  <span className="text-muted-foreground">
                    {labelOf(finalizeStatus, 'Processando…', 'Processando…')}
                  </span>
                </div>

                {(uploadStage === 'video' || uploadStage === 'cover') && (
                  <div className="flex justify-end pt-0.5">
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => { abortRef.current?.abort(); }}
                      className="h-6 text-[10px] text-rose-300 hover:text-rose-100 hover:bg-rose-500/20"
                    >
                      Cancelar upload
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}


          {/* Etapa 7 — Áudio: capa + termos jurídicos + metadados musicais */}
          {kind === 'audio' && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Capa da música (usada no card)
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                />
                {coverFile && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {coverFile.name} — {(coverFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
                {coverPreviewUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="relative h-20 w-20 rounded-lg overflow-hidden border border-border/40 bg-black/30 shrink-0">
                      <img src={coverPreviewUrl} alt="Prévia da capa" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Prévia da capa que aparecerá no card do feed.
                    </p>
                  </div>
                )}
              </div>

              {/* Seleção do trecho de preview (até 30s) — autoplay no card do feed */}
              {file && audioDuration > 0 && (
                <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-fuchsia-100">
                      Preview (até 30s) — toca automático no feed
                    </p>
                    <button
                      type="button"
                      onClick={togglePreview}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-fuchsia-500/90 hover:bg-fuchsia-500 text-white text-[11px] font-semibold"
                    >
                      {previewPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" fill="currentColor" />}
                      {previewPlaying ? 'Pausar' : 'Tocar'}
                    </button>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Início</span>
                      <span className="tabular-nums">
                        {previewStart.toFixed(1)}s / {Math.floor(audioDuration)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, audioDuration - 1)}
                      step={0.1}
                      value={previewStart}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(audioDuration - 1, Number(e.target.value)));
                        setPreviewStart(v);
                        const a = previewAudioRef.current;
                        if (a) {
                          try { a.currentTime = v; } catch { /* noop */ }
                        }
                      }}
                      onInput={(e) => {
                        const v = Math.max(0, Math.min(audioDuration - 1, Number((e.target as HTMLInputElement).value)));
                        // garante seek imediato durante arrasto (não espera change)
                        const a = previewAudioRef.current;
                        if (a) {
                          try { a.currentTime = v; } catch { /* noop */ }
                        }
                      }}
                      className="w-full accent-fuchsia-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Duração do preview</span>
                      <span className="tabular-nums">{previewLength}s</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={1}
                      value={previewLength}
                      onChange={(e) => setPreviewLength(Number(e.target.value))}
                      className="w-full accent-fuchsia-500"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Trecho: <span className="tabular-nums">{previewStart.toFixed(1)}s → {Math.min(audioDuration, previewStart + previewLength).toFixed(1)}s</span>
                  </p>
                </div>
              )}


              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Estilo / Gênero (selecione ou crie novas tags)
                </label>
                <AudioTagPicker kind="genre" selected={genreTags} onChange={setGenreTags} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Compositor da música
                </label>
                <Input
                  value={composerName}
                  onChange={(e) => setComposerName(e.target.value)}
                  placeholder="Nome do compositor (autor da letra/melodia)"
                  maxLength={120}
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  IA utilizada na produção (opcional)
                </label>
                <AudioTagPicker kind="ai" selected={aiTags} onChange={setAiTags} />
              </div>

              {/* Letra da música — upload (.txt), drag-and-drop ou digitar/colar */}
              <div
                className={cn(
                  'rounded-md border p-3 space-y-2 transition-colors',
                  lyricsDragOver
                    ? 'border-fuchsia-300 bg-fuchsia-500/15 ring-2 ring-fuchsia-400/40'
                    : 'border-fuchsia-500/30 bg-fuchsia-500/5',
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!lyricsDragOver) setLyricsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLyricsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLyricsDragOver(false);
                  const f = pickLyricsFileFromDataTransfer(e.dataTransfer);
                  if (!f) {
                    toast.error('Solte um arquivo .txt válido.');
                    return;
                  }
                  readLyricsFile(f)
                    .then((res) => {
                      setLyrics(res.value);
                      if (res.truncated) toast.error(res.error ?? 'Letra cortada no limite.');
                      else toast.success('Letra carregada do arquivo.');
                    })
                    .catch((err) => toast.error(err?.message ?? 'Falha ao ler o arquivo.'));
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-fuchsia-100 block">
                    Letra da música (opcional)
                  </label>
                  {lyrics && (
                    <button
                      type="button"
                      onClick={() => setLyrics('')}
                      className="text-[10px] text-rose-300 hover:text-rose-100 underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Envie um arquivo <code>.txt</code>, <strong>arraste e solte</strong> aqui
                  ou cole/digite abaixo. A formatação (quebras de linha) é preservada e pode
                  ser editada antes de publicar.
                </p>

                <Input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (!f) return;
                    const fileCheck = validateLyricsFile(f);
                    if (!fileCheck.ok) {
                      toast.error(fileCheck.error ?? 'Arquivo inválido.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const raw = String(reader.result ?? '');
                      const res = validateLyricsText(raw);
                      setLyrics(res.value);
                      if (res.truncated) toast.error(res.error ?? 'Letra cortada no limite.');
                      else toast.success('Letra carregada do arquivo.');
                    };
                    reader.onerror = () => toast.error('Falha ao ler o arquivo.');
                    reader.readAsText(f, 'utf-8');
                  }}
                />
                <Textarea
                  value={lyrics}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const res = validateLyricsText(raw);
                    setLyrics(res.value);
                    if (res.truncated && raw.length > lyrics.length) {
                      toast.error(res.error ?? 'Limite de caracteres atingido.');
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text') ?? '';
                    const projected = lyrics + pasted;
                    if (projected.length > LYRICS_MAX_CHARS) {
                      e.preventDefault();
                      const res = validateLyricsText(projected);
                      setLyrics(res.value);
                      toast.error(res.error ?? 'Texto colado excede o limite — cortado.');
                    }
                  }}
                  rows={8}
                  maxLength={LYRICS_MAX_CHARS}
                  placeholder={'Cole ou digite a letra aqui...\n\n[Verso 1]\n...'}
                  className="font-mono text-[12px] whitespace-pre-wrap leading-relaxed"
                />
                <p className={`text-[10px] ${lyrics.length >= LYRICS_MAX_CHARS ? 'text-rose-300 font-semibold' : 'text-muted-foreground'}`}>
                  {lyrics.length.toLocaleString('pt-BR')}/{LYRICS_MAX_CHARS.toLocaleString('pt-BR')} caracteres
                  {lyrics.length >= LYRICS_MAX_CHARS && ' • limite atingido'}
                </p>
              </div>


              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-100/90 leading-relaxed">
                <p className="font-semibold text-amber-300 mb-1">⚖️ Direitos autorais</p>
                <p>{audioLegalText}</p>
              </div>

              <label className="flex items-start gap-2 text-[11px] text-foreground/90 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(e) => setRightsConfirmed(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-fuchsia-500"
                />
                <span>Confirmo que este áudio é autoral ou tenho autorização para publicá-lo.</span>
              </label>

              <p className="text-[10px] text-muted-foreground -mt-1">
                Limites: até {audioMaxMb} MB e {Math.floor(audioMaxSec / 60)} min. Título obrigatório.
              </p>
            </>
          )}



          {/* Modo de publicação */}
          <div className="pt-1">
            <label className="text-xs text-muted-foreground mb-1 block">Publicação</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'now' as const, label: 'Agora', icon: Upload },
                { id: 'draft' as const, label: 'Rascunho', icon: FileText },
                { id: 'schedule' as const, label: 'Agendar', icon: CalendarClock },
              ]).map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className={cn(
                      "rounded-md border text-xs py-2 px-2 flex items-center justify-center gap-1.5 transition-all",
                      active
                        ? "bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-100"
                        : "bg-card border-border/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {mode === 'schedule' && (
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="mt-2 h-9 text-xs"
              />
            )}
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t border-border/40 shrink-0 gap-2 sm:gap-2 flex-row justify-end">
          <Button variant="ghost" onClick={() => onClose()} disabled={busy} className="flex-1 sm:flex-none">
            Fechar
          </Button>
          <Button onClick={handleSubmit} disabled={busy} className="flex-1 sm:flex-none bg-gradient-to-r from-fuchsia-500 to-primary">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : (
              mode === 'draft' ? <FileText className="h-4 w-4 mr-2" />
              : mode === 'schedule' ? <CalendarClock className="h-4 w-4 mr-2" />
              : <Upload className="h-4 w-4 mr-2" />
            )}
            {mode === 'draft' ? 'Salvar rascunho' : mode === 'schedule' ? 'Agendar' : 'Publicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * PlayKindLargeCardsSection — seção com cards GRANDES filtrada por kind.
 * Carrega todos os itens (até 200) e oferece filtros: busca por título,
 * estilo (tag auto-alimentada), criador e ordenação por data.
 */
function useSectionOpenState(key: string | undefined, defaultOpen: boolean, collapsible: boolean) {
  const storageKey = key ? `ocultoplay:section-open:v2:${key}` : null;
  const [open, setOpen] = useState<boolean>(() => {
    if (!collapsible) return true;
    if (!storageKey) return defaultOpen;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch { /* noop */ }
    return defaultOpen;
  });
  useEffect(() => {
    if (!collapsible || !storageKey) return;
    const onSectionOpenChange = (event: Event) => {
      const detail = (event as CustomEvent<{ storageKey?: string; open?: boolean }>).detail;
      if (detail?.storageKey !== storageKey || typeof detail.open !== 'boolean') return;
      setOpen(detail.open);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      if (event.newValue === '1') setOpen(true);
      if (event.newValue === '0') setOpen(false);
    };
    window.addEventListener('ocultoplay:section-open-change', onSectionOpenChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('ocultoplay:section-open-change', onSectionOpenChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [collapsible, storageKey]);
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? '1' : '0');
          window.dispatchEvent(new CustomEvent('ocultoplay:section-open-change', {
            detail: { storageKey, open: next },
          }));
        } catch { /* noop */ }
      }
      return next;
    });
  };
  return [open, toggle] as const;
}

function useAllOcultoPlayLinks(limit = 500) {
  return useQuery<OcultoPlayItem[]>({
    queryKey: ['oculto-play', 'direct-links', limit] as const,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const BASE_COLS = 'id, author_id, kind, section, visibility, title, caption, media_url, thumb_url, audio_url, audio_preview_url, duration_sec, tags, genre_tags, view_count, like_count, save_count, share_count, dislike_count, comment_count, published_at, created_at, expires_at, source_url, link_provider, is_adult, trailer_url, trailer_trim_start_seconds, trailer_trim_end_seconds';
      const run = (cols: string) => (supabase as any)
        .from('oculto_play_items')
        .select(cols)
        .eq('kind', 'link')
        .eq('section', 'normal')
        .or('is_published.is.null,is_published.eq.true')
        .or('is_draft.is.null,is_draft.eq.false')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      let res = await run(`${BASE_COLS}, channel_id`);
      // Servidor ainda sem a coluna de canal: busca sem ela.
      if (res.error && /channel_id/i.test(res.error.message ?? '')) res = await run(BASE_COLS);
      const { data, error } = res;
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map((row) => normalizeOcultoPlayItem(row));
      const channelIds = Array.from(new Set(rows.map((it) => it.channel_id).filter(Boolean))) as string[];
      if (channelIds.length > 0) {
        const { data: chans } = await (supabase as any)
          .from('oculto_play_channels')
          .select('id, name, slug, avatar_url, status')
          .in('id', channelIds);
        const cmap = new Map<string, any>(((chans ?? []) as any[]).map((c) => [c.id, c]));
        for (const it of rows) {
          const c = it.channel_id ? cmap.get(it.channel_id) : null;
          if (c) {
            it.channel_name = c.name;
            it.channel_slug = c.slug;
            it.channel_avatar_url = c.avatar_url ?? null;
          }
        }
      }
      const authorIds = Array.from(new Set(rows.map((it) => it.author_id).filter(Boolean)));
      if (authorIds.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, username, display_name, avatar_url')
          .or(`id.in.(${authorIds.join(',')}),user_id.in.(${authorIds.join(',')})`);
        const map = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null }>();
        for (const p of (profiles ?? []) as any[]) {
          const value = {
            username: p.username ?? null,
            display_name: p.display_name ?? null,
            avatar_url: p.avatar_url ?? null,
          };
          if (p.id) map.set(p.id, value);
          if (p.user_id) map.set(p.user_id, value);
        }
        for (const it of rows) {
          const author = map.get(it.author_id);
          if (author) {
            it.author_username = author.username;
            it.author_display_name = author.display_name;
            it.author_avatar_url = author.avatar_url;
          }
        }
      }
      return rows;
    },
  });
}

function PlayKindLargeCardsSection({
  kind,
  kinds,
  channelSection,
  layout = 'grid',
  title,
  icon,
  onOpenFocus,
  collapsible = true,
  defaultOpen = false,
  storageKey,
  headerClassName,
  wrapperClassName,
  wrapperId,
  wrapperStyle,
}: {
  kind?: OcultoPlayKind;
  kinds?: OcultoPlayKind[];
  channelSection?: PlayChannelSection;
  /** 'spotify' (áudios) · 'youtube' (vídeos) · 'grid' (padrão) */
  layout?: 'grid' | 'spotify' | 'youtube';
  title: string;
  icon?: React.ReactNode;
  onOpenFocus: (it: OcultoPlayItem) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
  storageKey?: string;
  headerClassName?: string;
  wrapperClassName?: string;
  wrapperId?: string;
  wrapperStyle?: React.CSSProperties;
}) {
  // Aceita um único `kind` (carregamento direto pela RPC) OU uma lista `kinds`
  // (vídeos curtos + teasers + links na seção "Vídeos"). Quando há múltiplos
  // tipos, carregamos sem filtro server-side e filtramos client-side.
  const effectiveKindSet = useMemo(
    () => new Set<OcultoPlayKind>(kinds && kinds.length > 0 ? kinds : kind ? [kind] : []),
    [kind, kinds],
  );
  const serverKind = kinds && kinds.length > 1 ? undefined : (kind ?? kinds?.[0]);
  const { data, isLoading } = useOcultoPlayFeed('normal', serverKind, 500);
  const items = useMemo(
    () => (data ?? []).filter((it) => effectiveKindSet.has(it?.kind as OcultoPlayKind)),
    [data, effectiveKindSet],
  );
  const [filters, setFilters] = useState<PlaySectionFilterState>({
    query: '', tag: null, creatorId: null, sort: 'newest',
  });
  const filtered = useMemo(() => applyPlaySectionFilters(items, filters), [items, filters]);
  const [open, toggleOpen] = useSectionOpenState(storageKey, defaultOpen, collapsible);

  if (!isLoading && items.length === 0) return null;
  const inner = (

    <section className="mb-4">
      <button
        type="button"
        onClick={() => collapsible && toggleOpen()}
        className={cn(
          "w-full flex items-center gap-2 rounded-xl px-3 py-2.5 mb-2 text-left ring-1 transition-all duration-200",
          collapsible && "cursor-pointer select-none",
          headerClassName ?? "bg-card/60 text-foreground ring-border/50 hover:ring-border",
        )}
        aria-expanded={open}
      >
        {icon}
        <h2 className="text-base font-extrabold text-current">{title}</h2>
        {items.length > 0 && (
          <span className="text-[10px] text-current/75">
            · {filtered.length === items.length ? items.length : `${filtered.length}/${items.length}`}
          </span>
        )}
        {collapsible && (
          <ChevronDown
            className={cn(
              "ml-auto h-5 w-5 text-current/80 transition-transform duration-200 shrink-0",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        )}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden min-h-0">
          {open && (
            <>
              {channelSection && <PlayChannelsStrip section={channelSection} />}
              {items.length > 0 && (
                <PlayKindSectionFilters items={items} state={filters} onChange={setFilters} />
              )}
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="aspect-[3/4] rounded-xl bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Nenhum resultado para os filtros selecionados.
                </div>
              ) : layout === 'spotify' && !(filters.query || filters.tag || filters.creatorId) ? (
                <SpotifyAudioLayout items={filtered} onOpenFocus={onOpenFocus} />
              ) : layout === 'youtube' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-2.5 gap-y-5 items-start">
                  {filtered.map((item) => (
                    <div key={item.id} className="contain-paint">
                      {item.kind === 'audio'
                        ? <AudioGridCard item={item} onOpenFocus={() => onOpenFocus(item)} />
                        : item.kind === 'link'
                          ? <PlayLinkCard item={item} variant="youtube" onOpenFocus={() => onOpenFocus(item)} />
                          : <PlayCard item={item} variant="youtube" onPlayQueue={() => onOpenFocus(item)} />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 items-start">
                  {filtered.map((item, idx) => {
                    const nextAudioItem = filtered.slice(idx + 1).find((it) => it.kind === 'audio' && !!audioPreviewSrc(it)) ?? null;
                    const nextAudio = nextAudioItem ? audioPreviewSrc(nextAudioItem) : null;
                    return (
                      <div key={item.id} className="contain-paint">
                        {item.kind === 'audio'
                          ? <AudioGridCard item={item} nextAudioUrl={nextAudio} onOpenFocus={() => onOpenFocus(item)} />
                          : item.kind === 'link'
                            ? <PlayLinkCard item={item} onOpenFocus={() => onOpenFocus(item)} />
                            : <PlayCard item={item} onPlayQueue={() => onOpenFocus(item)} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
  if (!wrapperClassName) return inner;
  return <div id={wrapperId} style={wrapperStyle} className={wrapperClassName}>{inner}</div>;
}


/**
 * PlayLinksSection — seção dedicada para itens kind='link'.
 * Cada card respeita a proporção natural do provedor:
 *  - YouTube / Vimeo / .mp4 direto → 16:9 (horizontal)
 *  - TikTok → 9:16 (vertical)
 *  - Outros → 1:1 (fallback)
 */
function PlayLinksSection({
  title,
  channelSection,
  layout = 'grid',
  icon,
  onOpenFocus,
  collapsible = true,
  defaultOpen = false,
  storageKey,
  adultOnly = false,
  wrapperClassName,
  wrapperId,
  wrapperStyle,
}: {
  title: string;
  channelSection?: PlayChannelSection;
  /** 'netflix' (Filmes) · 'youtube' (Filmes +18) · 'grid' (padrão) */
  layout?: 'grid' | 'netflix' | 'youtube';
  icon?: React.ReactNode;
  onOpenFocus: (it: OcultoPlayItem) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
  storageKey?: string;
  adultOnly?: boolean;
  wrapperClassName?: string;
  wrapperId?: string;
  wrapperStyle?: React.CSSProperties;
}) {
  const { data, isLoading } = useAllOcultoPlayLinks(500);

  const sectionTone = adultOnly ? 'adult' : 'movie';
  const allLinkItems = useMemo(
    () => (data ?? []).filter((it) => it?.kind === 'link'),
    [data],
  );

  const items = useMemo(
    () => allLinkItems.filter((it) => {
      const flag = (it as any).is_adult === true;
      return adultOnly ? flag === true : flag !== true;
    }),
    [allLinkItems, adultOnly],
  );

  const [filters, setFilters] = useState<PlaySectionFilterState>({
    query: '', tag: null, creatorId: null, sort: 'newest',
  });
  const filtered = useMemo(() => applyPlaySectionFilters(items, filters), [items, filters]);
  const [open, toggleOpen] = useSectionOpenState(storageKey, defaultOpen, collapsible);

  if (!isLoading && items.length === 0) return null;
  const inner = (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => collapsible && toggleOpen()}
        className={cn(
          "w-full flex items-center gap-2 rounded-xl px-3 py-2.5 mb-2 text-left ring-1 transition-all duration-200",
          collapsible && "cursor-pointer select-none",
          sectionTone === 'adult'
            ? "bg-gradient-to-r from-red-950/80 via-rose-950/55 to-red-900/25 text-red-50 ring-red-400/25 hover:ring-red-300/45 hover:from-red-900/85"
            : "bg-gradient-to-r from-sky-950/80 via-blue-950/55 to-cyan-950/25 text-cyan-50 ring-sky-400/25 hover:ring-sky-300/45 hover:from-sky-900/85",
        )}
        aria-expanded={open}
      >
        {icon}
        <h2 className="text-base font-extrabold text-current">{title}</h2>
        {items.length > 0 && (
          <span className={cn("text-[10px]", sectionTone === 'adult' ? "text-red-100/80" : "text-cyan-100/80")}>
            · {filtered.length === items.length ? items.length : `${filtered.length}/${items.length}`}
          </span>
        )}
        {collapsible && (
          <ChevronDown
            className={cn(
              "ml-auto h-5 w-5 opacity-85 transition-transform duration-200 shrink-0",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        )}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden min-h-0">
          {open && (
            <>
              {channelSection && <PlayChannelsStrip section={channelSection} />}
              {items.length > 0 && (
                <PlayKindSectionFilters items={items} state={filters} onChange={setFilters} defaultTagsOpen />

              )}
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="aspect-[3/4] rounded-xl bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Nenhum resultado para os filtros selecionados.
                </div>
              ) : layout === 'netflix' && !(filters.query || filters.tag || filters.creatorId) ? (
                <NetflixMoviesLayout items={filtered} onOpenFocus={onOpenFocus} />
              ) : layout === 'youtube' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-5 items-start">
                  {filtered.map((item) => (
                    <div key={item.id} className="contain-paint">
                      <PlayLinkCard item={item} variant="youtube" onOpenFocus={() => onOpenFocus(item)} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 items-start">
                  {filtered.map((item) => (
                    <PlayLinkCard key={item.id} item={item} onOpenFocus={() => onOpenFocus(item)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
  if (!wrapperClassName) return inner;
  return <div id={wrapperId} style={wrapperStyle} className={wrapperClassName}>{inner}</div>;
}

function PlayLinkCard({ item, onOpenFocus, variant = 'default' }: {
  item: OcultoPlayItem;
  onOpenFocus: () => void;
  /** 'netflix' = carrossel de filmes · 'youtube' = grade com canal/views/tempo */
  variant?: 'default' | 'netflix' | 'youtube';
}) {
  const { user } = useAuth();
  const { profile: viewerProfile } = useProfile();
  const freeze = useSetPlayItemFrozen();
  const qc = useQueryClient();
  const actions = useOcultoPlayActions();
  const shareToFeed = useShareOcultoPlayToFeed();
  const sourceUrl = item.source_url || item.media_url || '';
  const parsed = useMemo(() => parseEmbeddedVideo(sourceUrl), [sourceUrl]);
  const provider = (item.link_provider || parsed?.kind || '').toLowerCase();
  const mediaAspect = provider === 'tiktok' ? 'aspect-[9/16]' : 'aspect-video';

  // author_id é o id do PERFIL (antes comparava com o id da conta e o dono
  // podia não ver o próprio menu).
  const canManage = (!!viewerProfile?.id && item.author_id === viewerProfile.id) || (!!user && user.id === item.author_id);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const commentCount = (item as any).comment_count ?? 0;

  const { views, registerView } = usePlayLinkViews(item.id, Number(item.view_count ?? 0));

  const handleDelete = async () => {
    if (!canManage) return;
    setDeleting(true);
    qc.setQueriesData<OcultoPlayItem[] | undefined>(
      { queryKey: ['oculto-play', 'feed'] },
      (old) => (old ? old.filter((x) => x.id !== item.id) : old),
    );
    try {
      const { error } = await supabase.from('oculto_play_items').delete().eq('id', item.id);
      if (error) throw error;
      toast.success('Conteúdo excluído.');
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
      toast.error('Não foi possível excluir.', { description: err?.message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className={cn(
        'group relative flex flex-col',
        variant === 'default' && 'rounded-xl overflow-hidden bg-card border border-border/40',
      )}>
        {/* Media */}
        <div className={cn(
          'relative w-full bg-black/50 overflow-hidden',
          variant === 'netflix' ? 'aspect-video rounded-md' : variant === 'youtube' ? 'aspect-video rounded-xl' : mediaAspect,
        )}>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              if ((e.target as HTMLElement | null)?.closest('button,a,[role="menuitem"]')) return;
              onOpenFocus();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenFocus();
              }
            }}
            className="absolute inset-0 w-full h-full text-left cursor-pointer"
          >
            <OcultoPlayLinkPlayer
              sourceUrl={sourceUrl}
              thumbUrl={item.thumb_url}
              className="absolute inset-0 h-full w-full"
              lazyClickToPlay
              itemId={item.id}
              onPlayedThreshold={registerView}
              onCompleted={() => actions.registerMovieCompletion(item.id)}
              viewThresholdSec={10}
            />
          </div>
          {/* Menu 3 pontinhos */}
          <div className="absolute right-1.5 top-1.5 z-10">
            <OcultoPlayItemMenu
              canManage={canManage}
              onEdit={canManage ? () => setEditOpen(true) : undefined}
              onDelete={canManage ? () => setDeleteConfirmOpen(true) : undefined}
              onToggleFreeze={canManage ? () => {
                freeze.mutate({ itemId: item.id, frozen: !item.is_frozen }, {
                  onSuccess: () => toast.success(item.is_frozen ? 'Descongelado: visível para todos.' : 'Congelado: só você vê, no seu canal.'),
                  onError: (e: any) => toast.error(e?.message ?? 'Não foi possível congelar.'),
                });
              } : undefined}
              frozen={!!item.is_frozen}
              isFreezePending={freeze.isPending}
              onShareToFeed={() => shareToFeed.mutate({ item })}
              onReport={() => setReportOpen(true)}
              isShareToFeedPending={shareToFeed.isPending}
              isDeletePending={deleting}
            />
          </div>
          {/* Views badge */}
          <div
            className="pointer-events-none absolute left-1.5 bottom-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/15 backdrop-blur"
            aria-label={`${views} visualizações`}
            title={`${views} visualizações`}
          >
            <Eye className="h-3 w-3 text-white/85" />
            <span className="tabular-nums">{formatViewsCompact(views)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className={cn(variant === 'default' ? 'p-2' : 'pt-2 px-0.5')}>
          {variant === 'youtube' ? (
            <PlayYoutubeMeta item={item} views={views} />
          ) : (
            <>
              <p className={cn('font-medium line-clamp-2', variant === 'netflix' ? 'text-[12px] font-semibold line-clamp-1' : 'text-[11px]')}>
                {item.title || item.caption || 'Link'}
              </p>
              {(item.channel_name || item.author_username) && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {item.channel_name ?? `@${item.author_username}`}
                </p>
              )}
            </>
          )}
          {variant === 'default' && item.genre_tags && item.genre_tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.genre_tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={() => actions.toggleLike.mutate(item.id)}
              className="grid place-items-center h-6 w-6 rounded-full bg-muted/60 hover:bg-rose-500/70 text-foreground hover:text-white transition"
              title="Curtir"
            >
              <Heart className={cn("h-3 w-3", item.liked_by_me && "fill-rose-400 text-rose-400")} />
            </button>
            <button
              onClick={() => setCommentsOpen(true)}
              className="grid place-items-center h-6 w-6 rounded-full bg-muted/60 hover:bg-sky-500/70 text-foreground hover:text-white relative transition"
              title="Comentar"
            >
              <MessageCircle className="h-3 w-3" />
              {commentCount > 0 && (
                <span className="absolute -top-1 -right-1 text-[8px] bg-sky-500 text-white rounded-full px-1 min-w-[12px] text-center leading-3">
                  {commentCount > 99 ? '99+' : commentCount}
                </span>
              )}
            </button>
            <button
              onClick={() => actions.toggleSave.mutate(item.id)}
              className="grid place-items-center h-6 w-6 rounded-full bg-muted/60 hover:bg-amber-500/70 text-foreground hover:text-white transition"
              title="Salvar"
            >
              <Bookmark className={cn("h-3 w-3", item.saved_by_me && "fill-amber-300 text-amber-300")} />
            </button>
            <WatchLaterButton itemId={item.id} />
            <AddToCollectionButton itemId={item.id} />
            <PlayShareMenu itemId={item.id} title={item.title} author={item.author_username} />
          </div>
        </div>
      </div>

      <PlayCommentsSheet
        itemId={item.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
      <OcultoPlayEditModal
        item={editOpen ? item : null}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <ReportOcultoPlayContentModal
        itemId={reportOpen ? item.id : null}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
      <OcultoPlayDeleteConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(o) => { if (!deleting) setDeleteConfirmOpen(o); }}
        onConfirm={handleDelete}
        pending={deleting}
      />
    </>
  );
}





/* ================================================================
 * Layouts das seções (Canais Play)
 *  - Áudios ........ estilo Spotify (Tocar tudo, Novidades, Mais ouvidas, gêneros)
 *  - Vídeos / +18 .. estilo YouTube (capa + foto do canal, título, views, tempo)
 *  - Filmes ........ estilo Netflix (destaque + fileiras horizontais)
 * Os cards são os MESMOS de antes (curtir, comentar, salvar, menu, prévia…),
 * só reorganizados. Fileiras fora da tela só montam quando chegam perto
 * (LazyVisible) — leve para celular modesto.
 * ================================================================ */

function timeAgoPt(iso?: string | null): string {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  const m = Math.floor(d / 30);
  if (m < 12) return `há ${m} ${m === 1 ? 'mês' : 'meses'}`;
  const y = Math.floor(m / 12);
  return `há ${y} ${y === 1 ? 'ano' : 'anos'}`;
}

function PlayYoutubeMeta({ item, views }: { item: OcultoPlayItem; views: number }) {
  const navigate = useNavigate();
  const avatar = item.channel_avatar_url || item.author_avatar_url;
  const name = item.channel_name || (item.author_username ? `@${item.author_username}` : '');
  const goChannel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.channel_slug) navigate(`/play/c/${item.channel_slug}`);
  };
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={goChannel}
        className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-white/10"
        aria-label={name ? `Abrir canal ${name}` : 'Canal'}
      >
        {avatar
          ? <img src={avatar} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <span className="grid h-full w-full place-items-center text-xs font-bold">{(name || '?').replace('@', '').slice(0, 1).toUpperCase()}</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-current">
          {item.title || item.caption || 'Sem título'}
        </p>
        <p className="mt-0.5 truncate text-[11px] opacity-70">
          {name && <button type="button" onClick={goChannel} className="hover:underline">{name}</button>}
          {name ? ' · ' : ''}{formatViewsCompact(views)} views{item.published_at ? ` · ${timeAgoPt(item.published_at)}` : ''}
        </p>
      </div>
    </div>
  );
}

function PlayHRow({ title, children, itemWidth = 'w-[42vw] max-w-[176px]' }: {
  title: string;
  children: React.ReactNode[];
  itemWidth?: string;
}) {
  if (!children.length) return null;
  return (
    <LazyVisible minHeight={220} rootMargin="300px 0px">
      <section>
        <h3 className="mb-2 px-0.5 text-[15px] font-extrabold text-current">{title}</h3>
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children.map((child, i) => (
            <div key={i} className={cn('shrink-0 snap-start contain-paint', itemWidth)}>{child}</div>
          ))}
        </div>
      </section>
    </LazyVisible>
  );
}

function topGenres(items: OcultoPlayItem[], max: number, minItems: number) {
  const count = new Map<string, OcultoPlayItem[]>();
  for (const it of items) {
    const tags = (it.genre_tags && it.genre_tags.length ? it.genre_tags : it.tags) ?? [];
    for (const t of tags.slice(0, 4)) {
      const key = String(t).trim();
      if (!key) continue;
      const list = count.get(key) ?? [];
      list.push(it);
      count.set(key, list);
    }
  }
  return [...count.entries()]
    .filter(([, list]) => list.length >= minItems)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, max)
    .map(([name, list]) => ({ name, items: list.slice(0, 12) }));
}

function SpotifyAudioLayout({ items, onOpenFocus }: { items: OcultoPlayItem[]; onOpenFocus: (it: OcultoPlayItem) => void }) {
  const [showAll, setShowAll] = useState(false);
  const newest = useMemo(() => items.slice(0, 12), [items]);
  const mostPlayed = useMemo(() => [...items].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)).slice(0, 8), [items]);
  const genres = useMemo(() => topGenres(items, 3, 3), [items]);
  const trackList = showAll ? items : mostPlayed;
  const card = (it: OcultoPlayItem) => (
    <AudioGridCard item={it} onOpenFocus={() => onOpenFocus(it)} />
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => items[0] && onOpenFocus(items[0])}
          className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 active:scale-95 transition"
          aria-label="Tocar tudo"
        >
          <Play className="h-6 w-6 translate-x-0.5 fill-current" />
        </button>
        <div>
          <p className="text-sm font-extrabold">Tocar tudo</p>
          <p className="text-[11px] opacity-75">{items.length} {items.length === 1 ? 'faixa' : 'faixas'}</p>
        </div>
      </div>

      <PlayHRow title="Novidades">{newest.map((it) => <Fragment key={it.id}>{card(it)}</Fragment>)}</PlayHRow>

      <section>
        <h3 className="mb-1.5 px-0.5 text-[15px] font-extrabold">{showAll ? 'Todas as faixas' : 'Mais ouvidas'}</h3>
        <ol className="divide-y divide-white/10">
          {trackList.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onOpenFocus(it)}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-white/5 active:bg-white/10"
              >
                <span className="w-5 shrink-0 text-center text-xs font-semibold opacity-60">{i + 1}</span>
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-black/30">
                  {it.thumb_url
                    ? <img src={it.thumb_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    : <Headphones className="m-3 h-5 w-5 opacity-60" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{it.title || 'Sem título'}</span>
                  <span className="block truncate text-[11px] opacity-70">
                    {it.channel_name || (it.author_username ? `@${it.author_username}` : '')}
                    {' · '}{formatViewsCompact(it.view_count ?? 0)} plays
                  </span>
                </span>
                <Play className="h-4 w-4 shrink-0 opacity-70" />
              </button>
            </li>
          ))}
        </ol>
        {items.length > mostPlayed.length && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 px-1 text-xs font-bold opacity-80 hover:opacity-100">
            {showAll ? 'Mostrar menos' : `Ver todas as ${items.length} faixas`}
          </button>
        )}
      </section>

      {genres.map((g) => (
        <PlayHRow key={g.name} title={g.name}>{g.items.map((it) => <Fragment key={it.id}>{card(it)}</Fragment>)}</PlayHRow>
      ))}
    </div>
  );
}

function NetflixMoviesLayout({ items, onOpenFocus }: { items: OcultoPlayItem[]; onOpenFocus: (it: OcultoPlayItem) => void }) {
  const hero = items[0];
  const newest = useMemo(() => items.slice(0, 12), [items]);
  const mostWatched = useMemo(() => [...items].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)).slice(0, 12), [items]);
  const genres = useMemo(() => topGenres(items, 4, 2), [items]);
  const card = (it: OcultoPlayItem) => <PlayLinkCard item={it} variant="netflix" onOpenFocus={() => onOpenFocus(it)} />;

  return (
    <div className="space-y-5">
      {hero && (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          {hero.thumb_url && (
            <img src={hero.thumb_url} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Em destaque</p>
            <p className="mt-0.5 line-clamp-2 text-lg font-extrabold text-white sm:text-2xl">{hero.title || 'Filme'}</p>
            {hero.caption && <p className="mt-1 line-clamp-2 max-w-xl text-xs text-white/80">{hero.caption}</p>}
            <button
              type="button"
              onClick={() => onOpenFocus(hero)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-bold text-black active:scale-95 transition"
            >
              <Play className="h-4 w-4 fill-current" /> Assistir
            </button>
          </div>
        </div>
      )}
      <PlayHRow title="Lançamentos" itemWidth="w-[64vw] max-w-[280px]">{newest.map((it) => <Fragment key={it.id}>{card(it)}</Fragment>)}</PlayHRow>
      {items.length > 4 && (
        <PlayHRow title="Mais assistidos" itemWidth="w-[64vw] max-w-[280px]">{mostWatched.map((it) => <Fragment key={it.id}>{card(it)}</Fragment>)}</PlayHRow>
      )}
      {genres.map((g) => (
        <PlayHRow key={g.name} title={g.name} itemWidth="w-[64vw] max-w-[280px]">{g.items.map((it) => <Fragment key={it.id}>{card(it)}</Fragment>)}</PlayHRow>
      ))}
    </div>
  );
}
