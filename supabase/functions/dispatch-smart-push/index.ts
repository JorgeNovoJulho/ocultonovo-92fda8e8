/**
 * dispatch-smart-push
 * Central dispatcher for all intelligent push notification triggers:
 * - KYC approval / rejection
 * - Perfect Pair mutual match
 * - New chat message (E2EE safe: body is masked if encrypted)
 * - 30-day validation warnings (7 days / 24 hours)
 * - Admin global broadcast to all real users
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushEvent =
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'new_match'
  | 'new_message'
  | 'validation_warning_7d'
  | 'validation_warning_24h'
  | 'admin_broadcast';

interface DispatchPayload {
  event: PushEvent;
  // Target — one of user_id OR broadcast
  user_id?: string;
  broadcast?: boolean;            // admin only
  // Event-specific extras
  sender_name?: string;           // new_message
  is_encrypted?: boolean;         // new_message — masks body for E2EE
  conversation_id?: string;       // new_message — deep link
  match_username?: string;        // new_match
  // Admin broadcast
  broadcast_title?: string;
  broadcast_body?: string;
}

// ─── Build payload per event ──────────────────────────────────────────────────
function buildNotification(event: PushEvent, payload: DispatchPayload): {
  title: string; body: string; url: string; tag: string; requireInteraction: boolean; renotify: boolean;
} {
  switch (event) {
    case 'kyc_approved':
      return {
        title: '✅ Selo Oculto Aprovado!',
        body: 'Parabéns! O teu Selo Oculto foi aprovado. Explora agora todas as funções.',
        url: '/profile',
        tag: 'kyc-result',
        requireInteraction: true,
        renotify: false,
      };
    case 'kyc_rejected':
      return {
        title: '❌ Documento Reprovado',
        body: 'Os teus documentos não foram aprovados. Envie novamente para obter o Selo Oculto.',
        url: '/verify',
        tag: 'kyc-result',
        requireInteraction: true,
        renotify: false,
      };
    case 'new_match':
      return {
        title: '💞 Novo Match no Perfect Pair!',
        body: payload.match_username
          ? `Tens um novo Match com @${payload.match_username}! Clica para ver.`
          : 'Tens um novo Match no Perfect Pair! Clica para ver quem é.',
        url: '/matches',
        tag: 'match-notification',
        requireInteraction: false,
        renotify: true,
      };
    case 'new_message':
      return {
        title: payload.sender_name ? `💬 ${payload.sender_name}` : '💬 Nova mensagem',
        // E2EE: never expose message content in push
        body: payload.is_encrypted
          ? 'Nova mensagem recebida'
          : `${payload.sender_name || 'Alguém'} enviou-te uma mensagem`,
        url: payload.conversation_id
          ? `/inbox?conversation=${payload.conversation_id}`
          : '/inbox',
        // Group messages from the same conversation under same tag
        tag: `msg-${payload.conversation_id || 'inbox'}`,
        requireInteraction: false,
        renotify: true,
      };
    case 'validation_warning_7d':
      return {
        title: '⏰ 7 dias para validar a conta',
        body: 'Faltam apenas 7 dias para validares os teus documentos. Evita a restrição de acesso!',
        url: '/verify',
        tag: 'validation-warning',
        requireInteraction: true,
        renotify: false,
      };
    case 'validation_warning_24h':
      return {
        title: '🚨 Última chance: valida amanhã!',
        body: 'Tens apenas 24 horas para enviar os documentos de verificação.',
        url: '/verify',
        tag: 'validation-warning',
        requireInteraction: true,
        renotify: true,
      };
    case 'admin_broadcast':
      return {
        title: payload.broadcast_title || '📢 Aviso da plataforma',
        body: payload.broadcast_body || 'Tens uma nova mensagem da equipa Oculta.',
        url: '/',
        tag: 'admin-broadcast',
        requireInteraction: false,
        renotify: false,
      };
  }
}

// ─── VAPID helpers (copied from send-push-notification) ───────────────────────
async function createVapidJwt(
  endpoint: string,
  privateKeyJwk: JsonWebKey,
  publicKeyBase64: string,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const jwtPayload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:push@oculto.app',
  };
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsigned = `${encode(header)}.${encode(jwtPayload)}`;
  const key = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  );
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `vapid t=${unsigned}.${sigBase64}, k=${publicKeyBase64}`;
}

async function sendToToken(
  tokenStr: string,
  notifPayload: string,
  vapidAuth: string,
): Promise<'ok' | 'expired' | 'error'> {
  try {
    const sub = JSON.parse(tokenStr);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuth,
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
      },
      body: notifPayload,
    });
    if (res.ok || res.status === 201) return 'ok';
    if (res.status === 410 || res.status === 404) return 'expired';
    return 'error';
  } catch {
    return 'error';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('EXTERNAL_SUPABASE_URL')!,
    Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const payload: DispatchPayload = await req.json();
    const { event } = payload;

    if (!event) {
      return new Response(JSON.stringify({ error: 'event é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load VAPID config ──
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['vapid_enabled', 'vapid_public_key', 'vapid_private_key']);

    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => { cfg[s.key] = String(s.value).replace(/^"|"$/g, ''); });

    if (cfg['vapid_enabled'] !== 'true' || !cfg['vapid_public_key'] || !cfg['vapid_private_key']) {
      return new Response(JSON.stringify({ success: false, error: 'VAPID não configurado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vapidPrivateJwk = JSON.parse(cfg['vapid_private_key']);
    const vapidPublic = cfg['vapid_public_key'];

    // ── Build notification content ──
    const notif = buildNotification(event, payload);

    // ── Resolve target user_ids ──
    let targetUserIds: string[] = [];

    if (payload.broadcast && event === 'admin_broadcast') {
      // All real users (not bots) that have push tokens
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('user_id');
      const allIds = [...new Set((tokens || []).map((t: any) => t.user_id))];

      // Exclude is_seed users
      if (allIds.length > 0) {
        const { data: bots } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('is_seed', true);
        const botIds = new Set((bots || []).map((b: any) => b.user_id).filter(Boolean));
        targetUserIds = allIds.filter((id) => !botIds.has(id));
      }
    } else if (payload.user_id) {
      // Check user's notification preference for this event type
      const { data: profile } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('user_id', payload.user_id)
        .maybeSingle();

      const prefs: Record<string, boolean> = (profile as any)?.notification_preferences || {};

      // Respect per-event preference
      const prefKey: Record<PushEvent, keyof typeof prefs> = {
        kyc_approved: 'kyc_push',
        kyc_rejected: 'kyc_push',
        new_match: 'match_push',
        new_message: 'messages',
        validation_warning_7d: 'validation_push',
        validation_warning_24h: 'validation_push',
        admin_broadcast: 'push_enabled',
      };

      const key = prefKey[event];
      const allowed = key === undefined || prefs[key] !== false;
      if (allowed) targetUserIds = [payload.user_id];
    }

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No eligible targets' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Fetch tokens for all targets ──
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', targetUserIds);

    const notifJson = JSON.stringify({
      title: notif.title,
      body: notif.body,
      url: notif.url,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: notif.tag,
      renotify: notif.renotify,
      requireInteraction: notif.requireInteraction,
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'dismiss', title: 'Fechar' },
      ],
    });

    let sent = 0;
    let expired = 0;
    const expiredTokens: string[] = [];

    for (const row of (tokens || []) as any[]) {
      // Derive VAPID auth per endpoint (endpoint is inside token JSON)
      let endpoint = '';
      try { endpoint = JSON.parse(row.token).endpoint; } catch { continue; }

      const auth = await createVapidJwt(endpoint, vapidPrivateJwk, vapidPublic);
      const result = await sendToToken(row.token, notifJson, auth);

      if (result === 'ok') {
        sent++;
        await supabase
          .from('push_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('user_id', row.user_id)
          .eq('token', row.token);
      } else if (result === 'expired') {
        expired++;
        expiredTokens.push(row.token);
      }
    }

    // Clean expired tokens
    for (const t of expiredTokens) {
      await supabase.from('push_tokens').delete().eq('token', t);
    }

    console.log(`[dispatch-smart-push] event=${event} sent=${sent} expired=${expired} targets=${targetUserIds.length}`);

    return new Response(
      JSON.stringify({ success: true, event, sent, expired, targets: targetUserIds.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[dispatch-smart-push] error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
