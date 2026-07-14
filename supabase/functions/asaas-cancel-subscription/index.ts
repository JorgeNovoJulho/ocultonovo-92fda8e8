/**
 * asaas-cancel-subscription
 * Cancela assinatura recorrente ASAAS do usuário autenticado.
 * Body: { subscription_id?: string }  // se omitido, cancela a ativa
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
    if (!sub) return new Response(JSON.stringify({ error: 'Subscription not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (sub.asaas_subscription_id) {
      const res = await fetch(`${ASAAS_BASE}/subscriptions/${sub.asaas_subscription_id}`, {
        method: 'DELETE',
        headers: { access_token: asaasKey },
      });
      if (!res.ok && res.status !== 404) {
        const j = await res.json().catch(() => ({}));
        return new Response(JSON.stringify({ error: 'Asaas cancel error', details: j }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { data: updated } = await supabase
      .from('oculto_asaas_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), last_event: 'CANCELLED_BY_USER' })
      .eq('id', sub.id)
      .select()
      .single();

    // mantém acesso até next_due_date; downgrade real ocorre no webhook OVERDUE/SUSPEND
    return new Response(JSON.stringify({ subscription: updated }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
