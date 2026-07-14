// og-canal — SSR HTML com Open Graph para previews (WhatsApp/Telegram/X/Facebook)
// do CANAL VIP de um criador.
//
// Recebe ?id=<creator user_id OU profile id> e opcionalmente ?ref=<código afiliado>
// para preservar o tracking ao redirecionar para /canal/<id>?ref=<...>.
//
// Crawlers leem as meta-tags; humanos são redirecionados via meta-refresh + JS.
//
// IMPORTANTE: SEMPRE consulta o Supabase EXTERNO (rvybbrkzmboqbhcemqar) —
// fonte única de verdade do projeto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const APP_BASE = "https://ocultoswing.com.br";
const EXTERNAL_SUPABASE_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc";

const DEFAULT_TITLE = "Canal VIP exclusivo no OCULTO";
const DEFAULT_DESCRIPTION =
  "Conteúdo +18 e bastidores exclusivos do criador. Toque para assinar e desbloquear.";
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
  return String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pickFirst<T>(...vals: (T | null | undefined | "")[]): T | null {
  for (const v of vals) if (v) return v as T;
  return null;
}

function renderHtml(opts: {
  title: string;
  description: string;
  image: string;
  url: string;
  redirectTo: string;
  author?: string | null;
}) {
  const { title, description, image, url, redirectTo, author } = opts;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(redirectTo)}" />
<meta property="og:type" content="profile" />
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
${author ? `<meta property="profile:username" content="${escapeHtml(author)}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectTo)}" />
<script>window.location.replace(${JSON.stringify(redirectTo)});</script>
</head>
<body style="font-family:system-ui;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<a href="${escapeHtml(redirectTo)}" style="color:#d4a84c">Abrir canal no OCULTO →</a>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const ref = url.searchParams.get("ref") || "";
    const versionParam = url.searchParams.get("v") || "";
    const debug = url.searchParams.get("debug") === "1";

    if (!id) {
      return new Response("Missing id", { status: 400, headers: corsHeaders });
    }

    const supa = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    // Redirect humano sempre preserva o ?ref
    const refQs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const redirectTo = `${APP_BASE}/canal/${encodeURIComponent(id)}${refQs}`;

    // ===== Profile do criador (busca por id OU user_id) =====
    const { data: profile } = await supa
      .from("profiles")
      .select("id, user_id, username, display_name, avatar_url, cover_url, bio")
      .or(`id.eq.${id},user_id.eq.${id}`)
      .limit(1)
      .maybeSingle();

    if (!profile) {
      const html = renderHtml({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        image: DEFAULT_IMAGE,
        url: redirectTo,
        redirectTo,
      });
      return new Response(debug ? JSON.stringify({ status: "not-found", html }, null, 2) : html, {
        headers: {
          ...corsHeaders,
          "content-type": debug ? "application/json" : "text/html; charset=utf-8",
          "cache-control": "public, max-age=60, s-maxage=60",
        },
      });
    }

    // ===== Plano de assinatura ativo (capa/título/descrição do canal) =====
    let plan: any = null;
    try {
      const { data: plans } = await supa
        .from("subscription_plans")
        .select("id, title, description, banner_url, intro_image_url, monthly_price, updated_at, is_active")
        .eq("creator_id", profile.id)
        .order("updated_at", { ascending: false })
        .limit(5);
      plan = (plans || []).find((p: any) => p.is_active !== false) || (plans || [])[0] || null;
    } catch { /* noop */ }

    // ===== Nome do canal =====
    const handle = profile.username ? `@${profile.username}` : profile.display_name || "Criador";
    const channelName = pickFirst<string>(
      plan?.title?.trim(),
      profile.display_name,
      profile.username ? `@${profile.username}` : null,
    ) || "Canal VIP";

    const title = `${channelName} — Canal VIP · OCULTO`;

    // ===== Teaser/descrição =====
    const rawDesc = pickFirst<string>(
      stripHtml(plan?.description),
      stripHtml(profile.bio),
      `Acesse o canal VIP de ${handle} no OCULTO: conteúdo exclusivo +18, bastidores e mais.`,
    ) || DEFAULT_DESCRIPTION;
    const description = rawDesc.length > 200 ? `${rawDesc.slice(0, 197)}…` : rawDesc;

    // ===== Capa (cascata) =====
    const image = pickFirst<string>(
      absolutize(plan?.banner_url),
      absolutize(plan?.intro_image_url),
      absolutize(profile.cover_url),
      absolutize(profile.avatar_url),
      DEFAULT_IMAGE,
    ) || DEFAULT_IMAGE;

    // Cache-busting: muda quando o plano é editado
    const naturalVersion = String(new Date(plan?.updated_at || Date.now()).getTime() || Date.now());
    const effectiveVersion = versionParam || naturalVersion;
    const versionedImage = withVersion(image, effectiveVersion) || image;
    const versionedUrl = `${redirectTo}${refQs ? "&" : "?"}v=${encodeURIComponent(effectiveVersion)}`;

    const html = renderHtml({
      title,
      description,
      image: versionedImage,
      url: versionedUrl,
      redirectTo,
      author: profile.username || null,
    });

    const cacheControl = versionParam
      ? "no-store, no-cache, must-revalidate, max-age=0"
      : "public, max-age=180, s-maxage=180, stale-while-revalidate=120";

    if (debug) {
      return new Response(
        JSON.stringify({
          id, ref, redirectTo, versionedUrl, effectiveVersion,
          meta: { title, description, image: versionedImage },
          profile: { id: profile.id, user_id: profile.user_id, username: profile.username, has_cover: !!profile.cover_url, has_avatar: !!profile.avatar_url },
          plan: plan ? { id: plan.id, has_banner: !!plan.banner_url, has_intro_image: !!plan.intro_image_url, title: plan.title, updated_at: plan.updated_at } : null,
        }, null, 2),
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
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
