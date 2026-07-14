export const config = { runtime: 'edge' };

const TWIMG_ORIGIN = 'https://video.twimg.com';
const MAX_BYTES = 12 * 1024 * 1024;

function corsHeaders(contentType = 'video/mp4') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'range, content-type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': contentType,
  };
}

function normalizeTwimgUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.origin !== TWIMG_ORIGIN) return null;
    if (!/^\/([\w-]+_video|tweet_video)\//.test(u.pathname)) return null;
    if (!/\.(mp4|m3u8)$/i.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function clampRange(range: string | null): string | null {
  if (!range) return null;
  const m = range.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  const start = Number(m[1]);
  const requestedEnd = m[2] ? Number(m[2]) : start + MAX_BYTES - 1;
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd) || requestedEnd < start) return null;
  const end = Math.min(requestedEnd, start + MAX_BYTES - 1);
  return `bytes=${start}-${end}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

  const url = normalizeTwimgUrl(new URL(req.url).searchParams.get('url'));
  if (!url) return new Response('Invalid media URL', { status: 400, headers: corsHeaders('text/plain; charset=utf-8') });

  const upstreamHeaders: Record<string, string> = {
    Accept: 'video/mp4,video/*,*/*;q=0.8',
    'Accept-Encoding': 'identity',
    'User-Agent': 'Mozilla/5.0 OCULTO Twitter Video Proxy',
  };
  // Sempre responde em modo Range. Se o browser pedir o arquivo inteiro em
  // mobile, baixaria MP4 demais antes do primeiro frame e o áudio dessincroniza.
  const range = clampRange(req.headers.get('range')) || `bytes=0-${MAX_BYTES - 1}`;
  upstreamHeaders.Range = range;

  const upstream = await fetch(url, {
    method: req.method,
    headers: upstreamHeaders,
    redirect: 'follow',
  });

  const headers = corsHeaders(upstream.headers.get('content-type') || 'video/mp4');
  const copy = ['content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
  for (const key of copy) {
    const value = upstream.headers.get(key);
    if (value) headers[key] = value;
  }
  headers['Accept-Ranges'] = 'bytes';
  headers['Cache-Control'] = upstream.ok
    ? 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=1209600, immutable'
    : 'no-store';

  return new Response(req.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}