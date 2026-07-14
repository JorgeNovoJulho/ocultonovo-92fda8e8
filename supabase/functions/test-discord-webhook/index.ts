import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    // Read webhook URL: DB config first (hot-swappable), fallback to secret
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 🔒 Admin-only
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return respond({ error: 'Unauthorized' }, 401);
    const anonClient = createClient(supabaseUrl, Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!);
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !userData?.user) return respond({ error: 'Unauthorized' }, 401);
    const { data: roles } = await supabase
      .from('user_roles').select('role').eq('user_id', userData.user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) =>
      ['admin_master', 'admin_regional'].includes(r.role)
    );
    if (!isAdmin) return respond({ error: 'Forbidden: admin only' }, 403);


    let webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
    const { data: cfg } = await supabase
      .from('pix_gateway_config')
      .select('discord_webhook_url')
      .maybeSingle();
    if (cfg?.discord_webhook_url) webhookUrl = cfg.discord_webhook_url;

    if (!webhookUrl) {
      return respond({ success: false, error: 'URL do Webhook Discord não configurada. Adicione em Configuração PIX → Notificações Discord.' }, 400);
    }

    const testMessage = '🚀 Plataforma Oculta: Conexão estabelecida com sucesso! Sistema pronto para notificações de venda.';

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: testMessage,
        username: 'Oculta Sistema',
        embeds: [
          {
            title: '✅ Teste de Conexão',
            description: testMessage,
            color: 0x00ff88,
            fields: [
              { name: '📡 Status', value: 'Online', inline: true },
              { name: '⏱️ Timestamp', value: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), inline: true },
              { name: '💰 Split Configurado', value: '74% Criador / 20% Plataforma / 6% Impostos', inline: false },
            ],
            footer: { text: 'Plataforma Oculta — Sistema de Notificações' },
          },
        ],
      }),
    });

    // Consume body immediately to free RAM (< 4GB device optimization)
    const resText = await discordRes.text().catch(() => '');

    if (!discordRes.ok) {
      console.error('[test-discord-webhook] Discord error:', discordRes.status, resText);
      return respond({ success: false, error: `Discord retornou ${discordRes.status}: ${resText}` }, 502);
    }

    console.log('[test-discord-webhook] ✅ Discord notified successfully');
    return respond({ success: true, message: 'Mensagem enviada ao Discord com sucesso!' });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[test-discord-webhook] Error:', msg);
    return respond({ success: false, error: msg }, 500);
  }
});
