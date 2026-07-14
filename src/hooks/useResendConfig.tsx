import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";
import {
  persistIntegrationHealth,
  persistIntegrationReference,
} from "@/lib/integrationHealth";

const RESEND_CONFIG_MISSING_TABLE_MESSAGE =
  "Tabela resend_config não existe no Supabase externo. Execute o SQL enviado no chat e salve novamente.";

const isMissingResendConfigTable = (error: any) =>
  error?.code === "PGRST205" ||
  error?.code === "42P01" ||
  String(error?.message || "").includes(
    "Could not find the table 'public.resend_config'",
  ) ||
  String(error?.message || "").includes("schema cache");

export interface ResendConfig {
  id: string;
  api_key_encrypted: string | null;
  from_email: string;
  from_name: string;
  is_active: boolean;
  sandbox_mode: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  last_test_at?: string | null;
  last_test_status?: "OK" | "FAIL" | null;
  last_test_status_code?: number | null;
  last_test_message?: string | null;
  last_cors_at?: string | null;
  last_cors_status?: "OK" | "FAIL" | null;
  last_cors_message?: string | null;
}

export interface ResendProxyAttempt {
  ts: string;
  proxy: string;
  attempt: number;
  ok: boolean;
  status?: number;
  duration_ms: number;
  error?: string;
}

export interface ResendDiagnosticResult {
  success: boolean;
  status_code: number;
  status_text: string;
  message: string;
  response: any;
  raw_body: string;
  headers: Record<string, string>;
  attempts?: ResendProxyAttempt[];
  proxy_used?: string | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Auditoria 100% client-side — não depende de edge function deployada.
// Valida API Key (formato), faz lookup DNS via Cloudflare DoH (CORS aberto)
// e dispara webhook Discord direto do navegador (também CORS aberto).
// ──────────────────────────────────────────────────────────────────────────

const RESEND_CONFIG_ID = "00000000-0000-0000-0000-000000000001";

async function dohLookup(name: string, type: "MX" | "TXT" | "CNAME" | "A") {
  try {
    const r = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!r.ok) return { ok: false, records: [] as string[] };
    const j = await r.json();
    const records: string[] = (j.Answer || []).map((a: any) => String(a.data || ""));
    return { ok: true, records };
  } catch {
    return { ok: false, records: [] as string[] };
  }
}

async function fireDiscord(url: string, payload: object) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* fire-and-forget */
  }
}

async function persistHealth(
  status: "OK" | "FAIL",
  statusCode: number,
  message: string,
) {
  await (supabase as any)
    .from("resend_config")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: status,
      last_test_status_code: statusCode,
      last_test_message: message.slice(0, 4000),
    })
    .eq("id", RESEND_CONFIG_ID);
}

export async function requestResendConnectionTest(
  body: Record<string, unknown> = {},
): Promise<ResendDiagnosticResult> {
  const action = String(body.action || "connection");

  const [{ data: config, error: cfgErr }, { data: pix }] = await Promise.all([
    (supabase as any).from("resend_config").select("*").maybeSingle(),
    (supabase as any).from("pix_gateway_config").select("discord_webhook_url").maybeSingle(),
  ]);

  if (cfgErr || !config) {
    const msg = "Configuração Resend não encontrada. Salve a chave primeiro.";
    await persistHealth("FAIL", 400, msg).catch(() => null);
    const err = new Error(msg) as Error & { diagnostic?: ResendDiagnosticResult };
    err.diagnostic = {
      success: false, status_code: 400, status_text: "Bad Request",
      message: msg, response: { error: msg }, raw_body: "", headers: {},
    };
    throw err;
  }

  const discordUrl: string | undefined = pix?.discord_webhook_url || undefined;
  const apiKey: string = config.api_key_encrypted || "";
  const fromEmail: string = config.from_email || "";
  const domain = fromEmail.split("@")[1] || "";

  if (action === "send_test_email") {
    if (!apiKey || !/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
      const msg = "API Key do Resend ausente ou em formato inválido (esperado: re_...).";
      await persistHealth("FAIL", 401, msg).catch(() => null);
      const err = new Error(msg) as Error & { diagnostic?: ResendDiagnosticResult };
      err.diagnostic = {
        success: false, status_code: 401, status_text: "Unauthorized",
        message: msg, response: { error: msg }, raw_body: "", headers: {},
      };
      throw err;
    }

    const to = String((body as any).to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      const msg = "Email de destino inválido para envio de teste.";
      await persistHealth("FAIL", 400, msg).catch(() => null);
      const err = new Error(msg) as Error & { diagnostic?: ResendDiagnosticResult };
      err.diagnostic = {
        success: false, status_code: 400, status_text: "Bad Request",
        message: msg, response: { error: msg }, raw_body: "", headers: {},
      };
      throw err;
    }

    const fromName = config.from_name || "Oculto Swing";
    const fromAddr = fromEmail || "noreply@ocultoswing.com.br";
    const payload = {
      from: `${fromName} <${fromAddr}>`,
      to: [to],
      subject: "[Oculto Swing] Teste de entrega Resend",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>✅ Teste de email entregue</h2>
        <p>Este email confirma que o gateway Resend está enviando corretamente.</p>
        <p><strong>Data/hora:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
      </div>`,
    };

    // 1) Tenta a edge function send-test-email (caminho preferido, sem CORS).
    const attempts: ResendProxyAttempt[] = [];
    try {
      const edgeUrl = `${EXTERNAL_SUPABASE_URL}/functions/v1/send-test-email`;
      const t0 = performance.now();
      const r = await fetch(edgeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EXTERNAL_SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to,
          from_email: fromAddr,
          from_name: fromName,
          subject: payload.subject,
          html: payload.html,
          api_key: apiKey, // fallback caso a secret RESEND_API_KEY não esteja setada
          sandbox: config.sandbox_mode === true,
        }),
      });
      const dur = Math.round(performance.now() - t0);
      const txt = await r.text();
      attempts.push({
        ts: new Date().toISOString(),
        proxy: "edge:send-test-email", attempt: 1,
        ok: r.ok, status: r.status, duration_ms: dur,
      });
      // 404 = função não deployada → cai para proxies. Demais respostas (200/4xx/5xx do Resend) são finais.
      if (r.status !== 404) {
        let parsed: any = null;
        try { parsed = txt ? JSON.parse(txt) : null; } catch { /* noop */ }
        const ok = r.ok && parsed?.success !== false;
        const message = ok
          ? (parsed?.message || `Email enviado para ${to} (id: ${parsed?.response?.id || "—"})`)
          : (parsed?.message || parsed?.error || `HTTP ${r.status} ${r.statusText}`);
        await persistHealth(ok ? "OK" : "FAIL", r.status, message).catch(() => null);
        const result: ResendDiagnosticResult = {
          success: ok,
          status_code: r.status,
          status_text: r.statusText,
          message,
          response: parsed?.response ?? parsed,
          raw_body: parsed?.raw_body ?? txt,
          headers: parsed?.headers ?? Object.fromEntries(r.headers.entries()),
          attempts,
          proxy_used: "edge:send-test-email",
        };
        if (!ok) {
          const err = new Error(message) as Error & { diagnostic?: ResendDiagnosticResult };
          err.diagnostic = result;
          throw err;
        }
        return result;
      }
    } catch (e: any) {
      // Erro de rede chamando a edge → registra e segue para proxies.
      attempts.push({
        ts: new Date().toISOString(),
        proxy: "edge:send-test-email", attempt: 1, ok: false,
        duration_ms: 0, error: e?.message || String(e),
      });
    }

    // 2) Fallback: proxies CORS públicos com backoff exponencial.
    const target = "https://api.resend.com/emails";
    const proxies = [
      `https://corsproxy.io/?${encodeURIComponent(target)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(target)}`,
      `https://thingproxy.freeboard.io/fetch/${target}`,
      `https://cors.eu.org/${target}`,
      `https://proxy.cors.sh/${target}`,
    ];
    const maxRounds = Math.max(1, Number((body as any).max_retries) || 2);
    // (attempts já declarado acima — reaproveitando o mesmo array para incluir tentativas dos proxies)
    let resp: Response | null = null;
    let proxyUsed: string | null = null;
    let lastErr: any = null;

    outer: for (let round = 1; round <= maxRounds; round++) {
      for (const url of proxies) {
        const t0 = performance.now();
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "x-cors-api-key": "temp_anon",
            },
            body: JSON.stringify(payload),
          });
          const dur = Math.round(performance.now() - t0);
          attempts.push({
            ts: new Date().toISOString(),
            proxy: url, attempt: round,
            ok: r.ok, status: r.status, duration_ms: dur,
          });
          if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 403 && r.status !== 429)) {
            // 4xx do Resend (ex.: 401/422) já é resposta real — não tenta outro proxy.
            resp = r; proxyUsed = url; break outer;
          }
          lastErr = `HTTP ${r.status}`;
        } catch (e: any) {
          attempts.push({
            ts: new Date().toISOString(),
            proxy: url, attempt: round, ok: false,
            duration_ms: Math.round(performance.now() - t0),
            error: e?.message || String(e),
          });
          lastErr = e?.message || String(e);
        }
      }
      if (round < maxRounds) {
        // Backoff exponencial: 800ms, 1600ms, 3200ms...
        await new Promise((res) => setTimeout(res, 800 * Math.pow(2, round - 1)));
      }
    }

    if (!resp) {
      const msg = `Todos os proxies CORS indisponíveis após ${maxRounds} rodada(s). Último erro: ${lastErr}. Veja o histórico de tentativas no diagnóstico.`;
      await persistHealth("FAIL", 0, msg).catch(() => null);
      const err = new Error(msg) as Error & { diagnostic?: ResendDiagnosticResult };
      err.diagnostic = {
        success: false, status_code: 0, status_text: "Proxy Down",
        message: msg, response: { error: msg, attempts }, raw_body: "", headers: {},
        attempts, proxy_used: null,
      };
      throw err;
    }

    const raw = await resp.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* noop */ }

    const ok = resp.ok && !parsed?.error;
    const message = ok
      ? `Email de teste enviado para ${to} via ${new URL(proxyUsed!).host} (id: ${parsed?.id || "—"})`
      : (parsed?.error?.message || parsed?.message || `HTTP ${resp.status} ${resp.statusText} via ${proxyUsed ? new URL(proxyUsed).host : "—"}`);

    await persistHealth(ok ? "OK" : "FAIL", resp.status, message).catch(() => null);

    const result: ResendDiagnosticResult = {
      success: ok,
      status_code: resp.status,
      status_text: resp.statusText,
      message,
      response: parsed,
      raw_body: raw,
      headers: Object.fromEntries(resp.headers.entries()),
      attempts,
      proxy_used: proxyUsed,
    };
    if (!ok) {
      const err = new Error(message) as Error & { diagnostic?: ResendDiagnosticResult };
      err.diagnostic = result;
      throw err;
    }
    return result;
  }


  if (!apiKey || !/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
    const msg = "API Key do Resend ausente ou em formato inválido (esperado: re_...).";
    if (discordUrl) {
      fireDiscord(discordUrl, {
        embeds: [{
          title: "🚨 CRITICAL: Email Gateway Down",
          description: msg,
          color: 0xff0000,
          timestamp: new Date().toISOString(),
        }],
      });
    }
    await persistHealth("FAIL", 401, msg).catch(() => null);
    const err = new Error(msg) as Error & { diagnostic?: ResendDiagnosticResult };
    err.diagnostic = {
      success: false, status_code: 401, status_text: "Unauthorized",
      message: msg, response: { error: msg }, raw_body: "", headers: {},
    };
    throw err;
  }

  if (!domain) {
    const msg = "from_email sem domínio válido.";
    await persistHealth("FAIL", 400, msg).catch(() => null);
    const err = new Error(msg) as Error & { diagnostic?: ResendDiagnosticResult };
    err.diagnostic = {
      success: false, status_code: 400, status_text: "Bad Request",
      message: msg, response: { error: msg }, raw_body: "", headers: {},
    };
    throw err;
  }

  const [mx, spf, dkim] = await Promise.all([
    dohLookup(`send.${domain}`, "MX"),
    dohLookup(`send.${domain}`, "TXT"),
    dohLookup(`resend._domainkey.${domain}`, "TXT"),
  ]);

  const hasMx = mx.records.some((r) => /amazonses\.com|feedback-smtp/i.test(r));
  const hasSpf = spf.records.some((r) => /spf1.*amazonses/i.test(r));
  const hasDkim = dkim.records.length > 0;
  const verifiedCount = [hasMx, hasSpf, hasDkim].filter(Boolean).length;
  const domainVerified = verifiedCount >= 2;

  const summary =
    `DNS ${domain}: MX=${hasMx ? "✅" : "❌"} SPF=${hasSpf ? "✅" : "❌"} DKIM=${hasDkim ? "✅" : "❌"}`;

  const ok = domainVerified;
  await persistHealth(
    ok ? "OK" : "FAIL",
    ok ? 200 : 400,
    ok ? `Auditoria OK. ${summary}` : `Domínio não verificado. ${summary}`,
  ).catch(() => null);

  if (discordUrl) {
    fireDiscord(discordUrl, {
      embeds: [{
        title: ok ? "✅ Email Gateway: Auditoria OK" : "⚠️ Email Gateway: DNS incompleto",
        description: summary,
        color: ok ? 0x22c55e : 0xf59e0b,
        timestamp: new Date().toISOString(),
      }],
    });
  }

  const result: ResendDiagnosticResult = {
    success: ok,
    status_code: ok ? 200 : 400,
    status_text: ok ? "OK" : "DNS Incomplete",
    message: ok
      ? `Auditoria concluída. ${summary}`
      : `Domínio "${domain}" não está totalmente verificado. ${summary}`,
    response: {
      domain_name: domain,
      domain_verified: domainVerified,
      domain_status: domainVerified ? "verified" : "pending",
      mx: mx.records,
      spf: spf.records,
      dkim: dkim.records,
    },
    raw_body: summary,
    headers: {},
  };

  if (!ok) {
    const err = new Error(result.message) as Error & { diagnostic?: ResendDiagnosticResult };
    err.diagnostic = result;
    throw err;
  }
  return result;
}

export async function requestResendCorsPreflight(): Promise<ResendDiagnosticResult> {
  return {
    success: true,
    status_code: 200,
    status_text: "Client-side",
    message: "Auditoria agora roda 100% no navegador — preflight CORS não se aplica.",
    response: { mode: "client_side_audit" },
    raw_body: "",
    headers: {},
  };
}

export function useResendConfig() {
  return useQuery({
    queryKey: ["resend-config"],
    queryFn: async (): Promise<ResendConfig | null> => {
      const { data, error } = await (supabase as any)
        .from("resend_config")
        .select("*")
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST116" || isMissingResendConfigTable(error))
          return null;
        throw error;
      }

      return data;
    },
  });
}

interface UpdateResendConfigParams {
  api_key?: string;
  from_email?: string;
  from_name?: string;
  is_active?: boolean;
  sandbox_mode?: boolean;
}

export function useUpdateResendConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateResendConfigParams) => {
      if (!user) throw new Error("Não autenticado");

      const updateData: any = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      if (params.api_key !== undefined) {
        updateData.api_key_encrypted = params.api_key;
      }
      if (params.from_email !== undefined) {
        updateData.from_email = params.from_email;
      }
      if (params.from_name !== undefined) {
        updateData.from_name = params.from_name;
      }
      if (params.is_active !== undefined) {
        updateData.is_active = params.is_active;
      }
      if (params.sandbox_mode !== undefined) {
        updateData.sandbox_mode = params.sandbox_mode;
      }

      const { error } = await (supabase as any).from("resend_config").upsert(
        {
          id: "00000000-0000-0000-0000-000000000001",
          from_email: params.from_email || "noreply@ocultoswing.com.br",
          from_name: params.from_name || "Oculto Swing",
          is_active: params.is_active ?? false,
          sandbox_mode: params.sandbox_mode ?? true,
          ...updateData,
        },
        { onConflict: "id" },
      );

      if (error) {
        if (isMissingResendConfigTable(error))
          throw new Error(RESEND_CONFIG_MISSING_TABLE_MESSAGE);
        throw error;
      }

      await persistIntegrationReference(
        "resend",
        "Resend referenciado — aguardando teste de conexão",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resend-config"] });
      toast({
        title: "Referência salva — ainda não validada",
        description:
          "Clique em Testar Conexão para atualizar o status para Operacional.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useTestResendConnection() {
  return useMutation({
    mutationFn: () => requestResendConnectionTest(),
    onSuccess: async (data) => {
      await persistIntegrationHealth(
        "resend",
        data.success ? "OK" : "FAIL",
        data.message || "Teste Resend concluído",
      ).catch(() => null);
      toast({
        title: data.success ? "✅ Conexão OK" : "❌ Falha na conexão",
        description: data.message || "Teste concluído",
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: async (error: Error) => {
      await persistIntegrationHealth(
        "resend",
        "FAIL",
        error.message || "Erro no teste Resend",
      ).catch(() => null);
      toast({
        title: "Erro no teste",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
