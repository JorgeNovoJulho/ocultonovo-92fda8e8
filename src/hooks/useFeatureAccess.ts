/**
 * useFeatureAccess — chama check_and_increment_usage UMA VEZ por mount/sessão
 * (debouncado em sessionStorage para não consumir a janela a cada re-render).
 *
 * Uso ideal para "page-view"-style: feed_view, profile_view, story_view.
 *
 *   const { checking, allowed, status } = useFeatureAccess('feed_view');
 *   if (!allowed) return <UpgradeBlock reason={status?.reason} resetAt={status?.reset_at} />;
 *
 * Durante o Beta (platform_runtime.beta_free_has_premium_social = true) todos
 * os usuários ganham permissões sociais Premium, então o gate NÃO deve disparar.
 * Apenas o admin master mantém o comportamento padrão.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import type { RateLimitStatus } from './useRateLimit';
import { usePlatformPhase } from './usePlatformPhase';

const SESSION_PREFIX = 'oculto_feature_access_';
const TTL_MS = 60_000; // re-check a cada 1 min para não estourar contador

export function useFeatureAccess(feature: string) {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const { freeGetsPremiumSocial, isBeta } = usePlatformPhase();
  const betaUnlocked = Boolean(freeGetsPremiumSocial || isBeta);

  useEffect(() => {
    const key = `${SESSION_PREFIX}${feature}`;

    // Durante o beta, libera tudo imediatamente e limpa cache anterior
    // (que pode ter um status "denied" persistido de antes do beta).
    if (betaUnlocked) {
      try { sessionStorage.removeItem(key); } catch {}
      setStatus({ allowed: true, unlimited: true, reason: null });
      setChecking(false);
      return;
    }

    let cancelled = false;

    const cached = (() => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.t > TTL_MS) return null;
        return parsed.status as RateLimitStatus;
      } catch { return null; }
    })();

    if (cached) {
      setStatus(cached);
      setChecking(false);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const { data } = await (supabase as any).rpc('check_and_increment_usage', { _feature: feature });
        if (cancelled) return;
        const s = (data ?? { allowed: true }) as RateLimitStatus;
        setStatus(s);
        sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), status: s }));
      } catch {
        if (!cancelled) setStatus({ allowed: true });
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [feature, betaUnlocked]);

  return {
    checking,
    allowed: status?.allowed !== false,
    status,
  };
}
