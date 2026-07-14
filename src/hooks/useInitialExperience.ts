/**
 * useInitialExperience — busca tips/CTAs do banco filtrados por nível do usuário.
 * Sem PII, sem realtime, cache 5 min. RPC: initial_experience_items().
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type EngagementLevel = 'new' | 'engaged' | 'premium' | 'vip';

export interface InitialExperienceItem {
  id: string;
  kind: 'tip' | 'cta' | 'toggle';
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_route: string | null;
  icon: string | null;
  hue: number;
  sort_order: number;
}

export function useEngagementLevel() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['engagement-level', user?.id ?? 'anon'],
    queryFn: async (): Promise<EngagementLevel> => {
      const { data } = await (supabase as any).rpc('user_engagement_level_get', { p_user_id: user?.id ?? null });
      return ((data as EngagementLevel) ?? 'new');
    },
    staleTime: 5 * 60_000,
  });
}

export function useInitialExperienceItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['initial-experience-items', user?.id ?? 'anon'],
    queryFn: async (): Promise<InitialExperienceItem[]> => {
      const { data } = await (supabase as any).rpc('initial_experience_items');
      return (data ?? []) as InitialExperienceItem[];
    },
    staleTime: 5 * 60_000,
  });
}
