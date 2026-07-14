import { useCallback, useRef, useState } from "react";

/**
 * Circuit breaker UX para evitar duplo-clique e ações repetidas.
 * NÃO é rate limiting de segurança — proteção apenas no cliente.
 *
 * - cooldownMs: tempo mínimo entre execuções
 * - maxBurst: nº máx em burstWindowMs antes de "abrir" o circuito
 * - openMs: quanto tempo o circuito fica bloqueado depois do burst
 */
export interface ThrottleOptions {
  cooldownMs?: number;
  maxBurst?: number;
  burstWindowMs?: number;
  openMs?: number;
}

export function useActionThrottle(opts: ThrottleOptions = {}) {
  const {
    cooldownMs = 800,
    maxBurst = 5,
    burstWindowMs = 10_000,
    openMs = 15_000,
  } = opts;

  const lastRunRef = useRef<number>(0);
  const recentRef = useRef<number[]>([]);
  const openUntilRef = useRef<number>(0);
  const [isLocked, setIsLocked] = useState(false);

  const run = useCallback(
    async <T>(fn: () => Promise<T> | T): Promise<{ ok: true; value: T } | { ok: false; reason: "cooldown" | "open" }> => {
      const now = Date.now();

      if (now < openUntilRef.current) {
        return { ok: false, reason: "open" };
      }
      if (now - lastRunRef.current < cooldownMs) {
        return { ok: false, reason: "cooldown" };
      }

      // limpa janela de burst
      recentRef.current = recentRef.current.filter((t) => now - t < burstWindowMs);
      if (recentRef.current.length >= maxBurst) {
        openUntilRef.current = now + openMs;
        setIsLocked(true);
        setTimeout(() => setIsLocked(false), openMs);
        return { ok: false, reason: "open" };
      }

      lastRunRef.current = now;
      recentRef.current.push(now);
      const value = await fn();
      return { ok: true, value };
    },
    [cooldownMs, maxBurst, burstWindowMs, openMs]
  );

  return { run, isLocked };
}
