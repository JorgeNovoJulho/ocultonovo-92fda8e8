/**
 * useOcultoPlayContent — hooks de leitura/escrita do OCULTO PLAY (Etapa 3).
 *
 * Tudo passa pelo gate `can_access_oculto_play()`. Se o usuário não tiver
 * acesso, as queries retornam vazio (RPCs respondem sem dados).
 *
 * NENHUM hook é montado fora de páginas protegidas — manter assim até
 * a Etapa 4 (UI pública).
 */
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';
import { useOcultoPlayCountersStore } from '@/store/useOcultoPlayCountersStore';
import { resolveOcultoPlayMediaUrl } from '@/lib/ocultoPlayRepairedMedia';
import { AURA_QUEST_EVENT } from '@/lib/auraQuests';

export type OcultoPlayKind =
  | 'short_video' | 'meme' | 'audio'
  | 'vip_teaser' | 'community_post' | 'challenge' | 'link';

export type OcultoPlaySection = 'normal' | 'today' | 'comeback';
export type OcultoPlayVisibility = 'public' | 'premium' | 'vip';

export interface OcultoPlayItem {
  id: string;
  author_id: string;
  kind: OcultoPlayKind;
  section: OcultoPlaySection;
  visibility: OcultoPlayVisibility;
  title: string | null;
  caption: string | null;
  media_url: string | null;
  thumb_url: string | null;
  audio_url: string | null;
  audio_preview_url?: string | null;
  duration_sec: number | null;
  tags: string[];
  view_count: number;
  like_count: number;
  save_count: number;
  share_count: number;
  published_at: string;
  expires_at: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  liked_by_me: boolean;
  saved_by_me: boolean;
  disliked_by_me?: boolean;
  shared_by_me?: boolean;
  dislike_count?: number;
  comment_count?: number;
  trim_start_seconds?: number | null;
  trim_end_seconds?: number | null;
  genre_tags?: string[];
  ai_tool?: string | null;
  composer_name?: string | null;
  lyrics?: string | null;
  preview_start_seconds?: number | null;
  preview_end_seconds?: number | null;
  source_url?: string | null;
  link_provider?: string | null;
  is_adult?: boolean;
  trailer_url?: string | null;
  trailer_trim_start_seconds?: number | null;
  trailer_trim_end_seconds?: number | null;
}



const FEED_KEY = (section: OcultoPlaySection, kind?: OcultoPlayKind) =>
  ['oculto-play', 'feed', section, kind ?? 'all'] as const;

export function normalizeOcultoPlayItem(row: Partial<OcultoPlayItem> & Record<string, any>): OcultoPlayItem {
  const tags = Array.isArray(row.tags)
    ? row.tags
    : Array.isArray(row.genre_tags)
      ? row.genre_tags
      : [];
  return {
    id: String(row.id),
    author_id: String(row.author_id ?? ''),
    kind: (row.kind ?? 'meme') as OcultoPlayKind,
    section: (row.section ?? 'normal') as OcultoPlaySection,
    visibility: (row.visibility ?? 'public') as OcultoPlayVisibility,
    title: row.title ?? null,
    caption: row.caption ?? null,
    media_url: resolveOcultoPlayMediaUrl(row.id, row.media_url),
    thumb_url: row.thumb_url ?? null,
    audio_url: row.audio_url ?? null,
    audio_preview_url: row.audio_preview_url ?? null,
    duration_sec: row.duration_sec ?? null,
    tags,
    view_count: Number(row.view_count ?? 0),
    like_count: Number(row.like_count ?? 0),
    save_count: Number(row.save_count ?? 0),
    share_count: Number(row.share_count ?? 0),
    dislike_count: Number(row.dislike_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    published_at: row.published_at ?? row.created_at ?? new Date().toISOString(),


    expires_at: row.expires_at ?? null,
    author_username: row.author_username ?? null,
    author_display_name: row.author_display_name ?? null,
    author_avatar_url: row.author_avatar_url ?? null,
    liked_by_me: row.liked_by_me ?? false,
    saved_by_me: row.saved_by_me ?? false,
    disliked_by_me: row.disliked_by_me ?? false,
    shared_by_me: row.shared_by_me ?? false,
    trim_start_seconds: row.trim_start_seconds ?? null,
    trim_end_seconds: row.trim_end_seconds ?? null,
    genre_tags: Array.isArray(row.genre_tags) ? row.genre_tags : [],
    ai_tool: row.ai_tool ?? null,
    composer_name: row.composer_name ?? null,
    lyrics: typeof row.lyrics === 'string' ? row.lyrics : (row.lyrics ?? null),
    preview_start_seconds: row.preview_start_seconds != null ? Number(row.preview_start_seconds) : null,
    preview_end_seconds: row.preview_end_seconds != null ? Number(row.preview_end_seconds) : null,
    source_url: row.source_url ?? null,
    link_provider: row.link_provider ?? null,
    is_adult: row.is_adult === true,
    trailer_url: row.trailer_url ?? null,
    trailer_trim_start_seconds: row.trailer_trim_start_seconds != null ? Number(row.trailer_trim_start_seconds) : null,
    trailer_trim_end_seconds: row.trailer_trim_end_seconds != null ? Number(row.trailer_trim_end_seconds) : null,
  };
}


export function upsertOcultoPlayFeedItem(qc: QueryClient, raw: Partial<OcultoPlayItem> & Record<string, any>) {
  if (!raw?.id) return;
  const item = normalizeOcultoPlayItem(raw);
  const merge = (old?: OcultoPlayItem[]) => {
    const list = old ?? [];
    const next = [item, ...list.filter((it) => it.id !== item.id)]
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 1000);
    return next;
  };
  qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: FEED_KEY(item.section, undefined) }, merge);
  qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: FEED_KEY(item.section, item.kind) }, merge);
  qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: ['oculto-play', 'feed'] }, merge);
  if (item.kind === 'link' && item.section === 'normal') {
    qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: ['oculto-play', 'direct-links'] }, merge);
  }
  qc.invalidateQueries({ queryKey: ['oculto-play', 'trending-24h'] });
}

export function useOcultoPlayFeed(
  section: OcultoPlaySection = 'normal',
  kind?: OcultoPlayKind,
  limit = 20,
) {
  const { canAccess } = useOcultoPlayAccess();

  return useQuery<OcultoPlayItem[]>({
    queryKey: [...FEED_KEY(section, kind), limit] as const,
    enabled: canAccess,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_feed', {
        p_section: section,
        p_kind: kind ?? null,
        p_limit: limit,
        p_before: null,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => normalizeOcultoPlayItem(row));
    },
  });
}

export function useOcultoPlayComeback(limit = 12) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery({
    queryKey: ['oculto-play', 'comeback'] as const,
    enabled: canAccess,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_comeback', { p_limit: limit });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOcultoPlayActions() {
  const qc = useQueryClient();

  // Helper: aplica patch otimista em todos os caches de feed
  type PatchFn = (it: OcultoPlayItem) => OcultoPlayItem;
  const patchFeeds = (itemId: string, fn: PatchFn) => {
    const snaps: Array<{ key: unknown; data: OcultoPlayItem[] }> = [];
    qc.setQueriesData<OcultoPlayItem[] | undefined>(
      { queryKey: ['oculto-play', 'feed'] },
      (old) => {
        if (!old) return old;
        snaps.push({ key: ['oculto-play', 'feed'], data: old });
        return old.map((it) => (it.id === itemId ? fn(it) : it));
      },
    );
    return snaps;
  };

  const revertFeeds = () => {
    // a forma mais segura de reverter sem rastrear cada cache: invalida
    qc.invalidateQueries({ queryKey: ['oculto-play', 'feed'] });
  };

  const toggleLike = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.rpc('oculto_play_toggle_like', { p_item_id: itemId });
      if (error) throw error;
      return data as boolean;
    },
    onMutate: async (itemId: string) => {
      await qc.cancelQueries({ queryKey: ['oculto-play', 'feed'] });
      patchFeeds(itemId, (it) => ({
        ...it,
        liked_by_me: !it.liked_by_me,
        like_count: Math.max(0, (it.like_count ?? 0) + (it.liked_by_me ? -1 : 1)),
      }));
    },
    onError: (err) => {
      revertFeeds();
      toast.error('Não foi possível curtir. Tente novamente.', { description: (err as Error)?.message });
    },
    // Sem onSettled: o estado otimista é a verdade até o realtime/reactions
    // re-hidratar. Invalidar aqui causa "flash" do botão voltando ao estado
    // anterior em mobile (rede lenta) — sintoma reportado como intermitência.
  });

  const toggleDislike = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.rpc('oculto_play_toggle_dislike', { p_item_id: itemId });
      if (error) throw error;
      return data as boolean;
    },
    onMutate: async (itemId: string) => {
      await qc.cancelQueries({ queryKey: ['oculto-play', 'feed'] });
      patchFeeds(itemId, (it) => ({
        ...it,
        disliked_by_me: !it.disliked_by_me,
        dislike_count: Math.max(0, (it.dislike_count ?? 0) + (it.disliked_by_me ? -1 : 1)),
      }));
    },
    onError: (err) => {
      revertFeeds();
      toast.error('Não foi possível registrar. Tente novamente.', { description: (err as Error)?.message });
    },
  });

  const toggleSave = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.rpc('oculto_play_toggle_save', { p_item_id: itemId });
      if (error) throw error;
      return data as boolean;
    },
    onMutate: async (itemId: string) => {
      await qc.cancelQueries({ queryKey: ['oculto-play', 'feed'] });
      patchFeeds(itemId, (it) => ({
        ...it,
        saved_by_me: !it.saved_by_me,
        save_count: Math.max(0, (it.save_count ?? 0) + (it.saved_by_me ? -1 : 1)),
      }));
    },
    onError: (err) => {
      revertFeeds();
      toast.error('Não foi possível salvar. Tente novamente.', { description: (err as Error)?.message });
    },
  });

  const registerShare = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc('oculto_play_register_share', { p_item_id: itemId });
      if (error) throw error;
      return true;
    },
    onMutate: async (itemId: string) => {
      await qc.cancelQueries({ queryKey: ['oculto-play', 'feed'] });
      patchFeeds(itemId, (it) =>
        it.shared_by_me
          ? it
          : { ...it, shared_by_me: true, share_count: (it.share_count ?? 0) + 1 },
      );
    },
    onError: (err) => {
      revertFeeds();
      toast.error('Não foi possível registrar o compartilhamento.', { description: (err as Error)?.message });
    },
  });


  const registerView = useCallback(
    async (itemId: string, seconds = 0, completed = false) => {
      await supabase.rpc('oculto_play_register_view', {
        p_item_id: itemId,
        p_seconds: seconds,
        p_completed: completed,
      });
    },
    [],
  );

  // Cada execução de áudio/vídeo conta +1 (sem limite por usuário).
  // Patch otimista: incrementa view_count em todos os caches do feed
  // imediatamente para feedback instantâneo, mesmo antes do realtime chegar.
  const registerPlay = useCallback(async (itemId: string) => {
    qc.setQueriesData<OcultoPlayItem[] | undefined>(
      { queryKey: ['oculto-play', 'feed'] },
      (old) => {
        if (!old) return old;
        return old.map((it) =>
          it.id === itemId
            ? { ...it, view_count: (it.view_count ?? 0) + 1 }
            : it,
        );
      },
    );
    try {
      const { data } = await supabase.rpc('oculto_play_register_play', { p_item_id: itemId });
      // Reconcilia com o valor real do servidor, se vier
      const serverCount = typeof data === 'number' ? data : null;
      if (serverCount !== null && serverCount > 0) {
        qc.setQueriesData<OcultoPlayItem[] | undefined>(
          { queryKey: ['oculto-play', 'feed'] },
          (old) => {
            if (!old) return old;
            return old.map((it) =>
              it.id === itemId ? { ...it, view_count: serverCount } : it,
            );
          },
        );
      }
    } catch { /* noop */ }
  }, [qc]);

  const registerMovieCompletion = useCallback(async (itemId: string) => {
    try {
      const { data, error } = await supabase.rpc('oculto_play_register_movie_completion', { p_item_id: itemId });
      if (error) throw error;
      if (data === true) {
        qc.invalidateQueries({ queryKey: ['aura-achievements'] });
        try { window.dispatchEvent(new CustomEvent(AURA_QUEST_EVENT, { detail: { source: 'oculto_play_movie_completion' } })); } catch { /* noop */ }
      }
      return data === true;
    } catch {
      return false;
    }
  }, [qc]);

  const report = useMutation({
    mutationFn: async (input: { itemId: string; reason: string; details?: string }) => {
      const { data, error } = await supabase.rpc('oculto_play_report', {
        p_item_id: input.itemId,
        p_reason: input.reason,
        p_details: input.details ?? null,
      });
      if (error) throw error;
      return data as string;
    },
  });

  return { toggleLike, toggleDislike, toggleSave, registerShare, registerView, registerPlay, registerMovieCompletion, report };
}

/**
 * useOcultoPlayLiveCounts — sincroniza contadores em tempo real para uma lista
 * de itens visíveis. Hidrata dislike_count, disliked_by_me e shared_by_me que
 * não vêm no feed RPC base, e atualiza like/save/share/view ao vivo.
 */
export function useOcultoPlayLiveCounts(itemIds: string[]) {
  const qc = useQueryClient();
  const hydrateMany = useOcultoPlayCountersStore((s) => s.hydrateMany);
  const setView = useOcultoPlayCountersStore((s) => s.setView);

  const q = useQuery({
    queryKey: ['oculto-play', 'my-reactions', itemIds.slice().sort().join(',')],
    enabled: itemIds.length > 0,
    staleTime: 90_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const [rxRes, cntRes] = await Promise.all([
        supabase.rpc('oculto_play_my_reactions', { p_item_ids: itemIds }),
        supabase.rpc('oculto_play_item_counts', { p_item_ids: itemIds }),
      ]);
      const rx = (rxRes.data ?? []) as Array<{ item_id: string; liked: boolean; saved: boolean; disliked: boolean; shared: boolean }>;
      const cnt = (cntRes.data ?? []) as Array<{ item_id: string; view_count: number; like_count: number; dislike_count: number; save_count: number; share_count: number; comment_count?: number }>;
      // Hidrata o store com os contadores reais do servidor
      hydrateMany(cnt.map((c) => ({ id: c.item_id, view_count: c.view_count })));
      // patch all feed caches
      qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: ['oculto-play', 'feed'] }, (old) => {
        if (!old) return old;
        const rxMap = new Map(rx.map((r) => [r.item_id, r]));
        const cntMap = new Map(cnt.map((c) => [c.item_id, c]));
        return old.map((it) => {
          const r = rxMap.get(it.id);
          const c = cntMap.get(it.id);
          return {
            ...it,
            liked_by_me: r?.liked ?? it.liked_by_me,
            saved_by_me: r?.saved ?? it.saved_by_me,
            disliked_by_me: r?.disliked ?? it.disliked_by_me,
            shared_by_me: r?.shared ?? it.shared_by_me,
            view_count: c?.view_count ?? it.view_count,
            like_count: c?.like_count ?? it.like_count,
            dislike_count: c?.dislike_count ?? it.dislike_count,
            save_count: c?.save_count ?? it.save_count,
            share_count: c?.share_count ?? it.share_count,
            comment_count: c?.comment_count ?? it.comment_count ?? 0,
          };
        });
      });

      return true;
    },
  });

  useEffect(() => {
    if (itemIds.length === 0) return;
    const channel = supabase
      .channel(`oculto-play-counts-${itemIds.slice(0, 3).join('-')}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'oculto_play_items' },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as Partial<OcultoPlayItem> & { id: string };
          if (!itemIds.includes(row.id)) return;
          // Espelha view_count na store global (sincroniza Áudios/Vídeos)
          if (typeof row.view_count === 'number') {
            setView(row.id, row.view_count);
          }
          qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: ['oculto-play', 'feed'] }, (old) => {
            if (!old) return old;
            return old.map((it) =>
              it.id === row.id
                ? {
                    ...it,
                    view_count: row.view_count ?? it.view_count,
                    like_count: row.like_count ?? it.like_count,
                    dislike_count: row.dislike_count ?? it.dislike_count,
                    save_count: row.save_count ?? it.save_count,
                    share_count: row.share_count ?? it.share_count,
                    comment_count: (row as any).comment_count ?? it.comment_count ?? 0,
                  }
                : it,
            );

          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemIds.join(','), qc, setView]);

  return { isLoading: q.isLoading, isFetching: q.isFetching, isReady: !q.isLoading };
}


/**
 * useOcultoPlayItemLive — devolve a versão mais recente do item buscando em
 * qualquer cache de feed `['oculto-play','feed', ...]`. Garante que contagens
 * otimistas (like/dislike/save/share/comment/view) reflitam de imediato em
 * componentes que recebem o item como prop estática (ex.: OcultoPlayFocusModal).
 */
export function useOcultoPlayItemLive<T extends OcultoPlayItem | null | undefined>(
  itemId: string | null | undefined,
  fallback: T,
): T {
  const qc = useQueryClient();
  const findInCache = useCallback((): OcultoPlayItem | null => {
    if (!itemId) return null;
    const queries = qc.getQueriesData<OcultoPlayItem[] | undefined>({ queryKey: ['oculto-play', 'feed'] });
    for (const [, data] of queries) {
      if (!Array.isArray(data)) continue;
      const found = data.find((it) => it && it.id === itemId);
      if (found) return found;
    }
    return null;
  }, [qc, itemId]);

  const [live, setLive] = useState<OcultoPlayItem | null>(() => findInCache());

  useEffect(() => {
    if (!itemId) { setLive(null); return; }
    setLive(findInCache());
    const cache = qc.getQueryCache();
    let cancelled = false;
    let scheduled = false;
    const applyLatest = () => {
      scheduled = false;
      if (cancelled) return;
      const next = findInCache();
      setLive((prev) => {
        if (prev === next) return prev;
        // shallow-compare campos relevantes para evitar re-render desnecessário
        if (prev && next
          && prev.like_count === next.like_count
          && prev.dislike_count === next.dislike_count
          && prev.save_count === next.save_count
          && prev.share_count === next.share_count
          && prev.comment_count === next.comment_count
          && prev.view_count === next.view_count
          && prev.liked_by_me === next.liked_by_me
          && prev.disliked_by_me === next.disliked_by_me
          && prev.saved_by_me === next.saved_by_me
          && prev.shared_by_me === next.shared_by_me
        ) return prev;
        return next;
      });
    };
    const unsub = cache.subscribe(() => {
      // React Query pode notificar durante o render de um filho que usa useQuery
      // (ex.: botão de coleção). Adiamos para microtask para evitar update no
      // modal durante render e remover jank/piscadas do player.
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(applyLatest);
    });
    return () => { cancelled = true; unsub(); };
  }, [itemId, qc, findInCache]);

  if (!fallback) return fallback;
  if (!live) return fallback;
  // Merge: prioriza dados live do cache; mantém campos do fallback que não vieram
  return { ...fallback, ...live } as T;
}





// Upload helper — usa bucket dedicado 'oculto-play-media'
// Reaproveita a normalização de Content-Type + retry com backoff do helper XHR.
import {
  uploadOcultoPlayFileProgress,
  normalizeUploadContentType,
} from '@/hooks/useOcultoPlayUpload';

export async function uploadOcultoPlayFile(
  file: File,
  userId: string,
  folder: 'video' | 'image' | 'audio' = 'image',
): Promise<{ publicUrl: string; path: string }> {
  // Delegamos para o helper com progresso (que já faz retry + normaliza MIME).
  // Mantemos a assinatura legada para não quebrar chamadores.
  void normalizeUploadContentType; // garante tree-shake-safe import
  return uploadOcultoPlayFileProgress(file, userId, folder, file.name);
}
