/**
 * useAuraResonance — escuta eventos públicos de ressonância numa sala.
 *
 * Canal único por sala: `aura_resonance:room:{roomId}`.
 * Respeita preferência local: o overlay/strip só chama esse hook quando
 * o usuário não desligou `show_resonance_public`.
 *
 * Estado:
 *  - latest: último evento ativo (não expirado), usado pelo strip sutil
 *  - all: lista recente (até 5) só para debug/admin futura
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export interface ResonanceEvent {
  id: string;
  room_id: string;
  resonance_type: string;
  intensity: number;
  is_public: boolean;
  created_at: string;
  expires_at: string | null;
  metadata?: { pulse_type?: string } | null;
}

const PHRASES_DEFAULT = [
  '💜 Uma ressonância surgiu na sala',
  '⚡ Duas auras entraram em sintonia',
  '✨ Sinal mútuo detectado',
  '🌌 Sintonia silenciosa',
];

export function useAuraResonance(roomId?: string | null, enabled = true) {
  const [latest, setLatest] = useState<ResonanceEvent | null>(null);
  const [phrases, setPhrases] = useState<string[]>(PHRASES_DEFAULT);

  // Carrega frases globais do admin uma única vez
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('aura_pulse_settings')
        .select('resonance_phrases, resonance_enabled')
        .eq('id', true)
        .maybeSingle();
      if (!alive) return;
      if (data?.resonance_phrases && Array.isArray(data.resonance_phrases) && data.resonance_phrases.length) {
        setPhrases(data.resonance_phrases);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Realtime por sala
  useEffect(() => {
    if (!enabled || !roomId) return;
    const unsub = subscribeTable('aura_resonance_events', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const ev = payload?.new as ResonanceEvent | undefined;
      if (!ev || ev.room_id !== roomId) return;
      if (!ev.is_public) return;
      if (ev.expires_at && new Date(ev.expires_at).getTime() < Date.now()) return;
      setLatest(ev);
    }, { events: ['INSERT'] });
    return () => { unsub(); };
  }, [roomId, enabled]);


  // Auto-expira o latest quando expires_at passar
  useEffect(() => {
    if (!latest?.expires_at) return;
    const ms = new Date(latest.expires_at).getTime() - Date.now();
    if (ms <= 0) { setLatest(null); return; }
    const t = setTimeout(() => setLatest(null), Math.min(ms, 90_000));
    return () => clearTimeout(t);
  }, [latest?.id, latest?.expires_at]);

  const dismiss = useCallback(() => setLatest(null), []);

  return { latest, phrases, dismiss };
}
