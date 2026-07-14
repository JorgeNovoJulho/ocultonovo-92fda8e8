// Edge function: send-test-email
// Deploy no Supabase EXTERNO (rvybbrkzmboqbhcemqar) com "Enforce JWT verification = OFF".
// Secret necessária: RESEND_API_KEY (re_...).
//
// Body esperado (JSON):
// {
//   "to": "destino@exemplo.com",
//   "from_email": "noreply@seudominio.com.br",   // opcional, default abaixo
//   "from_name":  "Oculto Swing",                 // opcional
//   "subject":    "...",                          // opcional
//   "html":       "<p>...</p>",                   // opcional
//   "api_key":    "re_..."                        // opcional (fallback se a secret não estiver setada)
// }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const to = String(body?.to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json(400, { error: "invalid_to_email" });
  }

  const apiKey =
    (typeof body?.api_key === "string" && body.api_key.trim()) ||
    Deno.env.get("RESEND_API_KEY") ||
    "";
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
    return json(401, {
      error: "missing_or_invalid_api_key",
      hint:
        "Defina a secret RESEND_API_KEY no Supabase (Edge Functions → Manage secrets) ou envie api_key no body.",
    });
  }

  const fromName = String(body?.from_name || "Oculto Swing").slice(0, 80);
  const fromEmail = String(
    body?.from_email || "noreply@ocultoswing.com.br",
  ).trim();
  const subject = String(
    body?.subject || "[Oculto Swing] Teste de entrega Resend",
  ).slice(0, 200);
  const html =
    typeof body?.html === "string" && body.html.trim()
      ? body.html
      : `<div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>✅ Teste de email entregue</h2>
          <p>Este email confirma que o gateway Resend está enviando corretamente
          pela edge function <strong>send-test-email</strong>.</p>
          <p><strong>Data/hora:</strong> ${new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}</p>
        </div>`;

  const started = performance.now();
  const sandbox = body?.sandbox === true || body?.sandbox_mode === true;

  // Modo sandbox: não chama o Resend de verdade — apenas simula sucesso.
  if (sandbox) {
    return json(200, {
      success: true,
      status_code: 200,
      status_text: "OK (sandbox)",
      duration_ms: Math.round(performance.now() - started),
      proxy_used: "edge:send-test-email",
      sandbox: true,
      message: `[SANDBOX] Envio simulado para ${to} — nenhum email real foi disparado.`,
      response: { id: `sandbox_${crypto.randomUUID()}`, sandbox: true },
      raw_body: "",
      headers: {},
    });
  }

  let resendResp: Response;
  try {
    resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
    });
  } catch (e: any) {
    return json(502, {
      error: "resend_unreachable",
      message: e?.message || String(e),
      duration_ms: Math.round(performance.now() - started),
    });
  }

  const raw = await resendResp.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    /* noop */
  }

  const ok = resendResp.ok && !parsed?.error;
  return json(resendResp.ok ? 200 : resendResp.status, {
    success: ok,
    status_code: resendResp.status,
    status_text: resendResp.statusText,
    duration_ms: Math.round(performance.now() - started),
    proxy_used: "edge:send-test-email",
    sandbox: false,
    message: ok
      ? `Email enviado para ${to} (id: ${parsed?.id || "—"})`
      : parsed?.error?.message ||
        parsed?.message ||
        `HTTP ${resendResp.status} ${resendResp.statusText}`,
    response: parsed,
    raw_body: raw,
    headers: Object.fromEntries(resendResp.headers.entries()),
  });
});
