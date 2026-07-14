// supabase/functions/create-super-dm-payment/index.ts
// Cria cobrança Asaas (PIX ou cartão) de R$ 4,99 para Super DM (Aura Match).
// 100% para a plataforma — sem split.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPER_DM_AMOUNT = 4.99;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // === BETA CONTROL ===
  const __betaBlock = await assertPlatformFeature('monetization');
  if (__betaBlock) return betaBlockedResponse(__betaBlock, corsHeaders);
  // ====================


  try {
    const supabase = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claims.claims.sub;

    const body = await req.json().catch(() => ({}));
    const action = body.action || "create"; // create | check
    const service = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const asaasKey = Deno.env.get("ASAAS_API_KEY") || Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const isSandbox = Deno.env.get("ASAAS_SANDBOX") === "true";
    const asaasBase = isSandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/v3";

    // -------- CHECK STATUS --------
    if (action === "check") {
      const { payment_id } = body;
      if (!payment_id) return new Response(JSON.stringify({ error: "payment_id obrigatório" }), { status: 400, headers: corsHeaders });
      const { data: rec } = await service
        .from("super_dm_payments")
        .select("id, status, sender_user_id, sender_profile_id, target_profile_id, asaas_charge_id, paid_at")
        .eq("id", payment_id)
        .maybeSingle();
      if (!rec || rec.sender_user_id !== userId) {
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: corsHeaders });
      }
      if (rec.status === "paid") {
        return new Response(JSON.stringify({ status: "paid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!rec.asaas_charge_id) {
        return new Response(JSON.stringify({ status: rec.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const r = await fetch(`${asaasBase}/payments/${rec.asaas_charge_id}`, { headers: { access_token: asaasKey! } });
      const j = await r.json();
      const paid = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(j.status);
      if (paid) {
        await service.from("super_dm_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", payment_id);
        // Persist super_like
        await service.from("perfect_pair_actions").upsert(
          {
            user_id: rec.sender_profile_id,
            target_id: rec.target_profile_id,
            action_type: "super_like",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,target_id" },
        );
        await service.from("perfect_pairs").insert({
          user_id: rec.sender_profile_id,
          target_id: rec.target_profile_id,
          action: "super_like",
        }).then(() => {}, () => {});

        // Notify target (resolve auth user id)
        const { data: targetProf } = await service
          .from("profiles")
          .select("user_id, name")
          .eq("id", rec.target_profile_id)
          .maybeSingle();
        const { data: senderProf } = await service
          .from("profiles")
          .select("name, avatar_url")
          .eq("id", rec.sender_profile_id)
          .maybeSingle();
        if (targetProf?.user_id) {
          await service.from("notifications").insert({
            user_id: targetProf.user_id,
            type: "super_like_received",
            title: `${senderProf?.name || "Alguém"} enviou um Super DM 💎`,
            body: "Toque para ver e confirmar o match.",
            data: {
              sender_profile_id: rec.sender_profile_id,
              sender_name: senderProf?.name || null,
              sender_avatar: senderProf?.avatar_url || null,
            },
          } as any);
        }
        return new Response(JSON.stringify({ status: "paid" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ status: rec.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // -------- CREATE --------
    const { target_profile_id, payment_method, card, payer } = body;
    if (!target_profile_id) {
      return new Response(JSON.stringify({ error: "target_profile_id obrigatório" }), { status: 400, headers: corsHeaders });
    }
    const method = payment_method === "card" ? "card" : "pix";

    // sender profile (inclui cpf salvo no perfil, se houver)
    const { data: senderProfile } = await service
      .from("profiles")
      .select("id, name, user_id, cpf")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();
    if (!senderProfile?.id) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), { status: 400, headers: corsHeaders });
    }

    const { data: authUser } = await service.auth.admin.getUserById(userId);
    const email = authUser?.user?.email || "user@oculto.app";
    const name = (payer?.name || senderProfile.name || "Usuário").toString().trim();

    // CPF é obrigatório no Asaas para criar customer e gerar PIX/cartão
    const cpfDigits = String(payer?.cpf || (senderProfile as any).cpf || card?.cpf || "")
      .replace(/\D+/g, "");
    if (cpfDigits.length !== 11) {
      return new Response(
        JSON.stringify({ error: "CPF inválido. Informe um CPF de 11 dígitos para gerar o pagamento." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persiste o CPF no perfil para próximas cobranças (não bloqueia em caso de erro)
    if (!(senderProfile as any).cpf) {
      await service.from("profiles").update({ cpf: cpfDigits }).eq("id", senderProfile.id).then(() => {}, () => {});
    }

    // Asaas customer (busca por email; cria com CPF se não existir)
    let customerId: string | null = null;
    const listRes = await fetch(`${asaasBase}/customers?email=${encodeURIComponent(email)}`, { headers: { access_token: asaasKey! } });
    const listData = await listRes.json().catch(() => ({}));
    if (listData?.data?.length > 0) {
      customerId = listData.data[0].id;
      // Se o customer existir sem cpfCnpj, atualiza
      if (!listData.data[0].cpfCnpj) {
        await fetch(`${asaasBase}/customers/${customerId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", access_token: asaasKey! },
          body: JSON.stringify({ cpfCnpj: cpfDigits, name }),
        }).catch(() => {});
      }
    } else {
      const cRes = await fetch(`${asaasBase}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: asaasKey! },
        body: JSON.stringify({ name, email, cpfCnpj: cpfDigits, notificationDisabled: true }),
      });
      const cData = await cRes.json();
      if (!cRes.ok) {
        return new Response(
          JSON.stringify({ error: cData?.errors?.[0]?.description || "Falha ao criar cliente Asaas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      customerId = cData.id;
    }
    if (!customerId) throw new Error("Falha ao criar cliente Asaas");


    // Create record first (so we have id)
    const { data: rec, error: recErr } = await service
      .from("super_dm_payments")
      .insert({
        sender_user_id: userId,
        sender_profile_id: senderProfile.id,
        target_profile_id,
        amount: SUPER_DM_AMOUNT,
        payment_method: method,
        status: "pending",
      })
      .select("id")
      .single();
    if (recErr || !rec) throw new Error(recErr?.message || "Falha ao registrar pagamento");

    // Create Asaas payment
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const payload: any = {
      customer: customerId,
      value: SUPER_DM_AMOUNT,
      description: "Super DM — Aura Match",
      dueDate,
      externalReference: rec.id,
    };
    if (method === "pix") {
      payload.billingType = "PIX";
    } else {
      payload.billingType = "CREDIT_CARD";
      if (card) {
        payload.creditCard = {
          holderName: card.holder_name,
          number: card.number?.replace(/\s/g, ""),
          expiryMonth: card.expiry_month,
          expiryYear: card.expiry_year,
          ccv: card.cvv,
        };
        payload.creditCardHolderInfo = {
          name,
          email,
          cpfCnpj: cpfDigits,
          postalCode: card.postal_code || "01310100",
          addressNumber: card.address_number || "0",
          phone: card.phone || "11999999999",
        };
      }
    }

    const pRes = await fetch(`${asaasBase}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: asaasKey! },
      body: JSON.stringify(payload),
    });
    const pData = await pRes.json();
    if (!pRes.ok) {
      await service.from("super_dm_payments").update({ status: "failed" }).eq("id", rec.id);
      return new Response(JSON.stringify({ error: pData?.errors?.[0]?.description || "Erro ao criar cobrança" }), { status: 400, headers: corsHeaders });
    }

    await service.from("super_dm_payments").update({ asaas_charge_id: pData.id }).eq("id", rec.id);

    // For PIX, get QR code
    let qr: any = null;
    if (method === "pix") {
      const qRes = await fetch(`${asaasBase}/payments/${pData.id}/pixQrCode`, { headers: { access_token: asaasKey! } });
      qr = await qRes.json();
    }

    // For credit card, Asaas confirms instantly when status is CONFIRMED/RECEIVED
    const cardPaid = method === "card" && ["CONFIRMED", "RECEIVED"].includes(pData.status);
    if (cardPaid) {
      // mimic the check-status path
      await fetch(req.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization")! },
        body: JSON.stringify({ action: "check", payment_id: rec.id }),
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        payment_id: rec.id,
        method,
        status: cardPaid ? "paid" : "pending",
        qr_code_base64: qr?.encodedImage || null,
        copy_paste: qr?.payload || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    console.error("create-super-dm-payment error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
