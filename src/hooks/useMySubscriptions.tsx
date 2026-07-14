import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useProfile } from './useProfile';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import { getResolvedAuthorScope } from '@/lib/postAuthorResolver';
import { normalizePublicStorageUrl } from '@/lib/storageUrl';
import { getPublicHandle } from '@/lib/userHandle';

async function fetchChannelPlansWithFallback(profileIds: string[]) {
  if (!profileIds.length) return { data: [], error: null } as any;

  const buildBase = () =>
    (supabase as any)
      .from('subscription_plans')
      .select('id, profile_id, title, banner_url, monthly_price, is_enabled, sort_order')
      .in('profile_id', profileIds);

  const buildLegacyBase = () =>
    (supabase as any)
      .from('subscription_plans')
      .select('id, profile_id, title, banner_url, monthly_price, is_enabled, created_at')
      .in('profile_id', profileIds);

  let response = await buildBase().order('sort_order', { ascending: true });

  if (response.error) {
    const msg = String(response.error.message || '').toLowerCase();
    if (/sort_order/.test(msg)) {
      response = await buildLegacyBase().order('created_at', { ascending: true });
    }
  }

  if (response.error) {
    const msg = String(response.error.message || '').toLowerCase();
    if (/does not exist|could not find/.test(msg)) {
      response = await buildLegacyBase();
    }
  }

  return response;
}

async function fetchProfilesWithFallback(ids: string[], lookupColumn: 'id' | 'user_id') {
  if (!ids.length) return { data: [], error: null } as any;

  const buildBase = () =>
    (supabase as any)
      .from('profiles')
      .select('id, user_id, name, display_name, username, avatar_url, banner_url, cover_url:cover_image_url')
      .in(lookupColumn, ids);

  const buildLegacyBase = () =>
    (supabase as any)
      .from('profiles')
      .select('id, user_id, name, display_name, username, avatar_url, banner_url')
      .in(lookupColumn, ids);

  let response = await buildBase();

  if (response.error) {
    const msg = String(response.error.message || '').toLowerCase();
    if (/cover_url|cover_image_url/.test(msg)) {
      response = await buildLegacyBase();
    }
  }

  return response;
}

async function fetchPlansByIdsWithFallback(planIds: string[]) {
  if (!planIds.length) return { data: [], error: null } as any;

  const buildBase = () =>
    (supabase as any)
      .from('subscription_plans')
      .select('id, profile_id, title, banner_url, monthly_price, is_enabled, sort_order')
      .in('id', planIds);

  const buildLegacyBase = () =>
    (supabase as any)
      .from('subscription_plans')
      .select('id, profile_id, title, banner_url, monthly_price, is_enabled, created_at')
      .in('id', planIds);

  let response = await buildBase();

  if (response.error) {
    const msg = String(response.error.message || '').toLowerCase();
    if (/sort_order/.test(msg)) {
      response = await buildLegacyBase();
    }
  }

  return response;
}

// Interface para assinatura com dados do criador
export interface MySubscription {
  id: string;
  subscriber_id: string;
  creator_id: string;
  status: string;
  price: number;
  created_at: string;
  expires_at: string | null;
  access_source?: 'subscription' | 'beta';
  creator: {
    id: string;
    user_id: string | null;
    name: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
  channel: {
    id: string | null;
    title: string;
    banner_url: string | null;
    subscriber_count: number;
  } | null;
}

// Hook para buscar assinaturas do usuário atual
export function useMySubscriptions(options?: { enabled?: boolean }) {
  const { profile } = useProfile();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEnabled = options?.enabled ?? true;

  useEffect(() => {
    if (!user?.id || !isEnabled) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['is-subscribed'] });
      queryClient.invalidateQueries({ queryKey: ['channel-is-subscribed'] });
    };
    const unsubSubs = subscribeTable('subscriptions', () => invalidate());
    const unsubBeta = subscribeTable('beta_access_grants', (payload: any) => {
      const row = payload.new ?? payload.old;
      if (!row || row.user_id !== user.id) return;
      invalidate();
    });
    return () => { unsubSubs(); unsubBeta(); };
  }, [user?.id, isEnabled, queryClient]);

  return useQuery({
    queryKey: ['my-subscriptions', profile?.id || user?.id, profile?.username || null],
    queryFn: async (): Promise<MySubscription[]> => {
      if (!user?.id) return [];

      const scope = await getResolvedAuthorScope(user.id, {
        usernames: [profile?.username || null],
      });

      const subscriberIds = Array.from(
        new Set([scope.authorProfileId, ...(scope.allProfileIds || []), profile?.id].filter(Boolean))
      ) as string[];

      if (subscriberIds.length === 0) return [];

      const nowIso = new Date().toISOString();
      const [{ data: data, error }, betaResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select(`
            id,
            subscriber_id,
            creator_id,
            plan_id,
            status,
            price,
            created_at,
            expires_at
          `)
          .in('subscriber_id', subscriberIds)
          .in('status', ['active', 'trialing'])
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false }),
        supabase
          .from('beta_access_grants')
          .select('id, user_id, creator_id, plan_id, created_at, expires_at, status')
          .eq('user_id', user.id)
          .eq('grant_type', 'creator_subscription')
          .eq('status', 'active')
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false }),
      ]);

      if (error) throw error;

      const realSubscriptions = data || [];
      const betaSubscriptions = betaResult.error ? [] : (betaResult.data || []);

      if (realSubscriptions.length === 0 && betaSubscriptions.length === 0) return [];

      const creatorIds = Array.from(new Set([
        ...realSubscriptions.map(sub => sub.creator_id),
        ...betaSubscriptions.map(sub => sub.creator_id),
      ].filter(Boolean)));
      const betaPlanIds = Array.from(new Set(betaSubscriptions.map(sub => sub.plan_id).filter(Boolean)));

      const [creatorsById, creatorsByUserId, betaPlans] = await Promise.all([
        fetchProfilesWithFallback(creatorIds, 'id'),
        fetchProfilesWithFallback(creatorIds, 'user_id'),
        fetchPlansByIdsWithFallback(betaPlanIds),
      ]);

      const creatorsMap = new Map<string, any>();
      for (const creator of [...(creatorsById.data || []), ...(creatorsByUserId.data || [])]) {
        if (!creator) continue;
        if (creator.id) creatorsMap.set(creator.id, creator);
        if (creator.user_id) creatorsMap.set(creator.user_id, creator);
        if (creator.username) creatorsMap.set(creator.username, creator);
      }

      const betaPlanPriceMap = new Map(
        ((betaPlans.data || []) as Array<{ id: string; monthly_price: number | null; title?: string | null; banner_url?: string | null; profile_id?: string | null }>).map((plan) => [plan.id, Number(plan.monthly_price || 0)])
      );

      const resolvedCreatorProfileIds = Array.from(
        new Set(
          [...(creatorsById.data || []), ...(creatorsByUserId.data || [])]
            .map((c: any) => c?.id)
            .filter(Boolean)
        )
      ) as string[];

      const [channelPlansRes, subsCountRes, betaCountRes] = await Promise.all([
        fetchChannelPlansWithFallback(resolvedCreatorProfileIds),
        resolvedCreatorProfileIds.length
          ? supabase
              .from('subscriptions')
              .select('creator_id', { count: 'exact' })
              .in('creator_id', resolvedCreatorProfileIds)
              .in('status', ['active', 'trialing'])
          : Promise.resolve({ data: [], error: null } as any),
        resolvedCreatorProfileIds.length
          ? supabase
              .from('beta_access_grants')
              .select('creator_id')
              .in('creator_id', resolvedCreatorProfileIds)
              .eq('grant_type', 'creator_subscription')
              .eq('status', 'active')
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const planById = new Map<string, any>();
      for (const plan of (channelPlansRes.data || []) as any[]) {
        if (plan?.id) planById.set(plan.id, plan);
      }
      for (const plan of (betaPlans.data || []) as any[]) {
        if (plan?.id && !planById.has(plan.id)) planById.set(plan.id, plan);
      }

      // Escolhe a melhor "vitrine" por criador: título personalizado e banner
      // próprio têm prioridade sobre planos genéricos "Canal VIP".
      const isGenericTitle = (t?: string | null) => {
        const s = (t || '').trim().toLowerCase();
        return !s || s === 'canal vip' || s === 'vip' || s === 'canal';
      };
      // Inclui TODOS os planos do criador (mesmo sem is_enabled definido) para
      // que a vitrine encontre o melhor card mesmo quando só existe um plano
      // sem flag habilitada. Só descarta explicitamente os marcados false.
      const enabledPlansByCreator = new Map<string, any[]>();
      for (const plan of (channelPlansRes.data || []) as any[]) {
        if (!plan?.profile_id) continue;
        const arr = enabledPlansByCreator.get(plan.profile_id) || [];
        arr.push(plan);
        enabledPlansByCreator.set(plan.profile_id, arr);
      }
      const channelByCreator = new Map<string, { id: string; title: string; banner_url: string | null }>();
      for (const [creatorPid, plans] of enabledPlansByCreator.entries()) {
        const sorted = [...plans].sort((a, b) => {
          // 1) habilitados primeiro
          const aEn = a.is_enabled === false ? 1 : 0;
          const bEn = b.is_enabled === false ? 1 : 0;
          if (aEn !== bEn) return aEn - bEn;
          // 2) título personalizado primeiro
          const aGen = isGenericTitle(a.title) ? 1 : 0;
          const bGen = isGenericTitle(b.title) ? 1 : 0;
          if (aGen !== bGen) return aGen - bGen;
          // 3) com banner primeiro
          const aBan = a.banner_url ? 0 : 1;
          const bBan = b.banner_url ? 0 : 1;
          if (aBan !== bBan) return aBan - bBan;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        });
        const chosen = sorted[0];
        channelByCreator.set(creatorPid, {
          id: chosen.id,
          title: chosen.title || 'Canal VIP',
          banner_url: chosen.banner_url || null,
        });
      }

      const subscriberCountByCreator = new Map<string, number>();
      for (const row of ((subsCountRes.data || []) as any[])) {
        const k = row.creator_id;
        if (!k) continue;
        subscriberCountByCreator.set(k, (subscriberCountByCreator.get(k) || 0) + 1);
      }
      for (const row of ((betaCountRes.data || []) as any[])) {
        const k = row.creator_id;
        if (!k) continue;
        subscriberCountByCreator.set(k, (subscriberCountByCreator.get(k) || 0) + 1);
      }

      const toChannelPayload = (
        creatorProfileId: string | null | undefined,
        creator: any,
        exactPlanId?: string | null,
      ) => {
        if (!creatorProfileId) return null;
        const ch = channelByCreator.get(creatorProfileId);
        const exactPlan = exactPlanId ? planById.get(exactPlanId) : null;
        const count = subscriberCountByCreator.get(creatorProfileId) || 0;
        const realNameTokens = [creator?.name, creator?.display_name, creator?.full_name]
          .filter(Boolean)
          .map((value: string) => value.trim().toLowerCase());
        const isRealNameLike = (value?: string | null) => {
          const normalized = (value || '').trim().toLowerCase();
          return !!normalized && realNameTokens.includes(normalized);
        };
        // Para o card "Criadores que Assino", a prioridade deve ser o plano/canal
        // realmente assinado pelo usuário. Só cai para a vitrine do criador quando
        // o plano exato não trouxer título/capa utilizáveis.
        const showcaseTitle = ch?.title?.trim();
        const exactTitle = exactPlan?.title?.trim();
        const safeTitle =
          exactTitle && !isGenericTitle(exactTitle) && !isRealNameLike(exactTitle)
            ? exactTitle
            : showcaseTitle && !isGenericTitle(showcaseTitle) && !isRealNameLike(showcaseTitle)
            ? showcaseTitle
            : creator?.username
            ? `@${creator.username}`
            : 'Canal VIP';
        // Capa: prioriza a do plano/canal assinado; se faltar, usa a melhor vitrine
        // do criador; por fim, cai para o banner/avatar do perfil.
        const bannerFallback =
          normalizePublicStorageUrl(creator?.banner_url, 'banners') ||
          normalizePublicStorageUrl(creator?.cover_url, 'banners') ||
          normalizePublicStorageUrl(creator?.avatar_url, 'avatars') ||
          null;
        const preferredBanner =
          normalizePublicStorageUrl(exactPlan?.banner_url, 'banners') ||
          normalizePublicStorageUrl(ch?.banner_url, 'banners') ||
          null;
        const safeBanner = preferredBanner || bannerFallback;
        return {
          id: ch?.id || exactPlan?.id || null,
          title: safeTitle,
          banner_url: safeBanner,
          subscriber_count: count,
        };
      };

      const toCreatorPayload = (creator: any) => creator
        ? {
            id: creator.id,
            user_id: creator.user_id,
            username: creator.username,
            avatar_url: creator.avatar_url,
            name: getPublicHandle(creator),
          }
        : null;

      const normalizedReal = realSubscriptions.map((sub) => {
        const creator = creatorsMap.get(sub.creator_id) || null;
        return {
          ...sub,
          creator_id: creator?.id || sub.creator_id,
          access_source: 'subscription' as const,
          creator: toCreatorPayload(creator),
          channel: toChannelPayload(creator?.id || sub.creator_id, creator, sub.plan_id || null),
        };
      });

      const normalizedBeta = betaSubscriptions.map((sub) => {
        const creator = creatorsMap.get(sub.creator_id) || null;
        return {
          id: `beta:${sub.id}`,
          subscriber_id: user.id,
          creator_id: creator?.id || sub.creator_id,
          status: 'active',
          price: betaPlanPriceMap.get(sub.plan_id) || 0,
          created_at: sub.created_at,
          expires_at: sub.expires_at,
          access_source: 'beta' as const,
          creator: toCreatorPayload(creator),
          channel: toChannelPayload(creator?.id || sub.creator_id, creator, sub.plan_id || null),
        } satisfies MySubscription;
      });

      const dedupedByCreator = new Map<string, MySubscription>();
      for (const sub of [...normalizedReal, ...normalizedBeta]) {
        const dedupeKey = sub.creator?.id || sub.creator_id;
        if (!dedupeKey || dedupedByCreator.has(dedupeKey)) continue;
        dedupedByCreator.set(dedupeKey, sub as MySubscription);
      }

      const deduped = Array.from(dedupedByCreator.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return deduped;
    },
    enabled: (!!profile?.id || !!user?.id) && isEnabled,
    // Realtime de `subscriptions` invalida quando muda. Sem refetch agressivo:
    // staleTime longo + sem refetch on focus/mount evita 3-5 refetches a cada
    // troca de aba/rota sem ganho real.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 5 * 60_000,
  });
}


// Hook para cancelar assinatura (com grace period via Stripe)
export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', subscriptionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: 'Assinatura cancelada',
        description: 'Você manterá o acesso até o final do período faturado.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao cancelar assinatura',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
