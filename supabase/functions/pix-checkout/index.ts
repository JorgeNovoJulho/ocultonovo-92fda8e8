import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * pix-checkout — gera cobrança PIX ASAAS para conteúdo pago (post/creator).
 *
 * Regras críticas (PROMPT 8):
 *  - ASAAS_API_KEY é obrigatório. NUNCA usar ASAAS_WEBHOOK_TOKEN como fallback.
 *  - Sandbox lido de pix_gateway_config.sandbox_mode (fonte única de verdade,
 *    igual à pix-gateway). Se não houver config, usa ASAAS_SANDBOX env.
 *  - Idempotência: se já existir payments_log pendente recente para o mesmo
 *    user+post+amount nos últimos 25min, reutiliza (não duplica cobrança).
 *  - Insert em payments_log com onConflict(external_id) para barrar duplicatas
 *    a nível de banco (índice único parcial).
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
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Validate user
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { post_id, creator_id, amount, description } = await req.json();

    if (!post_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Dados inválidos' }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    // === ASAAS API KEY (obrigatório, sem fallback inseguro) ===
    const asaasKey = Deno.env.get('ASAAS_API_KEY');
    if (!asaasKey) {
      console.error('[pix-checkout] ❌ ASAAS_API_KEY ausente — bloqueando');
      return new Response(JSON.stringify({
        error: 'Gateway PIX não configurado (ASAAS_API_KEY ausente).',
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === Sandbox: fonte única = pix_gateway_config.sandbox_mode ===
    let isSandbox = Deno.env.get('ASAAS_SANDBOX') === 'true';
    try {
      const { data: cfg } = await serviceClient
        .from('pix_gateway_config')
        .select('sandbox_mode, gateway_provider, is_active')
        .eq('gateway_provider', 'asaas')
        .maybeSingle();
      if (cfg && typeof cfg.sandbox_mode === 'boolean') {
        isSandbox = cfg.sandbox_mode;
      }
    } catch (e) {
      console.warn('[pix-checkout] pix_gateway_config indisponível, usando env ASAAS_SANDBOX');
    }
    const asaasBaseUrl = isSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';

    // === IDEMPOTÊNCIA: reaproveita cobrança pendente recente ===
    const sinceIso = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const { data: existing } = await serviceClient
      .from('payments_log')
      .select('id, external_id, metadata, amount, created_at')
      .eq('user_id', userId)
      .eq('post_id', post_id)
      .eq('amount', amount)
      .eq('status', 'pending')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.external_id) {
      try {
        const qrRes = await fetch(`${asaasBaseUrl}/payments/${existing.external_id}/pixQrCode`, {
          headers: { 'access_token': asaasKey },
        });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          return new Response(JSON.stringify({
            qr_code_base64: qrData.encodedImage,
            copy_paste: qrData.payload,
            payment_id: existing.external_id,
            reused: true,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }
      } catch (_) { /* segue para gerar nova */ }
    }

    // Get user email for Asaas customer
    const { data: userProfile } = await serviceClient
      .from('profiles')
      .select('name, user_id')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: authUser } = await serviceClient.auth.admin.getUserById(userId);
    const email = authUser?.user?.email || 'user@oculto.app';
    const name = userProfile?.name || 'Usuário';

    // Create or find Asaas customer
    const customerRes = await fetch(`${asaasBaseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
      body: JSON.stringify({ name, email, notificationDisabled: true }),
    });

    let customerId: string;
    if (customerRes.ok) {
      const customerData = await customerRes.json();
      customerId = customerData.id;
    } else {
      const listRes = await fetch(`${asaasBaseUrl}/customers?email=${encodeURIComponent(email)}`, {
        headers: { 'access_token': asaasKey },
      });
      const listData = await listRes.json();
      if (listData.data?.length > 0) {
        customerId = listData.data[0].id;
      } else {
        throw new Error('Não foi possível criar cliente no gateway');
      }
    }

    // Create PIX payment
    const paymentRes = await fetch(`${asaasBaseUrl}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': asaasKey },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'PIX',
        value: amount,
        description: description || 'Conteúdo exclusivo',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }),
    });

    if (!paymentRes.ok) {
      const errBody = await paymentRes.text();
      console.error('Asaas payment error:', errBody);
      throw new Error('Erro ao gerar cobrança PIX');
    }

    const paymentData = await paymentRes.json();
    const paymentId = paymentData.id;

    // Get QR Code
    const qrRes = await fetch(`${asaasBaseUrl}/payments/${paymentId}/pixQrCode`, {
      headers: { 'access_token': asaasKey },
    });

    if (!qrRes.ok) {
      throw new Error('Erro ao gerar QR Code');
    }

    const qrData = await qrRes.json();

    // Record in payments_log com upsert idempotente por external_id
    const { error: insertErr } = await serviceClient
      .from('payments_log')
      .upsert({
        user_id: userId,
        post_id,
        creator_id,
        amount,
        provider: 'pix',
        external_id: paymentId,
        status: 'pending',
        metadata: { description, asaas_customer: customerId, sandbox: isSandbox },
      }, { onConflict: 'external_id' });

    if (insertErr) {
      console.warn('[pix-checkout] payments_log upsert warn:', insertErr.message);
    }

    return new Response(JSON.stringify({
      qr_code_base64: qrData.encodedImage,
      copy_paste: qrData.payload,
      payment_id: paymentId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('pix-checkout error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
