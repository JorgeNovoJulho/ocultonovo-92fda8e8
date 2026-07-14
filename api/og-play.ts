/**
 * /api/og-play — SSR Open Graph HTML para previews do OCULTO PLAY.
 *
 * Servido pelo próprio domínio ocultoswing.com.br (Vercel), evitando o
 * CSP `sandbox` que o gateway de Edge Functions do Supabase aplica em
 * respostas HTML — o sandbox impedia o Twitter/X e o WhatsApp de
 * renderizarem o preview com capa e título.
 *
 * Crawlers (Twitterbot, facebookexternalhit, WhatsApp, etc.) caem aqui
 * via rewrite em vercel.json com matching de User-Agent. Humanos NÃO
 * passam por esta rota e seguem direto para o SPA. Não usamos meta refresh
 * aqui: robôs do X podem seguir refresh para a mesma URL e entrar em loop,
 * resultando em timeout no Card Validator.
 */
export const config = { runtime: 'edge' };

const APP_BASE = 'https://ocultoswing.com.br';
const EXTERNAL_SUPABASE_URL = 'https://rvybbrkzmboqbhcemqar.supabase.co';
const EXTERNAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc';

const DEFAULT_TITLE = 'OCULTO PLAY — conteúdo exclusivo';
const DEFAULT_DESCRIPTION =
  'Vídeos curtos, áudios e memes +18 dos criadores no OCULTO. Toque para abrir.';
const DEFAULT_IMAGE = `${APP_BASE}/og-image.jpg?v=3`;

function cleanItemId(id: string): string {
  return decodeURIComponent(id || '')
    .replace(/\.(?:jpg|jpeg|png|webp|gif)$/i, '')
    .trim();
}

const KIND_LABEL: Record<string, string> = {
  short_video: 'Vídeo curto',
  meme: 'Meme',
  audio: 'Áudio',
  vip_teaser: 'Teaser VIP',
  community_post: 'Comunidade',
  challenge: 'Desafio',
  link: 'Filme',
};

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

function withMediaFragment(url: string, start?: number | null, end?: number | null): string {
  const s = Math.max(0, Number(start ?? 0) || 0);
  const e = Math.max(0, Number(end ?? 0) || 0);
  if (!(e > s) && s <= 0) return url;
  const fragment = e > s ? `t=${s},${e}` : `t=${s}`;
  return `${url.split('#')[0]}#${fragment}`;
}

function imageExtensionFromUrl(imageUrl: string): 'jpg' | 'png' | 'gif' {
  try {
    const pathname = new URL(imageUrl).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'png';
    if (pathname.endsWith('.gif')) return 'gif';
  } catch {
    const clean = imageUrl.split('?')[0].toLowerCase();
    if (clean.endsWith('.png')) return 'png';
    if (clean.endsWith('.gif')) return 'gif';
  }
  return 'jpg';
}

function contentTypeForImageExt(ext: 'jpg' | 'png' | 'gif'): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function proxiedOgImage(id: string, version: string, ext: 'jpg' | 'png' | 'gif'): string {
  return `${APP_BASE}/play/og-image/${encodeURIComponent(`${id}.${ext}`)}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
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

function renderHtml(opts: {
  title: string;
  description: string;
  image: string;
  imageType: string;
  video?: string | null;
  videoType?: string | null;
  url: string;
  redirectTo: string;
  author?: string | null;
  publishedAt?: string | null;
  kind?: string | null;
}): string {
  const { title, description, image, imageType, video, videoType, url, redirectTo, author, publishedAt, kind } = opts;
  const appUrl = withAppMarker(redirectTo);
  const safeVideo = video ? escapeHtml(video) : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(url)}" />
<meta property="og:type" content="video.other" />
<meta property="og:site_name" content="OCULTO PLAY" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:url" content="${escapeHtml(image)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />
<meta property="og:image:href" content="${escapeHtml(image)}" />
<meta property="og:image:type" content="${escapeHtml(imageType)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escapeHtml(title)}" />
${video ? `<meta property="og:video" content="${safeVideo}" />
<meta property="og:video:url" content="${safeVideo}" />
<meta property="og:video:secure_url" content="${safeVideo}" />
<meta property="og:video:type" content="${escapeHtml(videoType || 'video/mp4')}" />` : ''}
<meta property="og:locale" content="pt_BR" />
${kind ? `<meta property="article:section" content="${escapeHtml(kind)}" />` : ''}
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
<body style="font-family:system-ui;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box">
<main style="width:min(520px,100%);text-align:center">
${video ? `<video src="${safeVideo}" poster="${escapeHtml(image)}" muted autoplay loop playsinline controls style="width:100%;max-height:70vh;object-fit:contain;background:#000;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.55)"></video>` : `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" style="width:100%;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.55)" />`}
<h1 style="font-size:20px;line-height:1.2;margin:18px 0 8px">${escapeHtml(title)}</h1>
<p style="color:#d4d4d8;font-size:14px;margin:0 0 16px">${escapeHtml(description)}</p>
<a href="${escapeHtml(appUrl)}" style="display:inline-flex;color:#fff;background:linear-gradient(90deg,#d946ef,#f43f5e);border-radius:999px;padding:10px 16px;text-decoration:none;font-weight:700">Abrir no OCULTO PLAY →</a>
</main>
</body>
</html>`;
}

function notFound(id: string, versionParam: string): Response {
  const redirectTo = `${APP_BASE}/play/p/${id}${versionParam ? `?v=${encodeURIComponent(versionParam)}` : ''}`;
  const html = renderHtml({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    image: DEFAULT_IMAGE,
    imageType: 'image/jpeg',
    url: redirectTo,
    redirectTo,
  });
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60',
    },
  });
}

async function fetchPlayItem(id: string) {
  const rpcRes = await fetch(`${EXTERNAL_SUPABASE_URL}/rest/v1/rpc/oculto_play_public_preview`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
      authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ p_item_id: id }),
  });
  if (!rpcRes.ok) return null;
  const rows = await rpcRes.json().catch(() => null);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchPostFallback(id: string) {
  // Fallback: o link /play/p/<id> pode ser de um post comum do feed
  // (não está em oculto_play_items). Buscamos diretamente em `posts`
  // e enriquecemos com `profiles` para entregar capa + autor + caption.
  const headers = {
    apikey: EXTERNAL_SUPABASE_ANON_KEY,
    authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
  };
  const postRes = await fetch(
    `${EXTERNAL_SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}&select=id,author_id,creator_id,content_text,content,description,title,thumbnail_url,preview_url,media_url,media_type,post_type,is_paid,created_at,is_hidden`,
    { headers },
  );
  if (!postRes.ok) return null;
  const rows = await postRes.json().catch(() => null);
  const post = Array.isArray(rows) ? rows[0] : null;
  if (!post || post.is_hidden) return null;

  const authorId = post.author_id || post.creator_id;
  let profile: any = null;
  if (authorId) {
    const profRes = await fetch(
      `${EXTERNAL_SUPABASE_URL}/rest/v1/profiles?or=(id.eq.${authorId},user_id.eq.${authorId})&select=username,display_name,avatar_url&limit=1`,
      { headers },
    );
    if (profRes.ok) {
      const profRows = await profRes.json().catch(() => null);
      profile = Array.isArray(profRows) ? profRows[0] : null;
    }
  }

  const thumb =
    post.thumbnail_url ||
    post.preview_url ||
    (post.media_type === 'image' ? post.media_url : null);

  return {
    kind:
      post.media_type === 'video'
        ? 'short_video'
        : post.media_type === 'audio'
          ? 'audio'
          : 'community_post',
    title: post.title || null,
    caption: post.content_text || post.content || post.description || null,
    thumb_url: thumb,
    media_url: post.media_url || null,
    source_url: null,
    author_username: profile?.username || null,
    author_display_name: profile?.display_name || null,
    author_avatar_url: profile?.avatar_url || null,
    trailer_url: null,
    trailer_trim_start_seconds: null,
    trailer_trim_end_seconds: null,
    published_at: post.created_at,
  };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const id = cleanItemId(url.searchParams.get('id') || '');
    const versionParam = url.searchParams.get('v') || '';
    if (!id) {
      return new Response('Missing id', { status: 400 });
    }

    let item = await fetchPlayItem(id);
    if (!item) item = await fetchPostFallback(id);
    if (!item) return notFound(id, versionParam);


    const handle = item.author_username
      ? `@${item.author_username}`
      : item.author_display_name || null;
    const kindLabel = KIND_LABEL[item.kind] || 'Conteúdo';
    const baseTitle =
      item.title || (handle ? `${kindLabel} de ${handle}` : `${kindLabel} no OCULTO PLAY`);
    const title = `${baseTitle} · OCULTO PLAY`;

    const description = (
      item.caption?.trim() ||
      (handle ? `${kindLabel} publicado por ${handle} no OCULTO PLAY.` : DEFAULT_DESCRIPTION)
    ).slice(0, 200);

    const image = absolutize(item.thumb_url) || absolutize(item.author_avatar_url) || DEFAULT_IMAGE;
    const hasTrimWindow = Number(item.trailer_trim_end_seconds ?? 0) > Number(item.trailer_trim_start_seconds ?? 0);
    const rawPrimaryTrailerSource = hasTrimWindow
      ? absolutize(item.kind === 'link' ? (item.source_url || item.media_url) : item.media_url)
      : null;
    const rawUploadedTrailer = !hasTrimWindow ? absolutize(item.trailer_url) : null;
    const candidateTrailer = rawPrimaryTrailerSource
      ? withMediaFragment(rawPrimaryTrailerSource, item.trailer_trim_start_seconds, item.trailer_trim_end_seconds)
      : rawUploadedTrailer;
    // og:video só faz sentido para arquivos diretos (mp4/webm/mov). Links de
    // YouTube/Vimeo/TikTok/embed não são reproduzíveis no card do crawler —
    // nesse caso seguimos apenas com a capa (og:image) e o link "Abrir".
    const isDirectTrailer = !!candidateTrailer && /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i.test(candidateTrailer);
    const trailerVideo = isDirectTrailer ? candidateTrailer : null;
    const naturalVersion = String(new Date(item.published_at).getTime() || Date.now());
    const effectiveVersion = versionParam || naturalVersion;
    const imageExt = imageExtensionFromUrl(image);
    const imageType = contentTypeForImageExt(imageExt);
    const versionedImage = image === DEFAULT_IMAGE
      ? image
      : proxiedOgImage(id, effectiveVersion, imageExt);
    const versionedUrl = `${APP_BASE}/play/p/${id}?v=${encodeURIComponent(effectiveVersion)}`;
    const canonicalForCrawler = `${APP_BASE}/play/p/${id}`;

    const html = renderHtml({
      title,
      description,
      image: versionedImage,
      imageType,
      video: trailerVideo,
      videoType: trailerVideo?.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4',
      url: versionedUrl,
      redirectTo: canonicalForCrawler,
      author: handle,
      publishedAt: item.published_at,
      kind: item.kind,
    });

    // Preheat SÍNCRONO da capa: bloqueamos a resposta até a imagem estar
    // no edge cache (com timeout curto). Sem isso, o Facebook recebe o
    // HTML antes da capa estar processada e mostra "Propriedade inferida"
    // / "Prévia do link" sem imagem.
    if (versionedImage !== DEFAULT_IMAGE) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3500);
        const r = await fetch(versionedImage, {
          method: 'GET',
          headers: { accept: 'image/jpeg,image/png,image/gif,image/*;q=0.8' },
          signal: ctrl.signal,
        }).catch(() => null);
        clearTimeout(t);
        try { await r?.body?.cancel(); } catch { /* noop */ }
      } catch { /* noop */ }
    }

    const cacheControl = versionParam
      ? 'no-store, no-cache, must-revalidate, max-age=0'
      : 'public, max-age=120, s-maxage=120, stale-while-revalidate=60';

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': cacheControl,
        'cdn-cache-control': cacheControl,
        vary: 'User-Agent',
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }
}
