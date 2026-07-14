import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { share_code, referrer_id, promotion_id, session_hash, confirmed_age } = await req.json();

    if (!share_code) {
      return new Response(JSON.stringify({ error: 'share_code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hash IP for privacy (no raw IP stored)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16));

    const userAgent = req.headers.get('user-agent')?.slice(0, 200) || null;

    const { data, error } = await supabase
      .from('share_click_tracking')
      .insert({
        share_code,
        referrer_id: referrer_id || null,
        promotion_id: promotion_id || null,
        session_hash: session_hash || null,
        ip_hash: ipHash,
        user_agent: userAgent,
        confirmed_age: confirmed_age || false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Track click error:', error);
      throw error;
    }

    console.log(`📊 Click tracked: ${share_code}`);

    return new Response(JSON.stringify({ success: true, click_id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ track-share-click error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
