/**
 * asaas-create-subscription
 * Cria assinatura recorrente nativa no ASAAS para Premium ou VIP.
 * Body: { plan_type: 'premium'|'vip', cycle: 'MONTHLY'|'YEARLY', billing_type?: 'PIX'|'CREDIT_CARD' }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ASAAS_BASE = (Deno.env.get('ASAAS_API_BASE') || 'https://api.asaas.com/v3').replace(/\/$/, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // === BETA CONTROL ===
  const __betaBlock = await assertPlatformFeature('subscriptions');
  if (__betaBlock) return betaBlockedResponse(__betaBlock, corsHeaders);
  // ====================

  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supaUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const asaasKey = Deno.env.get('ASAAS_API_KEY')!;

    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(supaUrl, serviceKey);
    const { data: userData } = await supabase.auth.getUser(token);
    const authUser = userData?.user;
    if (!authUser) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const planType: 'premium' | 'vip' = body.plan_type === 'vip' ? 'vip' : 'premium';
    const cycle: 'MONTHLY' | 'YEARLY' = body.cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
    const billingType: string = body.billing_type || 'PIX';

    // perfil + config
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, username, email, cpf, phone, asaas_customer_id')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: cfg } = await supabase.from('oculto_subscription_settings').select('*').eq('id', 1).maybeSingle();
    const value =
      planType === 'vip'
        ? (cycle === 'YEARLY' ? cfg?.vip_yearly_value : cfg?.vip_monthly_value)
        : (cycle === 'YEARLY' ? cfg?.premium_yearly_value : cfg?.premium_monthly_value);

    if (!value) return new Response(JSON.stringify({ error: 'Plan value not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // já existe assinatura ativa?
    const { data: existing } = await supabase
      .from('oculto_asaas_subscriptions')
      .select('*')
      .eq('user_id', profile.id)
      .in('status', ['active', 'pending', 'overdue'])
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ subscription: existing, reused: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // garante customer no ASAAS
    let asaasCustomerId = profile.asaas_customer_id;
    if (!asaasCustomerId) {
      const customerRes = await fetch(`${ASAAS_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', access_token: asaasKey },
        body: JSON.stringify({
          name: profile.full_name || profile.username || authUser.email,
          email: profile.email || authUser.email,
          cpfCnpj: profile.cpf || undefined,
          mobilePhone: profile.phone || undefined,
          externalReference: profile.id,
        }),
      });
      const customerJson = await customerRes.json();
      if (!customerRes.ok) {
        return new Response(JSON.stringify({ error: 'Asaas customer error', details: customerJson }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      asaasCustomerId = customerJson.id;
      await supabase.from('profiles').update({ asaas_customer_id: asaasCustomerId }).eq('id', profile.id);
    }

    const today = new Date();
    today.setDate(today.getDate() + 1);
    const nextDue = today.toISOString().slice(0, 10);

    const subRes = await fetch(`${ASAAS_BASE}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: asaasKey },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType,
        cycle,
        value,
        nextDueDate: nextDue,
        description: `Plano ${planType.toUpperCase()} ${cycle === 'YEARLY' ? 'Anual' : 'Mensal'} — Oculto`,
        externalReference: profile.id,
      }),
    });
    const subJson = await subRes.json();
    if (!subRes.ok) {
      return new Response(JSON.stringify({ error: 'Asaas subscription error', details: subJson }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: inserted } = await supabase
      .from('oculto_asaas_subscriptions')
      .insert({
        user_id: profile.id,
        plan_type: planType,
        cycle,
        value,
        asaas_customer_id: asaasCustomerId,
        asaas_subscription_id: subJson.id,
        next_due_date: subJson.nextDueDate || nextDue,
        status: 'pending',
        metadata: { billingType },
      })
      .select()
      .single();

    return new Response(JSON.stringify({ subscription: inserted, asaas: subJson }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
