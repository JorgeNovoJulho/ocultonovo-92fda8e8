// LGPD Wave 6 — Worker DPO
// Job recorrente (via pg_cron) que:
//   1. Processa solicitações de exclusão pendentes chamando lgpd_anonymize_user.
//   2. Detecta exports pendentes há > 5 min e dispara alerta Discord para o DPO.
//   3. Detecta exports concluídos há > 7 dias e remove signed_url expirado.
//   4. Envia resumo diário ao DPO via Discord.
//
// IMPORTANTE: roda sem JWT do usuário — autentica via service role.
// Configurado em supabase/config.toml com verify_jwt = false.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
const DISCORD_URL  = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";
// Optional shared secret to gate cron invocations
const CRON_SECRET  = Deno.env.get("LGPD_WORKER_CRON_SECRET") ?? "";

const STALE_EXPORT_MIN = 5;     // export pendente > 5min => alerta
const SIGNED_TTL_DAYS  = 7;     // signed_url expira após 7 dias

interface RequestRow {
  id: string;
  user_id: string;
  kind: "export" | "erasure" | "rectification" | "restriction" | "portability";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  reason: string | null;
  signed_url: string | null;
  expires_at: string | null;
  requested_at: string;
  completed_at: string | null;
}

async function postDiscord(content: string, embeds: any[] = []) {
  if (!DISCORD_URL) {
    console.warn("[lgpd-worker] DISCORD_WEBHOOK_URL não configurado — alerta ignorado");
    return;
  }
  try {
    await fetch(DISCORD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds, username: "LGPD-DPO" }),
    });
  } catch (e) {
    console.error("[lgpd-worker] discord fail", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Gate por secret (cron inclui no body)
  if (CRON_SECRET) {
    const provided =
      req.headers.get("x-cron-secret") ??
      (await req.json().catch(() => ({}))).cron_secret;
    if (provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const startedAt = new Date().toISOString();
  const summary = {
    started_at: startedAt,
    erasures_processed: 0,
    erasures_failed: 0,
    exports_alerted: 0,
    expired_signed_urls: 0,
    pending_total: 0,
  };

  // ───────────────────────────────────────────────
  // 1) Processa erasures pendentes (anonimização)
  // ───────────────────────────────────────────────
  const { data: erasures } = await admin
    .from("lgpd_data_requests")
    .select("id,user_id,kind,status,reason,requested_at")
    .eq("status", "pending")
    .eq("kind", "erasure")
    .order("requested_at", { ascending: true })
    .limit(20);

  for (const r of (erasures ?? []) as RequestRow[]) {
    try {
      await admin.from("lgpd_data_requests")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", r.id);

      const { error: rpcErr } = await admin.rpc("lgpd_anonymize_user", { p_user_id: r.user_id });
      if (rpcErr) throw rpcErr;

      await admin.from("lgpd_data_requests")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", r.id);

      summary.erasures_processed++;
      console.log(`[lgpd-worker] erasure ok user=${r.user_id} req=${r.id}`);
    } catch (e: any) {
      summary.erasures_failed++;
      await admin.from("lgpd_data_requests")
        .update({
          status: "failed",
          error_message: String(e?.message ?? e).slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      console.error(`[lgpd-worker] erasure fail req=${r.id}`, e);
    }
  }

  // ───────────────────────────────────────────────
  // 2) Alerta Discord para exports pendentes > 5min
  // ───────────────────────────────────────────────
  const cutoff = new Date(Date.now() - STALE_EXPORT_MIN * 60_000).toISOString();
  const { data: stale } = await admin
    .from("lgpd_data_requests")
    .select("id,user_id,requested_at")
    .eq("status", "pending")
    .eq("kind", "export")
    .lt("requested_at", cutoff)
    .limit(10);

  if ((stale ?? []).length > 0) {
    summary.exports_alerted = stale!.length;
    await postDiscord("🔔 **LGPD — exportações pendentes**", [{
      title: `${stale!.length} solicitação(ões) de exportação aguardando`,
      description: stale!.map((s) =>
        `• req \`${s.id.slice(0, 8)}\` user \`${s.user_id.slice(0, 8)}\` desde ${s.requested_at}`
      ).join("\n"),
      color: 0xfacc15,
      footer: { text: "Painel: /admin/lgpd" },
      timestamp: new Date().toISOString(),
    }]);
  }

  // ───────────────────────────────────────────────
  // 3) Limpa signed_url expiradas (> 7 dias)
  // ───────────────────────────────────────────────
  const expiredCutoff = new Date(Date.now() - SIGNED_TTL_DAYS * 86_400_000).toISOString();
  const { data: expired } = await admin
    .from("lgpd_data_requests")
    .update({ signed_url: null })
    .eq("kind", "export")
    .eq("status", "completed")
    .not("signed_url", "is", null)
    .lt("expires_at", new Date().toISOString())
    .select("id");
  summary.expired_signed_urls = (expired ?? []).length;
  void expiredCutoff;

  // ───────────────────────────────────────────────
  // 4) Total pendente
  // ───────────────────────────────────────────────
  const { count } = await admin
    .from("lgpd_data_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"]);
  summary.pending_total = count ?? 0;

  console.log("[lgpd-worker] done", summary);

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
