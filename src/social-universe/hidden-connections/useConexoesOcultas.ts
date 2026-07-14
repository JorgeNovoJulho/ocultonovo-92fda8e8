/**
 * useConexoesOcultas — Onda C
 * Descobertas raras limitadas (até 5/dia). UI mostra "hint" antes da revelação.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useCallback } from 'react';

export interface HiddenConnection {
  id: string;
  target_user: string;
  rarity: 'rare' | 'epic' | 'mythic';
  hint: string | null;
  revealed: boolean;
  expires_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function useConexoesOcultas() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['hidden-connections', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<HiddenConnection[]> => {
      const { data } = await (supabase as any).rpc('hidden_connections_today');
      return (data ?? []) as HiddenConnection[];
    },
    staleTime: 5 * 60_000,
  });

  const reveal = useCallback(async (id: string) => {
    await (supabase as any).rpc('hidden_connection_reveal', { p_id: id });
    qc.invalidateQueries({ queryKey: ['hidden-connections', user?.id] });
  }, [qc, user?.id]);

  return { items: q.data ?? [], isLoading: q.isLoading, reveal };
}
