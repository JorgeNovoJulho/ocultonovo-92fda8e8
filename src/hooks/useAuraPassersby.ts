import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface PassersbyData {
  passersby_24h: number;
  passersby_1h: number;
  closest_minutes_ago: number;
}

/** Anônimo, agregado. 1 fetch + revalidação 5min. */
export function useAuraPassersby() {
  const { user } = useAuth();
  const [data, setData] = useState<PassersbyData | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const { data: rows } = await (supabase as any).rpc('aura_recent_passersby');
        if (!cancelled) setData((rows && rows[0]) || null);
      } catch { /* silent */ }
    };
    fetchOnce();
    const id = window.setInterval(fetchOnce, 5 * 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [user?.id]);

  return data;
}
