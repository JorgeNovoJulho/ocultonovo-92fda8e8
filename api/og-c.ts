/**
 * /api/og-c — SSR Open Graph HTML para previews da página pública
 * de compartilhamento de post (/c/:postId).
 *
 * Crawlers (WhatsApp, Telegram, Facebook, Twitter/X, etc.) caem aqui
 * via rewrite em vercel.json com matching de User-Agent. Humanos NÃO
 * passam por esta rota e seguem direto para o SPA em /c/:postId.
 */
export const config = { runtime: 'edge' };

const APP_BASE = 'https://ocultoswing.com.br';
const EXTERNAL_SUPABASE_URL = 'https://rvybbrkzmboqbhcemqar.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc';

const DEFAULT_TITLE = 'OCULTO — Conteúdo exclusivo';
const DEFAULT_DESCRIPTION =
  'Conteúdo exclusivo publicado no OCULTO. Toque para abrir a prévia.';
const DEFAULT_IMAGE = `${APP_BASE}/og-image.jpg?v=5`;
const SOCIAL_FETCH_TIMEOUT_MS = 1800;

function cleanShareId(id: string): string {
  return decodeURIComponent(id || '')
    .replace(/\.(?:jpg|jpeg|png|webp|gif)$/i, '')
    .trim();
}

function shareIdFromRequest(url: URL): string {
  const fromQuery = url.searchParams.get('id') || '';
  if (fromQuery) return cleanShareId(fromQuery);
  const match = url.pathname.match(/\/c\/([^/?#]+)/);
  return cleanShareId(match?.[1] || '');
}

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absolutize(url?: string | null): string | null {
  if (!url) return null;
  const v = url.trim();
  if (!v) return null;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (v.startsWith('/')) return `${APP_BASE}${v}`;
  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${v.replace(/^\/+/, '')}`;
}

function toOptimizedOgImage(url: string): string {
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
      u.searchParams.set('quality', '75');
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function withAppMarker(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('app', '1');
    return u.toString();
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}app=1`;
  }
}

function ogImageVersion(post: { link_preview_image_url?: string | null; media_url?: string | null; created_at?: string | null; id?: string | null }): string {
  const source = post.link_preview_image_url || post.media_url || '';
  const fromFile = source.match(/(?:^|\/)(\d{10,})(?:\.[a-z0-9]+)?(?:[?#].*)?$/i)?.[1];
  if (fromFile) return fromFile;
  const fromCreatedAt = post.created_at ? Date.parse(post.created_at) : NaN;
  if (Number.isFinite(fromCreatedAt)) return String(fromCreatedAt);
  return post.id || '5';
}

async function fetchJsonFast(url: string, timeoutMs = SOCIAL_FETCH_TIMEOUT_MS): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    return r.ok ? await r.json().catch(() => null) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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

async function fetchExternalPreview(rawUrl: string): Promise<{ title?: string; description?: string; image?: string; site?: string } | null> {
  const tweetId = tweetIdFromUrl(rawUrl);
  if (tweetId) {
    const sources = [
      `https://api.fxtwitter.com/status/${encodeURIComponent(tweetId)}`,
      `https://api.vxtwitter.com/status/${encodeURIComponent(tweetId)}`,
    ];
    for (const source of sources) {
      const j = await fetchJsonFast(source, 1400);
      const t = j?.tweet || j;
      const media = Array.isArray(t?.media_extended) ? t.media_extended[0] : Array.isArray(t?.mediaDetails) ? t.mediaDetails[0] : null;
      const image = media?.thumbnail_url || media?.media_url_https || t?.poster || j?.poster;
      const author = t?.author?.screen_name || t?.user_screen_name || t?.user_name;
      const text = t?.text || j?.text;
      if (image || text) {
        return {
          title: author ? `@${author} no X / Twitter` : 'Publicação no X / Twitter',
          description: text ? String(text).slice(0, 200) : 'Toque para abrir a prévia no OCULTO.',
          image: image || undefined,
          site: 'X / Twitter',
        };
      }
    }
  }

  const noembed = await fetchJsonFast(`https://noembed.com/embed?url=${encodeURIComponent(rawUrl)}`, 1500);
  if (noembed && !noembed.error && (noembed.title || noembed.thumbnail_url)) {
    return {
      title: noembed.title || noembed.provider_name,
      description: noembed.author_name ? `por ${noembed.author_name}` : undefined,
      image: noembed.thumbnail_url || undefined,
      site: noembed.provider_name,
    };
  }

  const micro = await fetchJsonFast(`https://api.microlink.io/?url=${encodeURIComponent(rawUrl)}&audio=false&video=false&iframe=false&meta=true`, 1700);
  const d = micro?.data;
  const image = typeof d?.image === 'string' ? d.image : d?.image?.url;
  if (micro?.status === 'success' && (d?.title || image)) {
    return {
      title: d.title || d.publisher,
      description: d.description,
      image: image || undefined,
      site: d.publisher,
    };
  }

  return null;
}

async function fetchPost(idOrSlug: string) {
  const headers = {
    apikey: EXTERNAL_SUPABASE_ANON_KEY,
    authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
    'content-type': 'application/json',
  };
  const rpcRes = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/post_public_share_preview`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_id_or_slug: idOrSlug }),
  });
  if (!rpcRes.ok) return null;
  const rows = await rpcRes.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  const post = {
    id: row.id,
    share_slug: row.share_slug,
    content_text: row.content_text,
    media_url: row.media_url,
    media_type: row.media_type,
    paid_price: row.paid_price,
    author_id: row.author_id,
    created_at: row.created_at || null,
    is_hidden: false,
    link_preview_image_url: row.link_preview_image_url,
    link_preview_title: row.link_preview_title,
    link_preview_description: row.link_preview_description,
  };
  const profile = {
    username: row.author_username,
    display_name: row.author_display_name || row.channel_title,
    avatar_url: row.author_avatar_url,
  };
  return { post, profile };
}

function renderHtml(opts: {
  title: string;
  description: string;
  image: string;
  url: string;
  isVideo: boolean;
  publishedAt?: string | null;
  author?: string | null;
}): string {
  const { title, description, image, url, isVideo, publishedAt, author } = opts;
  const appUrl = withAppMarker(url);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(url)}" />
<meta property="og:type" content="${isVideo ? 'video.other' : 'article'}" />
<meta property="og:site_name" content="OCULTO" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escapeHtml(title)}" />
<meta property="og:locale" content="pt_BR" />
${author ? `<meta property="article:author" content="${escapeHtml(author)}" />` : ''}
${publishedAt ? `<meta property="article:published_time" content="${escapeHtml(publishedAt)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@ocultoswing" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta name="twitter:image:alt" content="${escapeHtml(title)}" />
<script>if(!/bot|crawler|spider|preview|facebookexternalhit|facebot|twitterbot|telegrambot|whatsapp|linkedinbot|slackbot|discordbot/i.test(navigator.userAgent)){location.replace(${JSON.stringify(appUrl)})}</script>
</head>
<body style="font-family:system-ui;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<a href="${escapeHtml(appUrl)}" style="color:#d946ef">Abrir no OCULTO →</a>
</body>
</html>`;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const id = shareIdFromRequest(url);
    if (!id) return new Response('Missing id', { status: 400 });

    const shareUrl = `${APP_BASE}/c/${id}?v=4`;
    const data = await fetchPost(id);

    if (!data) {
      const html = renderHtml({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        image: DEFAULT_IMAGE,
        url: shareUrl,
        isVideo: false,
      });
      return new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=60, s-maxage=60',
        },
      });
    }

    const { post, profile } = data;
    const handle = profile?.username
      ? `@${profile.username}`
      : profile?.display_name || null;
    const rawText = (post.content_text || '').trim();
    const isJustUrl = /^https?:\/\/\S+$/i.test(rawText);
    const sharedUrl = firstUrl(rawText);
    const externalPreview = sharedUrl && (!post.link_preview_image_url || !post.link_preview_title) ? await fetchExternalPreview(sharedUrl) : null;
    const baseTitle = isJustUrl
      ? (post.link_preview_title || externalPreview?.title || (handle ? `${handle} compartilhou um link no OCULTO` : 'Link compartilhado no OCULTO'))
      : (rawText.slice(0, 80) || (handle ? `Conteúdo de ${handle}` : 'Conteúdo exclusivo'));
    const title = `${baseTitle} · OCULTO`;
    const description = isJustUrl
      ? (post.link_preview_description || externalPreview?.description || (handle
          ? `${handle} publicou um conteúdo no OCULTO. Toque para abrir a prévia.`
          : DEFAULT_DESCRIPTION))
      : (rawText || (handle ? `Publicado por ${handle} no OCULTO.` : DEFAULT_DESCRIPTION)).slice(0, 200);

    // Sempre servimos a og:image pelo nosso próprio domínio (proxy /c/og-image/:id).
    // Isso replica o comportamento do TikTok: o crawler do WhatsApp/FB baixa a
    // imagem rapidamente do mesmo host do link, com cache forte de CDN, sem
    // depender do storage externo nem da CDN do remetente original.
    const imageVersion = ogImageVersion(post);
    const image = `${APP_BASE}/c/og-image/${encodeURIComponent(id)}?cover=${encodeURIComponent(imageVersion)}`;

    const html = renderHtml({
      title,
      description,
      image,
      url: shareUrl,
      isVideo: post.media_type === 'video',
      publishedAt: post.created_at,
      author: handle,
    });

    // Pré-aquece o proxy de imagem para o crawler já encontrar no cache do CDN.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const r = await fetch(image, { signal: ctrl.signal }).catch(() => null);
      clearTimeout(t);
      try { await r?.body?.cancel(); } catch { /* noop */ }
    } catch { /* noop */ }

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'cdn-cache-control': 'no-store',
        vary: 'User-Agent',
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }
}
