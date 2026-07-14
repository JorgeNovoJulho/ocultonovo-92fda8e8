// Wallet top-up — credita valor cheio no saldo do usuário.
export async function creditWalletTopup(
  supabase: any, profileId: string, amount: number,
): Promise<void> {
  await supabase.rpc('add_to_balance', {
    p_user_id: profileId,
    p_amount: amount,
  }).catch(() => null);
  console.log(`[PIX Webhook] Wallet +R$${amount} for profile ${profileId}`);
}
