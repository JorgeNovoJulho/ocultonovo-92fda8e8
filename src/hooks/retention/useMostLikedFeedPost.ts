/**
 * useMostLikedFeedPost — retorna a postagem do feed com mais curtidas
 * (humanos, não bot, não oculta) das últimas 7 dias. Atualiza em tempo
 * real via realtimeBus quando posts mudam (likes_count, novos posts,
 * remoções). Usado pelo card "Postagem mais curtida" da Central Aura IA.
 *
 * Decoupled author: busca o perfil separado por user_id (memory:
 * Decoupled Author Feed) e mapeia para author_id no consumidor.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

const sb = supabase as any;

export interface MostLikedFeedPost {
  id: string;
  user_id: string;
  likes_count: number;
  content_text: string | null;
  thumbnail_url: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  author: {
    user_id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
}

const KEY = ['retention', 'most-liked-feed-post'] as const;

export function useMostLikedFeedPost() {
  const qc = useQueryClient();

  // Invalida quando qualquer post sofre UPDATE/INSERT/DELETE — janela de 7 dias
  // é pequena o suficiente para o refetch ser barato (single row).
  useEffect(() => {
    const unsub = subscribeTable(
      'posts',
      () => qc.invalidateQueries({ queryKey: KEY }),
      { events: ['INSERT', 'UPDATE', 'DELETE'] },
    );
    return () => { try { unsub?.(); } catch { /* noop */ } };
  }, [qc]);

  return useQuery<MostLikedFeedPost | null>({
    queryKey: KEY,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: posts, error } = await sb
        .from('posts')
        .select('id,user_id,likes_count,content_text,thumbnail_url,media_url,media_type,created_at,is_seed,is_hidden,is_flash,privacy_level,created_at')
        .eq('is_seed', false)
        .eq('is_hidden', false)
        .eq('is_flash', false)
        .in('privacy_level', ['public'])
        .gte('created_at', since)
        .gt('likes_count', 0)
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      if (error || !posts?.length) return null;
      const p = posts[0] as any;

      // Resolve autor por user_id
      const { data: prof } = await sb
        .from('profiles')
        .select('user_id,username,name,avatar_url')
        .eq('user_id', p.user_id)
        .maybeSingle();

      return {
        id: p.id,
        user_id: p.user_id,
        likes_count: Number(p.likes_count || 0),
        content_text: p.content_text ?? null,
        thumbnail_url: p.thumbnail_url ?? null,
        media_url: p.media_url ?? null,
        media_type: p.media_type ?? null,
        created_at: p.created_at,
        author: prof
          ? {
              user_id: (prof as any).user_id,
              username: (prof as any).username ?? null,
              name: (prof as any).name ?? null,
              avatar_url: (prof as any).avatar_url ?? null,
            }
          : null,
      };
    },
  });
}
