/**
 * useOcultoPlayPersonalMix — Etapa 30.
 * Mix Surpresa: itens personalizados pelas curtidas + frescor,
 * excluindo o que o usuário já viu.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface PersonalMixItem {
  id: string;
  kind: string;
  title: string | null;
  thumb_url: string | null;
  media_url: string | null;
  view_count: number;
  like_count: number;
  author_id: string | null;
  affinity: number;
  created_at: string;
}

export function useOcultoPlayPersonalMix(limit = 12) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['oculto-play', 'personal-mix', user?.id, limit],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PersonalMixItem[]> => {
      const { data, error } = await supabase.rpc(
        'oculto_play_personal_mix' as never,
        { p_user_id: user!.id, p_limit: limit } as never,
      );
      if (error || !data) return [];
      return (data as any[]).map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        thumb_url: r.thumb_url,
        media_url: r.media_url,
        view_count: Number(r.view_count ?? 0),
        like_count: Number(r.like_count ?? 0),
        author_id: r.author_id,
        affinity: Number(r.affinity ?? 0),
        created_at: r.created_at,
      }));
    },
  });
}
