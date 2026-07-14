/**
 * useAuraXpLedger — Histórico do ledger de XP de interação do usuário atual.
 * Mostra movimentações onde o usuário é actor (débito) ou receiver (crédito).
 * RLS na tabela já garante o filtro por profile.id do usuário logado.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';

export interface AuraXpLedgerEntry {
  id: string;
  actor_id: string;
  receiver_id: string | null;
  action_key: string;
  actor_cost: number;
  receiver_reward: number;
  post_id: string | null;
  created_at: string;
  actor_username?: string | null;
  receiver_username?: string | null;
  direction: 'in' | 'out' | 'self';
  delta: number;
}

const ACTION_LABEL: Record<string, string> = {
  post_like: 'Curtir',
  post_dislike: 'Descurtir',
  post_comment: 'Comentar',
  post_save: 'Salvar',
  post_share: 'Compartilhar',
  view_likers: 'Ver curtidas',
  view_comments: 'Ler comentários',
};

export function labelForAction(key: string): string {
  return ACTION_LABEL[key] ?? key;
}

export function useAuraXpLedger(limit = 50) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['aura-xp-ledger', user?.id, limit],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async (): Promise<AuraXpLedgerEntry[]> => {
      if (!user?.id) return [];
      const { data: prof } = await (supabase as any)
        .from('v_public_profiles').select('id').eq('user_id', user.id).maybeSingle();
      const myProfileId = prof?.id as string | undefined;
      if (!myProfileId) return [];

      const { data, error } = await (supabase as any)
        .from('oculto_aura_xp_interaction_ledger')
        .select('id, actor_id, receiver_id, action_key, actor_cost, receiver_reward, post_id, created_at')
        .or(`actor_id.eq.${myProfileId},receiver_id.eq.${myProfileId}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      const rows = (data ?? []) as AuraXpLedgerEntry[];

      // Resolve usernames em batch
      const ids = Array.from(new Set(rows.flatMap((r) => [r.actor_id, r.receiver_id]).filter(Boolean))) as string[];
      const map: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await (supabase as any)
          .from('v_public_profiles').select('id, username').in('id', ids);
        (profs ?? []).forEach((p: any) => { map[p.id] = p.username ?? ''; });
      }

      return rows.map((r) => {
        const isActor = r.actor_id === myProfileId;
        const isReceiver = r.receiver_id === myProfileId;
        const direction: AuraXpLedgerEntry['direction'] =
          isActor && isReceiver ? 'self' : isActor ? 'out' : 'in';
        const delta = direction === 'out' ? -(r.actor_cost || 0) : (r.receiver_reward || 0);
        return {
          ...r,
          actor_username: map[r.actor_id] ?? null,
          receiver_username: r.receiver_id ? (map[r.receiver_id] ?? null) : null,
          direction,
          delta,
        };
      });
    },
  });

  // Realtime: invalida ao receber novos eventos do ledger
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable('oculto_aura_xp_interaction_ledger', () => {
      qc.invalidateQueries({ queryKey: ['aura-xp-ledger'] }).catch(() => {});
    }, { events: ['INSERT'] });
    return () => { unsub(); };
  }, [user?.id, qc]);


  return query;
}
