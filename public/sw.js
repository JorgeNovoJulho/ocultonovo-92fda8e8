// Service Worker — OCULTO PWA
// Estratégias seguras: cache-first em assets versionados, network-first em HTML
// com fallback /offline.html, stale-while-revalidate em imagens públicas e
// imagens do Supabase Storage (capas/thumbs). NUNCA cacheia APIs Supabase
// (rest/auth/realtime/functions), áudio/vídeo de storage, /version.json, /sw.js,
// /manifest. Mantém push handler e SKIP_WAITING.

// v10: descarta caches antigos que podem ter guardado o index.html no lugar
// de arquivos JS/CSS de versões anteriores (causava "Algo deu errado").
const CACHE_VERSION = 'v10';
const ASSET_CACHE   = `oculto-assets-${CACHE_VERSION}`;
const IMAGE_CACHE   = `oculto-images-${CACHE_VERSION}`;
const MEDIA_IMG_CACHE = `oculto-media-img-${CACHE_VERSION}`;
const HTML_CACHE    = `oculto-html-${CACHE_VERSION}`;
const OFFLINE_URL   = '/offline.html';
const APP_SHELL_URL = '/';
const VALID_CACHES  = [ASSET_CACHE, IMAGE_CACHE, MEDIA_IMG_CACHE, HTML_CACHE];

// Limite LRU simples para imagens remotas de mídia (capas etc.)
const MEDIA_IMG_MAX_ENTRIES = 120;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(HTML_CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      // App shell — permite SPA inicializar offline (Oculto Play / Offline page)
      try { await cache.add(new Request(APP_SHELL_URL, { cache: 'reload' })); } catch (_) { /* noop */ }
    } catch (_) { /* noop */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('oculto-') && !VALID_CACHES.includes(k))
          .map((k) => caches.delete(k)),
      );
    } catch (_) { /* noop */ }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isApiNeverCache(url) {
  if (url.pathname.startsWith('/sb-proxy/')) return true;
  if (url.pathname.includes('/auth/v1/')) return true;
  if (url.pathname.includes('/rest/v1/')) return true;
  if (url.pathname.includes('/realtime/v1/')) return true;
  if (url.pathname.includes('/functions/v1/')) return true;
  return false;
}

function isSelfOriginNeverCache(url) {
  if (url.pathname === '/version.json') return true;
  if (url.pathname === '/sw.js') return true;
  if (url.pathname === '/manifest.webmanifest') return true;
  if (url.pathname === '/update.html' || url.pathname === '/update') return true;
  return false;
}

function isVersionedAsset(url) {
  return /^\/assets\//.test(url.pathname);
}

function isPublicImage(url) {
  return /^\/(icons|placeholders|screenshots)\//.test(url.pathname)
      || url.pathname === '/default-banner.jpg'
      || url.pathname === '/favicon.ico'
      || url.pathname === '/placeholder.svg';
}

function isSupabaseStorage(url) {
  return url.hostname.endsWith('supabase.co')
      && url.pathname.includes('/storage/v1/object/');
}

function looksLikeImageRequest(request, url) {
  const accept = request.headers.get('accept') || '';
  if (accept.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(url.pathname);
}

async function trimCache(cacheName, max) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= max) return;
    const overflow = keys.length - max;
    for (let i = 0; i < overflow; i++) await cache.delete(keys[i]);
  } catch (_) { /* noop */ }
}

async function networkFirstHTML(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const fresh = await fetch(request, { signal: controller.signal });
    clearTimeout(t);
    // Mantém o app shell atualizado para uso offline subsequente
    try {
      const url = new URL(request.url);
      if (url.origin === self.location.origin && fresh.ok) {
        cache.put(APP_SHELL_URL, fresh.clone()).catch(() => {});
      }
    } catch (_) { /* noop */ }
    return fresh;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // SPA: devolve o app shell para qualquer rota — assim /oculto-play/offline
    // (e demais rotas client-side) bootam mesmo sem rede.
    const shell = await cache.match(APP_SHELL_URL);
    if (shell) return shell;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// Resposta HTML para um pedido de JS/CSS = arquivo de uma versão antiga que
// não existe mais (o servidor devolveu a página do app no lugar).
function isHtmlResponse(res) {
  const ct = (res && res.headers && res.headers.get('content-type')) || '';
  return ct.includes('text/html');
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached && !isHtmlResponse(cached)) return cached;
  if (cached) cache.delete(request).catch(() => {});
  const fresh = await fetch(request);
  if (isHtmlResponse(fresh)) {
    // NÃO guarda e devolve 404: o app detecta o arquivo ausente e recarrega
    // a versão nova, em vez de executar HTML como JavaScript.
    return new Response('', { status: 404, statusText: 'Asset not found' });
  }
  if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
  return fresh;
}

async function staleWhileRevalidate(request, cacheName, opts) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((res) => {
    if (res.ok) {
      cache.put(request, res.clone())
        .then(() => { if (opts?.maxEntries) trimCache(cacheName, opts.maxEntries); })
        .catch(() => {});
    }
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ─── Fetch routing ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Nunca cachear range requests (áudio/vídeo streaming)
  if (request.headers.has('range')) return;

  // Supabase Storage: cacheia somente IMAGENS (capas/thumbs) via SWR.
  // Áudio/vídeo passam direto para suportar range/streaming.
  if (isSupabaseStorage(url)) {
    if (looksLikeImageRequest(request, url)) {
      event.respondWith(staleWhileRevalidate(request, MEDIA_IMG_CACHE, { maxEntries: MEDIA_IMG_MAX_ENTRIES }));
    }
    return;
  }

  // Demais hosts externos / APIs: passa direto
  if (url.origin !== self.location.origin) return;
  if (isApiNeverCache(url)) return;
  if (isSelfOriginNeverCache(url)) return;

  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstHTML(request));
    return;
  }
  if (isVersionedAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }
  if (isPublicImage(url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }
  // outros recursos do mesmo origin: passa direto
});

// ─── Push handler ─────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'OCULTO', body: event.data.text() }; }

  const tag = data.tag || `notif-${Date.now()}`;
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag,
    renotify: data.renotify === true,
    requireInteraction: data.requireInteraction || false,
    data: { url: data.url || '/', type: data.type || 'default' },
    actions: data.actions || [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Fechar' },
    ],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'OCULTO', options),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});

self.addEventListener('notificationclose', () => { /* noop */ });
