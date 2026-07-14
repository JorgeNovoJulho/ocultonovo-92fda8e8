/**
 * asaas-update-subscription
 * Atualiza valor / ciclo / billingType da assinatura ASAAS.
 * Body: { subscription_id?: string, cycle?: 'MONTHLY'|'YEARLY', value?: number, billing_type?: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ASAAS_BASE = (Deno.env.get('ASAAS_API_BASE') || 'https://api.asaas.com/v3').replace(/\/$/, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('EXTERNAL_SUPABASE_URL')!, Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!);
    const asaasKey = Deno.env.get('ASAAS_API_KEY')!;

    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: userData } = await supabase.auth.getUser(token);
    const authUser = userData?.user;
    if (!authUser) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));

    const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', authUser.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let q = supabase.from('oculto_asaas_subscriptions').select('*').eq('user_id', profile.id);
    if (body.subscription_id) q = q.eq('id', body.subscription_id);
    else q = q.in('status', ['active', 'overdue', 'pending']).order('created_at', { ascending: false }).limit(1);
    const { data: sub } = await q.maybeSingle();
    if (!sub?.asaas_subscription_id)
      return new Response(JSON.stringify({ error: 'Subscription not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const patch: Record<string, unknown> = {};
    if (body.cycle && ['MONTHLY', 'YEARLY'].includes(body.cycle)) patch.cycle = body.cycle;
    if (typeof body.value === 'number' && body.value > 0) patch.value = body.value;
    if (body.billing_type) patch.billingType = body.billing_type;

    const res = await fetch(`${ASAAS_BASE}/subscriptions/${sub.asaas_subscription_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: asaasKey },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Asaas update error', details: json }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: updated } = await supabase
      .from('oculto_asaas_subscriptions')
      .update({
        cycle: patch.cycle ?? sub.cycle,
        value: patch.value ?? sub.value,
        metadata: { ...(sub.metadata || {}), billingType: patch.billingType ?? (sub.metadata as any)?.billingType },
      })
      .eq('id', sub.id)
      .select()
      .single();

    return new Response(JSON.stringify({ subscription: updated, asaas: json }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
