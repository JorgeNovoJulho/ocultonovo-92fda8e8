/**
 * useSocialBetaRecentUsers — usuários recentes em um slot do Social Beta.
 * RPC: social_beta_recent_slot_users(_slot, _limit, _hours).
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type RecentSlotUser = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  last_visit: string;
  visits_count: number;
};

export function useSocialBetaRecentUsers(
  slot: string | null,
  enabled: boolean,
  limit = 12,
  hours = 24,
) {
  const { user } = useAuth();
  const [data, setData] = useState<RecentSlotUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled || !user?.id) { setLoading(false); return; }
    try {
      const { data: rows } = await (supabase as any).rpc('social_beta_recent_slot_users', {
        _slot: slot, _limit: limit, _hours: hours,
      });
      setData((rows || []) as RecentSlotUser[]);
    } finally {
      setLoading(false);
    }
  }, [enabled, user?.id, slot, limit, hours]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    refresh().catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [refresh]);

  return { data, loading, refresh };
}
