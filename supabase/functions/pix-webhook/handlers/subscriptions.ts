import { notifyDiscord } from './logging.ts';

// Lifecycle SUBSCRIPTION_* (CREATED/UPDATED/DELETED/INACTIVATED).
export async function processSubscriptionEvent(
  supabase: any, subscriptionId: string, eventType: string, payload: any,
): Promise<void> {
  console.log(`[PIX Webhook] Subscription lifecycle ${eventType}: ${subscriptionId}`);
  const { data, error } = await supabase.rpc('oculto_subscription_apply_lifecycle', {
    p_asaas_subscription_id: subscriptionId,
    p_event_type: eventType,
    p_payload: payload,
  });
  if (error) console.error('[PIX Webhook] subscription lifecycle RPC error:', error.message);
  else console.log('[PIX Webhook] subscription lifecycle result:', JSON.stringify(data));

  if (eventType === 'SUBSCRIPTION_DELETED' || eventType === 'SUBSCRIPTION_INACTIVATED') {
    notifyDiscord(`🛑 **Assinatura ASAAS ${eventType}**\n🔗 ${subscriptionId}`, supabase).catch(() => null);
  }
}

// Eventos PAYMENT_* atrelados a assinatura recorrente.
export async function processSubscriptionPayment(
  supabase: any,
  subscriptionId: string,
  paymentId: string,
  eventType: string,
  amount: number,
  payload: any,
): Promise<void> {
  console.log(`[PIX Webhook] Subscription payment ${eventType}: sub=${subscriptionId} pay=${paymentId} R$${amount}`);
  const { data, error } = await supabase.rpc('oculto_subscription_apply_payment', {
    p_asaas_subscription_id: subscriptionId,
    p_asaas_payment_id: paymentId,
    p_event_type: eventType,
    p_amount: amount,
    p_payload: payload,
  });
  if (error) console.error('[PIX Webhook] subscription payment RPC error:', error.message);
  else console.log('[PIX Webhook] subscription payment result:', JSON.stringify(data));

  if (eventType === 'PAYMENT_OVERDUE') {
    notifyDiscord(`⏰ **Assinatura ASAAS inadimplente**\n💰 R$ ${amount.toFixed(2)}\n🔗 ${subscriptionId}`, supabase).catch(() => null);
  } else if (eventType === 'PAYMENT_RECEIVED_AFTER_OVERDUE') {
    notifyDiscord(`✅ **Assinatura reativada após atraso**\n💰 R$ ${amount.toFixed(2)}\n🔗 ${subscriptionId}`, supabase).catch(() => null);
  }
}
