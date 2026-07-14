// Edge function de fallback para validação de rate-limit fora do banco.
// Útil para hot paths críticos (chat, matches) ou chamadas server-to-server
// que não passam pelo cliente. Usa o EXTERNAL Supabase via service role.
//
// POST /rate-limit-check
// body: { feature: string, user_id?: string }
// resp: { allowed: boolean, remaining?: number, reset_at?: string, limit?: number, plan?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXTERNAL_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ?? "";

const ALLOWED_FEATURES = new Set([
  "feed_view",
  "chat_msg",
  "match",
  "profile_view",
  "story_view",
  "like",
  "comment",
  "super_dm",
]);

// Cache em memória (por isolate) para reduzir round-trips ao DB.
// TTL curto: só evita rajadas dentro do mesmo segundo.
type CacheEntry = { value: any; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1500;

function cacheGet(key: string) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return null;
  }
  return e.value;
}
function cacheSet(key: string, value: any) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  // Cap de tamanho simples
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valida o JWT do usuário usando o anon key
    const userClient = createClient(EXTERNAL_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const feature = String(body?.feature ?? "");
    if (!ALLOWED_FEATURES.has(feature)) {
      return new Response(
        JSON.stringify({ error: "Invalid feature" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Cache hit?
    const cacheKey = `${userId}:${feature}`;
    const cached = cacheGet(cacheKey);
    if (cached && cached.allowed === false) {
      // Quando bloqueado, devolve cache (evita martelar o DB durante rajadas)
      return new Response(JSON.stringify({ ...cached, cached: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Usa service role para chamar o RPC de increment de forma autoritativa
    const adminClient = createClient(EXTERNAL_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: rl, error: rlErr } = await adminClient.rpc(
      "check_and_increment_usage",
      { _feature: feature, _user_id: userId }
    );

    if (rlErr) {
      // Fail-open por padrão (não bloqueia em caso de erro de infra)
      console.error("[rate-limit-check] RPC error", rlErr);
      return new Response(
        JSON.stringify({ allowed: true, error: rlErr.message, fallback: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    cacheSet(cacheKey, rl);

    return new Response(JSON.stringify(rl ?? { allowed: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[rate-limit-check] Unhandled", e);
    return new Response(
      JSON.stringify({ allowed: true, error: String(e), fallback: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
