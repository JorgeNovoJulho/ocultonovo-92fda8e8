import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface SocialPerk {
  kind: string;
  value: number;
  label: string;
  description?: string;
}

export interface SocialScore {
  user_id: string;
  xp: number;
  level: number;
  level_name: string;
  glow_color: string;
  next_level?: number;
  next_level_name?: string;
  next_level_xp?: number;
  progress_pct: number;
  perks: SocialPerk[];
  breakdown: Record<string, number>;
}

export function useSocialScore(userId?: string | null) {
  const [data, setData] = useState<SocialScore | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: r, error } = await (supabase as any).rpc('social_score_get', {
        p_user: userId ?? null,
      });
      if (!error && r && !r.error) setData(r as SocialScore);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}
