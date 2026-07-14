// og-leitura — SSR HTML com Open Graph para previews de WhatsApp/Telegram/X/Facebook.
// Crawlers leem as meta tags; usuários humanos são redirecionados via meta-refresh + JS
// para /leitura/:postId no app.
//
// IMPORTANTE: consulta SEMPRE o Supabase EXTERNO (rvybbrkzmboqbhcemqar) —
// fonte única de verdade do projeto — mesmo que esteja deployado em outro project ref.
//
// URLs:
//   /functions/v1/og-leitura?id=<postId>          → preview padrão
//   /functions/v1/og-leitura?id=<postId>&v=<n>    → força cache-busting nas redes sociais
//   /functions/v1/og-leitura?id=<postId>&debug=1  → resposta JSON com tudo que foi montado
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const APP_BASE = "https://ocultoswing.com.br";

// Supabase EXTERNO — sempre. Independe de SUPABASE_URL do runtime.
const EXTERNAL_SUPABASE_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc";

const DEFAULT_TITLE = "Leitura exclusiva no OCULTO";
const DEFAULT_DESCRIPTION =
  "Conteúdo +18 publicado no Canal VIP do criador. Toque para abrir no OCULTO.";
const DEFAULT_IMAGE = `${APP_BASE}/og-default.jpg`;

function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absolutize(url?: string | null): string | null {
  if (!url) return null;
  const v = url.trim();
  if (!v) return null;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/")) return `${APP_BASE}${v}`;
  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${v.replace(/^\/+/, "")}`;
}

// Anexa ?v=<ts> em qualquer URL — força redes sociais a re-baixarem o asset
// quando o conteúdo for editado, sem invalidar imagens estáveis.
function withVersion(u: string | null, version: string): string | null {
  if (!u) return null;
  if (!version) return u;
  try {
    const parsed = new URL(u);
    parsed.searchParams.set("v", version);
    return parsed.toString();
  } catch {
    return u.includes("?") ? `${u}&v=${encodeURIComponent(version)}` : `${u}?v=${encodeURIComponent(version)}`;
  }
}

function stripHtml(s?: string | null) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirst<T>(...vals: (T | null | undefined | "")[]): T | null {
  for (const v of vals) if (v) return v as T;
  return null;
}

function sectionLabel(section?: string | null): string {
  switch ((section || "").toLowerCase()) {
    case "story": return "História";
    case "chapter": return "Capítulo";
    case "diary": return "Diário VIP";
    case "article": return "Texto";
    case "series": return "Série";
    case "text_post": return "Bastidores";
    default: return "Canal VIP";
  }
}

function renderHtml(opts: {
  title: string;
  description: string;
  image: string;
  url: string;
  redirectTo: string;
  author?: string | null;
  publishedAt?: string | null;
  section?: string | null;
}) {
  const { title, description, image, url, redirectTo, author, publishedAt, section } = opts;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(redirectTo)}" />
<meta property="og:type" content="article" />
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
${section ? `<meta property="article:section" content="${escapeHtml(section)}" />` : ""}
${author ? `<meta property="article:author" content="${escapeHtml(author)}" />` : ""}
${publishedAt ? `<meta property="article:published_time" content="${escapeHtml(publishedAt)}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectTo)}" />
<script>window.location.replace(${JSON.stringify(redirectTo)});</script>
</head>
<body style="font-family:system-ui;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<a href="${escapeHtml(redirectTo)}" style="color:#d4a84c">Abrir leitura no OCULTO →</a>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const versionParam = url.searchParams.get("v") || "";
    const debug = url.searchParams.get("debug") === "1";

    if (!id) {
      return new Response("Missing id", { status: 400, headers: corsHeaders });
    }

    const supa = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: post } = await supa
      .from("posts")
      .select(
        "id, author_id, creator_id, title, subtitle, teaser, content_text, thumbnail_url, media_url, privacy_level, section_type, content_format, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    const redirectTo = `${APP_BASE}/leitura/${id}${versionParam ? `?v=${encodeURIComponent(versionParam)}` : ""}`;
    const canonicalForCrawler = `${APP_BASE}/leitura/${id}`;

    // Build cache headers — ETag derivado de updated_at + versionParam
    const etagBase = post?.updated_at || post?.created_at || "no-post";
    const etag = `"og-${id}-${etagBase}-${versionParam}"`;

    if (!post) {
      const html = renderHtml({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        image: DEFAULT_IMAGE,
        url: redirectTo,
        redirectTo: canonicalForCrawler,
      });
      return new Response(debug ? JSON.stringify({ status: "not-found", html }, null, 2) : html, {
        headers: {
          ...corsHeaders,
          "content-type": debug ? "application/json" : "text/html; charset=utf-8",
          "cache-control": "public, max-age=60, s-maxage=60",
          etag,
        },
      });
    }

    // ===== Autor =====
    let authorHandle: string | null = null;
    let authorAvatar: string | null = null;
    try {
      const { data: author } = await supa
        .from("profiles")
        .select("username, display_name, avatar_url")
        .or(`id.eq.${post.author_id},user_id.eq.${post.creator_id || post.author_id}`)
        .limit(1)
        .maybeSingle();
      if (author) {
        authorHandle = author.username
          ? `@${author.username}`
          : author.display_name || null;
        authorAvatar = absolutize(author.avatar_url);
      }
    } catch { /* noop */ }

    // ===== Título (com cascata) =====
    const baseTitle = pickFirst<string>(
      post.title,
      post.subtitle,
      post.teaser ? stripHtml(post.teaser).slice(0, 70) : null,
      `${sectionLabel(post.section_type)} no OCULTO`,
    );
    const title = `${baseTitle}${authorHandle ? ` — ${authorHandle}` : ""} · OCULTO`;

    // ===== Descrição (com cascata) =====
    const rawDesc = pickFirst<string>(
      stripHtml(post.teaser),
      stripHtml(post.subtitle),
      stripHtml(post.content_text),
      authorHandle
        ? `Novo ${sectionLabel(post.section_type).toLowerCase()} publicado por ${authorHandle} no OCULTO.`
        : null,
      DEFAULT_DESCRIPTION,
    ) || DEFAULT_DESCRIPTION;
    const description = rawDesc.length > 200 ? `${rawDesc.slice(0, 197)}…` : rawDesc;

    // ===== Imagem (com cascata) =====
    const image = pickFirst<string>(
      absolutize(post.thumbnail_url),
      absolutize(post.media_url),
      authorAvatar,
      DEFAULT_IMAGE,
    ) || DEFAULT_IMAGE;

    // ===== Cache-busting timestamp =====
    // Usa updated_at (epoch ms) como versão "natural" — muda sempre que o post é editado.
    // Se o caller passou ?v=, ele tem prioridade (força bypass manual).
    const naturalVersion = String(new Date(etagBase).getTime() || Date.now());
    const effectiveVersion = versionParam || naturalVersion;

    const versionedImage = withVersion(image, effectiveVersion) || image;
    const versionedUrl = `${APP_BASE}/leitura/${id}?v=${encodeURIComponent(effectiveVersion)}`;

    const html = renderHtml({
      title,
      description,
      image: versionedImage,
      url: versionedUrl,
      redirectTo: canonicalForCrawler,
      author: authorHandle,
      publishedAt: post.created_at,
      section: sectionLabel(post.section_type),
    });

    // Cache: curto + revalidação por ETag. ?v= explícito força bypass total.
    const cacheControl = versionParam
      ? "no-store, no-cache, must-revalidate, max-age=0"
      : "public, max-age=120, s-maxage=120, stale-while-revalidate=60";

    if (debug) {
      return new Response(
        JSON.stringify(
          {
            id,
            url: versionedUrl,
            cacheControl,
            etag,
            effectiveVersion,
            meta: { title, description, image: versionedImage, author: authorHandle, section: sectionLabel(post.section_type) },
            post: {
              has_title: !!post.title,
              has_subtitle: !!post.subtitle,
              has_teaser: !!post.teaser,
              has_thumbnail: !!post.thumbnail_url,
              has_media: !!post.media_url,
              section_type: post.section_type,
              content_format: post.content_format,
              updated_at: post.updated_at,
            },
            html,
          },
          null,
          2,
        ),
        {
          headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
        },
      );
    }

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "content-type": "text/html; charset=utf-8",
        "cache-control": cacheControl,
        "cdn-cache-control": cacheControl,
        pragma: versionParam ? "no-cache" : "cache",
        vary: "User-Agent",
        etag,
        "last-modified": new Date(etagBase).toUTCString(),
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
