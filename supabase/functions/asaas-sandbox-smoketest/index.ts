// asaas-sandbox-smoketest
// Smoke test do gateway ASAAS em sandbox: cria customer + cobrança PIX,
// valida resposta e devolve relatório. Admin-only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_SANDBOX = 'https://sandbox.asaas.com/api/v3';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status,
    });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    // Admin-only
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const anon = createClient(supabaseUrl, anonKey);
    const { data: u, error: ue } = await anon.auth.getUser(token);
    if (ue || !u?.user) return json({ error: 'Unauthorized' }, 401);
    const { data: roles } = await supabase
      .from('user_roles').select('role').eq('user_id', u.user.id);
    const isAdmin = (roles ?? []).some((r: any) =>
      ['admin_master', 'admin_regional'].includes(r.role));
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    // Lê chave sandbox da config
    const { data: cfg } = await supabase
      .from('pix_gateway_config')
      .select('asaas_api_key, sandbox_mode')
      .maybeSingle();

    const apiKey = cfg?.asaas_api_key || Deno.env.get('ASAAS_SANDBOX_API_KEY');
    if (!apiKey) return json({ ok: false, error: 'Sandbox API key não configurada' }, 400);
    if (cfg && !cfg.sandbox_mode) {
      return json({ ok: false, error: 'sandbox_mode=false. Habilite sandbox antes de rodar o smoke test.' }, 400);
    }

    const steps: any[] = [];
    const headers = { 'Content-Type': 'application/json', access_token: apiKey };

    // 1) Criar customer sintético
    const cpfRand = String(Math.floor(10000000000 + Math.random() * 89999999999));
    const custRes = await fetch(`${ASAAS_SANDBOX}/customers`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: 'Smoke Test Oculto', cpfCnpj: cpfRand, email: `smoke+${Date.now()}@oculto.test` }),
    });
    const customer = await custRes.json();
    steps.push({ step: 'create_customer', ok: custRes.ok, id: customer?.id, status: custRes.status });
    if (!custRes.ok) return json({ ok: false, steps }, 502);

    // 2) Criar cobrança PIX
    const due = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    const payRes = await fetch(`${ASAAS_SANDBOX}/payments`, {
      method: 'POST', headers,
      body: JSON.stringify({
        customer: customer.id, billingType: 'PIX', value: 1.00,
        dueDate: due, description: 'Smoke test ASAAS sandbox',
        externalReference: `smoke_${Date.now()}`,
      }),
    });
    const payment = await payRes.json();
    steps.push({ step: 'create_pix_charge', ok: payRes.ok, id: payment?.id, status: payRes.status });
    if (!payRes.ok) return json({ ok: false, steps }, 502);

    // 3) Buscar QR PIX
    const qrRes = await fetch(`${ASAAS_SANDBOX}/payments/${payment.id}/pixQrCode`, { headers });
    const qr = await qrRes.json();
    steps.push({
      step: 'fetch_pix_qrcode', ok: qrRes.ok, status: qrRes.status,
      hasPayload: !!qr?.payload, hasEncoded: !!qr?.encodedImage,
    });

    return json({
      ok: steps.every((s) => s.ok),
      env: 'sandbox',
      summary: 'Smoke test ASAAS sandbox completo',
      payment_id: payment?.id,
      customer_id: customer?.id,
      steps,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
