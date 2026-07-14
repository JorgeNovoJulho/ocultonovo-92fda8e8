import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useProfile } from './useProfile';

export type FeedPlan = 'free' | 'premium' | 'vip';

export interface FeedSettingsRow {
  id: string;
  plan_type: FeedPlan;
  is_enabled: boolean;
  show_all: boolean;
  max_posts: number;
  start_date: string | null;
  updated_at: string;
  updated_by: string | null;
}

const DEFAULTS: Record<FeedPlan, Omit<FeedSettingsRow, 'id' | 'updated_at' | 'updated_by'>> = {
  free:    { plan_type: 'free',    is_enabled: true, show_all: false, max_posts: 100,  start_date: null },
  premium: { plan_type: 'premium', is_enabled: true, show_all: true,  max_posts: 500,  start_date: null },
  vip:     { plan_type: 'vip',     is_enabled: true, show_all: true,  max_posts: 1000, start_date: null },
};

/** Lê todas as configurações (uso administrativo). */
export function useAllFeedSettings() {
  return useQuery({
    queryKey: ['feed-settings', 'all'],
    queryFn: async (): Promise<FeedSettingsRow[]> => {
      const { data, error } = await (supabase as any)
        .from('feed_settings')
        .select('id,plan_type,is_enabled,show_all,max_posts,start_date,updated_at,updated_by')
        .order('plan_type');
      if (error) {
        console.warn('[feed_settings] read error', error);
        return Object.values(DEFAULTS) as FeedSettingsRow[];
      }
      return (data as FeedSettingsRow[]) || [];
    },
    staleTime: 60_000,
  });
}

/** Lê a configuração efetiva para o plano atual do usuário. */
export function useFeedSettings() {
  const { profile } = useProfile();
  const plan: FeedPlan = (profile?.plan_type as FeedPlan) || 'free';

  return useQuery({
    queryKey: ['feed-settings', plan],
    queryFn: async (): Promise<FeedSettingsRow> => {
      const { data, error } = await (supabase as any)
        .from('feed_settings')
        .select('id,plan_type,is_enabled,show_all,max_posts,start_date,updated_at,updated_by')
        .eq('plan_type', plan)
        .maybeSingle();

      if (error || !data) {
        return { id: '', updated_at: new Date().toISOString(), updated_by: null, ...DEFAULTS[plan] } as FeedSettingsRow;
      }
      return data as FeedSettingsRow;
    },
    staleTime: 60_000,
  });
}

/** Atualiza configuração (somente admin master via RLS). */
export function useUpdateFeedSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<FeedSettingsRow> & { plan_type: FeedPlan }) => {
      const { data, error } = await (supabase as any)
        .from('feed_settings')
        .update({
          is_enabled: payload.is_enabled,
          show_all: payload.show_all,
          max_posts: payload.max_posts,
          start_date: payload.start_date,
          updated_at: new Date().toISOString(),
        })
        .eq('plan_type', payload.plan_type)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed-settings'] });
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
