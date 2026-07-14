/**
 * useDiscoveryMatches — fonte ÚNICA de "Meus Matches" da seção
 * "Explorar novos misteriosos(as)".
 *
 * Lê `oculto_discovery_likes` em ambas as direções (eu→outro e outro→eu),
 * mantém apenas pares com status='matched' (ativos) e 'cancelled' (histórico
 * = match desfeito) e mapeia para o shape `Match` consumido pelo MatchCard.
 *
 * Não usa Perfect Pair nem looking_now.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import type { Match } from './useMatches';

interface LikeRow {
  id: string;
  user_profile_id: string;
  target_profile_id: string;
  status: 'pending' | 'matched' | 'cancelled';
  match_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface ProfileRow {
  id: string;
  user_id: string | null;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_type: string | null;
  is_verified: boolean | null;
  is_verified_couple: boolean | null;
  plan_type: string | null;
}

interface LookingNowMatchRow {
  id: string;
  user1_id: string;
  user2_id: string;
  distance_km: number | null;
  matched_at: string;
  user1_chat_started: boolean | null;
  user2_chat_started: boolean | null;
  is_expired: boolean | null;
  is_super_match: boolean | null;
  created_at: string;
  updated_at: string;
}

function mapToMatch(myProfileId: string, like: LikeRow, other: ProfileRow, isExpired: boolean): Match {
  const otherIsUser1 = like.user_profile_id !== myProfileId;
  return {
    id: like.match_id ?? like.id,
    user1_id: otherIsUser1 ? like.user_profile_id : myProfileId,
    user2_id: otherIsUser1 ? myProfileId : like.target_profile_id,
    distance_km: 0,
    matched_at: like.updated_at ?? like.created_at,
    user1_chat_started: false,
    user2_chat_started: false,
    is_expired: isExpired,
    is_super_match: false,
    created_at: like.created_at,
    updated_at: like.updated_at ?? like.created_at,
    chat_started: false,
    other_user: {
      id: other.user_id ?? other.id,
      name: other.name || other.username || 'Misterioso(a)',
      username: other.username,
      avatar_url: other.avatar_url,
      is_looking_now: false,
      is_online: false,
      profile_type: other.profile_type || 'single',
      is_verified: !!other.is_verified,
      is_verified_couple: !!other.is_verified_couple,
      plan_type: other.plan_type || 'free',
    },
  };
}

function mapLookingNowToMatch(myProfileId: string, match: LookingNowMatchRow, other: ProfileRow): Match {
  const isUser1 = match.user1_id === myProfileId;
  const otherAuthOrProfileId = isUser1 ? match.user2_id : match.user1_id;

  return {
    id: match.id,
    user1_id: match.user1_id,
    user2_id: match.user2_id,
    distance_km: Number(match.distance_km ?? 0),
    matched_at: match.matched_at,
    user1_chat_started: !!match.user1_chat_started,
    user2_chat_started: !!match.user2_chat_started,
    is_expired: !!match.is_expired,
    is_super_match: !!match.is_super_match,
    created_at: match.created_at,
    updated_at: match.updated_at,
    chat_started: isUser1 ? !!match.user1_chat_started : !!match.user2_chat_started,
    other_user: {
      id: other.user_id ?? otherAuthOrProfileId,
      name: other.name || other.username || 'Misterioso(a)',
      username: other.username,
      avatar_url: other.avatar_url,
      is_looking_now: false,
      is_online: false,
      profile_type: other.profile_type || 'single',
      is_verified: !!other.is_verified,
      is_verified_couple: !!other.is_verified_couple,
      plan_type: other.plan_type || 'free',
    },
  };
}

export function useDiscoveryMatches() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const myProfileId = (profile as any)?.id as string | undefined;

  const query = useQuery({
    queryKey: ['discovery-matches', myProfileId],
    queryFn: async (): Promise<{ active: Match[]; expired: Match[] }> => {
      if (!myProfileId) return { active: [], expired: [] };

      // Busca em ambas as direções: aproximações que eu fiz e aproximações
      // direcionadas a mim. Mantemos apenas matched/cancelled.
      const { data, error } = await (supabase as any)
        .from('oculto_discovery_likes')
        .select('id,user_profile_id,target_profile_id,status,match_id,created_at,updated_at')
        .or(`user_profile_id.eq.${myProfileId},target_profile_id.eq.${myProfileId}`)
        .in('status', ['matched', 'cancelled'])
        .order('updated_at', { ascending: false })
        .limit(500);

      const discoveryRows = (data || []) as LikeRow[];

      // Dedup por par (mantém o registro mais recente por outro perfil).
      type Bucket = { row: LikeRow; otherProfileId: string };
      const byOther = new Map<string, Bucket>();
      discoveryRows.forEach((row) => {
        const otherProfileId = row.user_profile_id === myProfileId
          ? row.target_profile_id
          : row.user_profile_id;
        const existing = byOther.get(otherProfileId);
        if (!existing) {
          byOther.set(otherProfileId, { row, otherProfileId });
          return;
        }
        const newer = (row.updated_at || row.created_at) > (existing.row.updated_at || existing.row.created_at);
        if (newer) byOther.set(otherProfileId, { row, otherProfileId });
      });

      const { data: lookingNowData, error: lookingNowError } = await (supabase as any)
        .from('looking_now_matches')
        .select('id,user1_id,user2_id,distance_km,matched_at,user1_chat_started,user2_chat_started,is_expired,is_super_match,created_at,updated_at')
        .or(`user1_id.eq.${myProfileId},user2_id.eq.${myProfileId}`)
        .order('matched_at', { ascending: false })
        .limit(500);

      const lookingNowRows = (lookingNowError ? [] : (lookingNowData || [])) as LookingNowMatchRow[];
      lookingNowRows.forEach((row) => {
        const otherProfileId = row.user1_id === myProfileId ? row.user2_id : row.user1_id;
        if (!otherProfileId) return;
        const syntheticLike: LikeRow = {
          id: row.id,
          user_profile_id: row.user1_id,
          target_profile_id: row.user2_id,
          status: row.is_expired ? 'cancelled' : 'matched',
          match_id: row.id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
        const existing = byOther.get(otherProfileId);
        if (!existing) {
          byOther.set(otherProfileId, { row: syntheticLike, otherProfileId });
          return;
        }
        const existingIsCancelled = existing.row.status === 'cancelled';
        const incomingIsMatched = syntheticLike.status === 'matched';
        const newer = (syntheticLike.updated_at || syntheticLike.created_at) > (existing.row.updated_at || existing.row.created_at);
        if ((incomingIsMatched && existingIsCancelled) || newer) {
          byOther.set(otherProfileId, { row: syntheticLike, otherProfileId });
        }
      });

      const otherIds = [...byOther.keys()];
      if (!otherIds.length) return { active: [], expired: [] };

      const { data: profs } = await (supabase as any)
        .from('v_public_profiles')
        .select('id,user_id,name,username,avatar_url,profile_type,is_verified,is_verified_couple,plan_type')
        .in('id', otherIds);

      const profById = new Map<string, ProfileRow>();
      (profs || []).forEach((p: ProfileRow) => profById.set(p.id, p));

      const active: Match[] = [];
      const expired: Match[] = [];
      byOther.forEach(({ row, otherProfileId }) => {
        const other = profById.get(otherProfileId);
        if (!other) return; // perfil sumiu (banido/deletado) — esconde
        const lookingNow = lookingNowRows.find((item) => item.id === (row.match_id ?? row.id));
        const isExpired = row.status === 'cancelled';
        const m = lookingNow
          ? mapLookingNowToMatch(myProfileId, lookingNow, other)
          : mapToMatch(myProfileId, row, other, isExpired);
        (isExpired ? expired : active).push(m);
      });

      active.sort((a, b) => new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime());
      expired.sort((a, b) => new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime());

      return { active, expired };
    },
    enabled: !!user?.id && !!myProfileId,
    staleTime: 30_000,
  });

  return {
    activeMatches: query.data?.active ?? [],
    expiredMatches: query.data?.expired ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
