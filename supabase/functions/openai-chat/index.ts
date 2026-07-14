import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * 🔒 Validação de auth obrigatória
 * Retorna { userId } se válido; lança Response 401 caso contrário.
 */
async function requireAuthUser(req: Request): Promise<{ userId: string; isAdmin: boolean }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized: missing token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized: invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check if admin (for test-connection action)
  const admin = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  const isAdmin = (roles ?? []).some((r: { role: string }) =>
    ["admin_master", "admin_regional", "admin_marketing", "moderator"].includes(r.role)
  );

  return { userId: data.user.id, isAdmin };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY não configurada no servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 🔒 Auth obrigatória — bloqueia uso anônimo da API paga
  let auth: { userId: string; isAdmin: boolean };
  try {
    auth = await requireAuthUser(req);
  } catch (resp) {
    if (resp instanceof Response) return resp;
    return new Response(JSON.stringify({ error: "Auth failed" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { messages, model = "gpt-4o", stream = false, action } = body;

    // ── Teste de conexão (apenas admins) ─────────────────────────────────────
    if (action === "test-connection") {
      if (!auth.isAdmin) {
        return new Response(
          JSON.stringify({ error: "Forbidden: admin only" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`[openai-chat] test prefix=${OPENAI_API_KEY.slice(0, 7)} length=${OPENAI_API_KEY.length}`);
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });

      if (res.ok) {
        return new Response(
          JSON.stringify({ success: true, message: "OpenAI API operacional ✅" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        const err = await res.json().catch(() => ({}));
        return new Response(
          JSON.stringify({ success: false, message: err?.error?.message || `HTTP ${res.status}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Validação de payload ─────────────────────────────────────────────────
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Campo 'messages' é obrigatório e deve ser um array." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔒 Limite de tamanho do payload (proteção contra abuso de tokens)
    const totalChars = JSON.stringify(messages).length;
    if (totalChars > 50000) {
      return new Response(
        JSON.stringify({ error: "Payload muito grande. Limite: 50000 caracteres." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedModels = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];
    const safeModel = allowedModels.includes(model) ? model : "gpt-4o";

    // ── Chamada à OpenAI ─────────────────────────────────────────────────────
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: safeModel,
        messages,
        stream,
      }),
    });

    if (!openaiRes.ok) {
      const errData = await openaiRes.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${openaiRes.status}`;

      if (openaiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (openaiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Cota OpenAI esgotada. Verifique seu plano em platform.openai.com." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: openaiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (stream) {
      return new Response(openaiRes.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await openaiRes.json();
    const usage = data?.usage;
    if (usage) {
      console.log(`[openai-chat] user=${auth.userId} model=${safeModel} tokens=${usage.total_tokens}`);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[openai-chat] Erro inesperado:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
