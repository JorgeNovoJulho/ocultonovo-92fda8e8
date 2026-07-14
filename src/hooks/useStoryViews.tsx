import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";

export interface StoryViewer {
  viewer_id: string;
  viewed_at: string;
  viewer: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    is_verified_couple: boolean;
    plan_type: string;
  } | null;
}

/**
 * Hook para buscar visualizadores de um story (apenas o dono).
 * Usa RPC SECURITY DEFINER que valida ownership e devolve perfis enriquecidos.
 */
export function useStoryViews(storyId: string | null) {
  return useQuery({
    queryKey: ['story-views', storyId],
    queryFn: async (): Promise<StoryViewer[]> => {
      if (!storyId) return [];

      const { data, error } = await (supabase as any).rpc('story_viewers_for_owner', {
        p_story_id: storyId,
      });

      if (error) {
        console.error('[useStoryViews] RPC error:', error);
        return [];
      }

      return ((data || []) as any[]).map((row) => ({
        viewer_id: row.viewer_profile_id,
        viewed_at: row.viewed_at,
        viewer: {
          id: row.viewer_profile_id,
          name: row.name,
          username: row.username,
          avatar_url: row.avatar_url,
          is_verified: !!row.is_verified,
          is_verified_couple: !!row.is_verified_couple,
          plan_type: row.plan_type || 'free',
        },
      })) as StoryViewer[];
    },
    enabled: !!storyId,
    staleTime: 60_000,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook para contar visualizações de um story (usa RPC, bypass de RLS para counts reais).
 */
export function useStoryViewCount(storyId: string | null) {
  return useQuery({
    queryKey: ['story-view-count', storyId],
    queryFn: async (): Promise<number> => {
      if (!storyId) return 0;

      const { data, error } = await (supabase as any).rpc('story_metrics_get', {
        p_story_id: storyId,
      });

      if (error) {
        console.error('[useStoryViewCount] RPC error:', error);
        return 0;
      }

      return Number(data?.[0]?.view_count ?? 0);
    },
    enabled: !!storyId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Hook para verificar se o usuário atual é o dono do story
 */
export function useIsStoryOwner(storyAuthorId: string | null) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['is-story-owner', storyAuthorId, user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!storyAuthorId || !user?.id) return false;

      // Buscar o profile_id do usuário atual
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      return profile?.id === storyAuthorId;
    },
    enabled: !!storyAuthorId && !!user?.id,
  });
}
