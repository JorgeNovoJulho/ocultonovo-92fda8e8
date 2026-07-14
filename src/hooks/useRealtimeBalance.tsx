import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';

/**
 * Subscribe to realtime balance updates on the profiles table.
 * Invalidates the profile query cache when the logged-in user's balance changes.
 */
export function useRealtimeBalance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    return subscribeTable('profiles', (payload: any) => {
      if (payload?.new?.user_id !== user.id) return;
      const newBalance = payload?.new?.balance;
      if (newBalance !== undefined) {
        queryClient.setQueryData(['profile', user.id], (old: any) => {
          if (!old) return old;
          return { ...old, balance: Number(newBalance) };
        });
      }
    }, { events: ['UPDATE'] });
  }, [user?.id, queryClient]);
}
