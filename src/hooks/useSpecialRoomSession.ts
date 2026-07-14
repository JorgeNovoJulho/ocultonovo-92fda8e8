/**
 * useSpecialRoomSession — descobre se um ciclo especial tem sessão
 * aberta agora (e em qual sala). Usado pelo SocialCycleBadge para
 * direcionar o CTA direto ao chat e pelo chat para mostrar countdown.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export interface SpecialSession {
  id: string;
  cycle_key: string;
  room_slug: string;
  label: string;
  emoji: string;
  hue: number;
  opened_at: string;
  closes_at: string;
  status: 'open' | 'closing' | 'closed';
  min_aura_level: number;
  min_social_score: number;
  min_prestige_xp: number;
  required_plan: string | null;
  requires_kyc: boolean;
}

export function useSpecialRoomSession(cycleKey?: string | null) {
  const [session, setSession] = useState<SpecialSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOnce = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).rpc('special_room_active', {
        p_cycle_key: cycleKey ?? null,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        setSession(data[0] as SpecialSession);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [cycleKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => { if (!cancelled) await fetchOnce(); })();

    // Tick leve a cada 60s para acionar avisos 30/15/5 e fechamento
    // automático sem depender de cron externo. O auto-tick no backend
    // já é debounced (20s), então não há overhead se múltiplos clientes
    // estiverem abertos.
    const tickInterval = window.setInterval(() => {
      if (!cancelled) void fetchOnce();
    }, 60_000);

    const unsub = subscribeTable('oculto_special_cycle_sessions', () => { void fetchOnce(); });
    return () => {
      cancelled = true;
      window.clearInterval(tickInterval);
      unsub();
    };
  }, [cycleKey, fetchOnce]);


  return { session, loading, refetch: fetchOnce };
}

/** Hook auxiliar: descobre sessão especial associada a um slug de sala. */
export function useSpecialSessionForSlug(slug: string | null | undefined) {
  const [session, setSession] = useState<SpecialSession | null>(null);

  useEffect(() => {
    if (!slug) { setSession(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await (supabase as any).rpc('special_room_session_for_slug', { p_slug: slug });
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          // hidrata com dados da definição
          const row = data[0];
          const { data: act } = await (supabase as any).rpc('special_room_active', { p_cycle_key: row.cycle_key });
          if (!cancelled && Array.isArray(act) && act.length > 0) setSession(act[0] as SpecialSession);
          else if (!cancelled) setSession(null);
        } else if (!cancelled) setSession(null);
      } catch {
        if (!cancelled) setSession(null);
      }
    };
    void load();
    const unsub = subscribeTable('oculto_special_cycle_sessions', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.room_slug !== slug) return;
      void load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [slug]);


  return session;
}
