import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * pix-checkout-economy — gera cobrança PIX ASAAS para produtos da Economia Social Premium.
 *
 * Fluxo:
 *  1. Valida usuário autenticado.
 *  2. Confirma elegibilidade via RPC social_economy_can_purchase(slug).
 *  3. Cria cobrança PIX no ASAAS.
 *  4. Registra purchase pendente via social_economy_purchase_create(slug, asaas_payment_id).
 *  5. Retorna QR Code. Webhook pix-webhook chamará social_economy_mark_paid.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === BETA CONTROL ===
  const __betaBlock = await assertPlatformFeature('paid_content');
  if (__betaBlock) return betaBlockedResponse(__betaBlock, corsHeaders);
  // ====================


  try {
    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;

    const { slug } = await req.json();
    if (!slug || typeof slug !== 'string') {
      return new Response(JSON.stringify({ error: 'slug obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // === Elegibilidade (cooldown / daily_limit / min_plan) ===
    const { data: canRes, error: canErr } = await supabase.rpc('social_economy_can_purchase', { p_slug: slug });
    if (canErr || !canRes || !(canRes as any).ok) {
      return new Response(JSON.stringify({
        error: (canRes as any)?.reason || canErr?.message || 'Compra não permitida',
        detail: canRes,
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const priceCents = Number((canRes as any).price_cents ?? 0);
    if (priceCents <= 0) {
      return new Response(JSON.stringify({ error: 'Produto sem preço configurado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const amount = Math.round(priceCents) / 100;

    // === ASAAS API KEY ===
    const asaasKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasKey) {
      return new Response(JSON.stringify({ error: 'Gateway PIX não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === Sandbox: pix_gateway_config ===
    let isSandbox = Deno.env.get('ASAAS_SANDBOX') === 'true';
    try {
      const { data: cfg } = await serviceClient
        .from('pix_gateway_config')
        .select('sandbox_mode')
        .eq('gateway_provider', 'asaas')
        .maybeSingle();
      if (cfg && typeof cfg.sandbox_mode === 'boolean') isSandbox = cfg.sandbox_mode;
    } catch (_) { /* segue env */ }
    const asaasBaseUrl = isSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';

    // === Cliente ASAAS (cria ou reutiliza por email) ===
    const { data: profile } = await serviceClient
      .from('profiles').select('name').eq('user_id', userId).maybeSingle();
    const { data: authUser } = await serviceClient.auth.admin.getUserById(userId);
    const email = authUser?.user?.email || `user_${userId}@oculto.app`;
    const name = (profile as any)?.name || 'Usuário';

    let customerId: string | null = null;
    const customerRes = await fetch(`${asaasBaseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
      body: JSON.stringify({ name, email, notificationDisabled: true }),
    });
    if (customerRes.ok) {
      customerId = (await customerRes.json()).id;
    } else {
      const listRes = await fetch(`${asaasBaseUrl}/customers?email=${encodeURIComponent(email)}`, {
        headers: { 'access_token': asaasKey },
      });
      const listData = await listRes.json();
      if (listData.data?.length) customerId = listData.data[0].id;
    }
    if (!customerId) throw new Error('Falha ao criar cliente no gateway');

    // === Cobrança PIX ===
    const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: amount,
        description: `Economia Social — ${slug}`,
        externalReference: `economy:${slug}:${userId}`,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }),
    });
    if (!paymentRes.ok) {
      const errBody = await paymentRes.text();
      console.error('[pix-checkout-economy] ASAAS payment error:', errBody);
      throw new Error('Erro ao gerar cobrança PIX');
    }
    const payment = await paymentRes.json();
    const paymentId = payment.id as string;

    // === Registra purchase (idempotente por asaas_payment_id) ===
    const { data: purchaseRes, error: purchaseErr } = await supabase.rpc(
      'social_economy_purchase_create',
      { p_slug: slug, p_asaas_payment_id: paymentId, p_meta: { sandbox: isSandbox } },
    );
    if (purchaseErr || !purchaseRes || !(purchaseRes as any).ok) {
      console.error('[pix-checkout-economy] purchase_create error:', purchaseErr, purchaseRes);
      // Cobrança já criada; webhook ainda pode reconciliar — não bloqueia QR.
    }

    // === QR Code ===
    const qrRes = await fetch(`${asaasBaseUrl}/payments/${paymentId}/pixQrCode`, {
      headers: { 'access_token': asaasKey },
    });
    if (!qrRes.ok) throw new Error('Erro ao gerar QR Code');
    const qr = await qrRes.json();

    return new Response(JSON.stringify({
      ok: true,
      payment_id: paymentId,
      purchase_id: (purchaseRes as any)?.purchase_id ?? null,
      slug,
      amount_cents: priceCents,
      qr_code_base64: qr.encodedImage,
      copy_paste: qr.payload,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    console.error('[pix-checkout-economy] error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro inesperado' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
