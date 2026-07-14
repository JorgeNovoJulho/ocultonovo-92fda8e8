import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import { fetchAuraAttentionHistory } from '@/lib/auraAttentionHistoryApi';

export interface AuraAttentionResult {
  ok: boolean;
  cost_xp: number;
  remaining_xp: number;
  message: string;
  cooldown_seconds_left: number;
}

export interface AuraAttentionStatus {
  cost_xp: number;
  balance_xp: number;
  has_enough: boolean;
  cooldown_seconds_left: number;
}

/** Hook para custo, status (saldo + cooldown) e ação "Chamar atenção". */
export function useAuraAttention(targetUserId?: string | null) {
  const [costXp, setCostXp] = useState<number>(50);
  const [balanceXp, setBalanceXp] = useState<number>(0);
  const [hasEnough, setHasEnough] = useState<boolean>(true);
  const [cooldownLeft, setCooldownLeft] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc('aura_attention_status', {
      p_target_user_id: targetUserId ?? null,
    });
    if (error) return;
    const row = (Array.isArray(data) ? data[0] : data) as AuraAttentionStatus | undefined;
    if (!row) return;
    setCostXp(row.cost_xp);
    setBalanceXp(row.balance_xp);
    setHasEnough(row.has_enough);
    setCooldownLeft(row.cooldown_seconds_left);
  }, [targetUserId]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Decrementa cooldown localmente a cada 1s
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const i = setInterval(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, [cooldownLeft > 0]);

  const sendAttention = useCallback(async (target: string): Promise<AuraAttentionResult | null> => {
    if (!target) return null;
    // Snapshot para reverter em caso de erro
    const prevBalance = balanceXp;
    const prevCooldown = cooldownLeft;
    const prevHasEnough = hasEnough;

    // Atualização OTIMISTA: debita custo e ativa cooldown completo (6h) imediatamente
    const optimisticBalance = Math.max(0, balanceXp - costXp);
    setBalanceXp(optimisticBalance);
    setHasEnough(optimisticBalance >= costXp);
    setCooldownLeft(21600);
    setBusy(true);

    const { data, error } = await (supabase as any).rpc('aura_send_attention', {
      p_target_user_id: target,
    });
    setBusy(false);

    if (error) {
      // Reverte otimismo
      setBalanceXp(prevBalance);
      setCooldownLeft(prevCooldown);
      setHasEnough(prevHasEnough);
      toast.error('Não foi possível chamar atenção', { description: error.message });
      return null;
    }
    const r = (Array.isArray(data) ? data[0] : data) as AuraAttentionResult | undefined;
    if (!r) {
      setBalanceXp(prevBalance);
      setCooldownLeft(prevCooldown);
      setHasEnough(prevHasEnough);
      return null;
    }
    if (r.ok) {
      toast.success('✨ Atenção chamada!', {
        description: `Custou ${r.cost_xp} XP · Restam ${r.remaining_xp} XP`,
      });
      // Reconcilia com valor real do servidor
      setBalanceXp(r.remaining_xp);
      setHasEnough(r.remaining_xp >= r.cost_xp);
      setCooldownLeft(r.cooldown_seconds_left || 21600);
    } else {
      // Falha lógica (cooldown ainda ativo, XP insuficiente etc.) — reverte e aplica estado real
      setBalanceXp(r.remaining_xp);
      setHasEnough(r.remaining_xp >= r.cost_xp);
      setCooldownLeft(r.cooldown_seconds_left || 0);
      toast.warning(r.message || 'Ação bloqueada');
    }
    return r;
  }, [balanceXp, cooldownLeft, hasEnough, costXp]);

  return {
    costXp, balanceXp, hasEnough, cooldownLeft,
    busy, sendAttention, refreshStatus,
  };
}

// =====================================================================
// Histórico de atenções (enviadas + recebidas)
// =====================================================================
export interface AuraAttentionRow {
  id: string;
  direction: 'sent' | 'received';
  other_user_id: string;
  other_username: string | null;
  other_name: string | null;
  other_avatar: string | null;
  cost_xp: number;
  created_at: string;
}

export function useAuraAttentionsHistory(limit = 30) {
  const [items, setItems] = useState<AuraAttentionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoading(false);
    try {
      const data = await fetchAuraAttentionHistory({ direction: 'all', limit, before: null });
      setItems(data as AuraAttentionRow[]);
    } catch {
      setItems([]);
    }
  }, [limit]);

  useEffect(() => { refresh(); }, [refresh]);
  return { items, loading, refresh };
}
