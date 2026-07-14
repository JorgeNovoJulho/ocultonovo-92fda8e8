import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import type { SocialBetaSlot } from '@/hooks/useSocialBetaVisit';

/**
 * Hook de tracking granular do Social Beta.
 * - `track(event, meta?)`: dispara evento click/ação.
 * - Dwell time: mede tempo de permanência (active + visible) e envia `dwell`
 *   ao desmontar ou trocar para tab oculta. Throttle: só envia se >= 3s.
 */
export function useSocialBetaSlotEvent(slot: SocialBetaSlot, enabled: boolean) {
  const { user } = useAuth();
  const startRef = useRef<number>(Date.now());
  const accumRef = useRef<number>(0);
  const visibleRef = useRef<boolean>(document.visibilityState === 'visible');

  const track = useCallback(
    (event: string, meta?: Record<string, any>) => {
      if (!user?.id || !enabled) return;
      (supabase as any)
        .rpc('social_beta_record_slot_event', {
          _slot: slot,
          _event: event,
          _seconds_spent: null,
          _meta: meta ?? {},
        })
        .then(() => {});
    },
    [user?.id, enabled, slot],
  );

  // Dwell tracker
  useEffect(() => {
    if (!user?.id || !enabled) return;
    startRef.current = Date.now();
    accumRef.current = 0;
    visibleRef.current = document.visibilityState === 'visible';

    const flush = () => {
      if (visibleRef.current) {
        accumRef.current += Math.floor((Date.now() - startRef.current) / 1000);
        startRef.current = Date.now();
      }
      const secs = accumRef.current;
      if (secs >= 3) {
        (supabase as any)
          .rpc('social_beta_record_slot_event', {
            _slot: slot,
            _event: 'dwell',
            _seconds_spent: secs,
            _meta: {},
          })
          .then(() => {});
      }
      accumRef.current = 0;
    };

    const onVisibility = () => {
      const nowVisible = document.visibilityState === 'visible';
      if (visibleRef.current && !nowVisible) {
        accumRef.current += Math.floor((Date.now() - startRef.current) / 1000);
      } else if (!visibleRef.current && nowVisible) {
        startRef.current = Date.now();
      }
      visibleRef.current = nowVisible;
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [user?.id, enabled, slot]);

  return { track };
}
