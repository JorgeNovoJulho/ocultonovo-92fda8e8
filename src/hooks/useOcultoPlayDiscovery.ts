/**
 * useOcultoPlayDiscovery — Etapa 8
 *
 * Hooks leves para "anunciar" o PLAY em outras superfícies da plataforma
 * (Stories rail e Comunidades) sem vazar conteúdo pra quem não tem acesso.
 *
 * Tudo passa pelo gate `useOcultoPlayAccess()` — se não pode ver, retorna
 * false/[].
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from './useOcultoPlayAccess';

export function useOcultoPlayHasRecent(hours = 24) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<boolean>({
    queryKey: ['oculto-play', 'has-recent', hours],
    enabled: canAccess,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_has_recent', { p_hours: hours });
      if (error) return false;
      return !!data;
    },
  });
}

export interface CommunityPlayItem {
  id: string;
  author_id: string;
  kind: string;
  title: string | null;
  caption: string | null;
  media_url: string | null;
  thumb_url: string | null;
  duration_sec: number | null;
  view_count: number;
  like_count: number;
  published_at: string;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
}

export function useOcultoPlayForCommunity(communityId: string | null | undefined, limit = 8) {
  const { canAccess } = useOcultoPlayAccess();
  return useQuery<CommunityPlayItem[]>({
    queryKey: ['oculto-play', 'community', communityId ?? 'none', limit],
    enabled: canAccess && !!communityId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_for_community', {
        p_community_id: communityId,
        p_limit: limit,
      });
      if (error) return [];
      return (data ?? []) as CommunityPlayItem[];
    },
  });
}
