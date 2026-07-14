/**
 * /api/og-c-image — proxy de imagem para o preview social do /c/:id.
 *
 * Os crawlers (WhatsApp, Telegram, FB, X) precisam baixar a og:image
 * rapidamente. Servir a imagem a partir do nosso próprio domínio com
 * Cache-Control agressivo garante o mesmo comportamento que o TikTok:
 * thumbnail aparece imediatamente no preview.
 */
export const config = { runtime: 'edge' };

const APP_BASE = 'https://ocultoswing.com.br';
const EXTERNAL_SUPABASE_URL = 'https://rvybbrkzmboqbhcemqar.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc';

const FALLBACK_URL = `${APP_BASE}/og-image.jpg?v=5`;
const FETCH_TIMEOUT_MS = 4500;

function cleanShareId(id: string): string {
  return decodeURIComponent(id || '')
    .replace(/\.(?:jpg|jpeg|png|webp|gif)$/i, '')
    .trim();
}

function shareIdFromRequest(url: URL): string {
  const fromQuery = url.searchParams.get('id') || '';
  if (fromQuery) return cleanShareId(fromQuery);
  const match = url.pathname.match(/\/c\/og-image\/([^/?#]+)/) || url.pathname.match(/\/api\/og-c-image\/([^/?#]+)/);
  return cleanShareId(match?.[1] || '');
}

function absolutize(url?: string | null): string | null {
  if (!url) return null;
  const v = url.trim();
  if (!v) return null;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (v.startsWith('/')) return `${APP_BASE}${v}`;
  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${v.replace(/^\/+/, '')}`;
}

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/\S+/i);
  return m ? m[0].replace(/[)\].,!?]+$/g, '') : null;
}

function tweetIdFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (!/(^|\.)(x|twitter)\.com$/.test(host)) return null;
    return u.pathname.match(/\/(?:i\/)?status(?:es)?\/(\d+)/)?.[1] || null;
  } catch { return null; }
}

async function fetchJsonFast(url: string, timeoutMs = 1500): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    return r.ok ? await r.json().catch(() => null) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function resolveExternalImage(rawUrl: string): Promise<string | null> {
  const tweetId = tweetIdFromUrl(rawUrl);
  if (tweetId) {
    const j = await fetchJsonFast(`https://api.fxtwitter.com/status/${encodeURIComponent(tweetId)}`, 1400);
    const t = j?.tweet || j;
    const media = Array.isArray(t?.media_extended) ? t.media_extended[0] : null;
    const img = media?.thumbnail_url || media?.media_url_https || t?.poster;
    if (img) return img;
  }
  const noembed = await fetchJsonFast(`https://noembed.com/embed?url=${encodeURIComponent(rawUrl)}`, 1500);
  if (noembed?.thumbnail_url) return noembed.thumbnail_url;
  const micro = await fetchJsonFast(
    `https://api.microlink.io/?url=${encodeURIComponent(rawUrl)}&audio=false&video=false&iframe=false&meta=true`,
    1700,
  );
  const d = micro?.data;
  const image = typeof d?.image === 'string' ? d.image : d?.image?.url;
  return image || null;
}

async function fetchPost(idOrSlug: string) {
  const headers = {
    apikey: EXTERNAL_SUPABASE_ANON_KEY,
    authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
    'content-type': 'application/json',
  };
  // Usa RPC SECURITY DEFINER (bypassa RLS de visitante anônimo).
  const rpcRes = await fetch(
    `${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/post_public_share_preview`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_id_or_slug: idOrSlug }),
    },
  );
  if (!rpcRes.ok) return null;
  const rows = await rpcRes.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  return {
    post: {
      id: row.id,
      share_slug: row.share_slug,
      content_text: row.content_text,
      media_url: row.media_url,
      media_type: row.media_type,
      author_id: row.author_id,
      is_hidden: false,
      link_preview_image_url: row.link_preview_image_url,
    },
    avatar: row.author_avatar_url || null,
  };
}

async function streamImage(srcUrl: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(srcUrl, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 OcultoBot/1.0 (+https://ocultoswing.com.br)' },
    });
    if (!upstream.ok || !upstream.body) throw new Error(`upstream ${upstream.status}`);
    const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
    const ct = upstreamType.startsWith('image/') ? upstreamType.split(';')[0] : 'image/jpeg';
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': ct,
        'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'cdn-cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'access-control-allow-origin': '*',
      },
    });
  } finally {
    clearTimeout(t);
  }
}

async function fallback(): Promise<Response> {
  try { return await streamImage(FALLBACK_URL); }
  catch {
    return new Response('not found', { status: 302, headers: { location: FALLBACK_URL } });
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const id = shareIdFromRequest(url);
    if (!id) return fallback();
    const data = await fetchPost(id);
    if (!data) return fallback();
    const { post, avatar } = data;

    const text = (post.content_text || '').trim();
    const isJustUrl = /^https?:\/\/\S+$/i.test(text);
    const shared = firstUrl(text);

    let src: string | null = null;
    // 1) Capa de link salva no momento do post (caminho rápido — sem rede externa).
    if (post.link_preview_image_url) {
      src = absolutize(post.link_preview_image_url);
    }
    // 2) Resolução ao vivo (fxtwitter/microlink) — fallback para posts antigos.
    if (!src && isJustUrl && shared) {
      src = await resolveExternalImage(shared);
    }
    if (!src && post.media_type === 'image' && post.media_url) {
      src = absolutize(post.media_url);
    }
    if (!src && avatar) {
      src = absolutize(avatar);
    }
    if (!src) return fallback();

    try { return await streamImage(src); }
    catch { return fallback(); }
  } catch { return fallback(); }
}
