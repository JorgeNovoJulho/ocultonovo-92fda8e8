/**
 * useOcultoPlayMovieGenres — catálogo global de gêneros personalizados
 * para Filmes (cards de link) no Oculto Play. Persistido no Supabase
 * externo, compartilhado entre TODOS os usuários.
 *
 * Suporta dois catálogos independentes:
 *  - 'normal' (padrão) — gêneros para filmes comuns
 *  - 'adult'  — gêneros exclusivos da seção +18
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface MovieGenre {
  id: string;
  name: string;
  slug: string;
  usage_count: number;
  created_at: string;
  is_adult?: boolean;
}

export type MovieGenreVariant = 'normal' | 'adult';

const baseKey = (variant: MovieGenreVariant) => ['oculto-play', 'movie-genres', variant];
const LOCAL_CACHE = (variant: MovieGenreVariant) =>
  variant === 'adult'
    ? 'ocultoplay:link:custom-genres-adult:v1'
    : 'ocultoplay:link:custom-genres:v1';

export function useOcultoPlayMovieGenres(variant: MovieGenreVariant = 'normal') {
  const qc = useQueryClient();
  const isAdult = variant === 'adult';

  const query = useQuery<MovieGenre[]>({
    queryKey: baseKey(variant),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('oculto_play_movie_genres' as never)
        .select('*')
        .eq('is_adult', isAdult)
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MovieGenre[];
    },
  });

  // Realtime: novas tags criadas por outros usuários aparecem na hora.
  useEffect(() => {
    const ch = supabase
      .channel(`oculto_play_movie_genres_rt_${variant}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_play_movie_genres' },
        () => qc.invalidateQueries({ queryKey: baseKey(variant) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, variant]);

  // Cache local (lista de nomes) — fallback offline.
  useEffect(() => {
    if (query.data) {
      try {
        localStorage.setItem(
          LOCAL_CACHE(variant),
          JSON.stringify(query.data.map((g) => g.name)),
        );
      } catch { /* noop */ }
    }
  }, [query.data, variant]);

  return query;
}

export function useUpsertMovieGenre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { name: string; variant?: MovieGenreVariant }) => {
      const name = typeof input === 'string' ? input : input.name;
      const variant: MovieGenreVariant = typeof input === 'string' ? 'normal' : (input.variant ?? 'normal');
      const isAdult = variant === 'adult';
      // Tenta a RPC v2 (com flag); se ainda não existir no banco, cai para a v1.
      const v2 = await supabase.rpc(
        'oculto_play_upsert_movie_genre_v2' as never,
        { p_name: name, p_is_adult: isAdult } as never,
      );
      if (!v2.error) return v2.data as MovieGenre;
      const v1 = await supabase.rpc(
        'oculto_play_upsert_movie_genre' as never,
        { p_name: name } as never,
      );
      if (v1.error) throw v1.error;
      return v1.data as MovieGenre;
    },
    onSuccess: (row) => {
      const variant: MovieGenreVariant = row?.is_adult ? 'adult' : 'normal';
      qc.setQueryData<MovieGenre[] | undefined>(baseKey(variant), (old) => {
        const list = old ? [...old] : [];
        if (!list.some((g) => g.slug === row.slug)) list.unshift(row);
        return list;
      });
      qc.invalidateQueries({ queryKey: baseKey(variant) });
    },
  });
}

/** Lê o cache local (sobrevive sem rede). */
export function readLocalMovieGenresCache(variant: MovieGenreVariant = 'normal'): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CACHE(variant)) || '[]');
  } catch {
    return [];
  }
}
