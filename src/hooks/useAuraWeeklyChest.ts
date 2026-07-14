import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

export interface ChestStatus {
  week_key: string;
  claimed: boolean;
  claimed_at: string | null;
  next_claim_at: string;
  level: number;
  xp_preview: number;
  super_dm_preview: number;
}

export interface ChestHistoryRow {
  week_key: string;
  claimed_at: string;
  level_at_claim: number;
  xp_awarded: number;
  super_dm_awarded: number;
}

function currentWeekKeySaoPaulo(from = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? from.getFullYear());
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? from.getMonth() + 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? from.getDate());
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const isoDay = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay);

  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${isoYear}-${String(week).padStart(2, '0')}`;
}

function reconcileChestStatus(row: ChestStatus, historyRows: ChestHistoryRow[]): ChestStatus {
  const currentClientWeekKey = currentWeekKeySaoPaulo();
  const currentWeekClaim = historyRows.find((item) => item.week_key === row.week_key)
    ?? historyRows.find((item) => item.week_key === currentClientWeekKey);

  if (!currentWeekClaim) {
    const nextMs = row.next_claim_at ? new Date(row.next_claim_at).getTime() : 0;
    if (row.claimed && nextMs <= Date.now()) {
      return {
        ...row,
        next_claim_at: nextMondaySaoPaulo().toISOString(),
      };
    }

    return row;
  }

  const nextMs = row.next_claim_at ? new Date(row.next_claim_at).getTime() : 0;

  return {
    ...row,
    claimed: true,
    claimed_at: currentWeekClaim.claimed_at,
    next_claim_at:
      nextMs > Date.now()
        ? row.next_claim_at
        : nextMondaySaoPaulo(new Date(currentWeekClaim.claimed_at)).toISOString(),
    level: row.level ?? 1,
    xp_preview: currentWeekClaim.xp_awarded,
    super_dm_preview: currentWeekClaim.super_dm_awarded,
  };
}

function buildStatusFromHistory(historyRows: ChestHistoryRow[], previousStatus: ChestStatus | null): ChestStatus | null {
  const currentClientWeekKey = currentWeekKeySaoPaulo();
  const currentWeekClaim = historyRows.find((item) => item.week_key === currentClientWeekKey);

  if (!currentWeekClaim) return previousStatus;

  return {
    week_key: currentClientWeekKey,
    claimed: true,
    claimed_at: currentWeekClaim.claimed_at,
    next_claim_at: nextMondaySaoPaulo(new Date(currentWeekClaim.claimed_at)).toISOString(),
    level: previousStatus?.level ?? currentWeekClaim.level_at_claim ?? 1,
    xp_preview: currentWeekClaim.xp_awarded,
    super_dm_preview: currentWeekClaim.super_dm_awarded,
  };
}

// Próxima segunda-feira 00:00 em America/Sao_Paulo (em ms UTC).
function nextMondaySaoPaulo(from = new Date()): Date {
  const spStr = from.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const sp = new Date(spStr);
  const dayIdx = (sp.getDay() + 6) % 7;
  const daysUntilNextMonday = 7 - dayIdx;
  const targetSp = new Date(sp);
  targetSp.setDate(sp.getDate() + daysUntilNextMonday);
  targetSp.setHours(0, 0, 0, 0);
  const offsetMin = (sp.getTime() - from.getTime()) / 60000;
  return new Date(targetSp.getTime() - offsetMin * 60000);
}

export function useAuraWeeklyChest() {
  const [status, setStatus] = useState<ChestStatus | null>(null);
  const [history, setHistory] = useState<ChestHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [statusRes, histRes] = await Promise.all([
      (supabase as any).rpc('aura_weekly_chest_status'),
      (supabase as any).rpc('aura_weekly_chest_history', { p_limit: 12 }),
    ]);
    const historyRows = !histRes.error && Array.isArray(histRes.data)
      ? (histRes.data as ChestHistoryRow[])
      : [];

    if (!statusRes.error && Array.isArray(statusRes.data) && statusRes.data[0]) {
      setStatus(reconcileChestStatus(statusRes.data[0] as ChestStatus, historyRows));
      setJustClaimed(false);
    } else if (historyRows.length > 0) {
      setStatus((prev) => buildStatusFromHistory(historyRows, prev));
    }
    if (historyRows.length > 0 || (!histRes.error && Array.isArray(histRes.data))) {
      setHistory(historyRows);
    }
    setLoading(false);
  }, []);

  // Carrega ao montar e quando o app volta ao foco / aba visível.
  useEffect(() => {
    refresh();
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    const onFocus = () => refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const claim = useCallback(async () => {
    setClaiming(true);
    const { data, error } = await (supabase as any).rpc('aura_weekly_chest_claim');
    setClaiming(false);
    if (error) { toast.error('Erro ao abrir cofre'); return; }
    const res = Array.isArray(data) ? data[0] : data;
    if (!res?.ok) { toast.error(res?.message || 'Não foi possível abrir o cofre'); refresh(); return; }

    // Otimismo: marca como aberto imediatamente com cronômetro confiável.
    const now = new Date();
    const nextClaim = nextMondaySaoPaulo(now);
    setJustClaimed(true);
    setStatus((prev) => ({
      week_key: prev?.week_key ?? '',
      claimed: true,
      claimed_at: now.toISOString(),
      next_claim_at: nextClaim.toISOString(),
      level: res.level ?? prev?.level ?? 1,
      xp_preview: res.xp_awarded ?? prev?.xp_preview ?? 50,
      super_dm_preview: res.super_dm_awarded ?? prev?.super_dm_preview ?? 0,
    }));

    toast.success(
      `+${res.xp_awarded} XP${res.super_dm_awarded ? ` · +${res.super_dm_awarded} Super DM grátis` : ''}`,
      { description: res.level_up ? `Subiu para o nível ${res.level}!` : `Nível ${res.level}` }
    );
    // Re-sincroniza com o servidor (status + histórico) sem reverter a UI.
    setTimeout(() => { refresh(); }, 600);
  }, [refresh]);

  return { status, history, loading, claiming, claim, refresh, justClaimed };
}
