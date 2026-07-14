// release-pending-balances
// Cron-friendly. Libera saldos pendentes vencidos (D+7) via RPC release_due_balances().
// Pode ser chamada por cron (pg_cron + pg_net) ou manualmente pelo Admin Master.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const URL_ = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const SERVICE = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    if (!URL_ || !SERVICE) return json({ success: false, error: "missing_env" }, 500);

    const admin = createClient(URL_, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Body opcional: { creator_id?: uuid }
    let creatorId: string | null = null;
    if (req.method === "POST") {
      try {
        const b = await req.json();
        if (b?.creator_id) creatorId = String(b.creator_id);
      } catch (_) { /* sem body é ok */ }
    }

    const { data, error } = await admin.rpc("release_due_balances", {
      p_creator_id: creatorId,
      p_forced: false,
      p_actor_id: null,
    });

    if (error) {
      console.error("[release-pending-balances] rpc error:", error.message);
      return json({ success: false, error: error.message }, 500);
    }

    return json({ success: true, result: data });
  } catch (e) {
    console.error("[release-pending-balances] unhandled:", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
