// LGPD Wave 3 — Exportação real em ZIP
// Coleta todos os dados pessoais do usuário, monta um .zip com múltiplos JSONs,
// faz upload no bucket privado 'lgpd-exports' e devolve uma signed URL (7 dias).
// Atualiza public.lgpd_data_requests com signed_url e expires_at.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    // Cliente do usuário para validar identidade
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid token" }, 401);

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // request_id opcional do body
    let requestId: string | null = null;
    try {
      const body = await req.json();
      requestId = body?.request_id ?? null;
    } catch { /* sem body é ok */ }

    // Marca como processing
    if (requestId) {
      await admin.from("lgpd_data_requests")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("user_id", user.id);
    }

    console.log(`[lgpd-export-zip] start user=${user.id} request=${requestId}`);

    // Busca profile
    const { data: profile } = await admin
      .from("profiles").select("*").eq("user_id", user.id).maybeSingle();

    const profileId = profile?.id ?? null;

    // Helpers de coleta tolerantes a tabelas inexistentes
    const safeFetch = async (table: string, query: (q: any) => any) => {
      try {
        const { data, error } = await query(admin.from(table).select("*"));
        if (error) {
          console.warn(`[lgpd-export-zip] skip ${table}:`, error.message);
          return [];
        }
        return data ?? [];
      } catch (e) {
        console.warn(`[lgpd-export-zip] skip ${table}:`, (e as Error).message);
        return [];
      }
    };

    // Coleta paralela por categoria LGPD
    const [
      posts, comments, likes, saved, follows, followers,
      subscriptions, transactions, notifications, conversations,
      storyViews, cookieConsents, lgpdConsents, lgpdRequests,
      kycDocs, paymentMethods, marketplacePurchases, eventRSVPs,
      auctionsBids, supportTickets,
    ] = await Promise.all([
      safeFetch("posts",                     (q) => profileId ? q.eq("author_id", profileId) : q.eq("user_id", user.id)),
      safeFetch("post_comments",             (q) => q.eq("user_id", user.id)),
      safeFetch("post_likes",                (q) => profileId ? q.eq("user_id", profileId) : q.eq("user_id", user.id)),
      safeFetch("saved_posts",               (q) => profileId ? q.eq("user_id", profileId) : q.eq("user_id", user.id)),
      safeFetch("follows",                   (q) => q.eq("follower_id", user.id)),
      safeFetch("follows",                   (q) => q.eq("following_id", user.id)),
      safeFetch("subscriptions",             (q) => profileId ? q.or(`subscriber_id.eq.${profileId},creator_id.eq.${profileId}`) : q.eq("user_id", user.id)),
      safeFetch("transactions",              (q) => q.eq("user_id", user.id)),
      safeFetch("notifications",             (q) => q.eq("user_id", user.id)),
      safeFetch("conversation_participants", (q) => q.eq("user_id", user.id)),
      safeFetch("story_views",               (q) => q.eq("viewer_id", user.id)),
      safeFetch("cookie_consents",           (q) => q.eq("user_id", user.id)),
      safeFetch("lgpd_consents",             (q) => q.eq("user_id", user.id)),
      safeFetch("lgpd_data_requests",        (q) => q.eq("user_id", user.id)),
      safeFetch("couple_verification_docs",  (q) => q.eq("user_id", user.id)),
      safeFetch("payment_methods",           (q) => q.eq("user_id", user.id)),
      safeFetch("marketplace_purchases",     (q) => q.eq("user_id", user.id)),
      safeFetch("event_rsvps",               (q) => q.eq("user_id", user.id)),
      safeFetch("auction_bids",              (q) => q.eq("user_id", user.id)),
      safeFetch("support_tickets",           (q) => q.eq("user_id", user.id)),
    ]);

    const manifest = {
      lgpdCompliance: "Lei nº 13.709/2018 (LGPD) — art. 18, II e V",
      exportedAt: new Date().toISOString(),
      userId: user.id,
      profileId,
      email: user.email,
      retentionPolicy: "Veja arquivo retention_policy.json para a matriz de retenção aplicável.",
      counts: {
        posts: posts.length, comments: comments.length, likes: likes.length, saved: saved.length,
        follows: follows.length, followers: followers.length,
        subscriptions: subscriptions.length, transactions: transactions.length,
        notifications: notifications.length, conversations: conversations.length,
        storyViews: storyViews.length, cookieConsents: cookieConsents.length,
        lgpdConsents: lgpdConsents.length, lgpdRequests: lgpdRequests.length,
        kycDocs: kycDocs.length, paymentMethods: paymentMethods.length,
        marketplacePurchases: marketplacePurchases.length,
        eventRSVPs: eventRSVPs.length, auctionsBids: auctionsBids.length,
        supportTickets: supportTickets.length,
      },
    };

    // Matriz de retenção pública
    const { data: retention } = await admin
      .from("lgpd_retention_policy").select("*")
      .order("classification");

    // Monta o ZIP
    const zip = new JSZip();
    zip.file("MANIFEST.json", JSON.stringify(manifest, null, 2));
    zip.file("README.txt",
      `Exportação de dados LGPD — OCULTO\n` +
      `Data: ${new Date().toISOString()}\n` +
      `Usuário: ${user.email}\n\n` +
      `Este arquivo .zip contém todos os seus dados pessoais armazenados na plataforma,\n` +
      `organizados por categoria conforme exige a Lei nº 13.709/2018 (LGPD).\n` +
      `Consulte MANIFEST.json para o índice e retention_policy.json para a matriz de retenção.\n`,
    );
    zip.file("user.json",                JSON.stringify({ id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at }, null, 2));
    zip.file("profile.json",             JSON.stringify(profile ?? null, null, 2));
    zip.file("retention_policy.json",    JSON.stringify(retention ?? [], null, 2));
    zip.folder("social")!.file("posts.json", JSON.stringify(posts, null, 2));
    zip.folder("social")!.file("comments.json", JSON.stringify(comments, null, 2));
    zip.folder("social")!.file("likes.json", JSON.stringify(likes, null, 2));
    zip.folder("social")!.file("saved.json", JSON.stringify(saved, null, 2));
    zip.folder("social")!.file("follows_outgoing.json", JSON.stringify(follows, null, 2));
    zip.folder("social")!.file("followers_incoming.json", JSON.stringify(followers, null, 2));
    zip.folder("messages")!.file("conversation_participants.json", JSON.stringify(conversations, null, 2));
    zip.folder("messages")!.file("story_views.json", JSON.stringify(storyViews, null, 2));
    zip.folder("financial")!.file("subscriptions.json", JSON.stringify(subscriptions, null, 2));
    zip.folder("financial")!.file("transactions.json", JSON.stringify(transactions, null, 2));
    zip.folder("financial")!.file("payment_methods.json", JSON.stringify(paymentMethods, null, 2));
    zip.folder("financial")!.file("marketplace_purchases.json", JSON.stringify(marketplacePurchases, null, 2));
    zip.folder("events")!.file("rsvps.json", JSON.stringify(eventRSVPs, null, 2));
    zip.folder("events")!.file("auction_bids.json", JSON.stringify(auctionsBids, null, 2));
    zip.folder("compliance")!.file("cookie_consents.json", JSON.stringify(cookieConsents, null, 2));
    zip.folder("compliance")!.file("lgpd_consents.json", JSON.stringify(lgpdConsents, null, 2));
    zip.folder("compliance")!.file("lgpd_requests.json", JSON.stringify(lgpdRequests, null, 2));
    zip.folder("compliance")!.file("kyc_docs.json", JSON.stringify(kycDocs, null, 2));
    zip.folder("notifications")!.file("notifications.json", JSON.stringify(notifications, null, 2));
    zip.folder("support")!.file("tickets.json", JSON.stringify(supportTickets, null, 2));

    const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    // Upload no bucket privado lgpd-exports
    const path = `${user.id}/lgpd_${Date.now()}.zip`;
    const { error: upErr } = await admin.storage.from("lgpd-exports")
      .upload(path, zipBytes, {
        contentType: "application/zip",
        upsert: false,
      });

    if (upErr) {
      console.error("[lgpd-export-zip] upload error", upErr);
      if (requestId) {
        await admin.from("lgpd_data_requests").update({
          status: "failed", error_message: upErr.message,
        }).eq("id", requestId);
      }
      return json({ error: "Falha ao salvar arquivo de exportação" }, 500);
    }

    // Signed URL (7 dias)
    const { data: signed, error: signErr } = await admin.storage
      .from("lgpd-exports")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signErr || !signed) {
      if (requestId) {
        await admin.from("lgpd_data_requests").update({
          status: "failed", error_message: signErr?.message ?? "signed url failed",
        }).eq("id", requestId);
      }
      return json({ error: "Falha ao gerar link assinado" }, 500);
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    if (requestId) {
      await admin.from("lgpd_data_requests").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        signed_url: signed.signedUrl,
        expires_at: expiresAt,
        metadata: { storage_path: path, bytes: zipBytes.length, manifest: manifest.counts },
      }).eq("id", requestId);
    }

    console.log(`[lgpd-export-zip] done user=${user.id} bytes=${zipBytes.length}`);

    return json({
      success: true,
      signedUrl: signed.signedUrl,
      expiresAt,
      bytes: zipBytes.length,
      manifest: manifest.counts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[lgpd-export-zip] fatal", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
