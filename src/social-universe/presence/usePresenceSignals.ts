/**
 * Presença Invisível — sinais discretos e anonimizados.
 * Receptor nunca sabe quem emitiu. Backend força cooldowns e caps.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type PresenceSignalType =
  | 'profile_observed'
  | 'aura_passed_near'
  | 'attention_received'
  | 'almost_interacted'
  | 'rare_presence_detected'
  | 'room_energy_shift'
  | 'hidden_interest_signal';

export interface PresenceSignal {
  id: string;
  signal_type: PresenceSignalType;
  intensity: number;
  is_premium_hint: boolean;
  created_at: string;
}

export const PRESENCE_COPY: Record<PresenceSignalType, string> = {
  profile_observed:        'Alguém sentiu sua presença',
  aura_passed_near:        'Uma aura compatível passou perto',
  attention_received:      'Sua aura chamou atenção hoje',
  almost_interacted:       'Alguém quase se aproximou',
  rare_presence_detected:  'Uma conexão rara pode estar surgindo',
  room_energy_shift:       'A energia das salas mudou',
  hidden_interest_signal:  'Um interesse oculto foi notado',
};

export function usePresenceSignals(limit = 8) {
  const { user } = useAuth();
  const [signals, setSignals] = useState<PresenceSignal[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .rpc('presence_recent_signals', { p_limit: limit });
      if (!error && Array.isArray(data)) setSignals(data as PresenceSignal[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, limit]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 90_000); // 1.5 min, leve
    return () => window.clearInterval(id);
  }, [refresh]);

  return { signals, loading, refresh };
}

/** Emite sinal — backend valida cooldown/caps/bloqueio/ghost. */
export async function emitPresenceSignal(receiverId: string, type: PresenceSignalType, intensity = 1) {
  if (!receiverId) return { ok: false, reason: 'invalid' };
  try {
    const { data, error } = await (supabase as any)
      .rpc('presence_emit_signal', { p_receiver: receiverId, p_signal: type, p_intensity: intensity });
    if (error) return { ok: false, reason: 'error' };
    return data ?? { ok: false };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
