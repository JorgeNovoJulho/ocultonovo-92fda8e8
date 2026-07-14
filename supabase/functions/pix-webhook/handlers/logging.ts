// Discord notifier — lê URL da config DB com fallback para env.
export async function notifyDiscord(message: string, supabase?: any): Promise<void> {
  let webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
  if (supabase) {
    try {
      const { data: cfg } = await supabase
        .from('pix_gateway_config')
        .select('discord_webhook_url')
        .maybeSingle();
      if (cfg?.discord_webhook_url) webhookUrl = cfg.discord_webhook_url;
    } catch (_) { /* ignore */ }
  }
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    await res.text();
  } catch (e) {
    console.error('[PIX Webhook] Discord notify error:', e);
  }
}

// Idempotência ASAAS via UNIQUE(asaas_event_id).
export async function insertAsaasLog(
  supabase: any,
  payload: any,
): Promise<{ duplicated: boolean; logId: string | null }> {
  const eventId =
    payload.id ||
    `${payload.event}_${payload.payment?.id || payload.subscription?.id || Date.now()}`;
  const { data: logRow, error: logErr } = await supabase
    .from('oculto_asaas_webhook_logs')
    .insert({
      asaas_event_id: eventId,
      event_type: payload.event,
      payment_id: payload.payment?.id ?? null,
      payload,
      status: 'received',
    })
    .select('id')
    .maybeSingle();

  if (logErr && (logErr.code === '23505' || /duplicate/i.test(logErr.message))) {
    return { duplicated: true, logId: null };
  }
  if (logErr) console.error('[PIX Webhook] log insert error (continuing):', logErr.message);
  return { duplicated: false, logId: logRow?.id ?? null };
}

export async function finalizeAsaasLog(
  supabase: any,
  logId: string | null,
  processed: boolean,
  startedAt: number,
): Promise<void> {
  if (!logId) return;
  supabase.from('oculto_asaas_webhook_logs').update({
    status: processed ? 'processed' : 'ignored',
    processing_ms: Date.now() - startedAt,
    processed_at: new Date().toISOString(),
  }).eq('id', logId).then(() => null).catch(() => null);
}

export async function logLegacyEvent(
  supabase: any,
  provider: string,
  payload: any,
): Promise<void> {
  supabase.from('webhook_events').insert({
    provider: `pix_${provider}`,
    event_type: payload.event || 'pix_notification',
    event_id: `pix_${Date.now()}`,
    payload,
    processed: false,
  }).then(() => null).catch(() => null);
}
