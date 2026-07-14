import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

export interface BoostStatus {
  active: boolean;
  expires_at: string | null;
  xp: number;
}

export function useAuraBoost() {
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc('aura_boost_my_status');
    const row = Array.isArray(data) && data[0] ? (data[0] as BoostStatus) : null;
    setStatus(row);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Countdown ticker (1Hz, leve)
  useEffect(() => {
    if (!status?.active || !status.expires_at) {
      setRemainingMs(0);
      return;
    }
    const target = new Date(status.expires_at).getTime();
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      setRemainingMs(diff);
      if (diff <= 0) refresh();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [status?.active, status?.expires_at, refresh]);

  const activate = useCallback(async () => {
    setActivating(true);
    const { data, error } = await (supabase as any).rpc('aura_boost_activate');
    setActivating(false);
    if (error) { toast.error('Erro ao ativar boost'); return; }
    const res = Array.isArray(data) ? data[0] : data;
    if (!res?.ok) { toast.error(res?.message || 'Não foi possível ativar'); refresh(); return; }
    toast.success('Boost ativado por 60 minutos! ⚡', {
      description: 'Sua aura está em destaque para todos.',
    });
    refresh();
  }, [refresh]);

  return { status, loading, activating, activate, refresh, remainingMs };
}

export interface BoostMap {
  has: (id: string) => boolean;
  expiresAt: (id: string) => string | null;
}

export function useActiveBoostUserIds(): BoostMap {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const fetchIds = async () => {
      const { data } = await (supabase as any).rpc('aura_boost_active_users');
      if (cancelled) return;
      const next = new Map<string, string>();
      const userIds: string[] = [];
      for (const r of (data as any[]) || []) {
        if (r?.user_id) {
          next.set(r.user_id, r.expires_at || '');
          userIds.push(r.user_id);
        }
      }
      // map user_id -> profile.id para casar com PairCard.id
      if (userIds.length > 0) {
        const { data: profs } = await (supabase as any)
          .from('profiles')
          .select('id, user_id')
          .in('user_id', userIds);
        for (const p of (profs as any[]) || []) {
          const exp = next.get(p.user_id) ?? '';
          if (p?.id) next.set(p.id, exp);
        }
      }
      if (!cancelled) setMap(next);
    };
    fetchIds();
    const id = window.setInterval(fetchIds, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);
  return {
    has: (id: string) => map.has(id),
    expiresAt: (id: string) => map.get(id) || null,
  };
}
