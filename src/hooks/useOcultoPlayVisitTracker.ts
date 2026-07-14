/**
 * useOcultoPlayVisitTracker — registra visita do dia ao Oculto Play.
 * Uma chamada por sessão; RPC server-side é idempotente (unique por user+date).
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export function useOcultoPlayVisitTracker() {
  const { user } = useAuth();
  const calledRef = useRef(false);

  useEffect(() => {
    if (!user?.id || calledRef.current) return;
    calledRef.current = true;
    (async () => {
      try { await (supabase as any).rpc('oculto_play_register_visit'); } catch { /* silencioso */ }
    })();
  }, [user?.id]);
}
