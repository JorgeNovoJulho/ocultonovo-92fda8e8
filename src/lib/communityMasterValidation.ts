import { supabase } from '@/lib/supabaseExternal';

export async function validateMasterCommunityCreation(): Promise<{
  ok: boolean;
  status?: string | null;
  reason?: string | null;
}> {
  const { data, error } = await (supabase as any).rpc('community_master_create_validation');
  if (error) return { ok: false, reason: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: row?.ok === true && row?.created_status !== 'pending_review',
    status: row?.created_status ?? null,
    reason: row?.reason ?? null,
  };
}
