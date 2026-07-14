/**
 * useLikeLimit — agora ancorado no backend (Supabase externo) via RPC peek_usage / check_and_increment_usage.
 * Mantém API legada (canLike, remaining, isFreePlan, recordLike) para não quebrar consumidores.
 * sessionStorage ainda é usado como cache otimista entre renders, mas a verdade é o servidor.
 */
import { useCallback, useEffect, useState } from 'react';
import { useProfile } from './useProfile';
import { useRateLimit } from './useRateLimit';

const FALLBACK_MAX = 20; // bate com seed do plano free para 'like'

export function useLikeLimit() {
  const { profile } = useProfile();
  const isFreePlan = !profile?.plan_type || profile.plan_type === 'free';
  const { status, peek, consume } = useRateLimit('like');

  const [optimisticCount, setOptimisticCount] = useState(0);

  // Não força refetch — `useRateLimit` já dispara um peek compartilhado por
  // feature no primeiro mount (com cache TTL de 30s + dedupe de in-flight).
  // Antes: peek(true) em cada card do feed disparava N RPCs idênticas para
  // peek_usage e saturava a conexão HTTP/2 com o Supabase externo.
  useEffect(() => { void peek(false); }, [peek]);

  const limit = status?.limit ?? FALLBACK_MAX;
  const serverCount = status?.count ?? 0;
  const currentCount = Math.max(serverCount, optimisticCount);
  const unlimited = !!status?.unlimited || !isFreePlan;
  const canLike = unlimited || currentCount < limit;
  const remaining = unlimited ? Infinity : Math.max(0, limit - currentCount);

  const recordLike = useCallback(async () => {
    setOptimisticCount(c => c + 1);
    const r = await consume();
    return r.allowed;
  }, [consume]);

  return {
    canLike,
    remaining,
    isFreePlan,
    maxLikes: limit,
    currentCount,
    recordLike,
  };
}
