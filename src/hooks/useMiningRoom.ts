/**
 * useMiningRoom — Engine de XP de retenção da sala "Mineração".
 *
 * - Tick de 60s chamando `aura_room_mining_tick` (idempotente server-side).
 * - Pausa automaticamente quando a aba fica oculta ou o componente desmonta.
 * - Expõe `awardEvent(ruleKey, refKey, targetUserId?, message?)` para que
 *   os handlers da sala (mensagem, reação, like, mention, convite aceito, etc.)
 *   creditem XP conforme catálogo configurável.
 * - Toasts imediatos para o actor; refresh do saldo via AURA_XP_LEDGER_LOCAL_EVENT.
 */
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { AURA_XP_LEDGER_LOCAL_EVENT } from './useAuraXpInteraction';

export type MiningRuleKey =
  | 'per_minute_idle'
  | 'per_quality_message'
  | 'receive_pulse'
  | 'receive_highlight'
  | 'invite_accepted'
  | 'approach'
  | 'receive_reaction'
  | 'receive_like'
  | 'receive_dislike'
  | 'reply_mention';

interface AwardResult {
  ok: boolean;
  reason: string;
  awarded: number;
  balance: number;
}

const RULE_LABEL: Record<MiningRuleKey, string> = {
  per_minute_idle: 'Tempo em sala',
  per_quality_message: 'Mensagem',
  receive_pulse: 'Pulso recebido',
  receive_highlight: 'Destaque recebido',
  invite_accepted: 'Convite aceito',
  approach: 'Aproximação',
  receive_reaction: 'Reação recebida',
  receive_like: 'Like recebido',
  receive_dislike: 'Dislike recebido',
  reply_mention: 'Resposta/menção',
};

export function useMiningRoom(slug: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  const tickingRef = useRef(false);
  const visibleRef = useRef(typeof document !== 'undefined' ? !document.hidden : true);

  const fireRefresh = useCallback(() => {
    try { window.dispatchEvent(new CustomEvent(AURA_XP_LEDGER_LOCAL_EVENT)); } catch { /* noop */ }
    qc.invalidateQueries({ queryKey: ['aura-progress'] }).catch(() => {});
  }, [qc]);

  const tick = useCallback(async () => {
    if (!slug || tickingRef.current || !visibleRef.current) return;
    tickingRef.current = true;
    try {
      const { data } = await (supabase as any).rpc('aura_room_mining_tick', { p_slug: slug });
      const row = (Array.isArray(data) ? data[0] : data) as AwardResult | undefined;
      if (row?.ok && row.awarded > 0) {
        toast(`+${row.awarded} XP / Mineração`, {
          description: `Saldo: ${row.balance} XP`,
          duration: 1800,
        });
        fireRefresh();
      }
    } finally {
      tickingRef.current = false;
    }
  }, [slug, fireRefresh]);

  const awardEvent = useCallback(
    async (
      ruleKey: MiningRuleKey,
      refKey: string,
      targetUserId?: string | null,
      message?: string | null,
      messageId?: string | null,
    ): Promise<AwardResult | null> => {
      if (!slug) return null;
      const { data, error } = await (supabase as any).rpc('aura_room_mining_award', {
        p_slug: slug,
        p_rule_key: ruleKey,
        p_ref_key: refKey,
        p_target_user_id: targetUserId ?? null,
        p_message: message ?? null,
        p_message_id: messageId ?? null,
      });
      if (error) return null;
      const row = (Array.isArray(data) ? data[0] : data) as AwardResult | undefined;
      if (row?.ok && row.awarded !== 0) {
        const sign = row.awarded > 0 ? '+' : '';
        toast(`${sign}${row.awarded} XP · ${RULE_LABEL[ruleKey]}`, {
          description: `Saldo: ${row.balance} XP`,
          duration: 2000,
        });
        fireRefresh();
        // Notifica o mapa local de XP por mensagem (otimista, increment-only)
        if (messageId && row.awarded > 0) {
          try {
            window.dispatchEvent(
              new CustomEvent('MINING_MSG_XP_UPDATE', {
                detail: { slug, messageId, delta: row.awarded },
              }),
            );
          } catch { /* noop */ }
        }
      } else if (row && !row.ok) {
        // Avisa o painel sobre bloqueios silenciosos (anti-bot/rate-limit) para a
        // regra de mensagem. Estima o cooldown quando aplicável.
        const blockable = new Set([
          'rate_limited', 'msg_too_short', 'msg_low_diversity',
          'msg_blacklisted', 'msg_repetitive',
        ]);
        if (ruleKey === 'per_quality_message' && blockable.has(row.reason)) {
          let cooldownMs = 0;
          if (row.reason === 'rate_limited') cooldownMs = 20_000;
          else if (row.reason === 'msg_repetitive') cooldownMs = 10 * 60_000;
          try {
            window.dispatchEvent(
              new CustomEvent('MINING_RULE_BLOCKED', {
                detail: {
                  slug, ruleKey, reason: row.reason,
                  at: Date.now(), cooldownUntil: cooldownMs ? Date.now() + cooldownMs : null,
                  message: message ?? null,
                },
              }),
            );
          } catch { /* noop */ }
        }
      }
      return row ?? null;
    },
    [slug, fireRefresh],
  );

  useEffect(() => {
    if (!enabled || !slug) return;

    const onVis = () => {
      visibleRef.current = !document.hidden;
      if (visibleRef.current) tick(); // tenta um tick imediato ao voltar
    };
    document.addEventListener('visibilitychange', onVis);

    // primeiro tick após ~10s na sala (evita cobrar ao apenas passar)
    const first = window.setTimeout(() => { tick(); }, 10_000);
    const interval = window.setInterval(() => { tick(); }, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [enabled, slug, tick]);

  return { awardEvent };
}
