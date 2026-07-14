import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface WhatsAppRequest {
  action: 'send' | 'test-connection' | 'get-status' | 'send-welcome' | 'send-match' | 'send-badge-approved';
  phone?: string;
  message?: string;
  template?: string;
  template_vars?: Record<string, string>;
  // Specific action payloads
  user_name?: string;
  match_name?: string;
  badge_type?: string;
}

interface WhatsAppConfig {
  provider: 'z-api' | 'twilio' | 'evolution-api' | 'wppconnect';
  api_key_encrypted: string | null;
  instance_id: string | null;
  account_sid: string | null;
  from_number: string | null;
  server_url: string | null;
  is_active: boolean;
  sandbox_mode: boolean;
  cart_recovery_template: string;
}

// ─── Phone formatter ──────────────────────────────────────────────────────────
function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  return digits;
}

// ─── Provider senders ─────────────────────────────────────────────────────────
async function sendViaZApi(config: WhatsAppConfig, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!config.instance_id || !config.api_key_encrypted) return { success: false, error: 'Z-API credentials not configured' };
  const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.api_key_encrypted}/send-text`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: formatPhoneNumber(phone), message }),
    });
    const data = await response.json();
    if (response.ok && data.zapiMessageId) return { success: true, messageId: data.zapiMessageId };
    return { success: false, error: data.error || 'Failed to send via Z-API' };
  } catch (error: unknown) {
    return { success: false, error: `Z-API error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function sendViaTwilio(config: WhatsAppConfig, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!config.account_sid || !config.api_key_encrypted || !config.from_number) return { success: false, error: 'Twilio credentials not configured' };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`;
  try {
    const formData = new URLSearchParams();
    formData.append('To', `whatsapp:+${formatPhoneNumber(phone)}`);
    formData.append('From', `whatsapp:${config.from_number}`);
    formData.append('Body', message);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${config.account_sid}:${config.api_key_encrypted}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    const data = await response.json();
    if (response.ok && data.sid) return { success: true, messageId: data.sid };
    return { success: false, error: data.message || 'Failed to send via Twilio' };
  } catch (error: unknown) {
    return { success: false, error: `Twilio error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function sendViaEvolutionApi(config: WhatsAppConfig, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!config.instance_id || !config.api_key_encrypted) return { success: false, error: 'Evolution API credentials not configured' };
  const baseUrl = config.server_url || Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
  try {
    const response = await fetch(`${baseUrl}/message/sendText/${config.instance_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.api_key_encrypted },
      body: JSON.stringify({ number: formatPhoneNumber(phone), text: message }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return { success: false, error: `Evolution API returned non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}` };
    }
    const data = await response.json();
    if (response.ok && data.key?.id) return { success: true, messageId: data.key.id };
    return { success: false, error: data.message || 'Failed to send via Evolution API' };
  } catch (error: unknown) {
    return { success: false, error: `Evolution API error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
async function sendMessage(config: WhatsAppConfig, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Sandbox mode — log only
  if (config.sandbox_mode) {
    console.log('[SANDBOX] WhatsApp would send to:', phone.slice(0, 6) + '****');
    return { success: true, messageId: `sandbox-${Date.now()}` };
  }
  if (!config.is_active) return { success: false, error: 'WhatsApp gateway is not active' };

  switch (config.provider) {
    case 'z-api':        return sendViaZApi(config, phone, message);
    case 'twilio':       return sendViaTwilio(config, phone, message);
    case 'evolution-api': return sendViaEvolutionApi(config, phone, message);
    default:             return { success: false, error: `Unknown provider: ${config.provider}` };
  }
}

// ─── Connection tester ────────────────────────────────────────────────────────
async function testConnection(config: WhatsAppConfig): Promise<{ success: boolean; message: string }> {
  if (!config.is_active) return { success: false, message: 'WhatsApp gateway is not active' };
  switch (config.provider) {
    case 'z-api': {
      if (!config.instance_id || !config.api_key_encrypted) return { success: false, message: 'Z-API credentials not configured' };
      try {
        const response = await fetch(`https://api.z-api.io/instances/${config.instance_id}/token/${config.api_key_encrypted}/status`);
        const data = await response.json();
        return data.connected ? { success: true, message: 'Z-API connected successfully' } : { success: false, message: `Z-API status: ${data.error || 'Not connected'}` };
      } catch (e: unknown) { return { success: false, message: `Z-API connection error: ${e instanceof Error ? e.message : 'Unknown'}` }; }
    }
    case 'twilio': {
      if (!config.account_sid || !config.api_key_encrypted) return { success: false, message: 'Twilio credentials not configured' };
      try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}.json`, {
          headers: { 'Authorization': `Basic ${btoa(`${config.account_sid}:${config.api_key_encrypted}`)}` },
        });
        return response.ok ? { success: true, message: 'Twilio connected successfully' } : { success: false, message: 'Twilio authentication failed' };
      } catch (e: unknown) { return { success: false, message: `Twilio connection error: ${e instanceof Error ? e.message : 'Unknown'}` }; }
    }
    case 'evolution-api': {
      if (!config.instance_id || !config.api_key_encrypted) return { success: false, message: 'Evolution API credentials not configured' };
      try {
        const baseUrl = config.server_url || Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
        const response = await fetch(`${baseUrl}/instance/connectionState/${config.instance_id}`, {
          headers: { 'apikey': config.api_key_encrypted },
        });
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const statusMessages: Record<number, string> = {
            401: 'API Key inválida ou sem permissão (401 Unauthorized).',
            403: 'Acesso negado (403 Forbidden). Verifique a API Key.',
            404: 'Instância não encontrada (404). Verifique o Instance ID.',
            429: 'Muitas requisições (429 Too Many Requests). Aguarde e tente novamente.',
            500: 'Erro interno no servidor Evolution API (500).',
            502: 'Servidor Evolution API indisponível (502 Bad Gateway).',
            503: 'Serviço Evolution API temporariamente fora do ar (503).',
            504: 'Tempo limite de resposta esgotado (504 Gateway Timeout). O servidor está inacessível.',
          };
          const friendlyMsg = statusMessages[response.status] || `Servidor retornou HTTP ${response.status}.`;
          console.error(`[WhatsApp] Evolution API non-JSON response. Status: ${response.status}, Content-Type: ${contentType}`);
          return { success: false, message: `${friendlyMsg} Verifique se a URL "${baseUrl}" está correta e o serviço online.` };
        }
        const data = await response.json();
        // Evolution API v1 returns { state: 'open' }
        // Evolution API v2 returns { instance: { instanceName: '...', state: 'open' } }
        const state: string | undefined = data.state ?? data.instance?.state ?? data.connectionStatus;
        if (state === 'open' || state === 'connected') {
          return { success: true, message: 'Evolution API conectada com sucesso!' };
        }
        const stateLabels: Record<string, string> = {
          close: 'Desconectada (close). Reconecte a instância no painel Evolution API.',
          connecting: 'Conectando... Aguarde e tente novamente.',
          qrcode: 'Aguardando leitura do QR Code. Abra o WhatsApp e escaneie.',
        };
        const stateMsg = state ? (stateLabels[state] ?? `Estado: ${state}`) : `Resposta inesperada: ${JSON.stringify(data).slice(0, 120)}`;
        return { success: false, message: `Evolution API — ${stateMsg}` };
      } catch (e: unknown) { return { success: false, message: `Evolution API connection error: ${e instanceof Error ? e.message : 'Unknown'}` }; }
    }
    default:
      return { success: false, message: `Unknown provider: ${config.provider}` };
  }
}

// ─── Pre-built message templates ─────────────────────────────────────────────
function buildWelcomeMessage(userName: string): string {
  return `👋 Olá, *${userName}*! Seja bem-vindo(a) à *Plataforma Oculta*! 🎉\n\nSua conta está ativa e pronta para uso. Aqui você pode:\n✅ Explorar perfis no Radar\n✅ Assinar criadores VIP\n✅ Trocar mensagens privadas\n\nQualquer dúvida, estamos aqui! 💬`;
}

function buildMatchMessage(matchName: string): string {
  return `🔥 *Match importante!*\n\nVocê e *${matchName}* demonstraram interesse mútuo!\n\nNão perca tempo — envie uma mensagem agora e inicie essa conexão. 💬\n\n_Acesse o app para ver o perfil completo._`;
}

function buildBadgeApprovedMessage(badgeType: string): string {
  const badgeLabel = badgeType === 'oculto' ? 'Selo Oculto 🔐' : `Selo ${badgeType}`;
  return `🏅 Parabéns! Seu *${badgeLabel}* foi aprovado!\n\nSeu perfil agora conta com verificação especial, gerando mais confiança e destaque na plataforma.\n\n_Acesse seu perfil para visualizar o selo ativo._`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: WhatsAppRequest = await req.json();
    const { action } = body;

    // Fetch config
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .limit(1)
      .single();

    if (configError || !config) {
      // For automated flows, return success:false gracefully (don't crash)
      console.error('[WhatsApp] Config not found:', configError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    switch (action) {

      case 'test-connection': {
        const result = await testConnection(config);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'get-status': {
        return new Response(
          JSON.stringify({ success: true, provider: config.provider, is_active: config.is_active, sandbox_mode: config.sandbox_mode }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'send-welcome': {
        const { phone, user_name } = body;
        if (!phone || !user_name) return new Response(JSON.stringify({ success: false, error: 'phone and user_name required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        const result = await sendMessage(config, phone, buildWelcomeMessage(user_name));
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'send-match': {
        const { phone, match_name } = body;
        if (!phone || !match_name) return new Response(JSON.stringify({ success: false, error: 'phone and match_name required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        const result = await sendMessage(config, phone, buildMatchMessage(match_name));
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'send-badge-approved': {
        const { phone, badge_type } = body;
        if (!phone || !badge_type) return new Response(JSON.stringify({ success: false, error: 'phone and badge_type required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        const result = await sendMessage(config, phone, buildBadgeApprovedMessage(badge_type));
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'send': {
        const { phone, message, template, template_vars } = body;
        if (!phone) return new Response(JSON.stringify({ success: false, error: 'Phone number required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        let finalMessage = message;
        if (template && template_vars) {
          finalMessage = template;
          for (const [key, value] of Object.entries(template_vars)) {
            finalMessage = finalMessage!.replace(new RegExp(`{${key}}`, 'g'), value);
          }
        }
        if (!finalMessage) return new Response(JSON.stringify({ success: false, error: 'Message content required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

        const result = await sendMessage(config, phone, finalMessage);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }
  } catch (error: unknown) {
    // Graceful error — never crash the caller's flow
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WhatsApp] Gateway error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
