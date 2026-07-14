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
    // Use external Supabase (rvybbrkzmboqbhcemqar) where system_settings lives
    const externalUrl = 'https://rvybbrkzmboqbhcemqar.supabase.co';
    const externalServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(externalUrl, externalServiceKey);

    // 🔒 Admin-only
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const anonClient = createClient(externalUrl, Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!);
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roles } = await supabase
      .from('user_roles').select('role').eq('user_id', userData.user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) =>
      ['admin_master', 'admin_regional'].includes(r.role)
    );
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if VAPID keys already exist
    const { data: existing } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['vapid_public_key', 'vapid_private_key', 'vapid_enabled']);

    const settings: Record<string, string> = {};
    (existing || []).forEach((s: { key: string; value: string }) => { settings[s.key] = s.value; });

    if (settings['vapid_public_key'] && settings['vapid_private_key']) {
      return new Response(
        JSON.stringify({
          success: true,
          publicKey: settings['vapid_public_key'],
          alreadyExists: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new VAPID key pair
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    const xBytes = Uint8Array.from(atob(publicKeyJwk.x!.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const yBytes = Uint8Array.from(atob(publicKeyJwk.y!.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const uncompressed = new Uint8Array(65);
    uncompressed[0] = 0x04;
    uncompressed.set(xBytes, 1);
    uncompressed.set(yBytes, 33);
    const publicKeyBase64 = btoa(String.fromCharCode(...uncompressed))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const upserts = [
      { key: 'vapid_public_key', value: publicKeyBase64, category: 'push', description: 'VAPID Public Key (auto-generated)' },
      { key: 'vapid_private_key', value: JSON.stringify(privateKeyJwk), category: 'push', description: 'VAPID Private Key JWK (auto-generated)' },
      { key: 'vapid_enabled', value: 'true', category: 'push', description: 'Push notifications enabled' },
    ];

    for (const u of upserts) {
      const { error } = await supabase.from('system_settings').upsert(u, { onConflict: 'key' });
      if (error) {
        console.error(`[setup-vapid] Error upserting ${u.key}:`, error.message);
        throw error;
      }
    }

    console.log('[setup-vapid] VAPID keys generated and stored');

    return new Response(
      JSON.stringify({
        success: true,
        publicKey: publicKeyBase64,
        alreadyExists: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[setup-vapid]', errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
