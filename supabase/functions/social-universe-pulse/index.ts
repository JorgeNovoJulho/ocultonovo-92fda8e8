/**
 * social-universe-pulse — Onda D
 *
 * Edge function chamada por cron (sugestão: cada 5 min) que invoca
 * `public.social_universe_emit_pulse()` no Supabase EXTERNO. A RPC é
 * idempotente: só insere eventos no Feed Vivo quando não há entrada
 * recente do mesmo source.
 *
 * Headers:
 *  - x-cron-secret: opcional, se SOCIAL_PULSE_SECRET estiver configurado.
 *
 * Resposta: { ok: boolean, inserted: number, ts: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const EXTERNAL_URL = 'https://rvybbrkzmboqbhcemqar.supabase.co';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Proteção opcional por segredo
  const expectedSecret = Deno.env.get('SOCIAL_PULSE_SECRET');
  if (expectedSecret) {
    const provided = req.headers.get('x-cron-secret');
    if (provided !== expectedSecret) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const serviceKey =
    Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!serviceKey) {
    return new Response(
      JSON.stringify({ ok: false, error: 'missing service role key' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(EXTERNAL_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('social_universe_emit_pulse');

  if (error) {
    console.error('[social-universe-pulse] rpc error', error.message);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, ...(data as object) }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
