/**
 * useOcultoPlayCategories — lê oculto_play_categories (Etapa 2 incremental).
 * Apenas categorias ativas, ordenadas por position.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export type OcultoPlayCategory = {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
  is_adult: boolean;
  is_active: boolean;
  position: number;
};

export function useOcultoPlayCategories(opts: { onlyActive?: boolean } = {}) {
  const { onlyActive = true } = opts;
  return useQuery({
    queryKey: ['oculto-play-categories', onlyActive],
    queryFn: async () => {
      let q = supabase
        .from('oculto_play_categories' as never)
        .select('id, slug, label, icon, is_adult, is_active, position')
        .order('position', { ascending: true });
      if (onlyActive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OcultoPlayCategory[];
    },
    staleTime: 60_000,
  });
}
