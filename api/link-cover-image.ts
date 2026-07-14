/**
 * Proxy leve para o modal salvar capas de links externos.
 * Evita bloqueio de CORS ao transformar a imagem exibida na prévia em capa 1200x630.
 */
export const config = { runtime: 'edge' };

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const TIMEOUT_MS = 7000;

function isBlockedHost(hostname: string) {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('url') || '';
    const target = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(target.protocol) || isBlockedHost(target.hostname)) {
      return new Response('blocked', { status: 400 });
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(target.toString(), {
        signal: ctrl.signal,
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 OcultoBot/1.0 (+https://ocultoswing.com.br)',
          referer: `${target.protocol}//${target.hostname}/`,
        },
      });
    } finally {
      clearTimeout(t);
    }

    const type = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !upstream.body || !type.toLowerCase().startsWith('image/')) {
      return new Response('not image', { status: 415 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=86400, s-maxage=86400',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response('failed', { status: 400 });
  }
}