import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

/**
 * Retorna um Map<userId, multiplier> para o tipo de boost informado
 * ('boost_radar' | 'boost_aura'). Faz uma única chamada batch.
 */
export function useSocialBoosts(userIds: string[], kind: 'boost_radar' | 'boost_aura') {
  const [map, setMap] = useState<Map<string, number>>(new Map());

  // Stable key: avoid refetching on every render
  const key = userIds.length > 0 ? [...userIds].sort().join(',') : '';

  useEffect(() => {
    if (!key) { setMap(new Map()); return; }
    let alive = true;
    (async () => {
      const ids = key.split(',');
      const { data, error } = await (supabase as any).rpc('social_boosts_for_users', {
        p_users: ids, p_kind: kind,
      });
      if (!alive || error || !Array.isArray(data)) return;
      const m = new Map<string, number>();
      for (const row of data as { user_id: string; multiplier: number }[]) {
        m.set(row.user_id, Number(row.multiplier) || 1);
      }
      setMap(m);
    })();
    return () => { alive = false; };
  }, [key, kind]);

  return map;
}
