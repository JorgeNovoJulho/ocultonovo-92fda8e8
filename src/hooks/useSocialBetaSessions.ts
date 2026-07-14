import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import type { SocialBetaSlot } from '@/hooks/useSocialBetaVisit';

export type SocialBetaSession = {
  id: string;
  slot: string;
  title: string;
  description: string | null;
  host_id: string;
  status: 'open' | 'closed' | 'ended';
  max_participants: number;
  participant_count: number;
  is_participant: boolean;
  is_host: boolean;
  created_at: string;
};

export type SocialBetaInvite = {
  id: string;
  session_id: string;
  session_title: string;
  slot: string;
  invited_by: string;
  status: string;
  created_at: string;
};

export function useSocialBetaSessions(slot: Exclude<SocialBetaSlot, 'hub'>, allowed: boolean) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SocialBetaSession[]>([]);
  const [invites, setInvites] = useState<SocialBetaInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!allowed) return;
    const [{ data: ss }, { data: ii }] = await Promise.all([
      (supabase as any).rpc('social_beta_list_sessions', { _slot: slot }),
      (supabase as any).rpc('social_beta_my_invites'),
    ]);
    setSessions((ss || []) as SocialBetaSession[]);
    setInvites(((ii || []) as SocialBetaInvite[]).filter((i) => i.slot === slot));
    setLoading(false);
  }, [slot, allowed]);

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    refresh();
    const unsubA = subscribeTable('oculto_social_beta_sessions', refresh);
    const unsubB = subscribeTable('oculto_social_beta_session_participants', refresh);
    const unsubC = subscribeTable('oculto_social_beta_session_invites', refresh);
    return () => { unsubA(); unsubB(); unsubC(); };
  }, [slot, allowed, refresh, user?.id]);


  const createSession = useCallback(async (title: string, description?: string, max = 8) => {
    const { data, error } = await (supabase as any).rpc('social_beta_create_session', {
      _slot: slot, _title: title, _description: description ?? null, _max_participants: max,
    });
    if (error) throw error;
    await refresh();
    return data as string;
  }, [slot, refresh]);

  const inviteUser = useCallback(async (sessionId: string, invitedUser: string) => {
    const { error } = await (supabase as any).rpc('social_beta_invite_user', {
      _session_id: sessionId, _invited_user: invitedUser,
    });
    if (error) throw error;
  }, []);

  const respondInvite = useCallback(async (inviteId: string, accept: boolean) => {
    const { error } = await (supabase as any).rpc('social_beta_respond_invite', { _invite_id: inviteId, _accept: accept });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const leaveSession = useCallback(async (sessionId: string) => {
    await (supabase as any).rpc('social_beta_leave_session', { _session_id: sessionId });
    await refresh();
  }, [refresh]);

  const endSession = useCallback(async (sessionId: string) => {
    await (supabase as any).rpc('social_beta_end_session', { _session_id: sessionId });
    await refresh();
  }, [refresh]);

  return { sessions, invites, loading, refresh, createSession, inviteUser, respondInvite, leaveSession, endSession };
}
