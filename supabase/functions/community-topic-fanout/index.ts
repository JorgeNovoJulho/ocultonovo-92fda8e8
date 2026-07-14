// Edge function: community-topic-fanout
// Faz fan-out de push para todos os membros ativos de uma comunidade quando
// um novo tópico é publicado. Substitui o loop de triggerPush no cliente,
// reduzindo bottleneck em comunidades grandes.
// Auth: verify_jwt=false + validação manual (convenção do projeto).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXTERNAL_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;

interface Payload {
  community_id: string;
  topic_id: string;
}

// Limites de segurança — comunidades muito grandes não vão estourar runtime
const MAX_RECIPIENTS = 2000;
const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validação manual do JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(EXTERNAL_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const actorId = userData.user.id;

    const body = (await req.json()) as Payload;
    if (!body?.community_id || !body?.topic_id) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(EXTERNAL_URL, SERVICE_KEY);

    // Confirma autoria do tópico (somente o autor dispara fan-out)
    const { data: topic } = await svc
      .from("oculto_community_topics")
      .select("id, author_id, community_id, status, oculto_communities(slug,title)")
      .eq("id", body.topic_id)
      .maybeSingle();

    if (!topic || topic.community_id !== body.community_id) {
      return new Response(JSON.stringify({ error: "topic_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (topic.author_id !== actorId) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (topic.status !== "published") {
      return new Response(JSON.stringify({ ok: true, skipped: "not_published" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const community = (topic as any).oculto_communities ?? {};
    const slug = community.slug;
    const title = community.title ?? "comunidade";
    const url = slug ? `/comunidades/${slug}/topico/${body.topic_id}` : "/comunidades";

    // Busca membros ativos (exclui o autor) — cap MAX_RECIPIENTS
    const { data: members } = await svc
      .from("oculto_community_members")
      .select("user_id")
      .eq("community_id", body.community_id)
      .eq("status", "active")
      .neq("user_id", actorId)
      .limit(MAX_RECIPIENTS);

    const recipients = (members ?? []).map((m: any) => m.user_id as string);

    // Dispara push em lotes paralelos via send-push-notification (best-effort)
    let dispatched = 0;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const calls = batch.map((uid) =>
        fetch(`${EXTERNAL_URL}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            user_id: uid,
            title: `Novo tópico em ${title}`,
            body: "",
            url,
            type: "community_topic",
            tag: `community_topic_${body.topic_id}`,
          }),
        }).catch(() => null)
      );
      await Promise.allSettled(calls);
      dispatched += batch.length;
    }

    return new Response(
      JSON.stringify({ ok: true, dispatched, total: recipients.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
