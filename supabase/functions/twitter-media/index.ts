import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function tokenForTweet(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const id = new URL(req.url).searchParams.get("id")?.trim() || "";
    if (!/^\d{5,25}$/.test(id)) {
      return new Response(JSON.stringify({ error: "invalid_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endpoint = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${tokenForTweet(id)}&lang=pt`;
    const upstream = await fetch(endpoint, {
      headers: {
        "Accept": "application/json,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 OCULTO Twitter Media Proxy",
      },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: "tweet_unavailable" }), {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=900",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "proxy_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});