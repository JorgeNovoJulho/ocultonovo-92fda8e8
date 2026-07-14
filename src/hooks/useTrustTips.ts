import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface TrustTip { key: string; label: string; points: number; done: boolean }

export function useTrustTips(userId?: string | null) {
  const [tips, setTips] = useState<TrustTip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc('trust_score_tips', { p_user: userId ?? null });
      if (alive && !error && Array.isArray(data)) setTips(data as TrustTip[]);
      if (alive) setLoading(false);
    })();
    return () => { alive = false };
  }, [userId]);

  return { tips, loading };
}
