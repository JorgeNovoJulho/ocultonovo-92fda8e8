import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export interface PublicActivity {
  id: string;
  activity_type: 'subscription' | 'gift' | 'ppv_purchase' | 'poll_vote' | 'auction_bid';
  actor_name: string;
  actor_avatar_url: string | null;
  actor_id: string | null;
  target_creator_name: string;
  target_creator_id: string | null;
  amount: number | null;
  is_anonymous: boolean;
  metadata: Record<string, any>;
  created_at: string;
}

// Activity type configurations
export const activityConfig: Record<string, {
  icon: string;
  verb: string;
  anonymousVerb: string;
  color: string;
  bgColor: string;
}> = {
  subscription: {
    icon: '⭐',
    verb: 'assinou',
    anonymousVerb: 'Um Fã Secreto assinou',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
  gift: {
    icon: '🎁',
    verb: 'enviou um presente de',
    anonymousVerb: 'Um Fã Secreto enviou um presente de',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
  },
  ppv_purchase: {
    icon: '🔓',
    verb: 'comprou conteúdo exclusivo de',
    anonymousVerb: 'Um Fã Secreto comprou conteúdo exclusivo de',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
  poll_vote: {
    icon: '📊',
    verb: 'votou em enquete de',
    anonymousVerb: 'Um Fã Secreto votou em enquete de',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  auction_bid: {
    icon: '🔨',
    verb: 'deu um lance no leilão de',
    anonymousVerb: 'Um Fã Secreto deu um lance no leilão de',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
  },
};

// Fetch recent activities
export function usePublicActivities(limit: number = 20) {
  const queryClient = useQueryClient();
  const [realtimeActivities, setRealtimeActivities] = useState<PublicActivity[]>([]);

  const fetchActivities = async (selectClause: string) => {
    const { data, error } = await (supabase as any)
      .from('public_activities')
      .select(selectClause)
      .order('created_at', { ascending: false })
      .limit(limit);

    return { data, error };
  };

  // Fetch initial activities
  const query = useQuery({
    queryKey: ['public-activities', limit],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        // Tentativa progressiva: full -> sem metadata -> mínimo
        const attempts = [
          'id,activity_type,actor_name,actor_avatar_url,actor_id,target_creator_name,target_creator_id,amount,is_anonymous,metadata,created_at',
          'id,activity_type,actor_name,actor_avatar_url,actor_id,target_creator_name,target_creator_id,amount,is_anonymous,created_at',
          'id,activity_type,actor_name,target_creator_name,amount,created_at',
        ];
        for (const sel of attempts) {
          const { data, error } = await fetchActivities(sel);
          if (!error) return (data || []) as PublicActivity[];
          const code = String(error?.code || '').toUpperCase();
          // 42703 = coluna ausente; PGRST204 = cache stale; tenta próximo nível
          if (code !== '42703' && code !== 'PGRST204') break;
        }
        return [];
      } catch {
        return [];
      }
    },
    refetchInterval: 120000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const unsub = subscribeTable(
      'public_activities',
      (payload: any) => {
        const newActivity = payload.new as PublicActivity;
        if (!newActivity) return;

        setRealtimeActivities(prev => {
          if (prev.some(a => a.id === newActivity.id)) return prev;
          return [newActivity, ...prev].slice(0, 50);
        });

        queryClient.invalidateQueries({ queryKey: ['public-activities'] });
      },
      { events: ['INSERT'] },
    );

    return () => {
      unsub();
    };
  }, [queryClient]);

  // Merge realtime activities with fetched activities
  const allActivities = [...realtimeActivities, ...(query.data || [])];
  
  // Deduplicate and sort by created_at
  const uniqueActivities = allActivities
    .filter((activity, index, self) => 
      index === self.findIndex(a => a.id === activity.id)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);

  return {
    activities: uniqueActivities,
    isLoading: query.isLoading,
    error: query.error,
    newActivityCount: realtimeActivities.length,
  };
}

// Format activity message
export function formatActivityMessage(activity: PublicActivity): string {
  const config = activityConfig[activity.activity_type];
  
  if (activity.is_anonymous) {
    if (activity.activity_type === 'gift' && activity.amount) {
      return `${config.anonymousVerb} R$ ${activity.amount.toFixed(2)} para ${activity.target_creator_name}`;
    }
    return `${config.anonymousVerb} ${activity.target_creator_name}`;
  }
  
  if (activity.activity_type === 'gift' && activity.amount) {
    return `${activity.actor_name} ${config.verb} R$ ${activity.amount.toFixed(2)} para ${activity.target_creator_name}`;
  }
  
  if (activity.activity_type === 'subscription' && activity.amount) {
    return `${activity.actor_name} ${config.verb} ${activity.target_creator_name} por R$ ${activity.amount.toFixed(2)}/mês`;
  }
  
  return `${activity.actor_name} ${config.verb} ${activity.target_creator_name}`;
}

// Format relative time
export function formatActivityTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 5) return 'agora';
  if (diffSecs < 60) return `${diffSecs}s`;
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
