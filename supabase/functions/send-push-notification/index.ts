// Edge function: send-push-notification
// Envia Web Push (VAPID) para todas as subscriptions de um user.
// Auth: validação manual do JWT (convenção do projeto, verify_jwt=false).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXTERNAL_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;

interface Payload {
  user_id: string;
  sender_id?: string;
  title: string;
  body: string;
  url?: string;
  type?: string;
  tag?: string;
  requireInteraction?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(EXTERNAL_URL, SERVICE_KEY);

    // Aceita chamadas (a) com JWT do user logado, ou (b) com service-role key (server-to-server).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceCall = token === SERVICE_KEY;
    if (!isServiceCall) {
      if (!token) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anon = createClient(EXTERNAL_URL, ANON_KEY);
      const { data, error } = await anon.auth.getUser(token);
      if (error || !data?.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json()) as Partial<Payload>;
    if (!body?.user_id || !body?.title || !body?.body) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega VAPID
    const { data: vapidRows } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["vapid_public_key", "vapid_private_key", "vapid_enabled"]);
    const vapid: Record<string, string> = {};
    (vapidRows || []).forEach((r: { key: string; value: string }) => { vapid[r.key] = r.value; });
    if (vapid["vapid_enabled"] !== "true" || !vapid["vapid_public_key"] || !vapid["vapid_private_key"]) {
      return new Response(JSON.stringify({ error: "vapid_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica se push está habilitado globalmente
    const { data: prs } = await supabase
      .from("platform_runtime_settings")
      .select("pwa_push_enabled")
      .limit(1)
      .maybeSingle();
    if (prs && prs.pwa_push_enabled === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "push_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtra usuário is_seed (não envia para bots)
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_seed")
      .eq("user_id", body.user_id)
      .maybeSingle();
    if (profile?.is_seed) {
      return new Response(JSON.stringify({ ok: true, skipped: "seed_user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nunca envia push de chat quando qualquer lado bloqueou o outro.
    if ((body.type === "new_message" || body.type === "message") && body.sender_id) {
      const { data: pairProfiles } = await supabase
        .from("profiles")
        .select("id, user_id")
        .or(`id.eq.${body.sender_id},user_id.eq.${body.sender_id},id.eq.${body.user_id},user_id.eq.${body.user_id}`);
      const senderProfile = (pairProfiles || []).find((p: { id: string; user_id: string }) => p.id === body.sender_id || p.user_id === body.sender_id);
      const recipientProfile = (pairProfiles || []).find((p: { id: string; user_id: string }) => p.id === body.user_id || p.user_id === body.user_id);
      if (senderProfile?.id && recipientProfile?.id) {
        const { data: blockRows } = await supabase
          .from("blocked_contacts")
          .select("id, user_id, blocked_user_id")
          .eq("block_type", "blocked")
          .in("user_id", [senderProfile.id, recipientProfile.id])
          .in("blocked_user_id", [senderProfile.id, recipientProfile.id])
          .limit(1);
        if (blockRows && blockRows.length > 0) {
          return new Response(JSON.stringify({ ok: true, skipped: "chat_blocked" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", body.user_id);
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // web-push setup
    try {
      const vapidPriv = JSON.parse(vapid["vapid_private_key"]);
      webpush.setVapidDetails(
        "mailto:contato@ocultoswing.com.br",
        vapid["vapid_public_key"],
        vapidPriv.d,
      );
    } catch (e) {
      console.error("[send-push] vapid setup error", e);
      return new Response(JSON.stringify({ error: "vapid_setup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notifPayload = JSON.stringify({
      title: body.title,
      body: body.body,
      url: body.url || "/",
      type: body.type || "default",
      tag: body.tag,
      requireInteraction: !!body.requireInteraction,
    });

    let sent = 0;
    const toDelete: string[] = [];
    await Promise.all(
      subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            notifPayload,
          );
          sent++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) toDelete.push(s.id);
        }
      }),
    );

    if (toDelete.length) {
      await supabase.from("push_subscriptions").delete().in("id", toDelete);
    }

    return new Response(JSON.stringify({ ok: true, sent, removed: toDelete.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[send-push]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
