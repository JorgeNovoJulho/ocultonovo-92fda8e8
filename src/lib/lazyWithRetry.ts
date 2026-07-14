/**
 * lazyWithRetry — drop-in replacement do React.lazy com retry automático
 * para falhas transitórias de import dinâmico ("Failed to fetch dynamically
 * imported module" / ChunkLoadError).
 *
 * Por quê:
 *  - O app tem 200+ lazy imports. Durante HMR no preview do Lovable ou
 *    com chunks momentaneamente indisponíveis em produção (deploy novo),
 *    uma única falha derruba a rota inteira e o usuário percebe como
 *    "preview travado / lento".
 *  - Aqui fazemos backoff curto (3 tentativas: 0ms, 350ms, 900ms).
 *    Se mesmo assim falhar, propagamos o erro para o ErrorBoundary cuidar.
 *
 * 100% compatível com React.lazy — assinatura idêntica.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RETRIES = 3;
const BACKOFFS_MS = [0, 350, 900];

function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt] ?? 900));
        }
        return await factory();
      } catch (err) {
        lastErr = err;
        if (!isChunkError(err)) throw err; // erro real do componente — não retry
        // continua para próxima tentativa
      }
    }
    throw lastErr;
  });
}

export default lazyWithRetry;
