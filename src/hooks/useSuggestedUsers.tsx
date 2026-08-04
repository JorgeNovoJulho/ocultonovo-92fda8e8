import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { selectFollowerIdsFollowingTarget } from '@/lib/followsApi';
import { loadCache, saveCache } from '@/lib/persistentQueryCache';

function normalizeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface SuggestedUser {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  gender: string | null;
  age: number | null;
  city: string | null;
  common_interests: number;
  common_adult_interests?: number;
  mutual_following_count?: number;
  is_highlighted?: boolean;
  is_seed?: boolean;
  is_test_account?: boolean;
  follows_me?: boolean;
}

// Mock de fallback (apenas usado quando o RPC não retorna nada — útil em
// dev/desenvolvimento sem dados reais para validar a UI da carrossel)
const MOCK_SUGGESTIONS: SuggestedUser[] = [
  { id: 'mock-1', user_id: 'mock-1', name: 'Lucas & Marina', username: 'lucasmarina', avatar_url: 'https://i.pravatar.cc/300?img=12', gender: 'casal', age: 32, city: 'São Paulo', common_interests: 5, mutual_following_count: 3, is_highlighted: true },
  { id: 'mock-2', user_id: 'mock-2', name: 'Bia',           username: 'biaroma',     avatar_url: 'https://i.pravatar.cc/300?img=47', gender: 'feminino', age: 28, city: 'Rio de Janeiro', common_interests: 4, mutual_following_count: 2 },
  { id: 'mock-3', user_id: 'mock-3', name: 'Rafa',          username: 'rafaboy',     avatar_url: 'https://i.pravatar.cc/300?img=33', gender: 'masculino', age: 34, city: 'Curitiba', common_interests: 3, mutual_following_count: 1 },
  { id: 'mock-4', user_id: 'mock-4', name: 'Casal Sunset',  username: 'sunsetcasal', avatar_url: 'https://i.pravatar.cc/300?img=20', gender: 'casal', age: 36, city: 'Belo Horizonte', common_interests: 6, mutual_following_count: 0, is_highlighted: true },
  { id: 'mock-5', user_id: 'mock-5', name: 'Nat',           username: 'natbruna',    avatar_url: 'https://i.pravatar.cc/300?img=49', gender: 'feminino', age: 26, city: 'Porto Alegre', common_interests: 2, mutual_following_count: 4 },
  { id: 'mock-6', user_id: 'mock-6', name: 'Diego',         username: 'diegopaulista', avatar_url: 'https://i.pravatar.cc/300?img=15', gender: 'masculino', age: 31, city: 'Florianópolis', common_interests: 3, mutual_following_count: 0 },
];

// Limite mínimo de usuários reais para ativar a sessão de sugestões
export const SUGGESTIONS_MIN_REAL_USERS = 50;

// Mocks expostos apenas para preview visual enquanto a sessão está bloqueada
export const SUGGESTED_PREVIEW_MOCKS = MOCK_SUGGESTIONS;

export function useRealUsersCount() {
  return useQuery({
    queryKey: ['real-users-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as any)
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .or('is_seed.is.null,is_seed.eq.false')
        .or('is_test_account.is.null,is_test_account.eq.false');
      if (error) {
        console.warn('[Oculto] real users count failed:', error.message);
        return 0;
      }
      return count ?? 0;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSuggestedUsers(limit = 15, options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: ['suggested-users', user?.id, limit],
    queryFn: async (): Promise<SuggestedUser[]> => {
      if (!user?.id) return [];

      const { data, error } = await (supabase as any).rpc('get_suggested_users', {
        p_user_id: user.id,
        p_limit: limit * 3,
      });

      if (error) {
        console.warn('Failed to fetch suggested users:', error.message);
        return [];
      }

      const raw = (data || []) as SuggestedUser[];
      const real = raw.filter(u => !u.is_seed && !u.is_test_account);

      const shuffled = [...real].sort(() => Math.random() - 0.5);
      shuffled.sort((a, b) => Number(!!b.is_highlighted) - Number(!!a.is_highlighted));
      return shuffled.slice(0, limit);
    },
    enabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,

    placeholderData: [],
  });
}

/**
 * Sempre traz quaisquer usuários reais disponíveis (mesmo abaixo do
 * SUGGESTIONS_MIN_REAL_USERS). Usado para colocar reais NA FRENTE dos mocks
 * enquanto a sessão ainda está em modo preview.
 */
export function useAnyRealSuggestedUsers(limit = 15) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['suggested-users-any-real', user?.id, limit],
    queryFn: async (): Promise<SuggestedUser[]> => {
      if (!user?.id) return [];
      const { data, error } = await (supabase as any).rpc('get_suggested_users', {
        p_user_id: user.id,
        p_limit: limit * 3,
      });
      if (error) {
        // Fallback direto para a tabela profiles caso a RPC falhe
        const { data: rows } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, name, username, avatar_url, gender, plan_type, is_seed, is_test_account')
          .or('is_seed.is.null,is_seed.eq.false')
          .or('is_test_account.is.null,is_test_account.eq.false')
          .neq('user_id', user.id)
          .limit(limit);
        return (rows || []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          name: r.name || r.username || 'Usuário',
          username: r.username,
          avatar_url: r.avatar_url,
          gender: r.gender,
          age: null,
          city: null,
          common_interests: 0,
          mutual_following_count: 0,
        })) as SuggestedUser[];
      }
      const raw = (data || []) as SuggestedUser[];
      return raw.filter(u => !u.is_seed && !u.is_test_account).slice(0, limit);
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,

    placeholderData: [],
  });
}

/**
 * Sempre traz os usuários mais novos da plataforma (reais, sem seed/test),
 * embaralhados aleatoriamente a cada refetch. Usado pelo carrossel
 * "Explorar novos misteriosos(as)" — independe de afinidade / RPC.
 */
export function useNewRealUsersForCarousel(
  limit = 24,
  options?: { excludeIds?: readonly string[] },
) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const myProfileId = (profile as any)?.id as string | undefined;
  // Normaliza/limita exclusões para manter a URL do PostgREST sob controle.
  // Prioriza os mais recentes (últimos vistos) — o filtro server-side
  // resolve o caso comum; o restante é filtrado client-side.
  const excludeIds = useMemo(() => {
    const raw = Array.isArray(options?.excludeIds) ? options!.excludeIds : [];
    const dedup = Array.from(new Set(raw.filter(Boolean)));
    // Sem hard cap: o filtro é client-side, então não há risco de URL grande.
    // Mantemos um teto sanitário só para evitar excesso de memória.
    return dedup.slice(-5000);
  }, [options?.excludeIds]);
  const excludeSig = excludeIds.length === 0 ? 'none' : `${excludeIds.length}:${excludeIds[0]}:${excludeIds[excludeIds.length - 1]}`;
  const cacheKey = `discover-mysteries:v1:${user?.id ?? 'anon'}:${limit}`;
  const cached = loadCache<SuggestedUser[]>(cacheKey, 30 * 60 * 1000);
  return useQuery({
    queryKey: ['new-real-users-carousel-v3', user?.id ?? 'anon', myProfileId ?? 'pending-profile', limit, excludeSig],
    enabled: true,
    queryFn: async (): Promise<SuggestedUser[]> => {
      // Pool generoso: cresce com o número de excluídos para garantir
      // que sempre tenhamos cards "não vistos" para mostrar primeiro.
      // Teto alto (até 1500) para suportar bases grandes onde o usuário já viu
      // a maioria — o filtro de "não vistos" é feito client-side abaixo (vide
      // bug do PostgREST com URLs > 8KB quando excludeIds é grande).
      const poolSize = Math.min(1500, Math.max(limit * 6, 96) + Math.min(excludeIds.length, 1200));

      // IMPORTANTE: NÃO usar `.not('id','in','(...)')` com muitos IDs — a URL
      // estoura ~8KB e o request falha silenciosamente. Filtramos client-side.
      let query: any = (supabase as any)
        .from('profiles')
        .select('id, user_id, name, username, avatar_url, gender, plan_type, is_seed, is_test_account, created_at, birth_date, address_city, hide_age, hide_location')
        .or('is_seed.is.null,is_seed.eq.false')
        .or('is_test_account.is.null,is_test_account.eq.false')
        .order('created_at', { ascending: false })
        .limit(poolSize);

      const { data, error } = user?.id
        ? await query.neq('user_id', user.id)
        : await query;

      if (error) {
        console.warn('[Oculto] new-real-users-carousel failed:', error.message);
        return [];
      }
      const excludeSet = new Set(excludeIds);
      const rows = ((data || []) as any[]).filter((r: any) => !excludeSet.has(r?.id));
      const shuffled = rows.slice().sort(() => Math.random() - 0.5);

      // Destaques ativos ("Destaque seu perfil") — priorizam o card no carrossel.
      const highlightSet = new Set<string>();
      const allIds = rows.map((r) => r?.id).filter(Boolean);
      if (allIds.length) {
        try {
          const { data: highlights } = await (supabase as any)
            .from('oculto_profile_highlights')
            .select('profile_id, expires_at, active')
            .in('profile_id', allIds)
            .eq('active', true)
            .gt('expires_at', new Date().toISOString());
          (highlights || []).forEach((h: any) => {
            if (h?.profile_id) highlightSet.add(h.profile_id);
          });
        } catch (err) {
          console.warn('[Oculto] discover highlights fetch failed:', err);
        }
      }
      // Empurra perfis em destaque para o início, mantendo a ordem aleatória dos demais.
      shuffled.sort((a, b) =>
        Number(highlightSet.has(b?.id)) - Number(highlightSet.has(a?.id))
      );

      const candidateByProfileId = new Map<string, any>();
      const candidateByUserId = new Map<string, any>();
      rows.forEach((row) => {
        const profileId = normalizeIdentifier(row?.id);
        const authUserId = normalizeIdentifier(row?.user_id);
        if (profileId) candidateByProfileId.set(profileId, row);
        if (authUserId) candidateByUserId.set(authUserId, row);
      });

      const candidateProfileIds = shuffled.map((r) => r.id).filter(Boolean);
      const followsMeSet = new Set<string>();
      const matchedProfileIds = new Set<string>();
      const matchedIdentifiers = new Set<string>();

      const markMatched = (value: unknown) => {
        const identifier = normalizeIdentifier(value);
        if (!identifier) return;
        matchedIdentifiers.add(identifier);

        const resolved = candidateByProfileId.get(identifier) ?? candidateByUserId.get(identifier);
        const resolvedProfileId = normalizeIdentifier(resolved?.id);
        if (resolvedProfileId) matchedProfileIds.add(resolvedProfileId);
      };

      if (myProfileId && candidateProfileIds.length > 0) {
        const { data: followRows } = await selectFollowerIdsFollowingTarget(candidateProfileIds, myProfileId);
        (followRows || []).forEach((row: any) => {
          if (row?.follower_id) followsMeSet.add(row.follower_id);
        });

        // ── Filtro robusto de MATCH MÚTUO ──
        // Cruza várias tabelas de match e remove cards de quem já fez match com o usuário.
        try {
          const { data: excludedProfiles, error: excludedProfilesError } = await (supabase as any)
            .rpc('discovery_excluded_profiles');

          if (!excludedProfilesError && Array.isArray(excludedProfiles)) {
            excludedProfiles.forEach((row: any) => markMatched(row?.other_profile_id));
          } else {
            const [looking, lucky, ppOut, ppIn, ppaOut, ppaIn, profileLikesOut, profileLikesIn] = await Promise.all([
              (supabase as any)
                .from('looking_now_matches')
                .select('user1_id, user2_id, is_expired')
                .or(`user1_id.eq.${myProfileId},user2_id.eq.${myProfileId}`)
                .limit(2000),
              (supabase as any)
                .from('lucky_matches')
                .select('user_id, matched_user_id')
                .or(`user_id.eq.${myProfileId},matched_user_id.eq.${myProfileId}`)
                .limit(2000),
              (supabase as any)
                .from('perfect_pairs')
                .select('user_id, target_id, action')
                .eq('user_id', myProfileId)
                .in('action', ['like', 'super_like'])
                .limit(2000),
              (supabase as any)
                .from('perfect_pairs')
                .select('user_id, target_id, action')
                .eq('target_id', myProfileId)
                .in('action', ['like', 'super_like'])
                .limit(2000),
              (supabase as any)
                .from('perfect_pair_actions')
                .select('user_id, target_id, action_type')
                .eq('user_id', myProfileId)
                .in('action_type', ['like', 'super_like'])
                .limit(2000),
              (supabase as any)
                .from('perfect_pair_actions')
                .select('user_id, target_id, action_type')
                .eq('target_id', myProfileId)
                .in('action_type', ['like', 'super_like'])
                .limit(2000),
              (supabase as any)
                .from('profile_likes')
                .select('receiver_id')
                .eq('sender_id', myProfileId)
                .limit(2000),
              (supabase as any)
                .from('profile_likes')
                .select('sender_id')
                .eq('receiver_id', myProfileId)
                .limit(2000),
            ]);

            (looking?.data || []).forEach((r: any) => {
              if (r?.is_expired) return;
              markMatched(r?.user1_id === myProfileId ? r?.user2_id : r?.user1_id);
            });
            (lucky?.data || []).forEach((r: any) => {
              markMatched(r?.user_id === myProfileId ? r?.matched_user_id : r?.user_id);
            });

            const myLikes = new Set<string>([
              ...((ppOut?.data || []).map((r: any) => r.target_id)),
              ...((ppaOut?.data || []).map((r: any) => r.target_id)),
              ...((profileLikesOut?.data || []).map((r: any) => r.receiver_id)),
            ].filter(Boolean));
            (ppIn?.data || []).forEach((r: any) => {
              if (r?.user_id && myLikes.has(r.user_id)) markMatched(r.user_id);
            });
            (ppaIn?.data || []).forEach((r: any) => {
              if (r?.user_id && myLikes.has(r.user_id)) markMatched(r.user_id);
            });
            (profileLikesIn?.data || []).forEach((r: any) => {
              if (r?.sender_id && myLikes.has(r.sender_id)) markMatched(r.sender_id);
            });

            const { data: discoveryMatched } = await (supabase as any)
              .from('oculto_discovery_likes')
              .select('user_profile_id, target_profile_id, status')
              .or(`user_profile_id.eq.${myProfileId},target_profile_id.eq.${myProfileId}`)
              .eq('status', 'matched')
              .limit(2000);

            (discoveryMatched || []).forEach((r: any) => {
              markMatched(r?.user_profile_id === myProfileId ? r?.target_profile_id : r?.user_profile_id);
            });
          }
        } catch (err) {
          console.warn('[Oculto] mutual-match filter failed:', err);
        }
      }

      const calcAge = (iso?: string | null): number | null => {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
        return age >= 18 && age < 100 ? age : null;
      };

      const result = shuffled
        .filter((r) => {
          const profileId = normalizeIdentifier(r?.id);
          const authUserId = normalizeIdentifier(r?.user_id);

          if (profileId && matchedProfileIds.has(profileId)) return false;
          if (profileId && matchedIdentifiers.has(profileId)) return false;
          if (authUserId && matchedIdentifiers.has(authUserId)) return false;
          return true;
        })
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          user_id: r.user_id,
          name: r.name || r.username || 'Usuário',
          username: r.username,
          avatar_url: r.avatar_url,
          gender: r.gender,
          age: r.hide_age ? null : calcAge(r.birth_date),
          city: r.hide_location ? null : (r.address_city || null),
          common_interests: 0,
          mutual_following_count: 0,
          follows_me: followsMeSet.has(r.id),
          is_highlighted: highlightSet.has(r.id),
        })) as SuggestedUser[];

      // Reforça a prioridade dos destaques após filtros de match.
      result.sort((a, b) =>
        Number(!!b.is_highlighted) - Number(!!a.is_highlighted)
      );

      if (result.length > 0) saveCache(cacheKey, result);
      return result;
    },
    // Sem rotação automática nem refetch ao remontar: a sessão "Boas-vindas
    // aos novos no Oculto" só muda quando o usuário pede explicitamente
    // (botão atualizar do carrossel) ou quando o cache expira (15 min).
    // Isso evita o flash + nova requisição cada vez que o usuário sai e
    // volta para o feed.
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
    placeholderData: (prev: any) => prev ?? cached?.data,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}

/**
 * Hook para recuperar as preferências globais de descoberta do usuário.
 * Usado para invalidar o cache do carrossel quando os filtros mudam.
 */
export function useDiscoveryPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['discovery-preferences', user?.id],
    queryFn: async () => {
      if (!user?.id) return {};
      const { data } = await supabase
        .from('oculto_discovery_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      return data || {};
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}

