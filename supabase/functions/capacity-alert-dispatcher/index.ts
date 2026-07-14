// Capacity Alert Dispatcher Edge Function
// Dispara alertas para Telegram quando thresholds de capacidade são atingidos
// Inclui proteção anti-loop (máximo 1 alerta por threshold a cada 6 horas)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertPayload {
  threshold: number;
  current_users: number;
  max_limit: number;
  percentage: number;
  test?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: AlertPayload = await req.json();
    const { threshold, current_users, max_limit, percentage, test = false } = payload;

    console.log(`📊 Alerta de capacidade recebido: ${threshold}% (${current_users}/${max_limit})`);

    // Buscar configurações de Telegram
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'telegram_bot_token',
        'telegram_chat_id',
        `last_capacity_alert_${threshold}`,
        `capacity_alert_${threshold}`,
        'capacity_alert_email',
        'capacity_webhook_url'
      ]);

    if (settingsError) {
      console.error('Erro ao buscar configurações:', settingsError);
      throw settingsError;
    }

    const getSettingValue = (key: string): string => {
      const setting = settings?.find(s => s.key === key);
      if (!setting) return '';
      const val = setting.value;
      // Parse JSONB value
      if (typeof val === 'string') return val.replace(/^"|"$/g, '');
      if (val === null || val === undefined) return '';
      return String(val).replace(/^"|"$/g, '');
    };

    const telegramToken = getSettingValue('telegram_bot_token');
    const telegramChatId = getSettingValue('telegram_chat_id');
    const lastAlertKey = `last_capacity_alert_${threshold}`;
    const lastAlertTime = getSettingValue(lastAlertKey);
    const alertEnabled = getSettingValue(`capacity_alert_${threshold}`) === 'true';
    const webhookUrl = getSettingValue('capacity_webhook_url');

    // Verificar se o alerta está habilitado (ignorar para testes)
    if (!test && !alertEnabled) {
      console.log(`⏭️ Alerta de ${threshold}% está desabilitado, ignorando.`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: true, 
        reason: 'alert_disabled' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Proteção anti-loop: verificar se já foi enviado nas últimas 6 horas
    if (!test && lastAlertTime) {
      const lastAlert = new Date(lastAlertTime);
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      
      if (lastAlert > sixHoursAgo) {
        console.log(`⏭️ Alerta de ${threshold}% já enviado recentemente, ignorando.`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true, 
          reason: 'already_sent_recently',
          last_sent: lastAlertTime 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let telegramSent = false;
    let webhookSent = false;

    // Enviar para Telegram se configurado
    if (telegramToken && telegramChatId) {
      const emoji = threshold === 100 ? '🚨' : threshold === 95 ? '⚠️' : '📊';
      const urgency = threshold === 100 ? 'CRÍTICO' : threshold === 95 ? 'ALERTA' : 'ATENÇÃO';
      
      const message = test 
        ? `🧪 *TESTE DE ALERTA*\n\nEste é um teste do sistema de alertas de capacidade.\n\nSe você está vendo esta mensagem, a integração com Telegram está funcionando corretamente! ✅`
        : `${emoji} *${urgency}: Capacidade ${threshold}%*\n\n📈 Usuários: ${current_users.toLocaleString('pt-BR')} / ${max_limit.toLocaleString('pt-BR')}\n📊 Ocupação: ${percentage.toFixed(1)}%\n\n${threshold === 100 ? '⛔ *NOVOS CADASTROS BLOQUEADOS*' : threshold === 95 ? '⚠️ Considere aumentar o limite ou ativar a fila de espera.' : '💡 Monitore a situação.'}`;

      try {
        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${telegramToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: message,
              parse_mode: 'Markdown',
            }),
          }
        );

        const telegramResult = await telegramResponse.json();
        
        if (telegramResult.ok) {
          console.log('✅ Mensagem enviada para Telegram com sucesso');
          telegramSent = true;
        } else {
          console.error('❌ Erro ao enviar para Telegram:', telegramResult);
        }
      } catch (telegramError) {
        console.error('❌ Exceção ao enviar para Telegram:', telegramError);
      }
    } else {
      console.log('⚠️ Telegram não configurado (token ou chat_id ausente)');
    }

    // Enviar para Webhook se configurado
    if (webhookUrl && !test) {
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'capacity_alert',
            threshold,
            current_users,
            max_limit,
            percentage,
            timestamp: new Date().toISOString(),
          }),
        });

        if (webhookResponse.ok) {
          console.log('✅ Webhook enviado com sucesso');
          webhookSent = true;
        } else {
          console.error('❌ Erro ao enviar webhook:', await webhookResponse.text());
        }
      } catch (webhookError) {
        console.error('❌ Exceção ao enviar webhook:', webhookError);
      }
    }

    // Atualizar timestamp do último alerta (apenas se não for teste)
    if (!test && (telegramSent || webhookSent)) {
      const { error: updateError } = await supabase
        .from('system_settings')
        .update({ 
          value: JSON.stringify(new Date().toISOString()),
          updated_at: new Date().toISOString()
        })
        .eq('key', lastAlertKey);

      if (updateError) {
        console.error('Erro ao atualizar timestamp:', updateError);
      }
    }

    // Registrar na tabela de notificações admin
    if (!test) {
      await supabase
        .from('admin_notifications')
        .insert({
          type: 'capacity_alert',
          title: `Capacidade ${threshold}%`,
          message: `A plataforma atingiu ${percentage.toFixed(1)}% da capacidade (${current_users}/${max_limit} usuários).`,
          metadata: { threshold, current_users, max_limit, percentage },
          priority: threshold === 100 ? 'critical' : threshold === 95 ? 'high' : 'medium',
        });
    }

    return new Response(JSON.stringify({
      success: true,
      telegram_sent: telegramSent,
      webhook_sent: webhookSent,
      test,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro no capacity-alert-dispatcher:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
