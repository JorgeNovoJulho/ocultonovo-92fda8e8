import { notifyDiscord } from './logging.ts';

// Chargeback ASAAS — registra disputa, bloqueia saldo do criador, reverte afiliado.
export async function processChargeback(
  supabase: any, externalId: string, amount: number, eventType: string,
): Promise<void> {
  console.log(`[PIX Webhook] Chargeback ${eventType}: ${externalId} R$${amount}`);
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, user_id, type, seller_id')
    .eq('external_id', externalId)
    .maybeSingle();

  await supabase.from('chargebacks').insert({
    transaction_id: tx?.id ?? null,
    user_id: tx?.user_id ?? null,
    seller_id: tx?.seller_id ?? null,
    external_id: externalId,
    amount,
    event_type: eventType,
    status: eventType === 'PAYMENT_CHARGEBACK_DISPUTE' ? 'disputed' : 'lost',
    provider: 'asaas',
  }).catch((e: any) => console.error('[PIX Webhook] chargeback insert failed:', e?.message));

  if (tx) {
    await supabase.from('transactions').update({
      status: eventType === 'PAYMENT_CHARGEBACK_DISPUTE' ? 'disputed' : 'chargeback',
    }).eq('id', tx.id);

    if (eventType === 'PAYMENT_CHARGEBACK_REQUESTED' && tx.seller_id) {
      const { error: cbErr } = await supabase.rpc('oculto_apply_refund_debit', {
        p_creator_id: tx.seller_id,
        p_amount: amount,
        p_transaction_id: tx.id,
        p_reason: 'chargeback_asaas',
        p_external_id: externalId,
      });
      if (cbErr) {
        console.error('[PIX Webhook] chargeback debit hardened failed:', cbErr.message);
        await supabase.rpc('add_to_balance', { p_user_id: tx.seller_id, p_amount: -amount }).catch(() => null);
      }

      await supabase.rpc('oculto_reverse_affiliate_commission', {
        p_transaction_id: tx.id,
        p_reason: 'chargeback_asaas',
      }).catch(() => null);
    }
  }

  notifyDiscord(`⚠️ **Chargeback ASAAS** (${eventType})\n💰 R$ ${amount.toFixed(2)}\n🔗 ${externalId}`, supabase).catch(() => null);
}
