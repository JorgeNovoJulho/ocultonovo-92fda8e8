import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { selectFollowMaybeSingle } from '@/lib/followsApi';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(isUuid))];
}

async function getMyIdentifiers(userId: string): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('v_public_profiles')
    .select('id, user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.warn('[useFollowsMe] failed to load my identifiers', error);
  }
  return uniq([userId, (data as any)?.user_id, (data as any)?.id]);
}

async function getTargetIdentifiers(targetId: string): Promise<string[]> {
  // If we only have a username (non-UUID slug), resolve via username column.
  const lookup = isUuid(targetId)
    ? (supabase as any).from('v_public_profiles').select('id, user_id').or(`id.eq.${targetId},user_id.eq.${targetId}`).maybeSingle()
    : (supabase as any).from('v_public_profiles').select('id, user_id').eq('username', targetId).maybeSingle();

  const { data, error } = await lookup;
  if (error) {
    logger.warn('[useFollowsMe] failed to load target identifiers', error);
  }
  return uniq([targetId, (data as any)?.user_id, (data as any)?.id]);
}

/**
 * Verifica se o creator (targetId) segue o usuário logado.
 * Em caso de erro, retorna `false` e loga — não quebra a UI.
 */
export function useFollowsMe(targetId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['follows-me', targetId, user?.id],
    queryFn: async () => {
      if (!user?.id || !targetId) return false;

      try {
        const [myIds, targetIds] = await Promise.all([
          getMyIdentifiers(user.id),
          getTargetIdentifiers(targetId),
        ]);

        if (myIds.length === 0 || targetIds.length === 0) return false;

        // Inverte: targetIds são os "follower", myIds são "following"
        const { data, error } = await selectFollowMaybeSingle(targetIds, myIds);
        if (error) {
          logger.error('[useFollowsMe] selectFollowMaybeSingle error', error);
          throw error;
        }
        return !!data;
      } catch (err) {
        logger.error('[useFollowsMe] query failed', err);
        throw err;
      }
    },
    enabled: !!user?.id && !!targetId,
    retry: 1,
    staleTime: 30_000,
  });
}
