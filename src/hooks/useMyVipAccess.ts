import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useMySubscriptions } from './useMySubscriptions';
import { mockChannelSubsStore } from '@/lib/mockChannelSubscriptions';

/**
 * Retorna o conjunto de IDs de posts VIP que o usuário tem acesso:
 *   - posts comprados (payments_log com status pago)
 *   - posts cujo autor o usuário assina (creator subscriptions ativas — real ou mock)
 *
 * Inclui também o set de creator user_ids assinados para filtros visuais.
 */
export function useMyVipAccess(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isEnabled = options?.enabled ?? true;
  const { data: subs, isLoading: subsLoading } = useMySubscriptions({ enabled: isEnabled });

  // Layer reativa do mock (libera VIP imediatamente após o checkout)
  const [mockTick, setMockTick] = useState(0);
  useEffect(() => {
    const unsub = mockChannelSubsStore.subscribe(() => setMockTick((t) => t + 1));
    const i = window.setInterval(() => setMockTick((t) => t + 1), 60_000);
    return () => { unsub(); window.clearInterval(i); };
  }, []);
  const mockActive = mockChannelSubsStore.active();
  const mockCreatorProfileIds = mockActive.map((s) => s.creatorProfileId);
  const mockCreatorUserIds = mockActive
    .map((s) => s.creatorUserId)
    .filter(Boolean) as string[];

  // Mapeia profile.id -> user_id para os criadores assinados (real)
  const subscribedCreatorProfileIdsReal = (subs ?? []).map((s) => s.creator_id).filter(Boolean);
  const subscribedCreatorProfileIds = Array.from(
    new Set([...subscribedCreatorProfileIdsReal, ...mockCreatorProfileIds]),
  );

  const subscribedCreatorUserIds = useQuery({
    // ⚠️ mockTick NÃO entra na queryKey — só serve pra re-renderizar derivados
    // de mockChannelSubs. Incluí-lo aqui forçava cache miss a cada 60s.
    queryKey: ['vip-access-creator-userids', subscribedCreatorProfileIdsReal.sort().join(',')],
    enabled: isEnabled && subscribedCreatorProfileIdsReal.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id')
        .in('id', subscribedCreatorProfileIdsReal);
      return (data ?? []).map((r: any) => r.user_id).filter(Boolean) as string[];
    },
  });

  const purchasedPostIds = useQuery({
    queryKey: ['vip-access-purchased', user?.id, profile?.id ?? null],
    enabled: isEnabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user?.id) return [] as string[];

      const accessOwnerIds = Array.from(new Set([user.id, profile?.id].filter(Boolean))) as string[];

      const [{ data: mediaAccess }, { data: betaAccess }, { data: payments }] = await Promise.all([
        (supabase as any)
          .from('media_access')
          .select('post_id')
          .in('user_id', accessOwnerIds)
          .not('post_id', 'is', null),
        (supabase as any)
          .from('beta_access_grants')
          .select('post_id, status')
          .in('user_id', accessOwnerIds)
          .eq('status', 'active')
          .not('post_id', 'is', null),
        (supabase as any)
          .from('payments_log')
          .select('post_id, status')
          .in('user_id', accessOwnerIds)
          .not('post_id', 'is', null),
      ]);

      return Array.from(
        new Set([
          ...((mediaAccess ?? []).map((r: any) => r.post_id).filter(Boolean) as string[]),
          ...((betaAccess ?? []).map((r: any) => r.post_id).filter(Boolean) as string[]),
          ...((payments ?? [])
            .filter((r: any) => ['paid', 'confirmed', 'completed', 'received'].includes((r.status || '').toLowerCase()))
            .map((r: any) => r.post_id)
            .filter(Boolean) as string[]),
        ])
      );
    },
  });

  const mergedCreatorUserIds = new Set<string>([
    ...(subscribedCreatorUserIds.data ?? []),
    ...mockCreatorUserIds,
  ]);

  return {
    purchasedPostIds: new Set(purchasedPostIds.data ?? []),
    subscribedCreatorProfileIds: new Set(subscribedCreatorProfileIds),
    subscribedCreatorUserIds: mergedCreatorUserIds,
    isLoading: isEnabled && (subsLoading || purchasedPostIds.isLoading || subscribedCreatorUserIds.isLoading),
    hasAnyAccess:
      subscribedCreatorProfileIds.length > 0 ||
      (purchasedPostIds.data?.length ?? 0) > 0 ||
      mergedCreatorUserIds.size > 0,
  };
}
