import { notifyDiscord } from './logging.ts';

// Refund ASAAS — débito atômico hardened, cancela D+7, registra dívida, reverte afiliado.
export async function processRefund(
  supabase: any, externalId: string, amount: number,
): Promise<void> {
  console.log(`[PIX Webhook] Refund: ${externalId} R$${amount}`);
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, user_id, type, seller_id')
    .eq('external_id', externalId)
    .maybeSingle();
  if (!tx) { console.log('[PIX Webhook] Refund: no tx found'); return; }

  await supabase.from('transactions').update({
    status: 'refunded',
    refunded_at: new Date().toISOString(),
  }).eq('id', tx.id);

  if (tx.seller_id) {
    const { data: refundResult, error: refundErr } = await supabase.rpc('oculto_apply_refund_debit', {
      p_creator_id: tx.seller_id,
      p_amount: amount,
      p_transaction_id: tx.id,
      p_reason: 'refund_asaas',
      p_external_id: externalId,
    });
    if (refundErr) {
      console.error('[PIX Webhook] oculto_apply_refund_debit failed:', refundErr.message);
      await supabase.rpc('add_to_balance', { p_user_id: tx.seller_id, p_amount: -amount }).catch(() => null);
    } else {
      console.log('[PIX Webhook] Refund hardening result:', JSON.stringify(refundResult));
    }
  }

  await supabase.rpc('oculto_reverse_affiliate_commission', {
    p_transaction_id: tx.id,
    p_reason: 'refund_asaas',
  }).then(({ error }: any) => {
    if (error) console.error('[PIX Webhook] reverse_affiliate_commission failed:', error.message);
  }).catch(() => null);

  await supabase.from('transactions').insert({
    user_id: tx.user_id, amount: -amount, type: 'refund', status: 'completed',
    description: `Estorno PIX (ASAAS) — R$ ${amount.toFixed(2)}`,
    external_id: `refund_${externalId}`, provider: 'asaas',
  }).catch(() => null);

  notifyDiscord(`↩️ **Estorno ASAAS confirmado**\n💰 R$ ${amount.toFixed(2)}\n🔗 ${externalId}`, supabase).catch(() => null);
}
