import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface PrestigeData {
  user_id: string;
  xp: number;
  rank: number;
  name: string;
  description?: string;
  badge_icon: string;
  glow_color: string;
  visual_style?: Record<string, unknown>;
  rewards?: Record<string, unknown>;
  next_rank?: number;
  next_name?: string;
  next_min_xp?: number;
  xp_to_next: number;
  progress_pct: number;
}

export function usePrestige(userId?: string | null) {
  const [data, setData] = useState<PrestigeData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: r, error } = await (supabase as any).rpc('social_prestige_get', {
        p_user: userId ?? null,
      });
      if (!error && r && !r.error) setData(r as PrestigeData);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

export interface PrestigeLevel {
  id: string;
  rank: number;
  name: string;
  min_xp: number;
  description: string | null;
  badge_icon: string;
  glow_color: string;
  visual_style: Record<string, unknown>;
  rewards: Record<string, unknown>;
  is_active: boolean;
}

export function usePrestigeLevels() {
  const [levels, setLevels] = useState<PrestigeLevel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('social_prestige_list');
      if (!error && Array.isArray(data)) setLevels(data as PrestigeLevel[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { levels, loading, reload: load };
}
