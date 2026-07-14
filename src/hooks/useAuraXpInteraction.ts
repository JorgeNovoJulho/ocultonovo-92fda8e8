/**
 * useAuraXpInteraction — Economia de XP nas interações do feed e ferramentas.

 *
 * Hook central: carrega catálogo configurável (RPC aura_xp_interaction_config_list)
 * e expõe `chargeAction()` que chama a RPC `aura_xp_interaction_charge`.
 *
 * Em caso de saldo insuficiente, dispara evento global `AURA_XP_INSUFFICIENT`
 * para que o modal global `InsufficientXpModal` apareça automaticamente.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { logger } from '@/lib/logger';

export type AuraXpActionKey =
  | 'post_like'
  | 'post_dislike'
  | 'post_comment'
  | 'post_save'
  | 'post_share'
  | 'view_likers'
  | 'view_comments'
  | string;

export interface AuraXpCostConfig {
  action_key: AuraXpActionKey | string;
  actor_cost: number;
  receiver_reward: number;
  enabled: boolean;
  description: string | null;
  updated_at?: string;
}

export const AURA_XP_INSUFFICIENT_EVENT = 'AURA_XP_INSUFFICIENT';
export const AURA_XP_LEDGER_LOCAL_EVENT = 'AURA_XP_LEDGER_LOCAL';

export interface InsufficientXpDetail {
  actionKey: string;
  required: number;
  balance: number;
}

export interface ChargeResult {
  ok: boolean;
  reason: string;
  actor_cost: number;
  receiver_reward: number;
  actor_balance: number;
  receiver_balance: number;
}

export interface ChargeArgs {
  actionKey: AuraXpActionKey;
  postId?: string | null;
  receiverId?: string | null; // profiles.id do autor
  refKey: string;
}

export function useAuraXpCatalog() {
  const qc = useQueryClient();

  // Realtime: invalida catálogo + chave global sempre que admin altera no painel
  useEffect(() => {
    const unsubs = [
      subscribeTable('aura_xp_interaction_config', () => {
        qc.invalidateQueries({ queryKey: ['aura-xp-interaction-catalog'] });
        qc.invalidateQueries({ queryKey: ['aura-xp-admin-features'] });
      }),
      subscribeTable('aura_xp_global_config', () => {
        qc.invalidateQueries({ queryKey: ['aura-xp-global-config'] });
        (window as any).__XP_BILLING_ENABLED = undefined;
      }),
    ];
    return () => { unsubs.forEach((u) => u()); };
  }, [qc]);

  return useQuery({
    queryKey: ['aura-xp-interaction-catalog'],
    queryFn: async (): Promise<AuraXpCostConfig[]> => {
      const { data, error } = await (supabase as any).rpc('aura_xp_admin_features_list');
      if (error) return [];
      return (data ?? []) as AuraXpCostConfig[];
    },
    staleTime: 30_000,
  });
}

export function useAuraXpInteraction() {
  const qc = useQueryClient();
  const { data: catalog } = useAuraXpCatalog();

  const getCost = useCallback(
    (actionKey: AuraXpActionKey): AuraXpCostConfig | undefined =>
      catalog?.find((c) => c.action_key === actionKey),
    [catalog],
  );

  const chargeAction = useCallback(
    async ({ actionKey, postId, receiverId, refKey }: ChargeArgs): Promise<ChargeResult> => {
      // 1. Verificar se a cobrança global está ativa
      const { data: globalConfig } = await supabase.from('aura_xp_global_config').select('billing_enabled').maybeSingle();
      
      if (globalConfig && !globalConfig.billing_enabled) {
        return {
          ok: true,
          reason: 'disabled_globally',
          actor_cost: 0,
          receiver_reward: 0,
          actor_balance: 0,
          receiver_balance: 0
        };
      }

      const { data, error } = await (supabase as any).rpc('aura_xp_interaction_charge', {
        p_action_key: actionKey,
        p_post_id: postId ?? null,
        p_receiver_id: receiverId ?? null,
        p_ref_key: refKey,
      });

      // Degradação graciosa: se a RPC falhar (rede/ausente/policy), NÃO bloqueia
      // a ação e NÃO incomoda o usuário com toast — a ação já foi liberada.
      // Logamos no console para diagnóstico do admin.
      if (error) {
        const code = (error as any)?.code || '';
        const msg = (error as any)?.message || '';
        if (code === 'PGRST202' || /function .* does not exist/i.test(msg)) {
          return { ok: true, reason: 'rpc_missing', actor_cost: 0, receiver_reward: 0, actor_balance: 0, receiver_balance: 0 };
        }
        if (typeof console !== 'undefined') {
          logger.log('[aura-xp] charge failed (silenciado):', code, msg);
        }
        return { ok: true, reason: 'network_error', actor_cost: 0, receiver_reward: 0, actor_balance: 0, receiver_balance: 0 };
      }

      const row = (Array.isArray(data) ? data[0] : data) as ChargeResult | undefined;
      if (!row) {
        return { ok: true, reason: 'empty_response', actor_cost: 0, receiver_reward: 0, actor_balance: 0, receiver_balance: 0 };
      }

      // Bloqueio real: saldo insuficiente — dispara modal global
      if (!row.ok && row.reason === 'insufficient_xp') {
        try {
          window.dispatchEvent(
            new CustomEvent<InsufficientXpDetail>(AURA_XP_INSUFFICIENT_EVENT, {
              detail: { actionKey, required: row.actor_cost, balance: row.actor_balance },
            }),
          );
        } catch {/* noop */}
        return row;
      }

      // Outros "não-ok" — não bloqueia a UX, avisa e libera a ação.
      if (!row.ok) {
        if (row.reason === 'unauthenticated') {
          toast.error('Sessão expirada', { description: 'Faça login novamente para creditar XP.' });
        } else if (row.reason === 'daily_limit_reached' || row.reason === 'rate_limited') {
          toast('Limite diário de XP atingido', {
            description: 'Você já recebeu o XP máximo desta ação hoje. A ação continua liberada.',
            duration: 2600,
          });
        } else if (row.reason && !['self_action', 'already_charged', 'disabled'].includes(row.reason)) {
          toast('XP não creditado', { description: row.reason, duration: 2000 });
        }
        return { ...row, ok: true };
      }

      if (row.reason !== 'already_charged' && row.reason !== 'self_action' && row.reason !== 'disabled') {
        qc.invalidateQueries({ queryKey: ['aura-progress'] }).catch(() => {});
        qc.invalidateQueries({ queryKey: ['aura-xp-ledger'] }).catch(() => {});
        try {
          window.dispatchEvent(new CustomEvent(AURA_XP_LEDGER_LOCAL_EVENT, { detail: row }));
        } catch {/* noop */}

        if (row.actor_cost > 0) {
          toast(`-${row.actor_cost} XP`, {
            description: `Saldo atual: ${row.actor_balance} XP`,
            duration: 2200,
          });
        }

        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['aura-progress'] }).catch(() => {});
        }, 4000);
      }

      return row;
    },
    [qc],
  );


  return { catalog: catalog ?? [], getCost, chargeAction };
}
