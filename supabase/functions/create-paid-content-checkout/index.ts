// create-paid-content-checkout
// Cria cobrança ASAAS (PIX ou Cartão) para um post pago e registra
// transaction PENDING. A liberação (media_access) acontece SOMENTE no webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  post_id: string;
  payment_method: "pix" | "card";
  affiliate_username?: string | null;       // manual @username
  affiliate_id_from_link?: string | null;   // afiliado vindo de cookie/link
  // ⚠️ Apenas dica/hint do client. NUNCA é usado como walletId final.
  // O walletId oficial é resolvido server-side a partir do post/seller.
  creatorWalletId?: string | null;
  card?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
    installments?: number;
  };
}

/**
 * Resolve walletId oficial do criador (creator_pricing_config -> profiles).
 * Server-side only. Nunca confia em walletId vindo do client.
 */
async function resolveOfficialWalletId(
  admin: any,
  sellerProfileId: string
): Promise<string | null> {
  const { data: pricing } = await admin
    .from("creator_pricing_config")
    .select("asaas_wallet_id")
    .eq("profile_id", sellerProfileId)
    .maybeSingle();
  if (pricing?.asaas_wallet_id) return pricing.asaas_wallet_id as string;

  const { data: prof } = await admin
    .from("profiles")
    .select("asaas_wallet_id")
    .eq("id", sellerProfileId)
    .maybeSingle();
  return (prof?.asaas_wallet_id as string) || null;
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
    await admin.from("audit_logs").insert({
      admin_id: payload.userId,
      action_type: "asaas_wallet_id_mismatch",
      target_resource: "create-paid-content-checkout",
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
    console.warn("[create-paid-content-checkout] audit insert failed:", (e as Error).message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // === BETA CONTROL ===
  const __betaBlock = await assertPlatformFeature('paid_content');
  if (__betaBlock) return betaBlockedResponse(__betaBlock, corsHeaders);
  // ====================

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const URL_ = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const ANON = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u, error: uErr } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ error: "Invalid token" }, 401);
    const buyerAuthId = u.user.id;

    const body = (await req.json()) as Body;
    if (!body?.post_id || !["pix", "card"].includes(body.payment_method)) {
      return json({ success: false, error: "Payload inválido" }, 400);
    }

    const admin = createClient(URL_, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Buyer profile
    const { data: buyerProfile } = await admin
      .from("profiles")
      .select("id, name, username, email, cpf_cnpj, phone")
      .eq("user_id", buyerAuthId)
      .maybeSingle();

    if (!buyerProfile?.id) return json({ success: false, error: "Perfil do comprador não encontrado" }, 400);
    if (!buyerProfile.cpf_cnpj || buyerProfile.cpf_cnpj.replace(/\D/g, "").length < 11) {
      return json({ success: false, error: "Cadastre seu CPF antes de comprar.", error_code: "CPF_REQUIRED" }, 400);
    }

    // 2) Post + creator (preço autoritativo do banco)
    const { data: post } = await admin
      .from("posts")
      .select("id, user_id, is_paid, paid_price, content_text")
      .eq("id", body.post_id)
      .maybeSingle();

    if (!post || !post.is_paid) return json({ success: false, error: "Conteúdo não está à venda" }, 400);
    const price = Number(post.paid_price ?? 0);
    if (!(price > 0)) return json({ success: false, error: "Preço inválido" }, 400);

    const { data: creatorProfile } = await admin
      .from("profiles")
      .select("id, user_id, username, name, plan_type")
      .eq("user_id", post.user_id)
      .maybeSingle();
    if (!creatorProfile?.id) return json({ success: false, error: "Criador não encontrado" }, 400);
    if (creatorProfile.id === buyerProfile.id) {
      return json({ success: false, error: "Não é possível comprar seu próprio conteúdo" }, 400);
    }

    // 3) Já tem acesso? (curto-circuito)
    const { data: hasAccess } = await admin
      .from("media_access")
      .select("id")
      .eq("user_id", buyerAuthId)
      .eq("post_id", post.id)
      .maybeSingle();
    if (hasAccess) return json({ success: true, already_purchased: true });

    // 4) Resolver afiliado (link > manual)
    let affiliateId: string | null = null;
    let affiliateSource: "link" | "manual" | "none" = "none";
    let affiliateRejected: string | null = null;

    if (body.affiliate_id_from_link) {
      const v = await admin.rpc("validate_affiliate_for_purchase", {
        p_buyer_id: buyerProfile.id,
        p_creator_id: creatorProfile.id,
        p_affiliate_id: body.affiliate_id_from_link,
      });
      if ((v.data as any)?.valid) {
        affiliateId = body.affiliate_id_from_link;
        affiliateSource = "link";
      } else {
        affiliateRejected = (v.data as any)?.reason ?? "invalid";
      }
    }

    if (!affiliateId && body.affiliate_username) {
      const { data: aff } = await admin
        .from("profiles")
        .select("id")
        .ilike("username", body.affiliate_username.trim().replace(/^@/, ""))
        .maybeSingle();
      if (aff?.id) {
        const v = await admin.rpc("validate_affiliate_for_purchase", {
          p_buyer_id: buyerProfile.id,
          p_creator_id: creatorProfile.id,
          p_affiliate_id: aff.id,
        });
        if ((v.data as any)?.valid) {
          affiliateId = aff.id;
          affiliateSource = "manual";
        } else {
          affiliateRejected = (v.data as any)?.reason ?? "invalid";
        }
      } else {
        affiliateRejected = "not_found";
      }
    }

    // 5) Cria transaction PENDING (sem external_id ainda; preenchemos após criar no Asaas)
    const { data: txInserted, error: txErr } = await admin
      .from("transactions")
      .insert({
        user_id: buyerProfile.id,
        seller_id: creatorProfile.id,
        post_id: post.id,
        amount: price,
        type: "content_purchase",
        category: "creator_content",
        status: "pending",
        provider: "asaas",
        affiliate_id: affiliateId,
        affiliate_source: affiliateSource,
        affiliate_applied: !!affiliateId,
        description: `Compra de conteúdo VIP — post ${post.id}`,
        metadata: {
          payment_method: body.payment_method,
          affiliate_rejected_reason: affiliateRejected,
        },
      })
      .select("id")
      .single();

    if (txErr || !txInserted) {
      console.error("[create-paid-content-checkout] tx insert error:", txErr?.message);
      return json({ success: false, error: "Falha ao criar transação" }, 500);
    }
    const txId = txInserted.id as string;

    // 6) Carrega config Asaas
    const { data: cfg } = await admin.from("pix_gateway_config").select("*").maybeSingle();
    if (!cfg?.api_key_encrypted) {
      await admin.from("transactions").update({ status: "failed", metadata: { reason: "asaas_not_configured" } }).eq("id", txId);
      return json({ success: false, error: "Gateway não configurado" }, 400);
    }
    const baseUrl = (cfg as any).sandbox_mode ? "https://sandbox.asaas.com/api/v3" : "https://www.asaas.com/api/v3";
    const apiKey = (cfg as any).api_key_encrypted as string;

    // 7) Customer Asaas (busca/cria por cpfCnpj)
    const cleanCpf = String(buyerProfile.cpf_cnpj).replace(/\D/g, "");
    let customerId: string | null = null;
    try {
      const sr = await fetch(`${baseUrl}/customers?cpfCnpj=${cleanCpf}`, { headers: { access_token: apiKey } });
      const sd = await sr.json();
      if (sd?.data?.[0]?.id) customerId = sd.data[0].id;
    } catch (_) { /* ignore */ }

    if (!customerId) {
      const cr = await fetch(`${baseUrl}/customers`, {
        method: "POST",
        headers: { access_token: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: buyerProfile.name || buyerProfile.username || "Cliente Oculto",
          email: buyerProfile.email || "cliente@oculto.app",
          cpfCnpj: cleanCpf,
          phone: buyerProfile.phone || undefined,
        }),
      });
      const cd = await cr.json();
      customerId = cd?.id || null;
    }
    if (!customerId) {
      await admin.from("transactions").update({ status: "failed", metadata: { reason: "asaas_customer_failed" } }).eq("id", txId);
      return json({ success: false, error: "Falha ao criar cliente" }, 502);
    }

    // 8) Resolver walletId OFICIAL server-side (ignora qualquer hint do client)
    const clientHintWallet = body.creatorWalletId?.trim() || null;
    const officialWalletId = await resolveOfficialWalletId(admin, creatorProfile.id);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const ua = req.headers.get("user-agent") || null;

    if (clientHintWallet && officialWalletId && clientHintWallet !== officialWalletId) {
      await auditWalletMismatch(admin, {
        userId: buyerAuthId,
        clientWalletId: clientHintWallet,
        officialWalletId,
        sellerProfileId: creatorProfile.id,
        postId: post.id,
        ip,
        userAgent: ua,
        reason: "client_wallet_id_does_not_match_official",
      });
    } else if (clientHintWallet && !officialWalletId) {
      await auditWalletMismatch(admin, {
        userId: buyerAuthId,
        clientWalletId: clientHintWallet,
        officialWalletId: null,
        sellerProfileId: creatorProfile.id,
        postId: post.id,
        ip,
        userAgent: ua,
        reason: "client_provided_wallet_but_creator_has_none",
      });
    }

    // 9) Criar payment ASAAS (com split nativo quando wallet oficial existir)
    const due = new Date();
    due.setDate(due.getDate() + 1);
    const payload: any = {
      customer: customerId,
      value: price,
      dueDate: due.toISOString().split("T")[0],
      description: `Conteúdo VIP — ${creatorProfile.username ?? creatorProfile.name ?? "criador"}`,
      externalReference: txId,
    };

    // Split ASAAS nativo — usa SOMENTE walletId oficial (resolvido do banco).
    // Constantes do split (alinhadas ao padrão da plataforma):
    //   imposto 6% → plataforma 20% → afiliado 5% (do líquido) → criador (resto)
    if (officialWalletId) {
      const TAX = 0.06;
      const PLATFORM = 0.20;
      const AFFILIATE = 0.05;
      const net = price * (1 - TAX);
      const platformCut = net * PLATFORM;
      const affiliateCut = affiliateId ? net * AFFILIATE : 0;
      const creatorCut = Math.round((net - platformCut - affiliateCut) * 100) / 100;
      payload.split = [
        { walletId: officialWalletId, fixedValue: creatorCut },
      ];
    }

    if (body.payment_method === "pix") {
      payload.billingType = "PIX";
    } else {
      if (!body.card) {
        await admin.from("transactions").update({ status: "failed" }).eq("id", txId);
        return json({ success: false, error: "Dados do cartão ausentes" }, 400);
      }
      payload.billingType = "CREDIT_CARD";
      payload.creditCard = {
        holderName: body.card.holderName,
        number: body.card.number.replace(/\s/g, ""),
        expiryMonth: body.card.expiryMonth,
        expiryYear: body.card.expiryYear,
        ccv: body.card.ccv,
      };
      payload.creditCardHolderInfo = {
        name: buyerProfile.name || "Cliente",
        email: buyerProfile.email || "cliente@oculto.app",
        cpfCnpj: cleanCpf,
        postalCode: "00000000",
        addressNumber: "0",
        phone: buyerProfile.phone || "",
      };
      payload.remoteIp =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "127.0.0.1";
      if (body.card.installments && body.card.installments > 1) {
        payload.installmentCount = body.card.installments;
        payload.installmentValue = Math.round((price / body.card.installments) * 100) / 100;
      }
    }

    const pr = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers: { access_token: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const pd = await pr.json();
    if (!pd?.id) {
      console.error("[create-paid-content-checkout] asaas error:", pd);
      await admin.from("transactions").update({
        status: "failed",
        metadata: { asaas_error: pd?.errors?.[0]?.description || pd?.message || "unknown" },
      }).eq("id", txId);
      return json({ success: false, error: pd?.errors?.[0]?.description || "Falha na cobrança", details: pd }, 402);
    }

    // 9) Persiste external_id e devolve QR/status
    await admin.from("transactions")
      .update({ external_id: pd.id, metadata: { asaas_status: pd.status, payment_method: body.payment_method, seller_profile_id: creatorProfile.id, client_wallet_hint: clientHintWallet, official_wallet_id: officialWalletId } })
      .eq("id", txId);

    let qr_code: string | null = null;
    let qr_code_base64: string | null = null;
    if (body.payment_method === "pix") {
      const qr = await fetch(`${baseUrl}/payments/${pd.id}/pixQrCode`, { headers: { access_token: apiKey } });
      const qrData = await qr.json();
      qr_code = qrData?.payload ?? null;
      qr_code_base64 = qrData?.encodedImage ?? null;
    }

    return json({
      success: true,
      transaction_id: txId,
      payment_id: pd.id,
      status: pd.status,
      payment_method: body.payment_method,
      qr_code,
      qr_code_base64,
      invoice_url: pd.invoiceUrl ?? null,
      affiliate_applied: !!affiliateId,
      affiliate_source: affiliateSource,
      affiliate_rejected_reason: affiliateRejected,
      amount: price,
    });
  } catch (e) {
    console.error("[create-paid-content-checkout] unhandled:", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
