/**
 * useSlideGuide — busca override de conteúdo do "Saiba mais" no Supabase externo.
 * Fallback silencioso para o guide hard-coded no SlideInfoDialog.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface SlideGuideOverride {
  slug: string;
  title?: string | null;
  intro?: string | null;
  steps?: string[] | null;
  tip?: string | null;
  faq?: { q: string; a: string }[] | null;
  cta_label?: string | null;
  cta_route?: string | null;
  is_published?: boolean;
}

export function useSlideGuide(slug: string | null | undefined) {
  return useQuery<SlideGuideOverride | null>({
    queryKey: ['slide-guide', slug],
    enabled: !!slug,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc('slide_guide_get', { p_slug: slug });
        if (error || !data) return null;
        return data as SlideGuideOverride;
      } catch {
        return null;
      }
    },
  });
}

/** Lista completa — somente master admin. */
export function useSlideGuidesAdmin() {
  return useQuery<SlideGuideOverride[]>({
    queryKey: ['slide-guides-admin'],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('slide_guides_list_admin');
      if (error) throw error;
      return (data ?? []) as SlideGuideOverride[];
    },
  });
}
