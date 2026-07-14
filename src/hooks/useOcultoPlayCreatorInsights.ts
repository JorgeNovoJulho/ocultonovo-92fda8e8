/**
 * useOcultoPlayCreatorInsights — Etapa 9
 *
 * Painel pessoal do criador: agrega views/likes/saves/shares do que ele
 * publicou no PLAY, série diária e top itens.
 * Tudo passa pelo gate `can_access_oculto_play()` — sem acesso, vazio.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';

export interface PlayCreatorSummary {
  total_items: number;
  total_views: number;
  total_likes: number;
  total_saves: number;
  total_shares: number;
  items_last_24h: number;
  top_item_id: string | null;
  top_item_title: string | null;
  top_item_views: number;
}

export interface PlayCreatorDaily {
  day: string;
  views: number;
  likes: number;
  saves: number;
  items: number;
}

export interface PlayCreatorTopItem {
  id: string;
  kind: string;
  title: string | null;
  thumb_url: string | null;
  media_url: string | null;
  view_count: number;
  like_count: number;
  save_count: number;
  share_count: number;
  published_at: string;
}

const toNum = (v: unknown) => (typeof v === 'string' ? Number(v) : (v as number)) || 0;

export function useOcultoPlayCreatorSummary(days = 14) {
  const { user } = useAuth();
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<PlayCreatorSummary | null>({
    queryKey: ['oculto-play', 'creator-summary', user?.id ?? 'anon', days],
    enabled: canAccess && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_creator_summary', { p_days: days });
      if (error || !data || !Array.isArray(data) || data.length === 0) return null;
      const r = data[0] as any;
      return {
        total_items: toNum(r.total_items),
        total_views: toNum(r.total_views),
        total_likes: toNum(r.total_likes),
        total_saves: toNum(r.total_saves),
        total_shares: toNum(r.total_shares),
        items_last_24h: toNum(r.items_last_24h),
        top_item_id: r.top_item_id ?? null,
        top_item_title: r.top_item_title ?? null,
        top_item_views: toNum(r.top_item_views),
      };
    },
  });
}

export function useOcultoPlayCreatorDaily(days = 14) {
  const { user } = useAuth();
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<PlayCreatorDaily[]>({
    queryKey: ['oculto-play', 'creator-daily', user?.id ?? 'anon', days],
    enabled: canAccess && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_creator_daily', { p_days: days });
      if (error) return [];
      return ((data ?? []) as any[]).map((r) => ({
        day: r.day,
        views: toNum(r.views),
        likes: toNum(r.likes),
        saves: toNum(r.saves),
        items: toNum(r.items),
      }));
    },
  });
}

export function useOcultoPlayCreatorTop(limit = 6) {
  const { user } = useAuth();
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<PlayCreatorTopItem[]>({
    queryKey: ['oculto-play', 'creator-top', user?.id ?? 'anon', limit],
    enabled: canAccess && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_creator_top', { p_limit: limit });
      if (error) return [];
      return (data ?? []) as PlayCreatorTopItem[];
    },
  });
}
