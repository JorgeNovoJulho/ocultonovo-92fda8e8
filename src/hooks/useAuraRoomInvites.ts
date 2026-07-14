import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export interface RoomInvite {
  id: string;
  room_slug: string;
  room_name: string | null;
  reason: string | null;
  created_at: string;
  from_user: string;
  from_name: string | null;
  from_username: string | null;
  from_avatar: string | null;
  from_plan: string | null;
}

/**
 * Listener global de convites de Sala em tempo real.
 * - Carrega pendentes ao montar
 * - Subscribe em INSERT no oculto_aura_room_invites filtrado por to_user
 * - Hidrata o perfil do remetente via RPC quando chega novo INSERT
 */
export function useAuraRoomInvites() {
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(data.user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadPending = useCallback(async () => {
    const { data } = await (supabase as any).rpc('aura_room_invite_pending');
    if (!data) return;
    seenRef.current = new Set((data as RoomInvite[]).map((i) => i.id));
    setInvites(data as RoomInvite[]);
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadPending().catch(() => {});
    const unsub = subscribeTable('oculto_aura_room_invites', async (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const row = payload.new;
      if (!row || row.to_user !== userId) return;
      const id = row.id;
      if (!id || seenRef.current.has(id)) return;
      seenRef.current.add(id);
      const { data } = await (supabase as any).rpc('aura_room_invite_get', { p_id: id });
      const invite = (data as RoomInvite[])?.[0];
      if (invite) setInvites((prev) => [invite, ...prev].slice(0, 5));
    }, { events: ['INSERT'] });
    return () => { unsub(); };
  }, [userId, loadPending]);


  const respond = useCallback(async (id: string, action: 'accept' | 'ignore') => {
    setInvites((prev) => prev.filter((i) => i.id !== id));
    const { data } = await (supabase as any).rpc('aura_room_invite_respond', { p_id: id, p_action: action });
    return data as { ok: boolean; slug?: string; reason?: string };
  }, []);

  const send = useCallback(async (slug: string, name: string, toUser: string, reason: string) => {
    const { data } = await (supabase as any).rpc('aura_room_invite_send', {
      p_slug: slug, p_name: name, p_to_user: toUser, p_reason: reason,
    });
    return data as { ok: boolean; reason?: string; id?: string };
  }, []);

  return { invites, respond, send, refresh: loadPending };
}
