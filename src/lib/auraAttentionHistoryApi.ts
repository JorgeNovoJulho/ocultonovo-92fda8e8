import { supabase } from '@/lib/supabaseExternal';

export type AuraAttentionHistoryDirection = 'all' | 'received' | 'sent' | 'responded' | 'expired';

export interface AuraAttentionHistoryRow {
  id: string;
  direction: 'sent' | 'received';
  other_user_id: string;
  other_username: string | null;
  other_name: string | null;
  other_avatar: string | null;
  cost_xp?: number | null;
  room_id: string | null;
  pulse_type: 'default' | 'premium' | 'rare' | 'silent';
  status: 'sent' | 'responded' | 'ignored' | 'blocked';
  created_at: string;
  responded_at: string | null;
  expires_at: string | null;
}

interface LegacyAuraAttentionHistoryRow {
  id: string;
  direction: 'sent' | 'received';
  other_user_id: string;
  other_username: string | null;
  other_name: string | null;
  other_avatar: string | null;
  cost_xp?: number;
  created_at: string;
}

function isMissingRpc(error: unknown, rpcName: string) {
  const code = String((error as { code?: string } | null)?.code ?? '');
  const message = String((error as { message?: string } | null)?.message ?? '');

  return (
    code === 'PGRST202' ||
    (message.includes('Could not find the function') && message.includes(rpcName)) ||
    (message.includes('schema cache') && message.includes(rpcName))
  );
}

function mapLegacyRow(row: LegacyAuraAttentionHistoryRow): AuraAttentionHistoryRow {
  return {
    id: row.id,
    direction: row.direction,
    other_user_id: row.other_user_id,
    other_username: row.other_username,
    other_name: row.other_name,
    other_avatar: row.other_avatar,
    cost_xp: row.cost_xp ?? null,
    room_id: null,
    pulse_type: 'default',
    status: 'sent',
    created_at: row.created_at,
    responded_at: null,
    expires_at: null,
  };
}

function applyLegacyFilters(
  rows: AuraAttentionHistoryRow[],
  direction: AuraAttentionHistoryDirection,
  before: string | null,
  limit: number,
) {
  let filtered = rows;

  if (direction === 'received' || direction === 'sent') {
    filtered = filtered.filter((row) => row.direction === direction);
  } else if (direction === 'responded' || direction === 'expired') {
    filtered = [];
  }

  if (before) {
    const beforeTime = new Date(before).getTime();
    filtered = filtered.filter((row) => new Date(row.created_at).getTime() < beforeTime);
  }

  return filtered.slice(0, limit);
}

export async function fetchAuraAttentionHistory(params: {
  direction: AuraAttentionHistoryDirection;
  limit: number;
  before: string | null;
}): Promise<AuraAttentionHistoryRow[]> {
  const primary = await (supabase as any).rpc('aura_attention_history', {
    p_direction: params.direction,
    p_limit: params.limit,
    p_before: params.before,
  });

  if (!primary.error) {
    return Array.isArray(primary.data) ? (primary.data as AuraAttentionHistoryRow[]) : [];
  }

  if (!isMissingRpc(primary.error, 'aura_attention_history')) {
    throw primary.error;
  }

  const legacyLimit = params.before ? Math.max(params.limit * 4, 100) : params.limit;
  const legacy = await (supabase as any).rpc('aura_attentions_history', { p_limit: legacyLimit });

  if (legacy.error) {
    throw primary.error;
  }

  const mapped = Array.isArray(legacy.data)
    ? (legacy.data as LegacyAuraAttentionHistoryRow[]).map(mapLegacyRow)
    : [];

  return applyLegacyFilters(mapped, params.direction, params.before, params.limit);
}

export async function clearAuraAttentionHistory(pUser: string | null = null) {
  const result = await (supabase as any).rpc('aura_attention_history_clear', { p_user: pUser });

  if (!result.error) {
    return { data: result.data, error: null };
  }

  if (isMissingRpc(result.error, 'aura_attention_history_clear')) {
    return {
      data: { ok: false, error: 'missing_clear_rpc' },
      error: null,
    };
  }

  return { data: null, error: result.error };
}