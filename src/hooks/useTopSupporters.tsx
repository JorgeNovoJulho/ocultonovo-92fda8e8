import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";

export interface TopSupporter {
  supporter_id: string;
  supporter_name: string;
  supporter_avatar: string | null;
  supporter_username: string | null;
  is_anonymous: boolean;
  total_spent: number;
  rank_position: number;
}

export interface MyRankingPosition {
  my_position: number;
  my_total_spent: number;
  amount_to_top3: number;
  amount_to_top10: number;
}

export function useTopSupporters(creatorId: string | undefined, limit: number = 10) {
  return useQuery({
    queryKey: ['top-supporters', creatorId, limit],
    queryFn: async (): Promise<TopSupporter[]> => {
      if (!creatorId) return [];
      
      const { data, error } = await supabase.rpc('get_monthly_top_supporters', {
        p_creator_id: creatorId,
        p_limit: limit
      });
      
      if (error) {
        console.error('Error fetching top supporters:', error);
        throw error;
      }
      
      return (data || []) as TopSupporter[];
    },
    enabled: !!creatorId,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

export function useMyRankingPosition(creatorId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['my-ranking-position', creatorId, user?.id],
    queryFn: async (): Promise<MyRankingPosition | null> => {
      if (!creatorId || !user?.id) return null;
      
      // Buscar o profile_id do usuário atual
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (!profile) return null;
      
      const { data, error } = await supabase.rpc('get_my_ranking_position', {
        p_creator_id: creatorId,
        p_user_id: profile.id
      });
      
      if (error) {
        console.error('Error fetching my ranking position:', error);
        return null;
      }
      
      // RPC retorna array, pegar primeiro item
      const result = Array.isArray(data) ? data[0] : data;
      return result as MyRankingPosition | null;
    },
    enabled: !!creatorId && !!user?.id,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreatorShowsRanking(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-shows-ranking', creatorId],
    queryFn: async (): Promise<boolean> => {
      if (!creatorId) return false;
      
      const { data, error } = await (supabase as any)
        .from('v_public_profiles')
        .select('show_fan_ranking')
        .eq('id', creatorId)
        .single();
      
      if (error) {
        console.error('Error checking creator ranking setting:', error);
        return false;
      }
      
      return data?.show_fan_ranking ?? true;
    },
    enabled: !!creatorId,
  });
}
