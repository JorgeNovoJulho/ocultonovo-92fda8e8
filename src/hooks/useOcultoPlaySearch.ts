/**
 * useOcultoPlaySearch — busca leve dentro do OCULTO PLAY.
 *
 * Reaproveita o RPC `oculto_play_feed` (cached, gateado por can_access_oculto_play)
 * e filtra em memória por título / composer_name / autor / tags.
 * Limite alto (200) garante cobertura sem custo extra de paint.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';
import type { OcultoPlayItem } from './useOcultoPlayContent';

const norm = (s: string | null | undefined) =>
  (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function matches(item: OcultoPlayItem, q: string): boolean {
  if (!q) return false;
  const haystacks = [
    item.title,
    item.caption,
    item.composer_name,
    item.author_username,
    item.author_display_name,
    ...(item.tags || []),
    ...((item as any).genre_tags || []),
    item.ai_tool ?? null,
  ];
  return haystacks.some((h) => norm(h).includes(q));
}

export function useOcultoPlaySearch(query: string, limit = 8) {
  const { canAccess } = useOcultoPlayAccess();
  const q = norm(query);

  const enabled = canAccess && q.length >= 2;

  const { data } = useQuery<OcultoPlayItem[]>({
    queryKey: ['oculto-play', 'search-pool'],
    enabled: canAccess,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_feed', {
        p_section: 'normal',
        p_kind: null,
        p_limit: 200,
        p_before: null,
      });
      if (error) throw error;
      return (data ?? []) as OcultoPlayItem[];
    },
  });

  const results = useMemo(() => {
    if (!enabled || !data) return [] as OcultoPlayItem[];
    return data.filter((it) => matches(it, q)).slice(0, limit);
  }, [data, enabled, q, limit]);

  return { results, enabled };
}
