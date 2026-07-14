/**
 * ocultoPlayMediaCache — cache em 3 camadas para thumbnails/posters do
 * Oculto Play:
 *
 *   L1 (memória)        — Set<string> + Map<url, blobUrl> nesta sessão
 *   L2 (sessionStorage) — lista persistente por aba (sobrevive a navegações SPA)
 *   L3 (CacheStorage)   — cache do navegador, persistente entre sessões.
 *                          Funciona sem Service Worker (suportado em iOS Safari,
 *                          Chrome/Android, Firefox). Garante que ao voltar
 *                          para a lista, a imagem venha do disco — não da rede.
 *
 * Usar `getCachedThumbUrl(url)` para obter um blob: URL pronto (zero latência
 * de rede) quando disponível. `prefetchThumb` enche L1+L3 em idle.
 */
const MEM_KEY = '__op_thumb_cache__';
const SS_KEY = 'op:thumbs:v1';
const CACHE_NAME = 'oculto-play-thumbs-v1';
const MAX = 200;

type Bag = {
  set: Set<string>;
  queue: string[];
  blobs: Map<string, string>;
};

function bag(): Bag {
  const g = globalThis as unknown as Record<string, Bag | undefined>;
  if (!g[MEM_KEY]) {
    const set = new Set<string>();
    const queue: string[] = [];
    const blobs = new Map<string, string>();
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        for (const u of arr.slice(-MAX)) { set.add(u); queue.push(u); }
      }
    } catch { /* noop */ }
    g[MEM_KEY] = { set, queue, blobs };
  }
  return g[MEM_KEY]!;
}

function persist(b: Bag) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify(b.queue.slice(-MAX))); }
  catch { /* noop */ }
}

function hasCacheStorage(): boolean {
  try { return typeof caches !== 'undefined' && !!caches.open; }
  catch { return false; }
}

let cachePromise: Promise<Cache> | null = null;
function openCache(): Promise<Cache> | null {
  if (!hasCacheStorage()) return null;
  if (!cachePromise) cachePromise = caches.open(CACHE_NAME).catch(() => null as unknown as Cache);
  return cachePromise;
}

export function isThumbCached(url: string | null | undefined): boolean {
  if (!url) return false;
  return bag().set.has(url);
}

/**
 * Lookup SÍNCRONO de blob: URL na L1 (memória). Usado pelo <CachedThumbImg>
 * no primeiro render para evitar disparar request HTTP enquanto aguarda a
 * Promise do CacheStorage resolver — esse era o motivo das capas
 * "recarregarem" a cada entrada no Oculto Play.
 */
export function getCachedThumbBlobSync(url: string | null | undefined): string | null {
  if (!url) return null;
  return bag().blobs.get(url) ?? null;
}

export function markThumbCached(url: string | null | undefined) {
  if (!url) return;
  const b = bag();
  if (b.set.has(url)) return;
  b.set.add(url);
  b.queue.push(url);
  if (b.queue.length > MAX) {
    const drop = b.queue.splice(0, b.queue.length - MAX);
    for (const d of drop) {
      b.set.delete(d);
      const blob = b.blobs.get(d);
      if (blob) { try { URL.revokeObjectURL(blob); } catch { /* noop */ } b.blobs.delete(d); }
    }
  }
  persist(b);
}

/**
 * Retorna uma URL utilizável imediatamente para `<img src>`. Se estiver em
 * L3 (CacheStorage), devolve um blob: URL — zero round-trip de rede. Caso
 * contrário, devolve a URL original (que o `<img>` baixa normalmente).
 */
export async function getCachedThumbUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const b = bag();
  const existing = b.blobs.get(url);
  if (existing) return existing;
  const cache = openCache();
  if (!cache) return null;
  try {
    const c = await cache;
    if (!c) return null;
    const res = await c.match(url);
    if (!res) return null;
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    b.blobs.set(url, obj);
    markThumbCached(url);
    return obj;
  } catch {
    return null;
  }
}

/**
 * Prefetch silencioso. Sempre escreve em L3 (cache persistente) quando
 * possível, mesmo que a imagem nunca seja exibida — assim ao voltar para
 * a lista o disco já tem o byte.
 */
export function prefetchThumb(url: string | null | undefined): Promise<void> {
  if (!url) return Promise.resolve();
  if (isThumbCached(url)) return Promise.resolve();
  const cache = openCache();
  return new Promise<void>((resolve) => {
    const done = () => { markThumbCached(url); resolve(); };
    // Caminho preferido: fetch + cache.put — popula L3 (persistente)
    if (cache) {
      (async () => {
        try {
          const c = await cache;
          if (!c) throw new Error('no-cache');
          const hit = await c.match(url);
          if (hit) { done(); return; }
          const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
          if (res && (res.ok || res.type === 'opaque')) {
            try { await c.put(url, res.clone()); } catch { /* quota / opaque size */ }
            // Promove L3 → L1 (cria blob: URL em memória) para que o próximo
            // mount do <CachedThumbImg> use lookup SÍNCRONO — sem re-fetch.
            try { void getCachedThumbUrl(url); } catch { /* noop */ }
          }
          done();
        } catch {
          // Fallback: decodifica via Image() (popula HTTP cache do browser)
          try {
            const img = new Image();
            img.decoding = 'async';
            (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
            img.onload = () => done();
            img.onerror = () => resolve();
            img.src = url;
          } catch { resolve(); }
        }
      })();
    } else {
      try {
        const img = new Image();
        img.decoding = 'async';
        (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
        img.onload = () => done();
        img.onerror = () => resolve();
        img.src = url;
      } catch { resolve(); }
    }
  });
}

/** Limpa entradas antigas (chamar opcionalmente em logout / troca de usuário). */
export async function purgeThumbCache(): Promise<void> {
  const b = bag();
  for (const blob of b.blobs.values()) {
    try { URL.revokeObjectURL(blob); } catch { /* noop */ }
  }
  b.blobs.clear();
  b.set.clear();
  b.queue.length = 0;
  try { sessionStorage.removeItem(SS_KEY); } catch { /* noop */ }
  if (hasCacheStorage()) {
    try { await caches.delete(CACHE_NAME); } catch { /* noop */ }
  }
}
