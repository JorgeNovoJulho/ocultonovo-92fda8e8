import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Split defaults: 20% plataforma, 6% impostos, 5% afiliado, 69% criador VIP ──
// Source of truth: public.split_config (read by process_payment_split RPC).
const DEFAULT_PLATFORM_FEE = 20;
const DEFAULT_TAX_RESERVE  = 6;
const DEFAULT_AFFILIATE_PCT = 5;
const DEFAULT_CREATOR_PCT  = 69;

async function logSplitTelemetry(
  supabase: any,
  source: string,
  resolvedFrom: 'split_config' | 'fallback_constants',
  fees: { platformFee: number; taxReserve: number; creatorPct: number; affiliatePct: number },
  extras: { transaction_id?: string | null; gross_amount?: number | null; error_msg?: string | null } = {}
) {
  try {
    await supabase.from('split_telemetry_logs').insert({
      source,
      resolved_from: resolvedFrom,
      platform_pct: fees.platformFee,
      tax_pct: fees.taxReserve,
      creator_pct: fees.creatorPct,
      affiliate_pct: fees.affiliatePct,
      transaction_id: extras.transaction_id ?? null,
      gross_amount: extras.gross_amount ?? null,
      error_msg: extras.error_msg ?? null,
    });
  } catch (e) {
    console.warn(`[split-telemetry] insert failed (${source}):`, (e as Error).message);
  }
}

async function getFeeSplit(supabase: any, source = 'pix-gateway') {
  let errorMsg: string | null = null;
  try {
    const { data, error } = await supabase
      .from('split_config')
      .select('platform_percent, tax_percent, creator_percent, affiliate_percent')
      .eq('is_active', true)
      .maybeSingle();
    if (error) errorMsg = error.message;
    if (data) {
      const fees = {
        platformFee:  parseFloat(data.platform_percent),
        taxReserve:   parseFloat(data.tax_percent),
        creatorPct:   parseFloat(data.creator_percent),
        affiliatePct: parseFloat(data.affiliate_percent),
      };
      console.log(`[${source}] split resolved from split_config:`, fees);
      logSplitTelemetry(supabase, source, 'split_config', fees);
      return fees;
    }
  } catch (e) { errorMsg = (e as Error).message; }
  const fallback = {
    platformFee:  DEFAULT_PLATFORM_FEE,
    taxReserve:   DEFAULT_TAX_RESERVE,
    creatorPct:   DEFAULT_CREATOR_PCT,
    affiliatePct: DEFAULT_AFFILIATE_PCT,
  };
  console.warn(`[${source}] ⚠️ split_config indisponível — usando fallback 20/6/5/69`, { errorMsg });
  logSplitTelemetry(supabase, source, 'fallback_constants', fallback, { error_msg: errorMsg });
  return fallback;
}

interface PixPaymentRequest {
  action: 'generate' | 'test-connection' | 'webhook';
  amount?: number;
  description?: string;
  payer_email?: string;
  payer_name?: string;
  payer_cpf_cnpj?: string;
  payer_user_id?: string;
  webhook_data?: any;
  transaction_id?: string;
  creator_id?: string;
  provider?: string;
  api_key?: string;
}

interface PixPaymentResponse {
  success: boolean;
  qr_code?: string;
  qr_code_base64?: string;
  transaction_id?: string;
  expires_at?: string;
  error?: string;
  provider?: string;
  split?: {
    gross: number;
    platform_amount: number;
    creator_amount: number;
    creator_wallet_id: string | null;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function calcSplit(gross: number, walletId: string | null, creatorPct = DEFAULT_CREATOR_PCT) {
  const creator = Math.round(gross * (creatorPct / 100) * 100) / 100;
  const platform = Math.round((gross - creator) * 100) / 100;
  return { gross, platform_amount: platform, creator_amount: creator, creator_wallet_id: walletId };
}

// ── Mercado Pago ───────────────────────────────────────────────────────────
async function mercadoPagoTestConnection(accessToken: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.mercadopago.com/v1/payment_methods', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.ok) return { success: true, message: 'Conexão bem sucedida! PIX habilitado.' };
    let errorMsg = 'Falha na autenticação';
    try {
      const text = await response.text();
      if (text && text.trim().startsWith('{')) {
        const parsed = JSON.parse(text);
        errorMsg = parsed.message || errorMsg;
      }
    } catch (_) { /* non-JSON */ }
    return { success: false, message: errorMsg };
  } catch (err) {
    return { success: false, message: `Erro: ${err instanceof Error ? err.message : err}` };
  }
}

async function mercadoPagoGeneratePix(
  accessToken: string, amount: number, description: string, payerEmail: string
): Promise<PixPaymentResponse> {
  try {
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() + 30);
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description: description || 'Recarga de carteira',
        payment_method_id: 'pix',
        payer: { email: payerEmail },
        date_of_expiration: expirationDate.toISOString(),
      }),
    });
    const data = await response.json();
    if (response.ok && data.point_of_interaction?.transaction_data) {
      return {
        success: true,
        qr_code: data.point_of_interaction.transaction_data.qr_code,
        qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64,
        transaction_id: data.id.toString(),
        expires_at: data.date_of_expiration,
        provider: 'mercadopago',
      };
    }
    return { success: false, error: data.message || 'Erro ao gerar PIX', provider: 'mercadopago' };
  } catch (err) {
    return { success: false, error: `Erro: ${err instanceof Error ? err.message : err}`, provider: 'mercadopago' };
  }
}

// ── PagSeguro ──────────────────────────────────────────────────────────────
async function pagSeguroTestConnection(token: string, sandbox: boolean): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = sandbox ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com';
    const response = await fetch(`${baseUrl}/instant-payments/cob`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (response.status === 401) return { success: false, message: 'Token inválido' };
    return { success: true, message: 'Conexão bem sucedida com PagSeguro!' };
  } catch (err) {
    return { success: false, message: `Erro: ${err instanceof Error ? err.message : err}` };
  }
}

async function pagSeguroGeneratePix(
  token: string, amount: number, description: string, sandbox: boolean
): Promise<PixPaymentResponse> {
  try {
    const baseUrl = sandbox ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com';
    const txid = `OCULTO${Date.now()}${Math.random().toString(36).substr(2, 6)}`.toUpperCase();
    const response = await fetch(`${baseUrl}/instant-payments/cob/${txid}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendario: { expiracao: 1800 },
        valor: { original: amount.toFixed(2) },
        chave: '',
        solicitacaoPagador: description || 'Recarga de carteira',
      }),
    });
    const data = await response.json();
    if (response.ok) {
      return {
        success: true,
        qr_code: data.pixCopiaECola,
        transaction_id: txid,
        expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
        provider: 'pagseguro',
      };
    }
    return { success: false, error: data.detail || 'Erro ao gerar PIX PagSeguro', provider: 'pagseguro' };
  } catch (err) {
    return { success: false, error: `Erro: ${err instanceof Error ? err.message : err}`, provider: 'pagseguro' };
  }
}

// ── Asaas (with split) ─────────────────────────────────────────────────────
function maskSecret(s: string | null | undefined): string {
  if (!s) return '∅ não definido';
  const str = String(s);
  if (str.length <= 8) return `${str[0] ?? ''}***${str.slice(-1)}`;
  return `${str.slice(0, 6)}…${str.slice(-4)} (len ${str.length})`;
}

function getAsaasBaseUrl(sandbox: boolean): string {
  return sandbox
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';
}

interface FieldCheck {
  field: string;
  label: string;
  ok: boolean;
  detail: string;
  masked?: string;
}

async function asaasTestConnection(
  apiKey: string,
  sandbox: boolean,
  extraConfig?: { webhook_secret_encrypted?: string | null; pix_key?: string | null; pix_key_type?: string | null; sandbox_mode?: boolean; is_active?: boolean } | null,
): Promise<{ success: boolean; message: string; checks: FieldCheck[]; account?: any; raw?: any }> {
  const checks: FieldCheck[] = [];

  // 1. API Key formato
  const trimmed = (apiKey || '').trim();
  const looksProd = trimmed.startsWith('$aact_prod_') || (trimmed.startsWith('$aact_') && !trimmed.startsWith('$aact_hmlg_'));
  const looksSandbox = trimmed.startsWith('$aact_hmlg_') || trimmed.startsWith('$aact_YTU') || trimmed.startsWith('$aact_M');
  checks.push({
    field: 'api_key',
    label: 'API Key (formato Asaas)',
    ok: trimmed.startsWith('$aact_') && trimmed.length > 40,
    detail: trimmed.startsWith('$aact_')
      ? `Prefixo válido (${looksProd ? 'produção' : looksSandbox ? 'sandbox' : 'desconhecido'})`
      : 'Esperado iniciar com $aact_',
    masked: maskSecret(trimmed),
  });

  // 2. myAccount auth
  const baseUrl = getAsaasBaseUrl(sandbox);
  let accountData: any = null;
  let myAccountOk = false;
  let authMsg = 'Falha na autenticação';
  try {
    const response = await fetch(`${baseUrl}/myAccount`, { headers: { access_token: trimmed } });
    const text = await response.text();
    let parsed: any = null;
    try { parsed = text && text.trim().startsWith('{') ? JSON.parse(text) : null; } catch (_) {}
    if (response.ok && parsed) {
      accountData = parsed;
      myAccountOk = true;
      authMsg = 'Autenticada com sucesso';
    } else if (parsed) {
      authMsg = parsed.errors?.[0]?.description || parsed.message || `HTTP ${response.status}`;
    } else {
      authMsg = `HTTP ${response.status}`;
    }
  } catch (err) {
    authMsg = `Erro de rede: ${err instanceof Error ? err.message : String(err)}`;
  }
  checks.push({
    field: 'auth',
    label: 'Autenticação /myAccount',
    ok: myAccountOk,
    detail: authMsg,
  });

  // 3. Account identidade
  if (accountData) {
    checks.push({
      field: 'account',
      label: 'Conta Asaas',
      ok: !!(accountData.name || accountData.email),
      detail: `${accountData.name || '—'} • ${accountData.email || '—'}${accountData.walletId ? ` • wallet ${String(accountData.walletId).slice(0, 8)}…` : ''}`,
    });
    checks.push({
      field: 'company_type',
      label: 'Tipo de conta',
      ok: true,
      detail: `${accountData.personType || '—'} / ${accountData.companyType || 'PESSOA_FISICA'}`,
    });
  }

  // 4. Saldo (valida permissões da chave)
  let balanceOk = false;
  let balanceDetail = 'Não consultado';
  if (myAccountOk) {
    try {
      const r = await fetch(`${baseUrl}/finance/balance`, { headers: { access_token: trimmed } });
      const j = await r.json().catch(() => null);
      if (r.ok && j && typeof j.balance !== 'undefined') {
        balanceOk = true;
        balanceDetail = `R$ ${Number(j.balance).toFixed(2)}`;
      } else {
        balanceDetail = `HTTP ${r.status} — ${j?.errors?.[0]?.description || 'sem permissão'}`;
      }
    } catch (e) {
      balanceDetail = `Erro: ${e instanceof Error ? e.message : String(e)}`;
    }
    checks.push({ field: 'balance', label: 'Permissão de saldo (/finance/balance)', ok: balanceOk, detail: balanceDetail });
  }

  // 5. Webhook secret presente
  const hasWebhook = !!extraConfig?.webhook_secret_encrypted;
  checks.push({
    field: 'webhook_secret',
    label: 'Webhook Secret salvo',
    ok: hasWebhook,
    detail: hasWebhook ? 'Configurado no banco' : 'Não definido — webhooks não serão validados',
    masked: hasWebhook ? maskSecret(extraConfig?.webhook_secret_encrypted) : undefined,
  });

  // 6. Chave PIX da plataforma
  const hasPix = !!extraConfig?.pix_key;
  checks.push({
    field: 'pix_key',
    label: 'Chave PIX da plataforma',
    ok: hasPix,
    detail: hasPix
      ? `${extraConfig?.pix_key_type || 'tipo?'} • ${maskSecret(extraConfig?.pix_key)}`
      : 'Não cadastrada — recebimentos diretos podem falhar',
  });

  // 7. Modo
  if (extraConfig) {
    checks.push({
      field: 'sandbox_mode',
      label: 'Modo de operação',
      ok: true,
      detail: extraConfig.sandbox_mode ? 'SANDBOX' : 'PRODUÇÃO',
    });
    checks.push({
      field: 'is_active',
      label: 'Gateway ativo',
      ok: !!extraConfig.is_active,
      detail: extraConfig.is_active ? 'Ativo' : 'Desativado',
    });
  }

  const success = myAccountOk;
  const failed = checks.filter((c) => !c.ok).map((c) => c.label);
  const message = success
    ? failed.length
      ? `Conexão OK — pendências: ${failed.join(', ')}`
      : 'Conexão bem sucedida com Asaas!'
    : `Falha: ${authMsg}`;

  return { success, message, checks, account: accountData ? { name: accountData.name, email: accountData.email, walletId: accountData.walletId, personType: accountData.personType } : undefined };
}

async function asaasGeneratePix(
  apiKey: string,
  amount: number,
  description: string,
  payerEmail: string,
  payerName: string | null,
  sandbox: boolean,
  creatorWalletId?: string | null,
  payerCpfCnpj?: string | null
): Promise<PixPaymentResponse> {
  try {
    const baseUrl = getAsaasBaseUrl(sandbox);
    console.log(`[PIX Gateway] Using Asaas baseUrl: ${baseUrl} (sandbox=${sandbox})`);

    // ── 1. Create / find customer ─────────────────────────────────────────
    const cleanCpfCnpj = String(payerCpfCnpj || '').replace(/\D/g, '');
    const normalizedEmail = String(payerEmail || '').trim().toLowerCase();
    let customerId: string | null = null;
    let lastCustomerError = '';

    if (cleanCpfCnpj.length < 11) {
      return {
        success: false,
        error: 'CPF/CNPJ inválido para identificar o cliente',
        provider: 'asaas',
      };
    }

    // Try to find existing customer by cpfCnpj first
    try {
      const searchResp = await fetch(`${baseUrl}/customers?cpfCnpj=${cleanCpfCnpj}`, {
        headers: { 'access_token': apiKey },
      });
      const searchData = await searchResp.json();
      if (searchData.data && searchData.data.length > 0) {
        customerId = searchData.data[0].id;
        console.log(`[PIX Gateway] Found existing Asaas customer by CPF/CNPJ: ${customerId}`);
      } else if (!searchResp.ok) {
        lastCustomerError = searchData?.errors?.[0]?.description || searchData?.message || `HTTP ${searchResp.status}`;
      }
    } catch (e) {
      console.warn('[PIX Gateway] Error searching customer by CPF/CNPJ:', e);
    }

    // Fallback: search by email in case the customer was created without CPF/CNPJ on older flows
    if (!customerId && normalizedEmail) {
      try {
        const searchByEmailResp = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(normalizedEmail)}`, {
          headers: { 'access_token': apiKey },
        });
        const searchByEmailData = await searchByEmailResp.json();
        if (searchByEmailData.data && searchByEmailData.data.length > 0) {
          customerId = searchByEmailData.data[0].id;
          console.log(`[PIX Gateway] Found existing Asaas customer by email: ${customerId}`);
        } else if (!searchByEmailResp.ok) {
          lastCustomerError = searchByEmailData?.errors?.[0]?.description || searchByEmailData?.message || `HTTP ${searchByEmailResp.status}`;
        }
      } catch (e) {
        console.warn('[PIX Gateway] Error searching customer by email:', e);
      }
    }

    // If not found, create new customer
    if (!customerId) {
      const customerPayload: any = {
        name: payerName?.trim() || 'Cliente Oculto',
        email: normalizedEmail || undefined,
        cpfCnpj: cleanCpfCnpj,
        notificationDisabled: true,
      };
      const customerResponse = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload),
      });
      const customerData = await customerResponse.json();
      console.log(`[PIX Gateway] Customer create response (status ${customerResponse.status}):`, JSON.stringify(customerData));
      customerId = customerData.id || null;
      if (!customerId) {
        lastCustomerError =
          customerData.errors?.[0]?.description ||
          customerData.message ||
          `HTTP ${customerResponse.status}`;
      }
    }

    if (!customerId) {
      return {
        success: false,
        error: `Erro ao identificar cliente${lastCustomerError ? `: ${lastCustomerError}` : ''}`,
        provider: 'asaas',
      };
    }

    // ── 2. Calculate split (server-side only, zero CPU on device) ────────
    const split = calcSplit(amount, creatorWalletId ?? null);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const paymentPayload: any = {
      customer: customerId,
      billingType: 'PIX',
      value: amount,
      dueDate: dueDate.toISOString().split('T')[0],
      description: description || 'Assinatura Oculto',
    };

    // Attach split only when creator has a valid walletId (PPV content only)
    if (split.creator_wallet_id && split.creator_wallet_id.trim().length > 4) {
      const creatorPctValue = DEFAULT_CREATOR_PCT;
      paymentPayload.split = [
        {
          walletId: split.creator_wallet_id.trim(),
          percentualValue: creatorPctValue, // 74%
        },
      ];
    }

    // ── 3. Create payment ─────────────────────────────────────────────────
    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentPayload),
    });
    const paymentData = await paymentResponse.json();

    if (!paymentData.id) {
      return {
        success: false,
        error: paymentData.errors?.[0]?.description || 'Erro ao criar cobrança',
        provider: 'asaas',
      };
    }

    // ── 4. Fetch QR Code immediately ──────────────────────────────────────
    const qrResponse = await fetch(`${baseUrl}/payments/${paymentData.id}/pixQrCode`, {
      headers: { 'access_token': apiKey },
    });
    const qrData = await qrResponse.json();

    return {
      success: true,
      qr_code: qrData.payload,
      qr_code_base64: qrData.encodedImage,
      transaction_id: paymentData.id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      provider: 'asaas',
      split,
    };
  } catch (err) {
    return { success: false, error: `Erro: ${err instanceof Error ? err.message : err}`, provider: 'asaas' };
  }
}

// ── EfiBank/Gerencianet ────────────────────────────────────────────────────
async function gerencianetTestConnection(credentials: string, sandbox: boolean): Promise<{ success: boolean; message: string }> {
  try {
    const [clientId, clientSecret] = credentials.split(':');
    if (!clientId || !clientSecret) return { success: false, message: 'Formato: Client_Id:Client_Secret' };
    const baseUrl = sandbox ? 'https://pix-h.api.efipay.com.br' : 'https://pix.api.efipay.com.br';
    const authResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    if (authResponse.ok) return { success: true, message: 'Conexão bem sucedida com EfiBank!' };
    const error = await authResponse.json();
    return { success: false, message: error.error_description || 'Falha na autenticação' };
  } catch (err) {
    return { success: false, message: `Erro: ${err instanceof Error ? err.message : err}` };
  }
}

async function gerencianetGeneratePix(
  credentials: string, amount: number, description: string, pixKey: string, sandbox: boolean
): Promise<PixPaymentResponse> {
  try {
    const [clientId, clientSecret] = credentials.split(':');
    const baseUrl = sandbox ? 'https://pix-h.api.efipay.com.br' : 'https://pix.api.efipay.com.br';
    const authResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    const authData = await authResponse.json();
    if (!authData.access_token) return { success: false, error: 'Falha na autenticação', provider: 'gerencianet' };

    const txid = `OCULTO${Date.now()}`.substring(0, 35);
    const cobResponse = await fetch(`${baseUrl}/v2/cob/${txid}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendario: { expiracao: 1800 },
        valor: { original: amount.toFixed(2) },
        chave: pixKey,
        solicitacaoPagador: description || 'Recarga de carteira',
      }),
    });
    const cobData = await cobResponse.json();
    if (cobData.txid) {
      const qrResponse = await fetch(`${baseUrl}/v2/loc/${cobData.loc.id}/qrcode`, {
        headers: { 'Authorization': `Bearer ${authData.access_token}` },
      });
      const qrData = await qrResponse.json();
      return {
        success: true,
        qr_code: qrData.qrcode,
        qr_code_base64: qrData.imagemQrcode,
        transaction_id: txid,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        provider: 'gerencianet',
      };
    }
    return { success: false, error: cobData.mensagem || 'Erro ao gerar PIX', provider: 'gerencianet' };
  } catch (err) {
    return { success: false, error: `Erro: ${err instanceof Error ? err.message : err}`, provider: 'gerencianet' };
  }
}

// ── Main handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: PixPaymentRequest = { action: 'test-connection' };
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const text = await req.text();
        if (text && text.trim().length > 0) {
          body = JSON.parse(text);
        }
      } else {
        // Try to read anyway, ignore if empty
        try {
          const text = await req.text();
          if (text && text.trim().startsWith('{')) {
            body = JSON.parse(text);
          }
        } catch (_) { /* no body or not JSON — use default */ }
      }
    } catch (_) {
      // fallback to default body already set
    }
    const { action, amount, description, payer_email, payer_user_id, payer_cpf_cnpj: bodyPayerCpfCnpj, payer_name, transaction_id, creator_id, provider: bodyProvider, api_key: bodyApiKey } = body;

    // ── test-connection (can come from VIP modal with direct api_key) ─────
    if (action === 'test-connection') {
      // Allow testing with a directly provided key + provider (from VIP modal)
      if (bodyApiKey && bodyProvider === 'asaas') {
        const result = await asaasTestConnection(bodyApiKey, false);
        return respond(result);
      }

      const { data: config } = await supabase.from('pix_gateway_config').select('*').single();
      if (!config?.api_key_encrypted) return respond({ success: false, message: 'API Key não configurada' });

      let result;
      switch (config.gateway_provider) {
        case 'mercadopago': result = await mercadoPagoTestConnection(config.api_key_encrypted); break;
        case 'pagseguro':   result = await pagSeguroTestConnection(config.api_key_encrypted, config.sandbox_mode); break;
        case 'asaas':       result = await asaasTestConnection(config.api_key_encrypted, config.sandbox_mode, {
          webhook_secret_encrypted: config.webhook_secret_encrypted,
          pix_key: config.pix_key,
          pix_key_type: config.pix_key_type,
          sandbox_mode: config.sandbox_mode,
          is_active: config.is_active,
        }); break;
        case 'gerencianet': result = await gerencianetTestConnection(config.api_key_encrypted, config.sandbox_mode); break;
        default:            result = { success: false, message: 'Provedor não suportado' };
      }
      return respond(result);
    }

    // ── check-status (polling from admin test) ────────────────────────────
    if (action === 'check-status') {
      if (!transaction_id) return respond({ success: false, error: 'transaction_id obrigatório' }, 400);
      const { data: config } = await supabase.from('pix_gateway_config').select('*').maybeSingle();
      if (!config?.api_key_encrypted) return respond({ success: false, error: 'Gateway não configurado' }, 400);

      if (config.gateway_provider === 'asaas') {
        const baseUrl = config.sandbox_mode ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
        const res = await fetch(`${baseUrl}/payments/${transaction_id}`, {
          headers: { 'access_token': config.api_key_encrypted },
        });
        const payment = await res.json();
        const asaasStatus = payment?.status?.toLowerCase() || 'unknown';
        const confirmed = ['received', 'confirmed', 'received_in_cash'].includes(asaasStatus);
        return respond({ success: true, status: asaasStatus, confirmed });
      }

      return respond({ success: false, error: 'check-status não suportado para este provedor' });
    }

    // ── generate ──────────────────────────────────────────────────────────
    if (action === 'generate') {
      const { data: config, error: configError } = await supabase.from('pix_gateway_config').select('*').maybeSingle();
      if (configError || !config) return respond({ success: false, error: 'Gateway PIX não configurado' }, 400);
      if (!config.is_active) return respond({ success: false, error: 'Gateway PIX está desativado' }, 400);

      const safeAmount = amount ?? 0;
      if (safeAmount < (config.min_deposit ?? 5)) {
        return respond({ success: false, error: `Valor mínimo: R$ ${config.min_deposit ?? 5}` }, 400);
      }

    // ── Ledger DB único — split nativo ASAAS DESATIVADO ───────────────
    // 100% do PIX cai na conta da plataforma. O ledger DB controla pending_balance,
    // hold D+7 e saques via withdrawal_requests. Nunca passe walletId ao ASAAS.
    const resolvedWalletId: string | null = null;

    const descLower = (description || '').toLowerCase();
    const isContentPurchase = creator_id && !descLower.includes('assinatura') && !descLower.includes('subscription');

    if (isContentPurchase && config.gateway_provider === 'asaas') {
      // SECURITY: Only VIP creators can sell paid content
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('plan_type')
        .eq('id', creator_id)
        .maybeSingle();

      if (!creatorProfile || creatorProfile.plan_type !== 'vip') {
        console.warn(`[PIX Gateway] Non-VIP creator ${creator_id} blocked from PPV`);
        return respond({
          success: false,
          error: 'Apenas usuários VIP podem vender conteúdo pago.',
          error_code: 'VIP_REQUIRED_FOR_PPV',
        });
      }

      console.log(`[PIX Gateway] PPV charge for creator ${creator_id} — split via DB ledger only (no native ASAAS split)`);
    }

      const payerEmail = payer_email || 'cliente@oculto.app';
      const desc = description || 'Recarga de carteira Oculto';

      // Resolve payer CPF/CNPJ from profile (for Asaas)
      let payerCpfCnpj: string | null = null;
      if (config.gateway_provider === 'asaas') {
        // 1. Direct CPF/CNPJ from request body (admin test, etc.)
        if (bodyPayerCpfCnpj && bodyPayerCpfCnpj.replace(/\D/g, '').length >= 11) {
          payerCpfCnpj = bodyPayerCpfCnpj.replace(/\D/g, '');
          console.log(`[PIX Gateway] CPF/CNPJ from request body: ${payerCpfCnpj}`);
        }
        // 2. Fallback: resolve from profile using payer_user_id
        if (!payerCpfCnpj && payer_user_id) {
          const { data: payerProfile } = await supabase
            .from('profiles')
            .select('cpf_cnpj')
            .eq('user_id', payer_user_id)
            .maybeSingle();
          payerCpfCnpj = payerProfile?.cpf_cnpj || null;
          console.log(`[PIX Gateway] CPF/CNPJ from payer_user_id ${payer_user_id}: ${payerCpfCnpj}`);
        }
        if (!payerCpfCnpj) {
          console.warn('[PIX Gateway] No CPF/CNPJ found for payer');
          return respond({
            success: false,
            error: 'Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente.',
            error_code: 'CPF_CNPJ_REQUIRED',
          });
        }
      }

      let result: PixPaymentResponse;
      switch (config.gateway_provider) {
        case 'mercadopago':
          result = await mercadoPagoGeneratePix(config.api_key_encrypted, safeAmount, desc, payerEmail);
          break;
        case 'pagseguro':
          result = await pagSeguroGeneratePix(config.api_key_encrypted, safeAmount, desc, config.sandbox_mode);
          break;
        case 'asaas':
          // wallet_id resolved server-side from creator profile — zero trust from client
          result = await asaasGeneratePix(
            config.api_key_encrypted,
            safeAmount,
            desc,
            payerEmail,
            payer_name || null,
            config.sandbox_mode,
            resolvedWalletId,
            payerCpfCnpj
          );
          break;
        case 'gerencianet':
          result = await gerencianetGeneratePix(
            config.api_key_encrypted,
            safeAmount,
            desc,
            config.pix_key || '',
            config.sandbox_mode
          );
          break;
        default:
          return respond({ success: false, error: 'Provedor não suportado' }, 400);
      }

      // Persist split info alongside transaction record if provided
      if (result.success && result.split && transaction_id) {
        const fees = await getFeeSplit(supabase);
        await supabase.from('payment_splits').insert({
          transaction_external_id: result.transaction_id,
          total_amount: result.split.gross,
          platform_fee: result.split.platform_amount,
          creator_amount: result.split.creator_amount,
          platform_fee_percent: fees.platformFee + fees.taxReserve,
          processed_at: new Date().toISOString(),
        }).then(() => null).catch(() => null); // non-blocking
      }

      return respond(result);
    }

    return respond({ success: false, error: 'Ação desconhecida' }, 400);

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[PIX Gateway] Error:', errMsg);
    // Anti-tela branca: always return a clean JSON even on crash
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
