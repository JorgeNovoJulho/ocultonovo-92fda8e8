/**
 * useRateLimit — consome as RPCs check_and_increment_usage / peek_usage
 * do Supabase EXTERNO. Backend-enforced (sem confiar só em sessionStorage).
 *
 * Uso:
 *   const { peek, consume } = useRateLimit('like');
 *   const status = await peek(); // { allowed, count, limit, reset_at, plan, unlimited? }
 *   const r = await consume();   // incrementa atomicamente
 *   if (!r.allowed) toast.error(`Limite atingido (${r.count}/${r.limit})`);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export type RateLimitStatus = {
  allowed: boolean;
  count?: number;
  limit?: number;
  plan?: 'free' | 'premium' | 'vip';
  reset_at?: string;
  unlimited?: boolean;
  reason?: 'unauthenticated' | 'feature_disabled' | 'limit_exceeded' | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Dedupe GLOBAL por feature.
// Antes: cada card do feed que usasse useRateLimit('like') disparava seu próprio
// peek_usage no mount → 30 cards = 30 requests idênticas em <1s, saturando a
// conexão HTTP/2 com o Supabase e travando o feed/perfil. Agora as instâncias
// compartilham:
//   - o resultado em memória (TTL configurável por feature)
//   - a Promise em voo (qualquer call concorrente espera o mesmo fetch)
// ─────────────────────────────────────────────────────────────────────────────
const PEEK_TTL_MS = 30_000; // 30s — peek é só leitura, valor pode ser reaproveitado tranquilo
type CacheEntry = { value: RateLimitStatus; at: number };
const peekCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RateLimitStatus>>();
const subscribers = new Map<string, Set<(s: RateLimitStatus) => void>>();

const notify = (feature: string, value: RateLimitStatus) => {
  const subs = subscribers.get(feature);
  if (!subs) return;
  subs.forEach((cb) => {
    try { cb(value); } catch { /* noop */ }
  });
};

async function callRpc(fn: 'check_and_increment_usage' | 'peek_usage', feature: string): Promise<RateLimitStatus> {
  try {
    const { data, error } = await (supabase as any).rpc(fn, { _feature: feature });
    if (error) {
      // Em erro de rede/policy, libera para não travar UX — o backend ainda valida no próximo call.
      return { allowed: true, reason: null };
    }
    return (data ?? { allowed: true }) as RateLimitStatus;
  } catch {
    return { allowed: true };
  }
}

async function sharedPeek(feature: string, force: boolean): Promise<RateLimitStatus> {
  const now = Date.now();
  const cached = peekCache.get(feature);
  if (!force && cached && now - cached.at < PEEK_TTL_MS) {
    return cached.value;
  }
  const existing = inflight.get(feature);
  if (existing) return existing;

  const p = (async () => {
    const r = await callRpc('peek_usage', feature);
    peekCache.set(feature, { value: r, at: Date.now() });
    notify(feature, r);
    return r;
  })().finally(() => {
    inflight.delete(feature);
  });

  inflight.set(feature, p);
  return p;
}

export function useRateLimit(feature: string) {
  const [status, setStatus] = useState<RateLimitStatus | null>(() => peekCache.get(feature)?.value ?? null);
  const mounted = useRef(true);

  // Subscribe para receber atualizações globais (consume em outro card atualiza todos).
  useEffect(() => {
    mounted.current = true;
    const cb = (s: RateLimitStatus) => { if (mounted.current) setStatus(s); };
    let set = subscribers.get(feature);
    if (!set) { set = new Set(); subscribers.set(feature, set); }
    set.add(cb);
    return () => {
      mounted.current = false;
      set?.delete(cb);
    };
  }, [feature]);

  const peek = useCallback(async (force = false): Promise<RateLimitStatus> => {
    const r = await sharedPeek(feature, force);
    if (mounted.current) setStatus(r);
    return r;
  }, [feature]);

  const consume = useCallback(async (): Promise<RateLimitStatus> => {
    const r = await callRpc('check_and_increment_usage', feature);
    peekCache.set(feature, { value: r, at: Date.now() });
    notify(feature, r);
    return r;
  }, [feature]);

  // Primeiro mount por feature: dispara peek compartilhado (idempotente — só 1 request real).
  useEffect(() => {
    void sharedPeek(feature, false).then((r) => {
      if (mounted.current) setStatus(r);
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [feature]);

  return { status, peek, consume };
}
