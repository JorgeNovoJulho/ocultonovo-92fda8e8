/**
 * Social Core Engine — service layer
 * Centraliza as chamadas ao Supabase externo. Componentes/hooks NUNCA
 * devem chamar `supabase.rpc('social_identity_get'…)` direto — usar este
 * módulo para garantir cache compartilhado e contrato único.
 */
import { supabase } from '@/lib/supabaseExternal';
import type { SocialIdentityFull } from './socialCore.types';

/**
 * Busca a identidade social completa de um usuário.
 * Tenta `social_core_identity_get` (estendida) e cai para `social_identity_get`.
 */
export async function fetchSocialIdentity(userId?: string | null): Promise<SocialIdentityFull | null> {
  // 1) RPC estendida (Prioridade 1)
  try {
    const { data, error } = await (supabase as any).rpc('social_core_identity_get', { p_user: userId ?? null });
    if (!error && data && !data.error) return data as SocialIdentityFull;
  } catch { /* fallback */ }

  // 2) Fallback: RPC original (Onda A)
  const { data, error } = await (supabase as any).rpc('social_identity_get', { p_user: userId ?? null });
  if (error) throw error;
  if (!data || data.error) return null;
  return {
    ...(data as any),
    magnetism: null,
    popularity: null,
    compatibility_signals: null,
    reputation_flags: null,
  } as SocialIdentityFull;
}

/**
 * Recompute on-demand do trust score (mantém compatibilidade com hook legado).
 */
export async function recalculateTrust(): Promise<void> {
  try { await (supabase as any).rpc('user_trust_score_recalc'); } catch { /* noop */ }
}
