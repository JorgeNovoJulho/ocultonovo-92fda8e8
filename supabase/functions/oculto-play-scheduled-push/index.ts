// Edge function: oculto-play-scheduled-push
// Roda via pg_cron a cada minuto. Publica itens agendados vencidos
// (chama RPC oculto_play_publish_due_return) e dispara Web Push ao autor.
//
// Auth: verify_jwt = false. Aceita chamadas server-to-server (cron com apikey).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXTERNAL_URL = "https://rvybbrkzmboqbhcemqar.supabase.co";
const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(EXTERNAL_URL, SERVICE_KEY);

    const { data, error } = await supabase.rpc("oculto_play_publish_due_return");
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      item_id: string;
      author_id: string;
      author_user: string | null;
      title: string | null;
      kind: string;
    }>;

    let pushed = 0;
    for (const r of rows) {
      if (!r.author_user) continue;
      try {
        await supabase.functions.invoke("send-push-notification", {
          body: {
            user_id: r.author_user,
            title: "Sua publicação no PLAY foi ao ar 🎬",
            body: r.title?.trim() || "Seu item agendado acabou de ser publicado.",
            url: "/oculto-play",
            type: "oculto_play_scheduled_published",
            tag: `play-scheduled-${r.item_id}`,
          },
          headers: { Authorization: `Bearer ${SERVICE_KEY}` },
        });
        pushed += 1;
      } catch {
        // best-effort
      }
    }

    return new Response(
      JSON.stringify({ ok: true, published: rows.length, pushed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
