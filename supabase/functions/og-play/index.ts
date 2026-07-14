// og-play — SSR HTML com Open Graph para previews de links públicos do OCULTO PLAY.
// Crawlers leem as meta tags; usuários humanos são redirecionados para /play/p/:id.
//
// IMPORTANTE: consulta SEMPRE o Supabase EXTERNO (rvybbrkzmboqbhcemqar).
//
// URLs:
//   /functions/v1/og-play?id=<itemId>          → preview padrão
//   /functions/v1/og-play?id=<itemId>&v=<n>    → cache-busting manual
//   /functions/v1/og-play?id=<itemId>&debug=1  → resposta JSON
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const APP_BASE = "https://ocultoswing.com.br";
const EXTERNAL_SUPABASE_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc";

const DEFAULT_TITLE = "OCULTO PLAY — conteúdo exclusivo";
const DEFAULT_DESCRIPTION =
  "Vídeos curtos, áudios e memes +18 dos criadores no OCULTO. Toque para abrir.";
const DEFAULT_IMAGE = `${APP_BASE}/og-image.jpg`;

const KIND_LABEL: Record<string, string> = {
  short_video: "Vídeo curto",
  meme: "Meme",
  audio: "Áudio",
  vip_teaser: "Teaser VIP",
  community_post: "Comunidade",
  challenge: "Desafio",
};

function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanItemId(raw: string | null): string | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim();
  const withoutPath = decoded.split("/")[0] || decoded;
  const withoutExt = withoutPath.replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
  const match = withoutExt.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] ?? null;
}

function absolutize(url?: string | null): string | null {
  if (!url) return null;
  const v = url.trim();
  if (!v) return null;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/")) return `${APP_BASE}${v}`;
  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${v.replace(/^\/+/, "")}`;
}

/**
 * Converte uma URL pública do Supabase Storage para o endpoint de
 * transformação (`/render/image/public/...`), gerando uma versão
 * otimizada (≤ 1200x630, JPEG ~80%) que cabe no limite de preview
 * do WhatsApp (~600 KB). Se a URL não for do Supabase Storage,
 * devolve a original.
 */
function toOgImage(url: string | null, version: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const marker = "/storage/v1/object/public/";
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) {
      const rest = u.pathname.slice(idx + marker.length);
      u.pathname = `/storage/v1/render/image/public/${rest}`;
      u.search = "";
      u.searchParams.set("width", "1200");
      u.searchParams.set("height", "630");
      u.searchParams.set("resize", "cover");
      u.searchParams.set("quality", "75");
      u.searchParams.set("format", "origin");
      if (version) u.searchParams.set("v", version);
      return u.toString();
    }
    if (version) {
      u.searchParams.set("v", version);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function proxyImageResponse(imageUrl: string, version: string) {
  const optimizedUrl = toOgImage(imageUrl, version) || imageUrl;
  const imageResponse = await fetch(optimizedUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "user-agent": "OCULTO-PLAY-OG-IMAGE/1.0",
    },
  });

  if (!imageResponse.ok || !imageResponse.body) {
    return Response.redirect(DEFAULT_IMAGE, 302);
  }

  const cacheControl = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
  return new Response(imageResponse.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": imageResponse.headers.get("content-type") || "image/jpeg",
      "cache-control": cacheControl,
      "cdn-cache-control": cacheControl,
      "x-content-type-options": "nosniff",
    },
  });
}


function renderHtml(opts: {
  title: string;
  description: string;
  image: string;
  url: string;
  redirectTo: string;
  author?: string | null;
  publishedAt?: string | null;
  kind?: string | null;
}) {
  const { title, description, image, url, redirectTo, author, publishedAt, kind } = opts;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(redirectTo)}" />
<meta property="og:type" content="video.other" />
<meta property="og:site_name" content="OCULTO PLAY" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escapeHtml(title)}" />
<meta property="og:locale" content="pt_BR" />
${kind ? `<meta property="og:video:type" content="${escapeHtml(kind)}" />` : ""}
${author ? `<meta property="article:author" content="${escapeHtml(author)}" />` : ""}
${publishedAt ? `<meta property="article:published_time" content="${escapeHtml(publishedAt)}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@ocultoswing" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta name="twitter:image:alt" content="${escapeHtml(title)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectTo)}" />
<script>window.location.replace(${JSON.stringify(redirectTo)});</script>
</head>
<body style="font-family:system-ui;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<a href="${escapeHtml(redirectTo)}" style="color:#d946ef">Abrir no OCULTO PLAY →</a>
</body>
</html>`;
}

const BOT_UA_REGEX =
  /(facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|telegrambot|slackbot|discordbot|googlebot|bingbot|applebot|pinterestbot|redditbot|embedly|skypeuripreview|vkshare|w3c_validator|developers\.google\.com|bot|crawler|spider|preview|curl|wget|node-fetch|python-requests|http-client)/i;

function isBot(ua: string | null): boolean {
  if (!ua) return true; // sem UA, assume bot para servir OG
  return BOT_UA_REGEX.test(ua);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const id = cleanItemId(url.searchParams.get("id"));
    const versionParam = url.searchParams.get("v") || "";
    const debug = url.searchParams.get("debug") === "1";
    const imageMode = url.searchParams.get("image") === "1";
    const force = url.searchParams.get("bot") === "1";
    const ua = req.headers.get("user-agent");
    const bot = force || debug || isBot(ua);
    if (!id) return new Response("Missing id", { status: 400, headers: corsHeaders });

    const supa = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: rows } = await supa.rpc("oculto_play_public_preview", { p_item_id: id });
    const item = Array.isArray(rows) ? rows[0] : null;

    const redirectTo = `${APP_BASE}/play/p/${id}${versionParam ? `?v=${encodeURIComponent(versionParam)}` : ""}`;
    const canonicalForCrawler = `${APP_BASE}/play/p/${id}`;
    const etag = `"og-play-${id}-${item?.published_at || "x"}-${versionParam}"`;

    if (!item) {
      const html = renderHtml({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        image: DEFAULT_IMAGE,
        url: redirectTo,
        redirectTo: canonicalForCrawler,
      });
      return new Response(debug ? JSON.stringify({ status: "not-found" }, null, 2) : html, {
        headers: {
          ...corsHeaders,
          "content-type": debug ? "application/json" : "text/html; charset=utf-8",
          "cache-control": "public, max-age=60, s-maxage=60",
          etag,
        },
      });
    }

    const handle = item.author_username ? `@${item.author_username}` : item.author_display_name || null;
    const kindLabel = KIND_LABEL[item.kind] || "Conteúdo";
    const baseTitle = item.title || (handle ? `${kindLabel} de ${handle}` : `${kindLabel} no OCULTO PLAY`);
    const title = `${baseTitle} · OCULTO PLAY`;

    const description = (item.caption?.trim() ||
      (handle ? `${kindLabel} publicado por ${handle} no OCULTO PLAY.` : DEFAULT_DESCRIPTION)).slice(0, 200);

    const image = absolutize(item.thumb_url) || absolutize(item.author_avatar_url) || DEFAULT_IMAGE;
    const naturalVersion = String(new Date(item.published_at).getTime() || Date.now());
    const effectiveVersion = versionParam || naturalVersion;
    if (imageMode) {
      return proxyImageResponse(image, effectiveVersion);
    }

    const proxiedImage = `${EXTERNAL_SUPABASE_URL}/functions/v1/og-play?id=${encodeURIComponent(id)}&image=1&v=${encodeURIComponent(effectiveVersion)}`;
    const versionedImage = proxiedImage;
    const versionedUrl = `${APP_BASE}/play/p/${id}?v=${encodeURIComponent(effectiveVersion)}`;
    console.log("[og-play:v6-imgmode-fix]", { id, ua, bot, imageMode, image, proxiedImage });

    // ====== HUMANO: serve a SPA com OG injetada (mesmo URL, sem redirect/loop) ======
    if (!bot) {
      try {
        const shellRes = await fetch(`${APP_BASE}/index.html`, {
          headers: { "user-agent": "OCULTO-OGPLAY-SHELL/1.0", "accept": "text/html" },
          // evita cache antigo
          cache: "no-store" as RequestCache,
        });
        if (shellRes.ok) {
          let shell = await shellRes.text();
          const inject = [
            `<meta property="og:type" content="video.other" />`,
            `<meta property="og:site_name" content="OCULTO PLAY" />`,
            `<meta property="og:title" content="${escapeHtml(title)}" />`,
            `<meta property="og:description" content="${escapeHtml(description)}" />`,
            `<meta property="og:url" content="${escapeHtml(versionedUrl)}" />`,
            `<meta property="og:image" content="${escapeHtml(versionedImage)}" />`,
            `<meta property="og:image:secure_url" content="${escapeHtml(versionedImage)}" />`,
            `<meta property="og:image:width" content="1200" />`,
            `<meta property="og:image:height" content="630" />`,
            `<meta name="twitter:card" content="summary_large_image" />`,
            `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
            `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
            `<meta name="twitter:image" content="${escapeHtml(versionedImage)}" />`,
            `<title>${escapeHtml(title)}</title>`,
          ].join("\n");
          // Remove título/og default e injeta os novos antes de </head>
          shell = shell
            .replace(/<title>[\s\S]*?<\/title>/i, "")
            .replace(/<meta\s+property="og:[^"]+"[^>]*>/gi, "")
            .replace(/<meta\s+name="twitter:[^"]+"[^>]*>/gi, "")
            .replace(/<\/head>/i, `${inject}\n</head>`);
          return new Response(shell, {
            headers: {
              ...corsHeaders,
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
              "cdn-cache-control": "no-store",
              vary: "User-Agent",
              etag,
            },
          });
        }
      } catch (e) {
        console.error("[og-play] shell fetch fail", e);
      }
      // fallback humano: redirect simples
      return Response.redirect(canonicalForCrawler, 302);
    }

    // ====== BOT: HTML enxuto com OG (mantém comportamento original) ======
    const html = renderHtml({
      title,
      description,
      image: versionedImage,
      url: versionedUrl,
      redirectTo: canonicalForCrawler,
      author: handle,
      publishedAt: item.published_at,
      kind: item.kind,
    });

    const cacheControl = versionParam
      ? "no-store, no-cache, must-revalidate, max-age=0"
      : "public, max-age=120, s-maxage=120, stale-while-revalidate=60";

    if (debug) {
      return new Response(
        JSON.stringify({ id, ua, bot, url: versionedUrl, meta: { title, description, image: versionedImage }, item }, null, 2),
        { headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } },
      );
    }

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "content-type": "text/html; charset=utf-8",
        "cache-control": cacheControl,
        "cdn-cache-control": cacheControl,
        vary: "User-Agent",
        etag,
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
