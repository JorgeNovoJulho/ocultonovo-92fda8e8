// Resolve afiliado ativo (≤ 90 dias) para um perfil.
export async function findActiveAffiliate(
  supabase: any,
  profileId: string,
): Promise<string | null> {
  const { data: referral } = await supabase
    .from('referrals')
    .select('referrer_id, started_at, commission_ended_at')
    .eq('referred_user_id', profileId)
    .eq('is_active', true)
    .is('commission_ended_at', null)
    .maybeSingle();
  if (!referral) return null;
  const daysSince = (Date.now() - new Date(referral.started_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 90) return null;
  return referral.referrer_id;
}
