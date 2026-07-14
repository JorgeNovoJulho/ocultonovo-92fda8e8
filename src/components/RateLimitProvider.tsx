/**
 * RateLimitContext — provider global do RateLimitReachedModal.
 *
 *   const { showLimit } = useRateLimitModal();
 *   showLimit({ feature, ...status });
 *
 * Também escuta o evento `oculto:rate-limit` no window — qualquer hook
 * pode disparar com `window.dispatchEvent(new CustomEvent('oculto:rate-limit', { detail: status }))`.
 */
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { RateLimitReachedModal, RateLimitReachedModalProps } from './RateLimitReachedModal';

type ShowPayload = Omit<RateLimitReachedModalProps, 'open' | 'onClose'>;

const Ctx = createContext<{ showLimit: (p: ShowPayload) => void } | null>(null);

export function RateLimitProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShowPayload | null>(null);

  const showLimit = useCallback((p: ShowPayload) => setState(p), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      showLimit(detail);
    };
    window.addEventListener('oculto:rate-limit', handler as EventListener);
    return () => window.removeEventListener('oculto:rate-limit', handler as EventListener);
  }, [showLimit]);

  return (
    <Ctx.Provider value={{ showLimit }}>
      {children}
      <RateLimitReachedModal
        open={!!state}
        onClose={() => setState(null)}
        feature={state?.feature}
        reason={state?.reason}
        count={state?.count}
        limit={state?.limit}
        resetAt={state?.resetAt}
        plan={state?.plan}
      />
    </Ctx.Provider>
  );
}

export function useRateLimitModal() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback no-op para componentes fora do provider
    return { showLimit: (_: ShowPayload) => {} };
  }
  return ctx;
}

/** Helper estático para disparar o modal de qualquer lugar (hooks, mutations). */
export function dispatchRateLimit(payload: ShowPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('oculto:rate-limit', { detail: payload }));
}
