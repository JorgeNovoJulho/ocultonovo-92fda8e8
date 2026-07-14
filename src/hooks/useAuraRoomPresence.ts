import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface RoomPresence {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  plan_type: string | null;
}

export function useAuraRoomPresence(slug: string | null, intervalMs = 90_000) {
  const [data, setData] = useState<RoomPresence[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!slug) { setData([]); return; }
    let cancelled = false;

    const fetchOnce = async () => {
      setLoading(true);
      try {
        const { data: rows } = await (supabase as any).rpc('aura_room_presence', { p_slug: slug });
        if (!cancelled) setData((rows as RoomPresence[]) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const start = () => {
      fetchOnce();
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(fetchOnce, intervalMs);
    };
    const stop = () => {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    };
    const onVis = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVis);
    if (!document.hidden) start();
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); stop(); };
  }, [slug, intervalMs]);

  return { data, loading };
}
