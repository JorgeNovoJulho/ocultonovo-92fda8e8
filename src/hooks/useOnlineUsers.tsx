/**
 * useOnlineUsers — fonte ÚNICA do número "Online Agora" do painel admin.
 *
 * Mantém a mesma janela de 2 minutos do modal e remove o próprio master,
 * aceitando tanto `ocultomaster` quanto `oculto_master` e demais variações
 * equivalentes como o mesmo identificador reservado.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { isMasterUsernameVariant } from '@/lib/masterUsername';

export const ONLINE_USERS_QUERY_KEY = ['online-users'] as const;

export function useOnlineUsers() {
  const qc = useQueryClient();

  useEffect(() => {
    return subscribeTable('profiles', (payload: any) => {
      const changedOnline = payload.new?.is_online !== payload.old?.is_online;
      const changedSeen = payload.new?.last_seen !== payload.old?.last_seen;
      const changedMaster =
        isMasterUsernameVariant(payload.new?.username) ||
        isMasterUsernameVariant(payload.old?.username);

      if (changedOnline || changedSeen || changedMaster) {
        qc.invalidateQueries({ queryKey: ONLINE_USERS_QUERY_KEY });
        qc.invalidateQueries({ queryKey: ['master-online-unrewarded'] });
      }
    }, { events: ['UPDATE'] });
  }, [qc]);

  return useQuery({
    queryKey: ONLINE_USERS_QUERY_KEY,
    queryFn: async () => {
      try {
        const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('id, username')
          .eq('is_online', true)
          .gte('last_seen', cutoff)
          .or('is_seed.is.null,is_seed.eq.false')
          .or('is_test_account.is.null,is_test_account.eq.false')
          .is('banned_at', null)
          .limit(500);

        if (error) {
          console.warn('[Oculto] online-users count failed:', error.message);
          return 0;
        }

        return (data || []).filter((row: any) => !isMasterUsernameVariant(row.username)).length;
      } catch {
        return 0;
      }
    },
    retry: false,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
