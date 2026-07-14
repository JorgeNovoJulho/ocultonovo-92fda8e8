import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Fire-and-forget Discord critical alert ─────────────────────────────────
async function sendDiscordCriticalAlert(webhookUrl: string, errorMsg: string) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "🚨 CRITICAL: Email Gateway Down",
          description: `A verificação da API do Resend falhou.\n\n**Erro:** ${errorMsg}`,
          color: 0xff0000,
          fields: [
            { name: "🔴 Status", value: "OFFLINE / FALHOU", inline: true },
            { name: "⏱️ Timestamp", value: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), inline: true },
          ],
          footer: { text: "OCULTO — Sistema de Monitoramento de Email" },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (_) {
    // fire-and-forget; don't fail if Discord is also down
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 🔒 Admin-only OR cron (service_role)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const isServiceCall = token === supabaseServiceKey;
    if (!isServiceCall) {
      if (!token) return respond({ error: 'Unauthorized' }, 401);
      const anonClient = createClient(supabaseUrl, Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!);
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userData?.user) return respond({ error: 'Unauthorized' }, 401);
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', userData.user.id);
      const isAdmin = (roles ?? []).some((r: { role: string }) =>
        ['admin_master', 'admin_regional'].includes(r.role)
      );
      if (!isAdmin) return respond({ error: 'Forbidden: admin only' }, 403);
    }

    const requestBody = await req.json().catch(() => ({}));
    const action = requestBody?.action || "connection";

    const persistHealth = async (status: "OK" | "FAIL", statusCode: number, message: string) => {
      await supabase
        .from("resend_config")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: status,
          last_test_status_code: statusCode,
          last_test_message: message.slice(0, 4000),
        })
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .then(({ error }) => {
          if (error) console.log("[Resend Test] Health persistence skipped:", error.message);
        });
    };

    // Fetch Resend config from DB
    const { data: resendConfig, error: configError } = await supabase
      .from("resend_config")
      .select("*")
      .maybeSingle();

    // Also fetch Discord webhook URL for critical alerts
    const { data: pixConfig } = await supabase
      .from("pix_gateway_config")
      .select("discord_webhook_url")
      .maybeSingle() as any;
    const discordUrl = pixConfig?.discord_webhook_url || Deno.env.get("DISCORD_WEBHOOK_URL");

    if (configError || !resendConfig) {
      const errMsg = "Configuração Resend não encontrada no banco de dados.";
      if (discordUrl) sendDiscordCriticalAlert(discordUrl, errMsg);
      await persistHealth("FAIL", 400, errMsg);
      return respond({ success: false, error: errMsg, needs_sql: Boolean(configError) }, 400);
    }

    const apiKey = resendConfig.api_key_encrypted;

    if (!apiKey || apiKey === "" || apiKey === "re_placeholder_configure_in_admin") {
      const errMsg = "API Key do Resend não configurada.";
      if (discordUrl) sendDiscordCriticalAlert(discordUrl, errMsg);
      await persistHealth("FAIL", 400, errMsg);
      return respond({ success: false, error: errMsg }, 400);
    }

    if (action === "send_test_email") {
      const testEmail = String(requestBody?.to || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
        const errMsg = "Email de destino inválido para envio de teste.";
        await persistHealth("FAIL", 400, errMsg);
        return respond({ success: false, error: errMsg }, 400);
      }

      const resend = new Resend(apiKey);
      const emailResult = await resend.emails.send({
        from: `${resendConfig.from_name || "Oculto Swing"} <${resendConfig.from_email || "noreply@ocultoswing.com.br"}>`,
        to: [testEmail],
        subject: "[Oculto Swing] Teste de entrega Resend",
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Teste de email entregue</h2><p>Este email confirma que o gateway Resend está enviando corretamente.</p><p><strong>Data/hora:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></div>`,
      }) as any;

      if (emailResult?.error) {
        const errMsg = emailResult.error.message || JSON.stringify(emailResult.error);
        await persistHealth("FAIL", 400, errMsg);
        return respond({ success: false, error: errMsg, resend_response: emailResult }, 400);
      }

      const okMsg = `Email de teste enviado para ${testEmail}`;
      await persistHealth("OK", 200, okMsg);
      return respond({ success: true, message: okMsg, email_id: emailResult?.data?.id || emailResult?.id || null, resend_response: emailResult });
    }

    // Test the API key by calling Resend's /domains endpoint (lightweight ping)
    const testResponse = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const testData = await testResponse.json();

    if (!testResponse.ok) {
      const errMsg = testData?.message || testData?.name || "Chave inválida";
      console.error("❌ Resend API test failed:", testData);
      if (discordUrl) sendDiscordCriticalAlert(discordUrl, errMsg);
      await persistHealth("FAIL", testResponse.status, `Resend retornou erro: ${errMsg}`);
      return respond({ success: false, error: `Resend retornou erro: ${errMsg}` }, 400);
    }

    // Verify domain status from response
    const domains: any[] = testData?.data || [];
    const fromEmailDomain = (resendConfig.from_email || "").split("@")[1];
    const matchedDomain = domains.find((d: any) =>
      d.name === fromEmailDomain || d.name?.endsWith(`.${fromEmailDomain}`)
    );
    const domainVerified = matchedDomain?.status === "verified";
    const domainStatus = matchedDomain ? matchedDomain.status : "not_found";

    // Build DNS records hint if domain not verified
    let dnsRecords = null;
    if (matchedDomain && matchedDomain.status !== "verified") {
      dnsRecords = matchedDomain.records || null;
    }

    // Send success status to Discord
    if (discordUrl) {
      fetch(discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "✅ PIX Gateway & Email: OK",
            description: `Verificação da API do Resend concluída com sucesso.\n**Domínio:** \`${fromEmailDomain || "não configurado"}\` — Status: **${domainVerified ? "✅ Verificado" : "⚠️ " + domainStatus}**`,
            color: domainVerified ? 0x22c55e : 0xf59e0b,
            footer: { text: "OCULTO — Central de Inteligência Admin" },
            timestamp: new Date().toISOString(),
          }],
        }),
      }).catch(() => null);
    }

    console.log("✅ Resend connection test successful. Domain:", fromEmailDomain, "verified:", domainVerified);
    await persistHealth("OK", 200, "Conexão com Resend verificada com sucesso!");

    return respond({
      success: true,
      message: "Conexão com Resend verificada com sucesso!",
      sandbox: resendConfig.sandbox_mode,
      from_email: resendConfig.from_email,
      domain_verified: domainVerified,
      domain_status: domainStatus,
      domain_name: fromEmailDomain,
      dns_records: dnsRecords,
      domains_count: domains.length,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Error in test-resend-connection:", error);
    return respond({ success: false, error: errorMessage }, 500);
  }
});

