import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) throw new Error("Sessão inválida");

    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user?.id) throw new Error("Usuário não autenticado");

    const body = await req.json();
    const conversationId = String(body.conversation_id || "");
    const reportedProfileId = String(body.reported_profile_id || "");
    const reason = String(body.reason || "").trim();
    const evidenceUrls = Array.isArray(body.evidence_urls) ? body.evidence_urls.slice(0, 6) : [];
    if (!conversationId || !reportedProfileId || !reason) throw new Error("Dados da denúncia incompletos");

    const { data: participant } = await admin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!participant) throw new Error("Você não participa desta conversa");

    const [{ data: reported }, { data: messages }] = await Promise.all([
      admin.from("profiles").select("id, user_id, name, username, warning_count").eq("id", reportedProfileId).maybeSingle(),
      admin.from("messages").select("id, sender_id, content, media_url, media_type, created_at, deleted_for_everyone").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(1000),
    ]);
    if (!reported?.id || !reported?.user_id) throw new Error("Usuário denunciado não encontrado");

    const frozenUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const conversationCopy = messages || [];
    const description = [
      `Denúncia enviada pelo chat contra ${reported.username ? `@${reported.username}` : reported.name || reported.user_id}.`,
      `Motivo: ${reason}`,
      `Conversa copiada integralmente (${conversationCopy.length} mensagens):`,
      JSON.stringify(conversationCopy, null, 2),
    ].join("\n\n");

    const { data: report, error: reportError } = await admin.from("content_reports").insert({
      category: "harassment",
      reporter_id: userData.user.id,
      reported_user_id: reported.id,
      description,
      evidence_urls: evidenceUrls,
      priority_level: "high",
      status: "pending",
    }).select("id").single();
    if (reportError) throw reportError;

    const { error: freezeError } = await admin.from("profiles").update({
      account_status: "frozen",
      frozen_until: frozenUntil,
      warning_count: (reported.warning_count || 0) + 1,
    }).eq("id", reported.id);
    if (freezeError) throw freezeError;

    await Promise.all([
      admin.from("discipline_history").insert({
        profile_id: reported.id,
        action_type: "freeze",
        admin_id: userData.user.id,
        reason: `Congelamento automático por denúncia no chat: ${reason}`,
        details: { automatic: true, report_id: report.id, days: 7, frozen_until: frozenUntil, conversation_id: conversationId },
      }),
      admin.from("notifications").insert({
        user_id: reported.user_id,
        type: "account_frozen",
        title: "Conta congelada por 7 dias",
        body: "Sua conta está congelada por ter sido denunciada por outros usuários. O caso está sob investigação da moderação.",
        data: { notification_type: "account_frozen", report_id: report.id, frozen_until: frozenUntil, conversation_id: conversationId },
      }),
      admin.from("admin_notifications").insert({
        type: "chat_report",
        title: "Nova denúncia de chat",
        body: `${reported.username ? `@${reported.username}` : reported.name || "Usuário"} foi congelado automaticamente por 7 dias.`,
        data: { report_id: report.id, conversation_id: conversationId, reported_profile_id: reported.id, reporter_id: userData.user.id, evidence_urls: evidenceUrls },
      }),
    ]);

    return new Response(JSON.stringify({ success: true, report_id: report.id, frozen_until: frozenUntil }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar denúncia";
    return new Response(JSON.stringify({ success: false, error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
