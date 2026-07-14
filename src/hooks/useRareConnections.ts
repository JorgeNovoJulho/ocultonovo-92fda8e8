import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface RareConnection {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan_type: string | null;
  aura_level: number;
  rarity_score: number;
}

export function useRareConnections(limit = 6) {
  const { user } = useAuth();
  const [items, setItems] = useState<RareConnection[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('aura_rare_connections', { p_limit: limit });
      if (!error && Array.isArray(data)) setItems(data as RareConnection[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, limit]);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, refresh };
}
