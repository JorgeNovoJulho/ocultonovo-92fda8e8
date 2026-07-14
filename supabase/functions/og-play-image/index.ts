// og-play-image — proxy público da capa do OCULTO PLAY para Open Graph.
// Evita que crawlers ignorem imagens do Storage por causa de headers como x-robots-tag.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const APP_BASE = "https://ocultoswing.com.br";
const EXTERNAL_SUPABASE_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc";

const DEFAULT_IMAGE = `${APP_BASE}/og-image.jpg`;

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
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${APP_BASE}${value}`;
  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${value.replace(/^\/+/, "")}`;
}

function asOptimizedImage(url: string): string {
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
      u.searchParams.set("quality", "78");
      u.searchParams.set("format", "origin");
      return u.toString();
    }
  } catch {
    return url;
  }
  return url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const id = cleanItemId(url.searchParams.get("id"));
    if (!id) {
      return new Response("Missing or invalid id", { status: 400, headers: corsHeaders });
    }

    const supa = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: rows, error } = await supa.rpc("oculto_play_public_preview", { p_item_id: id });
    if (error) throw error;

    const item = Array.isArray(rows) ? rows[0] : null;
    const imageUrl = absolutize(item?.thumb_url) || absolutize(item?.author_avatar_url) || DEFAULT_IMAGE;
    const optimizedUrl = asOptimizedImage(imageUrl);

    const imageResponse = await fetch(optimizedUrl, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent": "OCULTO-PLAY-OG-IMAGE/1.0",
      },
    });

    if (!imageResponse.ok || !imageResponse.body) {
      return Response.redirect(DEFAULT_IMAGE, 302);
    }

    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    const cacheControl = url.searchParams.has("v")
      ? "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
      : "public, max-age=300, s-maxage=300, stale-while-revalidate=3600";

    return new Response(imageResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": contentType,
        "cache-control": cacheControl,
        "cdn-cache-control": cacheControl,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});