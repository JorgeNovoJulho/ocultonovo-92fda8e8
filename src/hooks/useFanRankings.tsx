import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface FanRanking {
  fan_id: string;
  fan_name: string;
  fan_avatar: string | null;
  fan_username: string | null;
  total_points: number;
  rank_position: number;
}

export function useFanRankings(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['fan-rankings', creatorId],
    queryFn: async (): Promise<FanRanking[]> => {
      if (!creatorId) return [];

      const { data, error } = await (supabase as any)
        .from('fan_rankings')
        .select('*')
        .eq('creator_id', creatorId)
        .order('total_points', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[FanRankings] Erro ao buscar:', error.message);
        return [];
      }

      const rows = (data || []).map((row: any, idx: number) => ({
        fan_id: row.fan_id || row.id,
        fan_name: row.fan_name || row.full_name || 'Anônimo',
        fan_avatar: row.fan_avatar || row.avatar_url || null,
        fan_username: row.fan_username || row.username || null,
        total_points: row.total_points ?? row.points ?? 0,
        rank_position: row.rank_position ?? idx + 1,
      }));

      // Enriquecer com username vindo de profiles (privacidade: nunca expor nome real)
      const missing = rows.filter((r) => !r.fan_username).map((r) => r.fan_id);
      if (missing.length > 0) {
        const { data: profs } = await (supabase as any)
          .from('profiles')
          .select('id, user_id, username, avatar_url')
          .or(
            `id.in.(${missing.join(',')}),user_id.in.(${missing.join(',')})`
          );
        const map = new Map<string, any>();
        (profs || []).forEach((p: any) => {
          if (p.id) map.set(p.id, p);
          if (p.user_id) map.set(p.user_id, p);
        });
        rows.forEach((r) => {
          const p = map.get(r.fan_id);
          if (p) {
            r.fan_username = r.fan_username || p.username || null;
            r.fan_avatar = r.fan_avatar || p.avatar_url || null;
          }
        });
      }

      return rows;
    },
    enabled: !!creatorId,
    staleTime: 300_000,
    placeholderData: [],
  });
}

