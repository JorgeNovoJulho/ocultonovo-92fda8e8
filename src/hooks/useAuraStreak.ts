import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

export interface StreakStatus {
  current_streak: number;
  longest_streak: number;
  last_check_in: string | null;
  can_check_in_today: boolean;
  today_xp_preview: number;
  freezes_left: number;
}

export function useAuraStreak() {
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc('aura_streak_status');
    setStatus(Array.isArray(data) && data[0] ? data[0] : null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const checkIn = useCallback(async () => {
    setClaiming(true);
    const { data, error } = await (supabase as any).rpc('aura_streak_check_in');
    setClaiming(false);
    if (error) { toast.error('Erro no check-in'); return; }
    const res = Array.isArray(data) ? data[0] : data;
    if (!res?.ok) { toast.info(res?.message || 'Sem check-in disponível'); refresh(); return; }
    toast.success(`+${res.xp_awarded} XP · Streak ${res.current_streak} 🔥`, {
      description: res.freeze_used ? 'Freeze semanal usado para preservar a sequência.' : undefined,
    });
    refresh();
  }, [refresh]);

  return { status, loading, claiming, checkIn, refresh };
}
