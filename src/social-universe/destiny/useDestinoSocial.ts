/**
 * useDestinoSocial — Onda C
 * Conexões raras / encontros recorrentes do usuário logado.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type DestinyRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export interface DestinyLink {
  other_user: string;
  affinity: number;
  encounters: number;
  rarity: DestinyRarity;
  last_seen_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function useDestinoSocial(limit = 10) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['destiny-top', user?.id, limit],
    enabled: !!user?.id,
    queryFn: async (): Promise<DestinyLink[]> => {
      const { data } = await (supabase as any).rpc('destiny_my_top', { p_limit: limit });
      return (data ?? []) as DestinyLink[];
    },
    staleTime: 2 * 60_000,
  });
}

export async function destinyRegisterEncounter(otherUser: string, affinityDelta = 1) {
  try {
    await (supabase as any).rpc('destiny_register_encounter', {
      p_other: otherUser,
      p_affinity_delta: affinityDelta,
    });
  } catch { /* silent — destiny é opcional */ }
}
