// create-asaas-subaccount — cria subconta ASAAS automaticamente para o criador
// Banco-alvo: Supabase EXTERNO. verify_jwt = false (validação manual).
// Criador NUNCA vê chave/api do ASAAS. Admin Master controla.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BodyHints {
  // Apenas hints — server resolve do banco quando possível.
  income_value?: number;
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const ANON_KEY    = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: u, error: uErr } = await userClient.auth.getUser(token);
    if (uErr || !u?.user) return json(401, { error: "Invalid token" });
    const userId = u.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as BodyHints;

    // 1) Já existe subconta? Retorna sem recriar (idempotente).
    const { data: existing } = await admin
      .from("oculto_asaas_subaccounts")
      .select("id, wallet_id, asaas_account_id, status, kyc_status, onboarding_url, last_error")
      .eq("creator_id", userId)
      .maybeSingle();

    if (existing?.wallet_id) {
      return json(200, {
        success: true,
        already_exists: true,
        wallet_id: existing.wallet_id,
        asaas_account_id: existing.asaas_account_id,
        status: existing.status,
        kyc_status: existing.kyc_status,
        onboarding_url: existing.onboarding_url,
      });
    }

    // 2) Carrega perfil + payout_profile (KYC/dados)
    const { data: profile } = await admin
      .from("profiles")
      .select("id, user_id, plan_type, monetization_status, payout_frozen, document_verified, asaas_wallet_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) return json(404, { success: false, error: "Perfil não encontrado" });

    // 3) Permissão: VIP ou monetização aprovada
    const planType = String(profile.plan_type || "").toLowerCase();
    const monetOk = profile.monetization_status === "approved" && !profile.payout_frozen;
    const isVipOrCreator = ["vip", "creator", "vip_creator"].includes(planType) || monetOk;
    if (!isVipOrCreator) {
      return json(403, {
        success: false,
        error: "Apenas criadores VIP ou com monetização aprovada podem ativar recebimentos.",
      });
    }

    // 4) Carrega creator_payout_profiles
    const { data: payout } = await admin
      .from("creator_payout_profiles")
      .select("*")
      .eq("creator_id", userId)
      .maybeSingle();

    if (!payout) {
      return json(400, {
        success: false,
        error: "Cadastro de monetização incompleto. Preencha o onboarding primeiro.",
      });
    }

    // 5) KYC aprovado
    const kycApproved =
      payout.kyc_status === "approved" ||
      payout.monetization_status === "approved" ||
      profile.document_verified === true;
    if (!kycApproved) {
      return json(403, {
        success: false,
        error: "KYC ainda não aprovado. Aguarde a verificação para ativar recebimentos.",
      });
    }

    // 6) Config ASAAS (mesma fonte do pix-gateway)
    const { data: cfg } = await admin
      .from("pix_gateway_config")
      .select("*")
      .maybeSingle();

    if (!cfg?.api_key_encrypted) {
      return json(400, { success: false, error: "Gateway de pagamento não configurado." });
    }

    const baseUrl = (cfg as any).sandbox_mode
      ? "https://sandbox.asaas.com/api/v3"
      : "https://api.asaas.com/v3";
    const apiKey = (cfg as any).api_key_encrypted;

    // 7) Monta payload ASAAS /v3/accounts
    const cleanDoc = String(payout.document_number || "").replace(/\D/g, "");
    const cleanPhone = String(payout.phone || "").replace(/\D/g, "");
    const accountPayload: Record<string, unknown> = {
      name: payout.full_name || u.user.email,
      email: payout.email || u.user.email,
      cpfCnpj: cleanDoc,
      mobilePhone: cleanPhone || undefined,
      birthDate: payout.birth_date || undefined,
      personType: payout.person_type === "PJ" ? "JURIDICA" : "FISICA",
      companyType: payout.person_type === "PJ" ? "LIMITED" : undefined,
      incomeValue: body.income_value ?? 5000,
      address: payout.address_street || undefined,
      addressNumber: payout.address_number || undefined,
      complement: payout.address_complement || undefined,
      province: payout.address_neighborhood || undefined,
      postalCode: (payout.address_cep || "").replace(/\D/g, "") || undefined,
    };

    // Remove undefined
    for (const k of Object.keys(accountPayload)) {
      if (accountPayload[k] === undefined || accountPayload[k] === null || accountPayload[k] === "") {
        delete accountPayload[k];
      }
    }

    if (!accountPayload.name || !accountPayload.email || !accountPayload.cpfCnpj) {
      return json(400, {
        success: false,
        error: "Dados de cadastro incompletos (nome, e-mail e CPF/CNPJ obrigatórios).",
      });
    }

    // 8) POST /v3/accounts
    const apiRes = await fetch(`${baseUrl}/accounts`, {
      method: "POST",
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Oculto/1.0",
      },
      body: JSON.stringify(accountPayload),
    });
    const apiData = await apiRes.json().catch(() => ({}));

    if (!apiRes.ok || !apiData?.walletId) {
      const errMsg = apiData?.errors?.[0]?.description || apiData?.error || "Falha ao criar subconta no gateway.";
      // Persiste a tentativa para debug do admin
      await admin.from("oculto_asaas_subaccounts").upsert({
        creator_id: userId,
        status: "rejected",
        kyc_status: "rejected",
        last_error: errMsg,
        raw_response: apiData,
      }, { onConflict: "creator_id" });

      return json(502, { success: false, error: errMsg, gateway_response: apiData });
    }

    const walletId: string = apiData.walletId;
    const accountId: string | null = apiData.id || null;
    const onboardingUrl: string | null = apiData.onboardingUrl || apiData.linkAcceptanceTerm || null;
    const subAccountApiKey: string | null = apiData.apiKey || null;

    // 9) Persiste subconta (api_key fica server-only)
    await admin.from("oculto_asaas_subaccounts").upsert({
      creator_id: userId,
      asaas_account_id: accountId,
      wallet_id: walletId,
      api_key_encrypted: subAccountApiKey,
      status: "active",
      kyc_status: "approved",
      onboarding_url: onboardingUrl,
      income_value: accountPayload.incomeValue,
      raw_response: apiData,
      last_error: null,
    }, { onConflict: "creator_id" });

    // 10) Atualiza profiles.asaas_wallet_id
    await admin.from("profiles").update({ asaas_wallet_id: walletId }).eq("user_id", userId);

    // 11) Atualiza creator_pricing_config.asaas_wallet_id (se existir)
    try {
      // Tenta por user_id
      const { error: e1 } = await admin
        .from("creator_pricing_config")
        .update({ asaas_wallet_id: walletId })
        .eq("user_id", userId);
      if (e1) {
        // fallback profile_id
        await admin
          .from("creator_pricing_config")
          .update({ asaas_wallet_id: walletId })
          .eq("profile_id", profile.id);
      }
    } catch (e) {
      console.warn("[create-asaas-subaccount] creator_pricing_config update skipped:", (e as Error).message);
    }

    // 12) Audit log
    try {
      await admin.from("audit_logs").insert({
        admin_id: userId,
        action: "create_asaas_subaccount",
        action_type: "create_asaas_subaccount",
        target_resource: "oculto_asaas_subaccounts",
        details: {
          asaas_account_id: accountId,
          wallet_id: walletId,
          sandbox: !!(cfg as any).sandbox_mode,
        },
      });
    } catch (_) { /* best-effort */ }

    return json(200, {
      success: true,
      wallet_id: walletId,
      asaas_account_id: accountId,
      status: "active",
      kyc_status: "approved",
      onboarding_url: onboardingUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    console.error("[create-asaas-subaccount] error:", msg);
    return json(500, { success: false, error: msg });
  }
});
