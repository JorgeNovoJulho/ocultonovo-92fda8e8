/**
 * Edge Function: check-safety-checkins
 * Roda a cada minuto (via cron), verifica check-ins atrasados no banco EXTERNO
 * e envia mensagens WhatsApp para os contatos de emergência cadastrados.
 *
 * IMPORTANTE: Esta função usa o banco externo (rvybbrkzmboqbhcemqar) via
 * EXTERNAL_SUPABASE_URL + EXTERNAL_SUPABASE_SERVICE_ROLE_KEY, pois é onde os
 * check-ins reais são gravados pelo app.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmergencyContact {
  name: string;
  phone?: string;
  email?: string;
  relationship: string;
}

interface SafetyCheckin {
  id: string;
  user_id: string;
  checkin_type: string;
  scheduled_at: string;
  grace_period_minutes: number;
  emergency_contacts: EmergencyContact[] | null;
  emergency_message: string | null;
  location_description: string | null;
  location_lat: number | null;
  location_lng: number | null;
  share_location_with_contacts: boolean;
  meeting_profile_url?: string | null;
}

async function sendEmail(contact: EmergencyContact, subject: string, message: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey || !contact.email) return { success: false, error: 'Email not configured' };
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'OcultaSwing Segurança <seguranca@ocultoswing.com.br>',
        to: [contact.email],
        subject,
        text: message,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return { success: true };
    return { success: false, error: data?.message || 'Resend failed' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown email error' };
  }
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  return digits;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendWhatsAppOnce(
  supabaseClient: ReturnType<typeof createClient>,
  phone: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: config, error: configError } = await supabaseClient
      .from('whatsapp_config')
      .select('*')
      .limit(1)
      .single();

    if (configError || !config) {
      return { success: false, error: 'WhatsApp not configured' };
    }

    if (config.sandbox_mode) {
      console.log(`📱 [SANDBOX] WhatsApp para ${phone}: ${message}`);
      return { success: true };
    }

    if (!config.is_active) {
      return { success: false, error: 'WhatsApp gateway not active' };
    }

    const formattedPhone = formatPhoneNumber(phone);

    if (config.provider === 'z-api') {
      const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.api_key_encrypted}/send-text`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, message }),
      });
      const data = await resp.json();
      if (resp.ok && data.zapiMessageId) return { success: true };
      return { success: false, error: data.error || 'Z-API failed' };
    }

    if (config.provider === 'twilio') {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`;
      const form = new URLSearchParams();
      form.append('To', `whatsapp:+${formattedPhone}`);
      form.append('From', `whatsapp:${config.from_number}`);
      form.append('Body', message);
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${config.account_sid}:${config.api_key_encrypted}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const data = await resp.json();
      if (resp.ok && data.sid) return { success: true };
      return { success: false, error: data.message || 'Twilio failed' };
    }

    if (config.provider === 'evolution-api') {
      const baseUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
      const url = `${baseUrl}/message/sendText/${config.instance_id}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': config.api_key_encrypted },
        body: JSON.stringify({ number: formattedPhone, text: message }),
      });
      const data = await resp.json();
      if (resp.ok && data.key?.id) return { success: true };
      return { success: false, error: data.message || 'Evolution API failed' };
    }

    return { success: false, error: `Unknown provider: ${config.provider}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// Retry exponencial 3x (1s, 2s, 4s)
async function sendWhatsApp(
  supabaseClient: ReturnType<typeof createClient>,
  phone: string,
  message: string,
): Promise<{ success: boolean; error?: string; attempts: number }> {
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await sendWhatsAppOnce(supabaseClient, phone, message);
    if (r.success) return { success: true, attempts: attempt };
    lastErr = r.error || 'unknown';
    if (attempt < 3) await sleep(1000 * Math.pow(2, attempt - 1));
  }
  return { success: false, error: lastErr, attempts: 3 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ⚠️ CRÍTICO: usa banco EXTERNO onde os check-ins são realmente gravados
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');

    if (!externalUrl || !externalKey) {
      throw new Error('Missing EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabaseClient = createClient(externalUrl, externalKey);

    const now = new Date();
    console.log(`[check-safety-checkins] Starting check at ${now.toISOString()}`);

    // Otimização: já filtra scheduled_at <= now (reduz scan)
    const { data: overdueCheckins, error } = await supabaseClient
      .from('safety_checkins')
      .select('*')
      .eq('status', 'scheduled')
      .is('alert_sent_at', null)
      .lte('scheduled_at', now.toISOString())
      .limit(500);

    if (error) {
      console.error('[check-safety-checkins] DB error:', error);
      throw error;
    }

    // Filtra os que já passaram do grace_period
    const toAlert = (overdueCheckins as SafetyCheckin[]).filter((c) => {
      const deadline = new Date(c.scheduled_at);
      deadline.setMinutes(deadline.getMinutes() + c.grace_period_minutes);
      return deadline <= now;
    });

    console.log(`[check-safety-checkins] Found ${toAlert.length} overdue check-in(s) to alert`);

    const results: Array<{ checkinId: string; notified: number; failed: number }> = [];

    for (const checkin of toAlert) {
      const contacts = checkin.emergency_contacts || [];
      const phonesToNotify = contacts.filter((c: EmergencyContact) => c.phone);
      const emailsToNotify = contacts.filter((c: EmergencyContact) => c.email);

      let notified = 0;
      let failed = 0;
      const contactsLog: Array<{ contact_info: EmergencyContact; notification_type: string; sent_at: string; delivered: boolean; attempts?: number }> = [];

      const typeLabel = checkin.checkin_type === 'meetup' ? 'Encontro'
        : checkin.checkin_type === 'date' ? 'Date'
        : checkin.checkin_type === 'event' ? 'Evento'
        : 'Check-in';

      const scheduledFormatted = new Date(checkin.scheduled_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      const { data: latestLocation } = await supabaseClient
        .from('safety_checkin_locations')
        .select('latitude, longitude, maps_url, waze_url, created_at')
        .eq('checkin_id', checkin.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: attachments } = await supabaseClient
        .from('safety_checkin_attachments')
        .select('file_name, file_url')
        .eq('checkin_id', checkin.id)
        .limit(20);

      let locationInfo = '';
      if (checkin.location_description) {
        locationInfo = `\n📍 Local informado: ${checkin.location_description}`;
      }
      if (latestLocation?.maps_url) {
        locationInfo += `\n🗺️ Localização em tempo real: ${latestLocation.maps_url}\n🚗 Waze: ${latestLocation.waze_url}`;
      }
      if (checkin.share_location_with_contacts && checkin.location_lat && checkin.location_lng) {
        locationInfo += `\n🗺️ Localização GPS: https://maps.google.com/?q=${checkin.location_lat},${checkin.location_lng}`;
      }
      if (checkin.meeting_profile_url) locationInfo += `\n👤 Perfil da pessoa encontrada: ${checkin.meeting_profile_url}`;
      if (attachments?.length) locationInfo += `\n📎 Anexos: ${attachments.map((a: any) => `${a.file_name || 'arquivo'}: ${a.file_url}`).join(' | ')}`;

      const alertMessage = checkin.emergency_message
        || `🚨 *ALERTA DE SEGURANÇA - OcultaSwing*\n\nUm(a) amigo(a) seu(ua) agendou um check-in de segurança para *${typeLabel}* em *${scheduledFormatted}* e NÃO confirmou a segurança no tempo esperado.${locationInfo}\n\n⚠️ Por favor, entre em contato imediatamente!\n\n_Esta mensagem foi enviada automaticamente pelo sistema de segurança OcultaSwing._`;

      for (const contact of phonesToNotify) {
        const result = await sendWhatsApp(supabaseClient, contact.phone!, alertMessage);
        contactsLog.push({
          contact_info: contact,
          notification_type: 'whatsapp',
          sent_at: new Date().toISOString(),
          delivered: result.success,
          attempts: result.attempts,
        });
        if (result.success) notified++;
        else {
          failed++;
          console.error(`[check-safety-checkins] Failed to send to ${contact.phone} after ${result.attempts}x: ${result.error}`);
        }
      }

      for (const contact of emailsToNotify) {
        const result = await sendEmail(contact, '🚨 Alerta de Segurança - OcultaSwing', alertMessage);
        contactsLog.push({
          contact_info: contact,
          notification_type: 'email',
          sent_at: new Date().toISOString(),
          delivered: result.success,
          attempts: 1,
        });
        if (result.success) notified++;
        else failed++;
      }

      const { error: updateError } = await supabaseClient
        .from('safety_checkins')
        .update({
          status: 'alert_sent',
          alert_sent_at: new Date().toISOString(),
        })
        .eq('id', checkin.id);

      if (updateError) {
        console.error(`[check-safety-checkins] Failed to update checkin ${checkin.id}:`, updateError);
      }

      const { error: alertError } = await supabaseClient
        .from('safety_alerts')
        .insert({
          checkin_id: checkin.id,
          user_id: checkin.user_id,
          alert_type: 'missed_checkin',
          contacts_notified: contactsLog.length > 0 ? contactsLog : null,
        });

      if (alertError) {
        console.error(`[check-safety-checkins] Failed to create alert record:`, alertError);
      }

      results.push({ checkinId: checkin.id, notified, failed });
    }

    console.log(`[check-safety-checkins] Done. Results:`, JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, processed: toAlert.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[check-safety-checkins] Fatal error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
