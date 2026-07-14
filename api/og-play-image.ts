/**
 * /api/og-play-image — proxy da capa OG do OCULTO PLAY.
 *
 * - Sempre devolve image/jpeg|png|gif válido para crawlers sociais.
 * - WebP é tratado como inválido para Facebook e cai no fallback JPEG.
 * - Se a origem falhar, retornar tipo não-imagem, ou o corpo for vazio,
 *   devolvemos diretamente /og-image.jpg para evitar prévia sem capa.
 * - Headers explícitos de Content-Type e Cache-Control para garantir que
 *   crawlers sempre recebam imagem válida e cacheável.
 */
export const config = { runtime: 'edge' };

const APP_BASE = 'https://ocultoswing.com.br';
const EXTERNAL_SUPABASE_URL = 'https://rvybbrkzmboqbhcemqar.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc';

const DEFAULT_IMAGE_URL = `${APP_BASE}/og-image.jpg?v=3`;
const CACHE_HEADER =
  'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';

function absolutize(url?: string | null): string | null {
  if (!url) return null;
  const v = url.trim();
  if (!v) return null;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${v.replace(/^\/+/, '')}`;
}

function toRenderedImage(url: string): string {
  try {
    const u = new URL(url);
    const marker = '/storage/v1/object/public/';
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      const rest = u.pathname.slice(idx + marker.length);
      u.pathname = `/storage/v1/render/image/public/${rest}`;
      u.search = '';
      u.searchParams.set('width', '1200');
      u.searchParams.set('height', '630');
      u.searchParams.set('resize', 'cover');
      u.searchParams.set('quality', '78');
      return u.toString();
    }
    return u.toString();
  } catch {
    return url;
  }
}

function slugify(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'og-play';
}

function cleanContentType(contentType: string): string {
  const clean = contentType.toLowerCase().split(';')[0].trim();
  return clean === 'image/jpg' ? 'image/jpeg' : clean;
}

function extensionForContentType(contentType: string): 'jpg' | 'png' | 'gif' {
  const clean = cleanContentType(contentType);
  if (clean === 'image/png') return 'png';
  if (clean === 'image/gif') return 'gif';
  return 'jpg';
}

function isAllowedImageType(contentType: string): boolean {
  const clean = cleanContentType(contentType);
  return (
    clean === 'image/jpeg' ||
    clean === 'image/png' ||
    clean === 'image/gif'
  );
}

function imageBodyMatchesType(buffer: ArrayBuffer, contentType: string): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  const clean = cleanContentType(contentType);
  if (clean === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (clean === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (clean === 'image/gif') return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  return false;
}

function fallbackRedirect(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: DEFAULT_IMAGE_URL,
      'cache-control': 'public, max-age=300, s-maxage=300',
      'access-control-allow-origin': '*',
    },
  });
}

async function fallbackImageResponse(): Promise<Response> {
  try {
    const res = await fetch(DEFAULT_IMAGE_URL, { headers: { accept: 'image/jpeg' } });
    const type = cleanContentType(res.headers.get('content-type') || 'image/jpeg');
    const buffer = await res.arrayBuffer();
    if (res.ok && buffer.byteLength >= 1024 && imageBodyMatchesType(buffer, type)) {
      return new Response(buffer, {
        status: 200,
        headers: {
          'content-type': type,
          'content-disposition': 'inline; filename="og-image.jpg"',
          'cache-control': CACHE_HEADER,
          'cdn-cache-control': CACHE_HEADER,
          'access-control-allow-origin': '*',
          'x-content-type-options': 'nosniff',
        },
      });
    }
  } catch { /* noop */ }
  return fallbackRedirect();
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const pathMatch = url.pathname.match(/\/play\/og-image\/([^/?#]+)/);
    const rawId = url.searchParams.get('id') || (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
    const id = rawId?.replace(/\.(?:jpe?g|png|webp|gif)$/i, '').trim() || null;
    if (!id) return fallbackImageResponse();

    const headers = {
      'content-type': 'application/json',
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
      authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
    };

    let item: any = null;
    const rpcRes = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/oculto_play_public_preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_item_id: id }),
    });
    if (rpcRes.ok) {
      const rows = await rpcRes.json().catch(() => null);
      item = Array.isArray(rows) ? rows[0] : null;
    }

    // Fallback: post comum do feed.
    if (!item) {
      const postRes = await fetch(
        `${EXTERNAL_SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&select=author_id,creator_id,thumbnail_url,preview_url,media_url,media_type,title,is_hidden`,
        { headers },
      );
      if (postRes.ok) {
        const rows = await postRes.json().catch(() => null);
        const post = Array.isArray(rows) ? rows[0] : null;
        if (post && !post.is_hidden) {
          const thumb =
            post.thumbnail_url ||
            post.preview_url ||
            (post.media_type === 'image' ? post.media_url : null);
          let avatar: string | null = null;
          const authorId = post.author_id || post.creator_id;
          if (!thumb && authorId) {
            const profRes = await fetch(
              `${EXTERNAL_SUPABASE_URL}/rest/v1/profiles?or=(id.eq.${authorId},user_id.eq.${authorId})&select=avatar_url&limit=1`,
              { headers },
            );
            if (profRes.ok) {
              const profRows = await profRes.json().catch(() => null);
              avatar = Array.isArray(profRows) ? profRows[0]?.avatar_url || null : null;
            }
          }
          item = {
            thumb_url: thumb,
            author_avatar_url: avatar,
            title: post.title || null,
          };
        }
      }
    }

    const image = absolutize(item?.thumb_url) || absolutize(item?.author_avatar_url);
    if (!image) return fallbackImageResponse();


    let imageRes = await fetch(toRenderedImage(image), {
      headers: { accept: 'image/jpeg,image/png,image/gif,image/*;q=0.8' },
    });
    if (!imageRes.ok) {
      imageRes = await fetch(image, {
        headers: { accept: 'image/jpeg,image/png,image/gif,image/*;q=0.8' },
      });
    }
    if (!imageRes.ok || !imageRes.body) return fallbackImageResponse();

    const upstreamType = imageRes.headers.get('content-type') || '';
    if (!isAllowedImageType(upstreamType)) {
      try { await imageRes.body.cancel(); } catch { /* noop */ }
      return fallbackImageResponse();
    }
    const outType = cleanContentType(upstreamType);
    const buffer = await imageRes.arrayBuffer().catch(() => null);
    if (!buffer || buffer.byteLength < 1024 || !imageBodyMatchesType(buffer, outType)) {
      return fallbackImageResponse();
    }

    const filename = `${slugify(item?.title || item?.author_username || 'og-play')}.${extensionForContentType(outType)}`;

    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': outType,
        'content-disposition': `inline; filename="${filename}"`,
        'cache-control': CACHE_HEADER,
        'cdn-cache-control': CACHE_HEADER,
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return fallbackImageResponse();
  }
}
