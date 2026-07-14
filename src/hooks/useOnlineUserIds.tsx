import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export interface OnlineUsersData {
  ids: Set<string>;
  lastSeenById: Map<string, string>;
}

interface Options {
  /** Intervalo de polling em ms. Use `false` para pausar. Padrão: 45s. */
  intervalMs?: number | false;
  enabled?: boolean;
}

/**
 * Retorna os usuários online em tempo real (presence < 5min).
 * - Polling de segurança (45s) +
 * - Realtime: assina UPDATE/INSERT em profiles.is_online/last_seen e
 *   invalida o cache instantaneamente (sem precisar atualizar página).
 */
export function useOnlineUserIds(options: Options = {}) {
  const { intervalMs = 45_000, enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    return subscribeTable('profiles', (payload: any) => {
      const next = payload?.new ?? {};
      const prev = payload?.old ?? {};
      if (
        next.is_online !== prev.is_online ||
        next.last_seen !== prev.last_seen ||
        next.show_online_status !== prev.show_online_status
      ) {
        queryClient.invalidateQueries({ queryKey: ['online-user-ids'] });
        queryClient.invalidateQueries({ queryKey: ['online-users'] });
      }
    }, { events: ['UPDATE'] });
  }, [enabled, queryClient]);

  return useQuery<OnlineUsersData>({
    queryKey: ['online-user-ids'],
    queryFn: async (): Promise<OnlineUsersData> => {
      try {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('id,last_seen')
          .eq('is_online', true)
          .gte('last_seen', twoMinutesAgo)
          .limit(5000);
        if (error) {
          console.warn('[OnlineUserIds] erro:', error.message);
          return { ids: new Set(), lastSeenById: new Map() };
        }
        const ids = new Set<string>();
        const lastSeenById = new Map<string, string>();
        for (const r of (data || []) as Array<{ id: string; last_seen: string | null }>) {
          ids.add(r.id);
          if (r.last_seen) lastSeenById.set(r.id, r.last_seen);
        }
        return { ids, lastSeenById };
      } catch {
        return { ids: new Set(), lastSeenById: new Map() };
      }
    },
    enabled,
    retry: false,
    refetchInterval: intervalMs === false ? false : intervalMs,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}
