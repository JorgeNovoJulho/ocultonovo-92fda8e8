/**
 * useOcultoPlayReactions — Etapa 34
 *
 * Hook para reações rápidas (emoji) por item do Oculto Play.
 * - `useItemReactions(itemId)`: leitura + toggle de uma reação para um item.
 * - `useBatchReactions(itemIds)`: leitura em lote para strips/feed.
 *
 * IMPORTANTE: usa exclusivamente o Supabase EXTERNO via @/lib/supabaseExternal.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type PlayEmoji = 'heart' | 'fire' | 'wow' | 'clap' | 'laugh';

export const PLAY_EMOJI_META: Record<PlayEmoji, { glyph: string; label: string }> = {
  heart: { glyph: '❤️', label: 'Amei' },
  fire:  { glyph: '🔥', label: 'Fogo' },
  wow:   { glyph: '😮', label: 'Uau' },
  clap:  { glyph: '👏', label: 'Aplausos' },
  laugh: { glyph: '😂', label: 'Risos' },
};

export const PLAY_EMOJI_ORDER: PlayEmoji[] = ['heart', 'fire', 'wow', 'clap', 'laugh'];

export interface ReactionRow {
  emoji: PlayEmoji;
  count: number;
  mine: boolean;
}

interface BatchRow extends ReactionRow {
  item_id: string;
}

/** Reações de um item específico. */
export function useItemReactions(itemId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['oculto-play-reactions', 'item', itemId],
    enabled: !!itemId,
    staleTime: 30_000,
    queryFn: async (): Promise<ReactionRow[]> => {
      if (!itemId) return [];
      const { data, error } = await (supabase as any).rpc('oculto_play_reactions_for_items', {
        p_item_ids: [itemId],
      });
      if (error) {
        console.warn('[reactions] fetch error', error.message);
        return [];
      }
      return ((data as BatchRow[]) || []).map(r => ({
        emoji: r.emoji as PlayEmoji,
        count: Number(r.count) || 0,
        mine: !!r.mine,
      }));
    },
  });

  const toggle = useMutation({
    mutationFn: async (emoji: PlayEmoji): Promise<ReactionRow[]> => {
      if (!itemId) return [];
      if (!user?.id) throw new Error('not-authenticated');
      const { data, error } = await (supabase as any).rpc('oculto_play_react', {
        p_item_id: itemId,
        p_emoji: emoji,
      });
      if (error) throw error;
      return ((data as ReactionRow[]) || []).map(r => ({
        emoji: r.emoji as PlayEmoji,
        count: Number(r.count) || 0,
        mine: !!r.mine,
      }));
    },
    // Optimistic: toggle imediato local
    onMutate: async (emoji) => {
      if (!itemId) return;
      await qc.cancelQueries({ queryKey: ['oculto-play-reactions', 'item', itemId] });
      const prev = qc.getQueryData<ReactionRow[]>(['oculto-play-reactions', 'item', itemId]) || [];
      const map = new Map<PlayEmoji, ReactionRow>();
      for (const r of prev) map.set(r.emoji, { ...r });
      const cur = map.get(emoji);
      if (cur) {
        if (cur.mine) {
          cur.count = Math.max(0, cur.count - 1);
          cur.mine = false;
          if (cur.count === 0) map.delete(emoji);
          else map.set(emoji, cur);
        } else {
          cur.count += 1;
          cur.mine = true;
          map.set(emoji, cur);
        }
      } else {
        map.set(emoji, { emoji, count: 1, mine: true });
      }
      const next = Array.from(map.values()).sort((a, b) => b.count - a.count);
      qc.setQueryData(['oculto-play-reactions', 'item', itemId], next);
      return { prev };
    },
    onError: (_e, _emoji, ctx) => {
      if (itemId && ctx?.prev) {
        qc.setQueryData(['oculto-play-reactions', 'item', itemId], ctx.prev);
      }
      toast.error('Não consegui registrar sua reação.');
    },
    onSuccess: (data) => {
      if (!itemId) return;
      qc.setQueryData(['oculto-play-reactions', 'item', itemId], data);
    },
  });

  return {
    reactions: query.data || [],
    loading: query.isLoading,
    toggle,
  };
}

/** Leitura em lote (strip/feed). Mapa itemId → ReactionRow[]. */
export function useBatchReactions(itemIds: string[]) {
  const key = useMemo(() => [...new Set(itemIds)].sort().join(','), [itemIds]);

  const query = useQuery({
    queryKey: ['oculto-play-reactions', 'batch', key],
    enabled: itemIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, ReactionRow[]>> => {
      const ids = [...new Set(itemIds)];
      if (!ids.length) return new Map();
      const { data, error } = await (supabase as any).rpc('oculto_play_reactions_for_items', {
        p_item_ids: ids,
      });
      if (error) {
        console.warn('[reactions/batch] error', error.message);
        return new Map();
      }
      const out = new Map<string, ReactionRow[]>();
      for (const r of (data as BatchRow[]) || []) {
        const list = out.get(r.item_id) || [];
        list.push({ emoji: r.emoji as PlayEmoji, count: Number(r.count) || 0, mine: !!r.mine });
        out.set(r.item_id, list);
      }
      return out;
    },
  });

  const get = useCallback(
    (id: string): ReactionRow[] => query.data?.get(id) || [],
    [query.data],
  );

  return { get, loading: query.isLoading };
}

/** Admin: totais por emoji nos últimos N dias. */
export function useAdminReactions(days = 7) {
  return useQuery({
    queryKey: ['oculto-play-admin-reactions', days],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('oculto_play_admin_reactions', {
        p_days: days,
      });
      if (error) throw error;
      return ((data as Array<{ emoji: PlayEmoji; total: number; distinct_items: number; distinct_users: number }>) || []).map(r => ({
        emoji: r.emoji,
        total: Number(r.total) || 0,
        distinct_items: Number(r.distinct_items) || 0,
        distinct_users: Number(r.distinct_users) || 0,
      }));
    },
  });
}
