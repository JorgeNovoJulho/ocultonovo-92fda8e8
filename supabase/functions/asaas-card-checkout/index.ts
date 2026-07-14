// asaas-card-checkout — cobrança via cartão de crédito (Asaas)
// Mantém PIX intacto em pix-gateway. Reusa system_settings para split.
// Banco-alvo: Supabase EXTERNO. verify_jwt = false (validação manual).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_PLATFORM_FEE = 20;
const DEFAULT_TAX_RESERVE = 6;
const DEFAULT_AFFILIATE_PCT = 5;
const DEFAULT_CREATOR_PCT = 69;

interface CardPayload {
  amount: number;
  description?: string;
  payerEmail: string;
  payerName: string;
  payerCpfCnpj: string;
  payerPhone?: string;
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  remoteIp?: string;
  /** @deprecated Hint apenas; servidor SEMPRE resolve do banco. */
  creatorWalletId?: string;
  /** Identifica o vendedor para resolver walletId oficial. */
  postId?: string;
  sellerId?: string;
  installments?: number;
  type?: 'card_charge' | 'subscription' | 'ppv';
  metadata?: Record<string, unknown>;
}

/**
 * Resolve walletId oficial do criador a partir de postId ou sellerId.
 * Nunca confia em walletId vindo do client.
 */
async function resolveOfficialWalletId(
  admin: any,
  opts: { postId?: string; sellerId?: string }
): Promise<{ walletId: string | null; sellerProfileId: string | null; sellerUserId: string | null }> {
  let sellerProfileId: string | null = null;
  let sellerUserId: string | null = null;

  if (opts.postId) {
    const { data: post } = await admin
      .from('posts')
      .select('author_id, user_id')
      .eq('id', opts.postId)
      .maybeSingle();
    sellerProfileId = post?.author_id || null;
    sellerUserId = post?.user_id || null;
  }

  if (!sellerProfileId && opts.sellerId) {
    // sellerId pode vir como profile.id OU user_id; tenta ambos.
    const { data: byId } = await admin
      .from('profiles')
      .select('id, user_id')
      .eq('id', opts.sellerId)
      .maybeSingle();
    if (byId) {
      sellerProfileId = byId.id;
      sellerUserId = byId.user_id;
    } else {
      const { data: byUser } = await admin
        .from('profiles')
        .select('id, user_id')
        .eq('user_id', opts.sellerId)
        .maybeSingle();
      sellerProfileId = byUser?.id || null;
      sellerUserId = byUser?.user_id || null;
    }
  }

  if (!sellerProfileId) return { walletId: null, sellerProfileId: null, sellerUserId };

  // 1ª fonte: creator_pricing_config
  const { data: pricing } = await admin
    .from('creator_pricing_config')
    .select('asaas_wallet_id')
    .eq('profile_id', sellerProfileId)
    .maybeSingle();

  let walletId: string | null = pricing?.asaas_wallet_id || null;

  // 2ª fonte: profiles.asaas_wallet_id (espelho)
  if (!walletId) {
    const { data: prof } = await admin
      .from('profiles')
      .select('asaas_wallet_id')
      .eq('id', sellerProfileId)
      .maybeSingle();
    walletId = prof?.asaas_wallet_id || null;
  }

  return { walletId, sellerProfileId, sellerUserId };
}

async function auditWalletMismatch(
  admin: any,
  payload: {
    userId: string;
    clientWalletId?: string | null;
    officialWalletId?: string | null;
    sellerProfileId?: string | null;
    postId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    reason: string;
  }
) {
  try {
    await admin.from('audit_logs').insert({
      admin_id: payload.userId,
      action_type: 'asaas_wallet_id_mismatch',
      target_resource: 'asaas-card-checkout',
      target_id: payload.sellerProfileId || null,
      details: {
        reason: payload.reason,
        client_wallet_id: payload.clientWalletId || null,
        official_wallet_id: payload.officialWalletId || null,
        post_id: payload.postId || null,
      },
      ip_address: payload.ip || null,
      user_agent: payload.userAgent || null,
    });
  } catch (e) {
    console.warn('[asaas-card] audit insert failed:', (e as Error).message);
  }
}

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

async function getFeeSplit(supabase: any, source = 'asaas-card-checkout') {
  let errorMsg: string | null = null;
  try {
    const { data, error } = await supabase
      .from("split_config")
      .select("platform_percent, tax_percent, creator_percent, affiliate_percent")
      .eq("is_active", true)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // === BETA CONTROL ===
  const __betaBlock = await assertPlatformFeature('subscriptions');
  if (__betaBlock) return betaBlockedResponse(__betaBlock, corsHeaders);
  // ====================

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: u, error: uErr } = await userClient.auth.getUser(token);
    if (uErr || !u?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = u.user.id;

    const body = (await req.json()) as CardPayload;

    // Validação mínima server-side
    if (
      !body?.amount ||
      body.amount < 1 ||
      !body?.payerEmail ||
      !body?.payerName ||
      !body?.payerCpfCnpj ||
      !body?.card?.number ||
      !body?.card?.expiryMonth ||
      !body?.card?.expiryYear ||
      !body?.card?.ccv ||
      !body?.card?.holderName
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Payload incompleto" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Lê config Asaas (mesmo schema usado por pix-gateway)
    const { data: cfg } = await admin
      .from("pix_gateway_config")
      .select("*")
      .maybeSingle();
    const remoteIp =
      body.remoteIp ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";


    if (!cfg?.api_key_encrypted) {
      return new Response(
        JSON.stringify({ success: false, error: "Asaas não configurado" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const baseUrl = (cfg as any).sandbox_mode
      ? "https://sandbox.asaas.com/api/v3"
      : "https://api.asaas.com/v3";
    const apiKey = (cfg as any).api_key_encrypted;

    // 1) Customer (busca/cria)
    const cleanCpf = body.payerCpfCnpj.replace(/\D/g, "");
    let customerId: string | null = null;
    try {
      const sr = await fetch(
        `${baseUrl}/customers?email=${encodeURIComponent(body.payerEmail)}`,
        { headers: { access_token: apiKey } }
      );
      const sd = await sr.json();
      if (sd?.data?.[0]?.id) customerId = sd.data[0].id;
    } catch (_) {}

    if (!customerId) {
      const cr = await fetch(`${baseUrl}/customers`, {
        method: "POST",
        headers: { access_token: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: body.payerName,
          email: body.payerEmail,
          cpfCnpj: cleanCpf,
          phone: body.payerPhone,
        }),
      });
      const cd = await cr.json();
      customerId =
        cd?.id ||
        cd?.errors?.[0]?.description?.match(/Customer already exists: (\w+)/)?.[1] ||
        null;
    }

    if (!customerId) {
      return new Response(
        JSON.stringify({ success: false, error: "Falha ao criar cliente" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2) Split (server-side)
    const split = await getFeeSplit(admin);

    const due = new Date();
    due.setDate(due.getDate() + 1);

    const payload: any = {
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: body.amount,
      dueDate: due.toISOString().split("T")[0],
      description: body.description || "Pagamento Oculto",
      installmentCount: body.installments && body.installments > 1 ? body.installments : undefined,
      installmentValue:
        body.installments && body.installments > 1
          ? Math.round((body.amount / body.installments) * 100) / 100
          : undefined,
      creditCard: {
        holderName: body.card.holderName,
        number: body.card.number.replace(/\s/g, ""),
        expiryMonth: body.card.expiryMonth,
        expiryYear: body.card.expiryYear,
        ccv: body.card.ccv,
      },
      creditCardHolderInfo: {
        name: body.payerName,
        email: body.payerEmail,
        cpfCnpj: cleanCpf,
        postalCode: "00000000",
        addressNumber: "0",
        phone: body.payerPhone || "",
      },
      remoteIp,
    };

    // === Resolução server-side do walletId (NUNCA confia no client) ===
    const userAgent = req.headers.get('user-agent') || null;
    const clientHintWallet = body.creatorWalletId?.trim() || null;
    const isPpvFlow = (body.type || 'card_charge') === 'ppv' || !!body.postId || !!body.sellerId;

    let officialWalletId: string | null = null;
    let resolvedSellerProfileId: string | null = null;

    if (isPpvFlow) {
      const resolved = await resolveOfficialWalletId(admin, {
        postId: body.postId,
        sellerId: body.sellerId,
      });
      officialWalletId = resolved.walletId;
      resolvedSellerProfileId = resolved.sellerProfileId;

      if (!officialWalletId) {
        await auditWalletMismatch(admin, {
          userId,
          clientWalletId: clientHintWallet,
          officialWalletId: null,
          sellerProfileId: resolvedSellerProfileId,
          postId: body.postId || null,
          ip: remoteIp,
          userAgent,
          reason: 'official_wallet_not_found',
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Criador sem carteira ASAAS configurada. Pagamento bloqueado.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Auditoria se client tentou injetar walletId diferente do oficial
      if (clientHintWallet && clientHintWallet !== officialWalletId) {
        await auditWalletMismatch(admin, {
          userId,
          clientWalletId: clientHintWallet,
          officialWalletId,
          sellerProfileId: resolvedSellerProfileId,
          postId: body.postId || null,
          ip: remoteIp,
          userAgent,
          reason: 'client_wallet_id_overridden',
        });
        console.warn('[asaas-card] walletId do client divergente — usando oficial do banco.');
      }

      payload.split = [
        { walletId: officialWalletId, percentualValue: split.creatorPct },
      ];
    }


    const pr = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers: { access_token: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const pd = await pr.json();

    if (!pd?.id) {
      console.error("[asaas-card] payment failed:", pd);
      return new Response(
        JSON.stringify({
          success: false,
          error: pd?.errors?.[0]?.description || "Cartão recusado",
          details: pd,
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3) Persiste transação pending para o webhook fechar
    await admin.from("transactions").insert({
      user_id: userId,
      amount: body.amount,
      type: body.type || "card_charge",
      status:
        pd.status === "CONFIRMED" || pd.status === "RECEIVED"
          ? "completed"
          : "pending",
      provider: "asaas",
      external_id: pd.id,
      description: body.description || "Pagamento via cartão",
      metadata: {
        installments: body.installments || 1,
        creator_wallet_id: officialWalletId,
        seller_profile_id: resolvedSellerProfileId,
        post_id: body.postId || null,
        client_wallet_hint: clientHintWallet,
        split,
        ...(body.metadata || {}),
      },
    } as any);

    return new Response(
      JSON.stringify({
        success: true,
        provider: "asaas",
        payment_id: pd.id,
        status: pd.status,
        invoice_url: pd.invoiceUrl,
        installments: body.installments || 1,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("[asaas-card] unhandled:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
