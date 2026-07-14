import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminNotifPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
  record?: Record<string, unknown>;
  table?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use external Supabase (rvybbrkzmboqbhcemqar) where all data lives
    const externalUrl = 'https://rvybbrkzmboqbhcemqar.supabase.co';
    const externalServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(externalUrl, externalServiceKey);

    // 🔒 Auth: aceita service_role (DB webhooks/cron) OU admin autenticado
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const isServiceCall = token === externalServiceKey;
    if (!isServiceCall) {
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const anonClient = createClient(externalUrl, Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!);
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', userData.user.id);
      const isAdmin = (roles ?? []).some((r: { role: string }) =>
        ['admin_master', 'admin_regional', 'admin_marketing', 'moderator'].includes(r.role)
      );
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden: admin only' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const payload: AdminNotifPayload = await req.json();
    let { title, body, url, tag, type } = payload;

    // Auto-detect from DB webhook payloads
    if (payload.record && payload.table) {
      const rec = payload.record as Record<string, unknown>;
      if (payload.table === 'profiles' && rec.plan_type && rec.plan_type !== 'free') {
        title = '💳 Nova Assinatura';
        body = `${rec.name || 'Usuário'} assinou o plano ${String(rec.plan_type).toUpperCase()}`;
        url = '/admin/users';
        tag = 'admin-subscription';
        type = 'admin_subscription';
      } else if (payload.table === 'anonymous_reports') {
        const urgent = rec.is_urgent ? '🚨 URGENTE: ' : '';
        title = `${urgent}Nova Denúncia`;
        body = `Categoria: ${rec.category || 'Não informada'}`;
        url = '/admin/reports';
        tag = 'admin-report';
        type = 'admin_report';
      } else {
        return new Response(
          JSON.stringify({ success: true, skipped: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!title) {
      return new Response(
        JSON.stringify({ success: false, error: 'title is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get admin user IDs
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin_master', 'admin_regional', 'moderator']);

    const adminUserIds = (adminRoles || []).map((r: { user_id: string }) => r.user_id);
    if (adminUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No admins found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get push tokens for admins
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', adminUserIds);

    if (!tokens || tokens.length === 0) {
      // Still log the notification even without push tokens
      await supabase.from('admin_notifications').insert({
        title,
        body: body || '',
        type: type || 'admin_push',
        data: { url, sent: 0, failed: 0 } as Record<string, unknown>,
      });
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No admin push tokens' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get VAPID config
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['vapid_public_key', 'vapid_private_key']);

    const sm: Record<string, string> = {};
    (settings || []).forEach((s: { key: string; value: string }) => { sm[s.key] = s.value; });

    if (!sm['vapid_public_key'] || !sm['vapid_private_key']) {
      return new Response(
        JSON.stringify({ success: false, error: 'VAPID not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vapidPublicKey = sm['vapid_public_key'].replace(/"/g, '');
    const vapidPrivateKeyJwk = JSON.parse(sm['vapid_private_key']);

    // Build notification payload
    const notifPayload = JSON.stringify({
      title,
      body: body || '',
      url: url || '/admin',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: tag || `admin-${Date.now()}`,
      type: type || 'admin',
      requireInteraction: true,
      renotify: true,
      actions: [
        { action: 'open', title: 'Ver' },
        { action: 'dismiss', title: 'Fechar' },
      ],
    });

    // Send push to all admin tokens
    let sent = 0;
    let failed = 0;
    const expiredTokens: string[] = [];

    for (const { user_id, token } of tokens) {
      try {
        const subscription = JSON.parse(token);

        // Encrypt payload using Web Push encryption (RFC 8291)
        const encrypted = await encryptPushPayload(subscription, notifPayload);
        const vapidHeaders = await createVapidJwt(subscription.endpoint, vapidPrivateKeyJwk, vapidPublicKey);

        const res = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': vapidHeaders.authorization,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
          },
          body: encrypted,
        });

        if (res.ok || res.status === 201) {
          sent++;
          await supabase
            .from('push_tokens')
            .update({ last_used_at: new Date().toISOString() })
            .eq('user_id', user_id)
            .eq('token', token);
        } else {
          console.error(`[push] status=${res.status} endpoint=${subscription.endpoint}`);
          failed++;
          if (res.status === 410 || res.status === 404) {
            expiredTokens.push(token);
          }
        }
      } catch (err) {
        console.error('[push] send error', err);
        failed++;
      }
    }

    // Cleanup expired tokens
    for (const t of expiredTokens) {
      await supabase.from('push_tokens').delete().eq('token', t);
    }

    // Log notification
    await supabase.from('admin_notifications').insert({
      title,
      body: body || '',
      type: type || 'admin_push',
      data: { url, sent, failed } as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({ success: true, sent, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[send-admin-notification]', errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ── Web Push Encryption (RFC 8291 / aes128gcm) ─────────────────────────
async function encryptPushPayload(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);

  // Decode subscriber keys
  const p256dhBytes = base64urlToUint8Array(subscription.keys.p256dh);
  const authBytes = base64urlToUint8Array(subscription.keys.auth);

  // Import subscriber public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    p256dhBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Generate ephemeral key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey },
    localKeyPair.privateKey,
    256
  );

  const localPublicKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey);
  const localPublicKeyBytes = new Uint8Array(localPublicKeyRaw);

  // HKDF-based key derivation per RFC 8291
  const ikm = new Uint8Array(sharedSecret);
  const authInfo = encoder.encode('WebPush: info\0');
  const authInfoFull = new Uint8Array(authInfo.length + p256dhBytes.length + localPublicKeyBytes.length);
  authInfoFull.set(authInfo, 0);
  authInfoFull.set(p256dhBytes, authInfo.length);
  authInfoFull.set(localPublicKeyBytes, authInfo.length + p256dhBytes.length);

  // PRK = HKDF-Extract(auth_secret, ecdh_secret)
  const prkKey = await crypto.subtle.importKey('raw', authBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, ikm));

  // IKM for final keys = HKDF-Expand(PRK, info, 32)
  const ikmForKeys = await hkdfExpand(prk, authInfoFull, 32);

  // Content Encryption Key = HKDF(ikm_for_keys, salt, "Content-Encoding: aes128gcm\0", 16)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekInfo = encoder.encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = encoder.encode('Content-Encoding: nonce\0');

  const prkForCek = await hkdfExtract(salt, ikmForKeys);
  const cek = await hkdfExpand(prkForCek, cekInfo, 16);
  const nonce = await hkdfExpand(prkForCek, nonceInfo, 12);

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  
  // Add padding delimiter
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // padding delimiter

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    paddedPayload
  );

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = payloadBytes.length + 1 + 16; // record size = payload + padding + tag
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs + 86, false); // record size
  header[20] = localPublicKeyBytes.length;
  header.set(localPublicKeyBytes, 21);

  const result = new Uint8Array(header.length + encrypted.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(encrypted), header.length);

  return result;
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info, 0);
  infoWithCounter[info.length] = 1;
  const result = new Uint8Array(await crypto.subtle.sign('HMAC', key, infoWithCounter));
  return result.slice(0, length);
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(base64 + padding);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// ── VAPID JWT helper ────────────────────────────────────────────────────
async function createVapidJwt(
  endpoint: string,
  privateKeyJwk: JsonWebKey,
  publicKeyBase64: string
): Promise<{ authorization: string }> {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:push@ocultoswing.com.br',
  };

  const encode = (obj: unknown) => {
    const str = JSON.stringify(obj);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const unsignedToken = `${encode(header)}.${encode(payload)}`;
  const key = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { authorization: `vapid t=${unsignedToken}.${sigBase64}, k=${publicKeyBase64}` };
}
