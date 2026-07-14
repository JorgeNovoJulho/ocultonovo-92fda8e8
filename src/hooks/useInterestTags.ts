/**
 * useInterestTags — fonte única das tags de interesse (social/+18).
 *
 * - Lê public.oculto_interest_tags (Supabase externo).
 * - Realtime: invalida o cache assim que o admin cria/edita/remove tags.
 * - Fallback: se o banco vier vazio (ex.: SQL ainda não executado),
 *   usa as constantes de src/data/tagsData.ts para não quebrar o cadastro.
 *
 * Configurado em /admin/interest-tags pelo admin master.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import {
  SOCIAL_TAGS,
  ADULT_TAGS,
  SOCIAL_TAG_ICONS,
  ADULT_TAG_ICONS,
} from '@/data/tagsData';

export type InterestTagKind = 'social' | 'adult';

export interface InterestTagRow {
  id: string;
  kind: InterestTagKind;
  name: string;
  icon: string | null;
  position: number;
  is_active: boolean;
}

export interface UseInterestTags {
  isLoading: boolean;
  socialTags: string[];
  adultTags: string[];
  socialIcons: Record<string, string>;
  adultIcons: Record<string, string>;
}

export function useInterestTags(opts: { onlyActive?: boolean } = {}): UseInterestTags {
  const { onlyActive = true } = opts;
  const qc = useQueryClient();

  const query = useQuery<InterestTagRow[]>({
    queryKey: ['interest-tags', onlyActive],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('oculto_interest_tags' as never)
        .select('id,kind,name,icon,position,is_active')
        .order('position', { ascending: true })
        .order('name', { ascending: true });
      if (onlyActive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as InterestTagRow[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel('oculto_interest_tags-rt')
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'oculto_interest_tags' } as never,
        () => {
          qc.invalidateQueries({ queryKey: ['interest-tags'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useMemo(() => {
    const rows = query.data ?? [];
    const dbSocial = rows.filter((r) => r.kind === 'social');
    const dbAdult = rows.filter((r) => r.kind === 'adult');

    const socialTags = dbSocial.length
      ? dbSocial.map((r) => r.name)
      : ([...SOCIAL_TAGS] as string[]);
    const adultTags = dbAdult.length
      ? dbAdult.map((r) => r.name)
      : ([...ADULT_TAGS] as string[]);

    const socialIcons: Record<string, string> = { ...SOCIAL_TAG_ICONS };
    for (const r of dbSocial) socialIcons[r.name] = r.icon || socialIcons[r.name] || '🏷️';

    const adultIcons: Record<string, string> = { ...ADULT_TAG_ICONS };
    for (const r of dbAdult) adultIcons[r.name] = r.icon || adultIcons[r.name] || '🔥';

    return {
      isLoading: query.isLoading,
      socialTags,
      adultTags,
      socialIcons,
      adultIcons,
    };
  }, [query.data, query.isLoading]);
}
