/**
 * useWatchParty — Etapa 39
 *
 * Cria, entra, atualiza estado e finaliza uma Watch Party do Oculto Play.
 * Para guests, expõe o estado da sala via realtime (postgres_changes).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export interface WatchPartyState {
  id: string;
  host_user_id: string;
  current_item_id: string | null;
  current_pos_seconds: number;
  is_playing: boolean;
  title: string | null;
  status: 'live' | 'ended';
  participant_count: number;
  updated_at: string;
}

export function useWatchPartyActions() {
  const create = useCallback(async (itemId: string, title?: string | null): Promise<string | null> => {
    const { data, error } = await supabase.rpc('watch_party_create', {
      _item_id: itemId,
      _title: title ?? null,
    });
    if (error) {
      console.warn('[watch_party_create]', error.message);
      return null;
    }
    return (data as string) ?? null;
  }, []);

  const join = useCallback(async (partyId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('watch_party_join', { _party_id: partyId });
    if (error) {
      console.warn('[watch_party_join]', error.message);
      return false;
    }
    return !!data;
  }, []);

  const updateState = useCallback(
    async (partyId: string, itemId: string | null, pos: number, playing: boolean) => {
      const { error } = await supabase.rpc('watch_party_update_state', {
        _party_id: partyId,
        _item_id: itemId,
        _pos: pos,
        _playing: playing,
      });
      if (error) console.warn('[watch_party_update_state]', error.message);
    },
    [],
  );

  const end = useCallback(async (partyId: string) => {
    const { error } = await supabase.rpc('watch_party_end', { _party_id: partyId });
    if (error) console.warn('[watch_party_end]', error.message);
  }, []);

  return { create, join, updateState, end };
}

export function useWatchParty(partyId: string | null | undefined) {
  const [party, setParty] = useState<WatchPartyState | null>(null);
  const [loading, setLoading] = useState<boolean>(!!partyId);

  useEffect(() => {
    if (!partyId) {
      setParty(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from('oculto_play_watch_parties')
      .select('*')
      .eq('id', partyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setParty((data as WatchPartyState | null) ?? null);
        setLoading(false);
      });

    const channel = supabase
      .channel(`watch_party:${partyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_play_watch_parties', filter: `id=eq.${partyId}` },
        (payload) => {
          const next = (payload.new as WatchPartyState | null) ?? null;
          if (next) setParty(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  return { party, loading };
}
