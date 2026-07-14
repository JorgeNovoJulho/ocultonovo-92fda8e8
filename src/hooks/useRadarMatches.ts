/**
 * useRadarMatches — lista todos os matches gerados via Radar
 * (botão "Estou com Sorte" do Radar). Lê `lucky_matches` em ambas as
 * direções (eu→outro e outro→eu) e devolve no shape `Match` consumido pelo
 * MatchCard.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import type { Match } from './useMatches';

interface LuckyRow {
  id: string;
  user_id: string;
  matched_user_id: string;
  compatibility_score: number | null;
  was_contacted: boolean | null;
  created_at: string;
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
  is_online: boolean | null;
  is_looking_now: boolean | null;
  plan_type: string | null;
}

function mapToMatch(myAuthId: string, row: LuckyRow, other: ProfileRow): Match {
  const iAmInitiator = row.user_id === myAuthId;
  return {
    id: row.id,
    user1_id: row.user_id,
    user2_id: row.matched_user_id,
    distance_km: 0,
    matched_at: row.created_at,
    user1_chat_started: false,
    user2_chat_started: false,
    is_expired: false,
    is_super_match: (row.compatibility_score ?? 0) >= 95,
    created_at: row.created_at,
    updated_at: row.created_at,
    chat_started: !!row.was_contacted,
    other_user: {
      id: other.user_id ?? other.id,
      name: other.name || other.username || 'Misterioso(a)',
      username: other.username,
      avatar_url: other.avatar_url,
      is_looking_now: !!other.is_looking_now,
      is_online: !!other.is_online,
      profile_type: other.profile_type || 'single',
      is_verified: !!other.is_verified,
      is_verified_couple: !!other.is_verified_couple,
      plan_type: other.plan_type || 'free',
    },
  };
}

export function useRadarMatches() {
  const { user } = useAuth();
  const myAuthId = user?.id;

  const query = useQuery({
    queryKey: ['radar-matches', myAuthId],
    queryFn: async (): Promise<Match[]> => {
      if (!myAuthId) return [];

      const { data, error } = await (supabase as any)
        .from('lucky_matches')
        .select('id,user_id,matched_user_id,compatibility_score,was_contacted,created_at')
        .or(`user_id.eq.${myAuthId},matched_user_id.eq.${myAuthId}`)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) return [];
      const rows = (data || []) as LuckyRow[];

      // Dedup por outro usuário (mantém o mais recente).
      const byOther = new Map<string, LuckyRow>();
      rows.forEach((r) => {
        const other = r.user_id === myAuthId ? r.matched_user_id : r.user_id;
        if (!other) return;
        const ex = byOther.get(other);
        if (!ex || new Date(r.created_at).getTime() > new Date(ex.created_at).getTime()) {
          byOther.set(other, r);
        }
      });

      const otherIds = [...byOther.keys()];
      if (!otherIds.length) return [];

      const { data: profs } = await (supabase as any)
        .from('profiles')
        .select('id,user_id,name,username,avatar_url,profile_type,is_verified,is_verified_couple,is_online,is_looking_now,plan_type')
        // matched_user_id em lucky_matches pode ser tanto profiles.id quanto auth user_id
        // dependendo de quem chamou — buscamos pelos dois caminhos.
        .or(`id.in.(${otherIds.join(',')}),user_id.in.(${otherIds.join(',')})`);

      const profById = new Map<string, ProfileRow>();
      (profs || []).forEach((p: ProfileRow) => {
        profById.set(p.id, p);
        if (p.user_id) profById.set(p.user_id, p);
      });

      const out: Match[] = [];
      byOther.forEach((row, otherId) => {
        const other = profById.get(otherId);
        if (!other) return;
        out.push(mapToMatch(myAuthId, row, other));
      });

      out.sort((a, b) => new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime());
      return out;
    },
    enabled: !!myAuthId,
    staleTime: 30_000,
  });

  return {
    matches: query.data ?? [],
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
