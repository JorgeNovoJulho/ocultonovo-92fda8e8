import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type SocialBetaSlot = 'hub' | 'lounge' | 'connections' | 'games' | 'dynamics';

/** Registra visita do usuário liberado em uma sub-área. Throttle de 1 min via RPC. */
export function useSocialBetaVisit(slot: SocialBetaSlot, allowed: boolean) {
  const { user } = useAuth();
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !allowed) return;
    const key = `${user.id}:${slot}`;
    if (sentRef.current === key) return;
    sentRef.current = key;
    (supabase as any).rpc('social_beta_record_visit', { _slot: slot }).then(() => {});
  }, [user?.id, allowed, slot]);
}
