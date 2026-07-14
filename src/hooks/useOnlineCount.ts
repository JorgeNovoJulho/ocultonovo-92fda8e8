import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useOnlineCounterStore } from '@/store/useOnlineCounterStore';
import { isMasterUsernameVariant } from '@/lib/masterUsername';

const ONLINE_WINDOW_SECONDS = 2 * 60; // 2 minutos — alinhado a isReallyOnline()
const QUERY_KEY = ['online-count-real'];

/**
 * Conta usuários REALMENTE online no banco externo.
 * Sincroniza o resultado com o useOnlineCounterStore (Zustand).
 */
export function useOnlineCount(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const isEnabled = options?.enabled ?? true;
  const { setCount, setInitialized } = useOnlineCounterStore();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<number> => {
      try {
        const cutoff = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000).toISOString();
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('id, username')
          .eq('is_online', true)
          .gte('last_seen', cutoff)
          .or('is_seed.is.null,is_seed.eq.false')
          .or('is_test_account.is.null,is_test_account.eq.false');

        if (error) {
          // Fallback se last_seen não existir no schema
          if ((error as any).code === '42703' || /does not exist/i.test(error.message ?? '')) {
            const fallback = await (supabase as any)
              .from('profiles')
              .select('id, username')
              .eq('is_online', true)
              .or('is_seed.is.null,is_seed.eq.false');
            return (fallback.data || []).filter((row: any) => !isMasterUsernameVariant(row.username)).length;
          }
          throw error;
        }
        return (data || []).filter((row: any) => !isMasterUsernameVariant(row.username)).length;
      } catch (err) {
        console.warn('[useOnlineCount] erro ao contar online:', (err as any)?.message ?? err);
        return 0;
      }
    },
    enabled: isEnabled,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Sincroniza com o Zustand quando o dado muda
  useEffect(() => {
    if (query.data !== undefined) {
      setCount(query.data);
      setInitialized(true);
    }
  }, [query.data, setCount, setInitialized]);

  // Atualização em tempo real: qualquer alteração em is_online/last_seen invalida o cache
  useEffect(() => {
    if (!isEnabled) return;
    return subscribeTable('profiles', (payload: any) => {
      const isRelevant =
        payload.new?.is_online !== payload.old?.is_online ||
        isMasterUsernameVariant(payload.new?.username) ||
        isMasterUsernameVariant(payload.old?.username);
      if (isRelevant) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }
    });
  }, [queryClient, isEnabled]);

  return query;
}
