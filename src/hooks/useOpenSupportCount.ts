import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';

const QUERY_KEY = ['open-support-count'];

export function useOpenSupportCount(enabled: boolean = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user && enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeTable('support_tickets', () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    });
    return () => unsub();
  }, [user, queryClient]);

  return count;
}
