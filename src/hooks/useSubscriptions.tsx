import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useSubscriptionPersistStore } from '@/store/useSubscriptionPersistStore';
import type { Profile } from './useProfile';

export interface Subscription {
  id: string;
  subscriber_id: string;
  creator_id: string;
  status: 'active' | 'expired' | 'cancelled';
  price: number;
  created_at: string;
  expires_at: string | null;
  // Joined data
  creator?: Profile;
  subscriber?: Profile;
}

async function getProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (error) return null;
  return data?.id || null;
}

export function useMySubscriptions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-subscriptions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      const { data, error } = await supabase
        .from('subscriptions' as any)
        .select('*')
        .eq('subscriber_id', profileId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching subscriptions:', error);
        return [];
      }

      // Fetch creator profiles
      const subscriptions = data as any[] || [];
      const creatorIds = [...new Set(subscriptions.map(s => s.creator_id))];
      if (creatorIds.length === 0) return subscriptions as Subscription[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,user_id,display_name,name,full_name,username,avatar_url,is_verified,plan_type,is_creator')
        .in('id', creatorIds);

      const profileMap = new Map((profiles as any[] || []).map(p => [p.id, p]));

      return subscriptions.map(sub => ({
        ...sub,
        creator: profileMap.get(sub.creator_id),
      })) as Subscription[];
    },
    enabled: !!user?.id,
  });
}

export function useMySubscribers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-subscribers', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      const { data, error } = await supabase
        .from('subscriptions' as any)
        .select('*')
        .eq('creator_id', profileId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching subscribers:', error);
        return [];
      }

      // Fetch subscriber profiles
      const subscriptions = data as any[] || [];
      const subscriberIds = [...new Set(subscriptions.map(s => s.subscriber_id))];
      if (subscriberIds.length === 0) return subscriptions as Subscription[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,user_id,display_name,name,full_name,username,avatar_url,is_verified,plan_type')
        .in('id', subscriberIds);

      const profileMap = new Map((profiles as any[] || []).map(p => [p.id, p]));

      return subscriptions.map(sub => ({
        ...sub,
        subscriber: profileMap.get(sub.subscriber_id),
      })) as Subscription[];
    },
    enabled: !!user?.id,
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ creatorId, price }: { creatorId: string; price: number }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const profileId = await getProfileId(user.id);
      if (!profileId) throw new Error('Profile not found');

      // Calculate expiration (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { data, error } = await supabase
        .from('subscriptions' as any)
        .upsert({
          subscriber_id: profileId,
          creator_id: creatorId,
          status: 'active',
          price,
          expires_at: expiresAt.toISOString(),
        }, {
          onConflict: 'subscriber_id,creator_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { error } = await supabase
        .from('subscriptions' as any)
        .update({ status: 'cancelled' })
        .eq('id', subscriptionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    },
  });
}

export function useIsSubscribedTo(creatorId: string | undefined) {
  const { user } = useAuth();
  const persistedActive = useSubscriptionPersistStore((s) =>
    user?.id && creatorId ? s.isActive(user.id, creatorId) : false
  );
  const remember = useSubscriptionPersistStore((s) => s.remember);
  const forget = useSubscriptionPersistStore((s) => s.forget);

  const query = useQuery({
    queryKey: ['is-subscribed', user?.id, creatorId],
    queryFn: async () => {
      if (!user?.id || !creatorId) return { active: false, expiresAt: null as string | null };

      const profileId = await getProfileId(user.id);
      if (!profileId) return { active: false, expiresAt: null };

      const nowIso = new Date().toISOString();
      const [subRes, betaRes] = await Promise.all([
        supabase
          .from('subscriptions' as any)
          .select('id, expires_at, status')
          .eq('subscriber_id', profileId)
          .eq('creator_id', creatorId)
          .in('status', ['active', 'trialing'])
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .maybeSingle(),
        (supabase as any).rpc('has_beta_creator_access', { p_user: user.id, p_creator: creatorId }),
      ]);

      if (subRes.data) {
        return { active: true, expiresAt: (subRes.data as any).expires_at ?? null };
      }
      if (betaRes.data === true) {
        return { active: true, expiresAt: null };
      }
      return { active: false, expiresAt: null };
    },
    enabled: !!user?.id && !!creatorId,
    staleTime: 30_000,
    placeholderData: persistedActive ? { active: true, expiresAt: null } : undefined,
  });

  // Sincroniza store local com a verdade do servidor (também ao expirar).
  useEffect(() => {
    if (!user?.id || !creatorId || !query.data) return;
    if (query.data.active) {
      remember({ subscriberUserId: user.id, creatorId, expiresAt: query.data.expiresAt });
    } else if (!query.isFetching) {
      forget(user.id, creatorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.active, query.data?.expiresAt, user?.id, creatorId]);

  // Compatibilidade: muitos consumidores fazem `if (data) ...` esperando boolean.
  // Mantemos o boolean exposto via `.data` quando true, mas adicionamos `isSubscribed` legível.
  return {
    ...query,
    data: query.data?.active || persistedActive ? true : false,
    isSubscribed: query.data?.active || persistedActive,
  } as ReturnType<typeof useQuery> & { isSubscribed: boolean };
}

/**
 * Retorna status detalhado da assinatura ao criador:
 *  - active, expiresAt, daysLeft, expiringSoon (<=7 dias)
 * Atualiza em tempo real via Supabase Realtime na tabela subscriptions.
 */
export function useSubscriptionStatus(creatorId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['subscription-status', user?.id, creatorId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user?.id || !creatorId) return null;
      const profileId = await getProfileId(user.id);
      if (!profileId) return null;

      // tenta ambas as colunas (subscriber_id [profile.id] OU subscriber_user_id [auth.uid])
      const { data } = await supabase
        .from('subscriptions' as any)
        .select('id, status, expires_at, created_at, price')
        .or(`subscriber_id.eq.${profileId},subscriber_user_id.eq.${user.id}`)
        .or(`creator_id.eq.${creatorId},creator_user_id.eq.${creatorId}`)
        .in('status', ['active', 'trialing'])
        .order('expires_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (!data) return { active: false, expiresAt: null, daysLeft: 0, expiringSoon: false };

      const expiresAt = (data as any).expires_at ? new Date((data as any).expires_at) : null;
      const now = Date.now();
      const isActive = !expiresAt || expiresAt.getTime() > now;
      const msLeft = expiresAt ? expiresAt.getTime() - now : Infinity;
      const daysLeft = expiresAt ? Math.max(0, Math.ceil(msLeft / 86_400_000)) : Infinity;

      return {
        active: isActive,
        expiresAt: expiresAt?.toISOString() ?? null,
        daysLeft,
        expiringSoon: isActive && Number.isFinite(daysLeft) && daysLeft <= 7,
      };
    },
    enabled: !!user?.id && !!creatorId,
    staleTime: 60_000,
    // Sem polling nem refetch on focus — realtime na tabela subscriptions já invalida.
    refetchOnWindowFocus: false,
  });

  // Realtime via bus — filtra subscriber_user_id no handler.
  useEffect(() => {
    if (!user?.id || !creatorId) return;
    const unsub = subscribeTable('subscriptions', (payload: any) => {
      const row = payload.new || payload.old;
      if (!row || row.subscriber_user_id !== user.id) return;
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['is-subscribed'] });
      queryClient.invalidateQueries({ queryKey: ['channel-is-subscribed'] });
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, creatorId]);

  // Persiste/limpa o período no store local conforme a verdade do servidor
  const remember = useSubscriptionPersistStore((s) => s.remember);
  const forget = useSubscriptionPersistStore((s) => s.forget);
  useEffect(() => {
    if (!user?.id || !creatorId || !query.data) return;
    if (query.data.active) {
      remember({ subscriberUserId: user.id, creatorId, expiresAt: query.data.expiresAt });
    } else if (!query.isFetching) {
      forget(user.id, creatorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.active, query.data?.expiresAt, user?.id, creatorId]);

  return query;
}
