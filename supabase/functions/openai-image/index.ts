// openai-image — Geração de imagens via OpenAI (gpt-image-1).
// NUNCA usa Lovable AI Gateway. Auth obrigatória (bloqueia uso anônimo da API paga).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function requireAuthUser(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized: missing token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const token = authHeader.replace("Bearer ", "");
  const supa = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!,
  );
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized: invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return { userId: data.user.id };
}

const ALLOWED_SIZES = new Set([
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "auto",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY não configurada no servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    await requireAuthUser(req);
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return new Response(JSON.stringify({ error: "Auth failed" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt vazio." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const size = ALLOWED_SIZES.has(body?.size) ? body.size : "1024x1024";
    const quality = ["low", "medium", "high", "auto"].includes(body?.quality)
      ? body.quality
      : "medium";
    const model = body?.model === "dall-e-3" ? "dall-e-3" : "gpt-image-1";

    const payload: Record<string, unknown> = {
      model,
      prompt,
      size,
      n: 1,
    };
    if (model === "gpt-image-1") {
      payload.quality = quality;
    } else {
      // dall-e-3 returns URL by default; we want base64 for canvas use.
      payload.response_format = "b64_json";
    }

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        json?.error?.message ||
        json?.error?.code ||
        `OpenAI HTTP ${res.status}`;
      return new Response(JSON.stringify({ error: message, code: json?.error?.code }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const b64 = json?.data?.[0]?.b64_json;
    const url = json?.data?.[0]?.url;
    if (!b64 && !url) {
      return new Response(JSON.stringify({ error: "Resposta sem imagem." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        dataUrl: b64 ? `data:image/png;base64,${b64}` : undefined,
        url,
        size,
        model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("openai-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
