/**
 * useOcultoPlayDerived — Etapa 7
 *
 * Filtros derivados do feed Play SEM tocar no banco:
 *   - 'following' → pega o feed 'normal' e mantém apenas autores que o
 *     usuário atual segue (lookup em `follows`/`oculto_follows` com fallback).
 *   - 'trending'  → pega o feed 'normal' e ordena por
 *     (like_count*3 + save_count*4 + share_count*5 + view_count*0.1),
 *     mantendo os 30 mais "quentes".
 *
 * Mantém RAM baixa: roda em memória sobre o resultado já cacheado.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';
import { useOcultoPlayFeed, type OcultoPlayItem } from './useOcultoPlayContent';
import { useOcultoPlayTrending24h } from './useOcultoPlayTrending24h';

export type DerivedSection = 'following' | 'trending';

function useFollowedAuthorIds() {
  const { user } = useAuth();
  const { canAccess } = useOcultoPlayAccess();

  return useQuery<Set<string>>({
    queryKey: ['oculto-play', 'following-ids-v2', user?.id ?? 'anon'],
    enabled: !!user?.id && canAccess,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out = new Set<string>();
      const followedUserIds = new Set<string>();

      // Tentativa 1: tabela canônica `follows` (follower_id → following_id)
      const { data: d1 } = await (supabase as any)
        .from('follows')
        .select('following_id')
        .eq('follower_id', user!.id);
      (d1 ?? []).forEach((r: any) => r?.following_id && followedUserIds.add(String(r.following_id)));

      // Tentativa 2: fallback antigo `oculto_follows`
      if (followedUserIds.size === 0) {
        const { data: d2 } = await (supabase as any)
          .from('oculto_follows')
          .select('following_id')
          .eq('follower_id', user!.id);
        (d2 ?? []).forEach((r: any) => r?.following_id && followedUserIds.add(String(r.following_id)));
      }

      if (followedUserIds.size === 0) return out;

      // Inclui tanto os ids brutos (caso author_id já seja user_id)
      // quanto o profile.id correspondente (caso author_id seja profile.id).
      const ids = Array.from(followedUserIds);
      ids.forEach((id) => out.add(id));
      try {
        const { data: profs } = await (supabase as any)
          .from('profiles')
          .select('id, user_id')
          .in('user_id', ids);
        (profs ?? []).forEach((p: any) => {
          if (p?.id) out.add(String(p.id));
          if (p?.user_id) out.add(String(p.user_id));
        });
      } catch { /* noop */ }

      return out;
    },
  });
}


export function useOcultoPlayDerivedFeed(section: DerivedSection) {
  // Base = feed normal (já passa pelo gate). Usado para 'following' e como
  // dicionário para hidratar campos faltantes do RPC de trending.
  const base = useOcultoPlayFeed('normal', undefined, 80);
  const { data: followedIds } = useFollowedAuthorIds();
  const trending = useOcultoPlayTrending24h();

  const items = useMemo<OcultoPlayItem[]>(() => {
    const all = base.data ?? [];
    if (section === 'following') {
      if (!followedIds || followedIds.size === 0) return [];
      return all.filter((i) => followedIds.has(String(i.author_id)));
    }
    // trending: usa o ranking real (views_24h + likes_24h*3) vindo do RPC.
    const map = new Map(all.map((i) => [i.id, i]));
    return (trending.data ?? []).map((t) => {
      const merged = { ...(map.get(t.id) ?? {}), ...t } as unknown as OcultoPlayItem;
      return merged;
    });
  }, [base.data, followedIds, section, trending.data]);

  const isLoading = section === 'trending'
    ? (trending.loading || base.isLoading)
    : base.isLoading;

  return {
    data: items,
    isLoading,
    refetch: () => { base.refetch(); trending.refetch(); },
    isEmpty: !isLoading && items.length === 0,
  };
}
