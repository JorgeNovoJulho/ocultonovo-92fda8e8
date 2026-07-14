import type { SplitResult } from './types.ts';

// Split atômico via RPC process_payment_split.
export async function executeDualSplit(
  supabase: any,
  transactionId: string,
  paymentExternalId: string,
  flowType: 'platform_plan' | 'creator_content' | 'wallet_topup',
  grossAmount: number,
  creatorId: string | null,
  affiliateId: string | null,
  provider: string,
): Promise<SplitResult> {
  const { data, error } = await supabase.rpc('process_payment_split', {
    p_transaction_id: transactionId,
    p_payment_external_id: paymentExternalId,
    p_flow_type: flowType,
    p_gross_amount: grossAmount,
    p_creator_id: creatorId,
    p_affiliate_id: affiliateId,
    p_provider: provider,
  });
  if (error) {
    console.error('[PIX Webhook] Split RPC error:', error.message);
    return {
      gross: grossAmount, tax: 0, base: grossAmount,
      platform: 0, affiliate: 0, creator: 0, flow_type: flowType,
    };
  }
  return data as SplitResult;
}
