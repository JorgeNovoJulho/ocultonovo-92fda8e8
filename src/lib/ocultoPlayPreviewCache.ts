/**
 * ocultoPlayPreviewCache — LRU em memória para previews de áudio do OCULTO PLAY.
 *
 * Mantém um pequeno conjunto de elementos <audio> já buferizados (preload=auto)
 * indexados pela URL. Ao alternar entre cards, o áudio é reaproveitado e o
 * delay até o som tocar cai praticamente a zero.
 *
 * Regras (alinhadas a "Performance First <4GB RAM"):
 * - Capacidade DINÂMICA baseada em (a) número de itens e (b) bytes totais
 *   carregados. Em hardware fraco (deviceMemory <= 2GB / 2 cores), o limite cai
 *   para evitar travamentos. Em hardware forte, sobe um pouco.
 * - LRU: o item menos usado é descartado quando qualquer limite é excedido.
 * - prefetch(url) é silencioso (não força play, só dispara load()).
 * - Quando descartado, o elemento é pausado e tem `src` limpo para o GC liberar.
 */

// ------- Limites dinâmicos por hardware -------
function detectLimits(): { maxItems: number; maxBytes: number } {
  // Defaults conservadores
  let maxItems = 8;
  let maxBytes = 24 * 1024 * 1024; // 24 MB de áudio bufferizado

  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : {};
    const mem: number | undefined = nav.deviceMemory; // GB (Chrome)
    const cores: number = nav.hardwareConcurrency || 4;
    const saveData: boolean = !!(nav.connection && nav.connection.saveData);
    const effType: string = (nav.connection && nav.connection.effectiveType) || '';

    if (saveData || effType === 'slow-2g' || effType === '2g') {
      maxItems = 2;
      maxBytes = 4 * 1024 * 1024; // 4 MB
    } else if ((mem !== undefined && mem <= 2) || cores <= 2) {
      maxItems = 3;
      maxBytes = 8 * 1024 * 1024; // 8 MB
    } else if ((mem !== undefined && mem <= 4) || cores <= 4) {
      maxItems = 6;
      maxBytes = 16 * 1024 * 1024; // 16 MB
    } else if (mem !== undefined && mem >= 8 && cores >= 8) {
      maxItems = 12;
      maxBytes = 48 * 1024 * 1024; // 48 MB
    }
  } catch { /* noop */ }

  return { maxItems, maxBytes };
}

let LIMITS = detectLimits();
let totalBytes = 0;

// Map preserva ordem de inserção; reordenamos a cada uso para emular LRU.
const cache = new Map<string, HTMLAudioElement>();
// Tamanho estimado (bytes) por URL, para somar/abater no totalBytes.
const sizes = new Map<string, number>();
const previewPrimeControllers = new Map<string, AbortController>();
const primedBlobUrls = new Map<string, string>();
const primedBlobSizes = new Map<string, number>();
const primedBlobRequests = new Map<string, Promise<string | null>>();
let primedBlobBytes = 0;

function cleanTime(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function toPreviewSourceUrl(url: string, startSeconds = 0, endSeconds?: number | null): string {
  const start = cleanTime(startSeconds);
  const end = endSeconds == null ? 0 : cleanTime(endSeconds);
  const base = url.split('#')[0];
  // Previews dedicados gerados pelo app são WAVs já recortados. Em Safari/iOS,
  // media fragments em WAV podem atrasar metadata; tocar o arquivo direto é mais rápido.
  if (/\.wav(?:\?|$)/i.test(base)) return base;
  if (start <= 0 && (!end || end <= start)) return base;
  const s = Number(start.toFixed(2));
  const e = end > start ? Number(end.toFixed(2)) : undefined;
  // Media Fragment: faz o browser pedir/tocar diretamente o trecho do preview
  // quando suportado, evitando seek tardio em MP3 grande no clique.
  return `${base}#t=${s}${e ? `,${e}` : ''}`;
}

type PreviewTarget = string | { url?: string | null; start?: number | null; end?: number | null } | null | undefined;

function normalizeTarget(target: PreviewTarget): { url: string; start: number; end?: number | null } | null {
  if (!target) return null;
  if (typeof target === 'string') return { url: target, start: 0, end: null };
  if (!target.url) return null;
  return { url: target.url, start: cleanTime(target.start), end: target.end ?? null };
}

function touch(url: string, el: HTMLAudioElement) {
  cache.delete(url);
  cache.set(url, el);
}

function estimateSize(el: HTMLAudioElement): number {
  // 1) Content-Length real exposto por buffered/duration nem sempre existe.
  //    Tentamos via performance.getEntriesByName (Resource Timing).
  try {
    const src = el.currentSrc || el.src;
    if (src && typeof performance !== 'undefined') {
      const entries = (performance.getEntriesByName(src) as PerformanceResourceTiming[]) || [];
      const last = entries[entries.length - 1];
      const size = last && (last.encodedBodySize || last.transferSize);
      if (size && size > 0) return size;
    }
  } catch { /* noop */ }
  // 2) Estimativa: ~16 KB/s por segundo de áudio comprimido (128 kbps).
  const dur = Number.isFinite(el.duration) ? el.duration : 0;
  if (dur > 0) return Math.round(dur * 16 * 1024);
  // 3) Fallback default para preview curto.
  return 512 * 1024; // 512 KB
}

function recomputeSize(url: string, el: HTMLAudioElement) {
  const prev = sizes.get(url) || 0;
  const next = estimateSize(el);
  if (next !== prev) {
    totalBytes += (next - prev);
    sizes.set(url, next);
  }
}

function dropEntry(url: string) {
  const el = cache.get(url);
  cache.delete(url);
  const sz = sizes.get(url) || 0;
  sizes.delete(url);
  totalBytes = Math.max(0, totalBytes - sz);
  if (el) {
    try { el.pause(); } catch { /* noop */ }
    try { el.removeAttribute('src'); el.load(); } catch { /* noop */ }
  }
}

function playableSourceUrl(sourceUrl: string): string {
  return primedBlobUrls.get(sourceUrl) || sourceUrl;
}

function evictPrimedBlobs() {
  const maxItems = Math.max(2, Math.min(LIMITS.maxItems, 8));
  const maxBytes = Math.max(4 * 1024 * 1024, Math.min(LIMITS.maxBytes, 18 * 1024 * 1024));
  const evictOne = () => {
    for (const key of primedBlobUrls.keys()) {
      const el = cache.get(key);
      if (el && !el.paused) continue;
      const blobUrl = primedBlobUrls.get(key);
      if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch { /* noop */ } }
      primedBlobUrls.delete(key);
      primedBlobBytes = Math.max(0, primedBlobBytes - (primedBlobSizes.get(key) || 0));
      primedBlobSizes.delete(key);
      return true;
    }
    return false;
  };
  while (primedBlobUrls.size > maxItems && evictOne()) { /* loop */ }
  while (primedBlobBytes > maxBytes && primedBlobUrls.size > 1 && evictOne()) { /* loop */ }
}

function evictIfNeeded() {
  // Helper: encontra a entrada mais antiga que NÃO está tocando.
  const oldestEvictable = (): string | undefined => {
    for (const key of cache.keys()) {
      const el = cache.get(key);
      if (el && el.paused) return key;
    }
    return undefined;
  };
  // 1) Limite por contagem
  while (cache.size > LIMITS.maxItems) {
    const k = oldestEvictable();
    if (!k) break;
    dropEntry(k);
  }
  // 2) Limite por bytes totais — preserva ao menos 1 item
  while (totalBytes > LIMITS.maxBytes && cache.size > 1) {
    const k = oldestEvictable();
    if (!k) break;
    dropEntry(k);
  }
}

/**
 * Devolve um <audio> pronto para a URL (já com preload=auto disparado).
 * Cria um novo elemento se não existir; reaproveita se já estiver em cache.
 */
export function getOrCreatePreviewAudio(url: string, startSeconds = 0, endSeconds?: number | null): HTMLAudioElement {
  const sourceUrl = toPreviewSourceUrl(url, startSeconds, endSeconds);
  const existing = cache.get(sourceUrl);
  if (existing) {
    const playable = playableSourceUrl(sourceUrl);
    if (playable !== sourceUrl && existing.paused && String(existing.currentSrc || existing.src).split('#')[0] !== playable) {
      try { existing.src = playable; existing.preload = 'auto'; existing.load(); } catch { /* noop */ }
    }
    touch(sourceUrl, existing);
    // Atualiza tamanho estimado quando metadata/buffer evoluírem
    recomputeSize(sourceUrl, existing);
    evictIfNeeded();
    return existing;
  }
  const a = new Audio();
  a.preload = 'auto';
  // NÃO definir crossOrigin: força preflight CORS e atrasa o primeiro byte
  // em mobile/3G. Como não usamos WebAudio aqui, é desnecessário.
  a.src = playableSourceUrl(sourceUrl);
  try { a.load(); } catch { /* noop */ }
  cache.set(sourceUrl, a);
  sizes.set(sourceUrl, 0);
  // Quando soubermos o tamanho real, recomputa e despeja se precisar.
  const onMeta = () => { recomputeSize(sourceUrl, a); evictIfNeeded(); };
  a.addEventListener('loadedmetadata', onMeta, { once: true });
  a.addEventListener('progress', onMeta);
  evictIfNeeded();
  return a;
}

function abortPreviewPrimeRequests(keepSource?: string | null) {
  const keep = keepSource ? keepSource.split('#')[0] : null;
  previewPrimeControllers.forEach((controller, url) => {
    if (keep && url === keep) return;
    try { controller.abort(); } catch { /* noop */ }
  });
}

export function warmPreviewAudioWindow(url: string, startSeconds = 0, endSeconds?: number | null): HTMLAudioElement {
  const a = getOrCreatePreviewAudio(url, startSeconds, endSeconds);
  const start = Math.max(0, Number(startSeconds) || 0);
  const seekToPreviewStart = () => {
    if (!a.paused) return;
    try {
      if (Number.isFinite(a.duration) && a.duration > 0 && start >= a.duration - 0.2) return;
      if (Math.abs((a.currentTime || 0) - start) > 0.35) a.currentTime = start;
    } catch { /* noop */ }
  };
  try {
    a.preload = 'auto';
    if (a.readyState >= 1) seekToPreviewStart();
    else a.addEventListener('loadedmetadata', seekToPreviewStart, { once: true });
    if (a.readyState === 0 && a.networkState !== 2) a.load();
  } catch { /* noop */ }
  return a;
}

/**
 * Pré-carrega silenciosamente uma URL (ex.: próxima faixa da lista).
 * Não toca; apenas garante que esteja bufferizada no cache.
 */
export function prefetchPreviewAudio(url: string | null | undefined, startSeconds = 0, endSeconds?: number | null): void {
  if (!url) return;
  const sourceUrl = toPreviewSourceUrl(url, startSeconds, endSeconds);
  if (cache.has(sourceUrl)) {
    touch(sourceUrl, cache.get(sourceUrl)!);
    return;
  }
  try { getOrCreatePreviewAudio(url, startSeconds, endSeconds); } catch { /* noop */ }
}

export function primePreviewClipBlob(url: string | null | undefined, startSeconds = 0, endSeconds?: number | null): Promise<string | null> {
  if (!url || typeof window === 'undefined') return Promise.resolve(null);
  const sourceUrl = toPreviewSourceUrl(url, startSeconds, endSeconds);
  const existingBlob = primedBlobUrls.get(sourceUrl);
  if (existingBlob) return Promise.resolve(existingBlob);
  const existingRequest = primedBlobRequests.get(sourceUrl);
  if (existingRequest) return existingRequest;

  const controller = new AbortController();
  previewPrimeControllers.set(sourceUrl.split('#')[0], controller);
  const req = fetch(sourceUrl.split('#')[0], {
    mode: 'cors',
    cache: 'force-cache',
    credentials: 'omit',
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.size || blob.size > 6 * 1024 * 1024) return null;
      const blobUrl = URL.createObjectURL(blob);
      primedBlobUrls.set(sourceUrl, blobUrl);
      primedBlobSizes.set(sourceUrl, blob.size);
      primedBlobBytes += blob.size;
      evictPrimedBlobs();
      const audio = cache.get(sourceUrl);
      if (audio && audio.paused) {
        try { audio.src = blobUrl; audio.preload = 'auto'; audio.load(); } catch { /* noop */ }
      }
      return blobUrl;
    })
    .catch(() => null)
    .finally(() => {
      primedBlobRequests.delete(sourceUrl);
      previewPrimeControllers.delete(sourceUrl.split('#')[0]);
    });
  primedBlobRequests.set(sourceUrl, req);
  return req;
}

/**
 * Pré-carrega um LOTE de URLs em ordem, com throttling via requestIdleCallback,
 * para popular o cache LRU com as próximas faixas visíveis sem competir com
 * o áudio que o usuário acabou de clicar.
 */
export function prefetchPreviewAudioBatch(urls: PreviewTarget[]): void {
  const clean = urls
    .map(normalizeTarget)
    .filter((u): u is { url: string; start: number; end?: number | null } => !!u && !cache.has(toPreviewSourceUrl(u.url, u.start, u.end)));
  if (clean.length === 0) return;
  const idle = (cb: () => void) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(cb, { timeout: 1200 });
    } else {
      setTimeout(cb, 250);
    }
  };
  clean.slice(0, LIMITS.maxItems).forEach((u, i) => {
    idle(() => { setTimeout(() => prefetchPreviewAudio(u.url, u.start, u.end), i * 80); });
  });
}

/**
 * Prioriza o áudio que recebeu interação direta do usuário.
 * IMPORTANTE: NÃO descartamos buffers de outras entradas — apenas pausamos
 * o que estiver tocando. Descartar e re-baixar entre cliques era a causa
 * principal do delay percebido ao alternar entre cards no feed.
 */
export function preparePreviewAudioForPlayback(url: string, startSeconds = 0, endSeconds?: number | null): HTMLAudioElement {
  const sourceUrl = toPreviewSourceUrl(url, startSeconds, endSeconds);
  cache.forEach((el, key) => {
    if (key !== sourceUrl && el && !el.paused) {
      try { el.pause(); } catch { /* noop */ }
    }
  });
  const a = getOrCreatePreviewAudio(url, startSeconds, endSeconds);
  try {
    a.preload = 'auto';
    if (a.readyState === 0 && a.networkState !== 2 /* NETWORK_LOADING */) {
      a.load();
    }
  } catch { /* noop */ }
  return a;
}

export function suspendInactivePreviewDownloads(keep?: PreviewTarget): void {
  // DEFINITIVO: NÃO descartamos o src de previews — apenas pausamos.
  // Destruir o buffer fazia o próximo clique re-baixar tudo, causando
  // o delay de vários segundos antes do som começar a tocar.
  const normalizedKeep = normalizeTarget(keep);
  const keepSource = normalizedKeep ? toPreviewSourceUrl(normalizedKeep.url, normalizedKeep.start, normalizedKeep.end) : null;
  cache.forEach((el, key) => {
    if (!el || key === keepSource) return;
    if (!el.paused) { try { el.pause(); } catch { /* noop */ } }
  });
}

/**
 * Libera banda imediatamente para o player principal.
 * Aborta apenas requests HTTP em voo (prime de blobs); NÃO descarta os
 * buffers dos previews já carregados — eles continuam prontos para tocar
 * instantaneamente no próximo clique do usuário.
 */
export function abortInactivePreviewDownloads(keep?: PreviewTarget): void {
  const normalizedKeep = normalizeTarget(keep);
  const keepSource = normalizedKeep ? toPreviewSourceUrl(normalizedKeep.url, normalizedKeep.start, normalizedKeep.end) : null;
  abortPreviewPrimeRequests(keepSource);
  cache.forEach((el, key) => {
    if (!el || key === keepSource) return;
    if (!el.paused) { try { el.pause(); } catch { /* noop */ } }
  });
}



/** Remove explicitamente uma URL do cache (ex.: item excluído). */
export function dropPreviewAudio(url: string | null | undefined): void {
  if (!url) return;
  if (!cache.has(url)) return;
  dropEntry(url);
}

/** Pausa todos os áudios do cache (útil ao abrir player full-screen). */
export function pauseAllCachedPreviews(): void {
  cache.forEach((el) => { try { el.pause(); } catch { /* noop */ } });
}

/** Debug/telemetria opcional. */
export function getPreviewCacheStats() {
  return {
    items: cache.size,
    bytes: totalBytes,
    limits: { ...LIMITS },
  };
}

/** Re-detecta limites (ex.: mudança de rede ou Modo Economia). */
export function refreshPreviewCacheLimits() {
  LIMITS = detectLimits();
  evictIfNeeded();
}

// Reagir a mudanças de conexão (Save-Data ON/OFF, 4G->2G, etc.)
try {
  const conn: any = (navigator as any)?.connection;
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', refreshPreviewCacheLimits);
  }
} catch { /* noop */ }
