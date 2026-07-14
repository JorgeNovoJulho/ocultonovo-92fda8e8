import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheckResult {
  name: string;
  status: "healthy" | "degraded" | "critical";
  response_time_ms: number;
  error_message?: string;
  details?: Record<string, unknown>;
}

interface WebhookPayload {
  type: "discord" | "slack" | "telegram";
  url: string;
  title: string;
  description: string;
  checks: HealthCheckResult[];
  timestamp: string;
}

// Format webhook for Discord
function formatDiscordWebhook(payload: WebhookPayload): object {
  const failedChecks = payload.checks.filter(c => c.status !== "healthy");
  const fields = payload.checks.map(check => ({
    name: `📍 ${check.name}`,
    value: check.status === "healthy" 
      ? `✅ OK (${check.response_time_ms}ms)` 
      : `❌ ${check.status.toUpperCase()} - ${check.error_message || "Falha"}`,
    inline: true,
  }));

  return {
    embeds: [{
      title: payload.title,
      description: payload.description,
      color: failedChecks.length > 0 ? 16711680 : 65280, // Red or Green
      fields,
      footer: { text: "Checkout Sentinel - Oculto" },
      timestamp: payload.timestamp,
    }],
  };
}

// Format webhook for Slack
function formatSlackWebhook(payload: WebhookPayload): object {
  const blocks = payload.checks.map(check => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: check.status === "healthy"
        ? `✅ *${check.name}*: OK (${check.response_time_ms}ms)`
        : `❌ *${check.name}*: ${check.status.toUpperCase()} - ${check.error_message || "Falha"}`,
    },
  }));

  return {
    text: payload.title,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: payload.title },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: payload.description },
      },
      ...blocks,
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `⏰ ${payload.timestamp} | Checkout Sentinel`,
        }],
      },
    ],
  };
}

// Format webhook for Telegram
function formatTelegramWebhook(payload: WebhookPayload): object {
  const checksText = payload.checks.map(check => 
    check.status === "healthy"
      ? `✅ ${check.name}: OK (${check.response_time_ms}ms)`
      : `❌ ${check.name}: ${check.status.toUpperCase()} - ${check.error_message || "Falha"}`
  ).join("\n");

  return {
    text: `${payload.title}\n\n${payload.description}\n\n${checksText}\n\n⏰ ${payload.timestamp}`,
    parse_mode: "HTML",
  };
}

// Send webhook notification
async function sendWebhookAlert(
  webhookUrl: string,
  webhookType: string,
  checks: HealthCheckResult[]
): Promise<boolean> {
  if (!webhookUrl || webhookUrl === "null") {
    console.log("No webhook URL configured, skipping alert");
    return false;
  }

  const failedChecks = checks.filter(c => c.status !== "healthy");
  const isCritical = failedChecks.some(c => c.status === "critical");

  const payload: WebhookPayload = {
    type: webhookType as "discord" | "slack" | "telegram",
    url: webhookUrl,
    title: isCritical ? "🚨 CRITICAL ALERT: CHECKOUT DOWN" : "⚠️ DEGRADED: Checkout com problemas",
    description: `O sistema de checkout ${isCritical ? "falhou" : "apresentou problemas"} na verificação automática.`,
    checks,
    timestamp: new Date().toISOString(),
  };

  let body: object;
  switch (webhookType) {
    case "slack":
      body = formatSlackWebhook(payload);
      break;
    case "telegram":
      body = formatTelegramWebhook(payload);
      break;
    default:
      body = formatDiscordWebhook(payload);
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("Webhook failed:", await response.text());
      return false;
    }

    console.log("Webhook sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending webhook:", error);
    return false;
  }
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("🛡️ Checkout Sentinel starting health checks...");

  const results: HealthCheckResult[] = [];
  const siteUrl = Deno.env.get('APP_URL') || "https://ocultoswing.com.br";

  // =====================================================
  // CHECK 1: Homepage Availability
  // =====================================================
  const homepageStart = Date.now();
  try {
    const response = await fetch(siteUrl, { method: "HEAD" });
    results.push({
      name: "Homepage",
      status: response.ok ? "healthy" : "critical",
      response_time_ms: Date.now() - homepageStart,
      error_message: response.ok ? undefined : `HTTP ${response.status}`,
    });
  } catch (error) {
    results.push({
      name: "Homepage",
      status: "critical",
      response_time_ms: Date.now() - homepageStart,
      error_message: error instanceof Error ? error.message : "Connection failed",
    });
  }

  // =====================================================
  // CHECK 2: Database Connection
  // =====================================================
  const dbStart = Date.now();
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    results.push({
      name: "Database",
      status: error ? "critical" : "healthy",
      response_time_ms: Date.now() - dbStart,
      error_message: error?.message,
    });
  } catch (error) {
    results.push({
      name: "Database",
      status: "critical",
      response_time_ms: Date.now() - dbStart,
      error_message: error instanceof Error ? error.message : "Database error",
    });
  }

  // =====================================================
  // CHECK 3: PIX Gateway
  // =====================================================
  const pixStart = Date.now();
  try {
    const { data: pixConfig, error: pixError } = await supabase
      .from("pix_gateway_config")
      .select("is_active, gateway_provider")
      .maybeSingle();

    if (pixError) {
      results.push({
        name: "PIX Gateway",
        status: "critical",
        response_time_ms: Date.now() - pixStart,
        error_message: pixError.message,
      });
    } else if (!pixConfig) {
      results.push({
        name: "PIX Gateway",
        status: "degraded",
        response_time_ms: Date.now() - pixStart,
        error_message: "Configuração PIX ainda não criada",
      });
    } else if (!pixConfig?.is_active) {
      results.push({
        name: "PIX Gateway",
        status: "degraded",
        response_time_ms: Date.now() - pixStart,
        error_message: "Gateway PIX está desativado",
        details: { provider: pixConfig?.gateway_provider },
      });
    } else {
      results.push({
        name: "PIX Gateway",
        status: "healthy",
        response_time_ms: Date.now() - pixStart,
        details: { provider: pixConfig?.gateway_provider, active: true },
      });
    }
  } catch (error) {
    results.push({
      name: "PIX Gateway",
      status: "critical",
      response_time_ms: Date.now() - pixStart,
      error_message: error instanceof Error ? error.message : "PIX check failed",
    });
  }

  // =====================================================
  // CHECK 4: ASAAS Gateway (cartão + PIX)
  // =====================================================
  const asaasStart = Date.now();
  try {
    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasKey) {
      results.push({
        name: "ASAAS Gateway",
        status: "degraded",
        response_time_ms: Date.now() - asaasStart,
        error_message: "ASAAS_API_KEY não configurada",
      });
    } else {
      let isSandbox = Deno.env.get("ASAAS_SANDBOX") === "true";
      try {
        const { data: cfg } = await supabase
          .from("pix_gateway_config")
          .select("sandbox_mode")
          .eq("gateway_provider", "asaas")
          .maybeSingle();
        if (cfg && typeof cfg.sandbox_mode === "boolean") isSandbox = cfg.sandbox_mode;
      } catch (_) {}
      const baseUrl = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";
      const r = await fetch(`${baseUrl}/myAccount`, { headers: { access_token: asaasKey } });
      results.push({
        name: "ASAAS Gateway",
        status: r.ok ? "healthy" : "degraded",
        response_time_ms: Date.now() - asaasStart,
        error_message: r.ok ? undefined : `HTTP ${r.status}`,
      });
    }
  } catch (error) {
    results.push({
      name: "ASAAS Gateway",
      status: "degraded",
      response_time_ms: Date.now() - asaasStart,
      error_message: error instanceof Error ? error.message : "ASAAS check failed",
    });
  }

  // =====================================================
  // CHECK 5: Subscription Plans
  // =====================================================
  const plansStart = Date.now();
  try {
    const { data: plans, error: plansError } = await supabase
      .from("subscription_plans")
      .select("id, name, is_active")
      .eq("is_active", true);

    if (plansError) {
      results.push({
        name: "Planos de Assinatura",
        status: "critical",
        response_time_ms: Date.now() - plansStart,
        error_message: plansError.message,
      });
    } else if (!plans || plans.length === 0) {
      results.push({
        name: "Planos de Assinatura",
        status: "critical",
        response_time_ms: Date.now() - plansStart,
        error_message: "Nenhum plano ativo encontrado",
      });
    } else {
      results.push({
        name: "Planos de Assinatura",
        status: "healthy",
        response_time_ms: Date.now() - plansStart,
        details: { active_plans: plans.length },
      });
    }
  } catch (error) {
    results.push({
      name: "Planos de Assinatura",
      status: "critical",
      response_time_ms: Date.now() - plansStart,
      error_message: error instanceof Error ? error.message : "Plans check failed",
    });
  }

  // =====================================================
  // SAVE RESULTS TO DATABASE
  // =====================================================
  console.log("📊 Saving health check results...");
  
  for (const result of results) {
    await supabase.from("checkout_health_logs").insert({
      check_name: result.name,
      status: result.status,
      response_time_ms: result.response_time_ms,
      error_message: result.error_message || null,
      details: result.details || {},
    });
  }

  // Update last run timestamp
  await supabase
    .from("system_settings")
    .update({ value: `"${new Date().toISOString()}"` })
    .eq("key", "sentinel_last_run");

  // =====================================================
  // CHECK FOR FAILURES AND SEND ALERTS
  // =====================================================
  const failedChecks = results.filter(r => r.status !== "healthy");
  const hasCritical = failedChecks.some(r => r.status === "critical");

  if (failedChecks.length > 0) {
    console.log(`⚠️ ${failedChecks.length} checks failed, sending alerts...`);

    // Get webhook configuration
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["alert_webhook_url", "alert_webhook_type", "alert_email_enabled"]);

    const settingsMap = Object.fromEntries(
      (settings || []).map((s: { key: string; value: string }) => [s.key, s.value?.replace(/"/g, "")])
    );

    // Send webhook alert
    if (settingsMap.alert_webhook_url && settingsMap.alert_webhook_url !== "null") {
      await sendWebhookAlert(
        settingsMap.alert_webhook_url,
        settingsMap.alert_webhook_type || "discord",
        results
      );
    }

    // Create admin notification
    await supabase.from("admin_notifications").insert({
      type: hasCritical ? "checkout_critical" : "checkout_degraded",
      title: hasCritical ? "🚨 CHECKOUT CRÍTICO" : "⚠️ Checkout Degradado",
      body: `${failedChecks.length} verificações falharam: ${failedChecks.map(c => c.name).join(", ")}`,
      data: { checks: results, failed_count: failedChecks.length },
    });

    // Create incident if critical
    if (hasCritical) {
      await supabase.from("checkout_incidents").insert({
        severity: "critical",
        title: "Checkout indisponível - verificações críticas falharam",
        description: failedChecks.map(c => `${c.name}: ${c.error_message}`).join("\n"),
        affected_checks: failedChecks.map(c => c.name),
      });
    }
  }

  // =====================================================
  // RETURN RESPONSE
  // =====================================================
  const overallStatus = hasCritical ? "critical" : (failedChecks.length > 0 ? "degraded" : "healthy");

  console.log(`✅ Checkout Sentinel completed. Status: ${overallStatus}`);

  return new Response(
    JSON.stringify({
      success: true,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
      failed_count: failedChecks.length,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
