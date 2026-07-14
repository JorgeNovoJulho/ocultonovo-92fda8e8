/**
 * betaGuard — guarda servidor para Beta Control.
 *
 * Uso (no início do handler de qualquer edge function de cobrança/saque):
 *
 *   import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
 *   const block = await assertPlatformFeature('subscriptions');
 *   if (block) return betaBlockedResponse(block, corsHeaders);
 *
 * Chave aceita: 'monetization' | 'subscriptions' | 'paid_content' |
 *               'vip_channels' | 'payouts' | 'safe_meetings' |
 *               'whatsapp' | 'real_experiences'
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PlatformFeatureKey =
  | 'monetization'
  | 'subscriptions'
  | 'paid_content'
  | 'vip_channels'
  | 'payouts'
  | 'safe_meetings'
  | 'whatsapp'
  | 'real_experiences';

const REASONS: Record<PlatformFeatureKey, string> = {
  monetization:     'Cobranças desativadas durante o Beta.',
  subscriptions:    'Assinaturas pagas serão liberadas no lançamento oficial.',
  paid_content:     'Conteúdo pago será liberado no lançamento oficial.',
  vip_channels:     'Canais VIP pagos serão liberados no lançamento oficial.',
  payouts:          'Saques serão liberados quando a monetização entrar no ar.',
  safe_meetings:    'Encontros seguros serão liberados em breve.',
  whatsapp:         'Integração WhatsApp será liberada em breve.',
  real_experiences: 'Experiências reais serão liberadas em breve.',
};

/** Retorna null se liberado; retorna mensagem PT-BR se bloqueado. */
export async function assertPlatformFeature(
  feature: PlatformFeatureKey,
): Promise<string | null> {
  try {
    const url = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const key = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return null; // fail-open se infra ausente
    const admin = createClient(url, key);
    const { data, error } = await admin.rpc('assert_platform_feature', { p_key: feature });
    if (error) {
      console.warn('[betaGuard] rpc error', error);
      return null; // fail-open: não derruba pagamento por glitch
    }
    // RPC retorna boolean (true = liberado, false = bloqueado)
    if (data === false) {
      return REASONS[feature] || 'Recurso desativado durante o Beta.';
    }
    return null;
  } catch (e) {
    console.warn('[betaGuard] exception', e);
    return null;
  }
}

export function betaBlockedResponse(reason: string, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: 'beta_locked', message: reason, beta_locked: true }),
    { status: 423, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
