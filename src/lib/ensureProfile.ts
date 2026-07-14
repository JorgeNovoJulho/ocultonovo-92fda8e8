import { supabase } from '@/lib/supabaseExternal';

/**
 * Resolve o profiles.id do usuário autenticado.
 * 1) Tenta o RPC `ensure_my_profile` (idempotente, cria se faltar).
 * 2) Se RPC falhar, usa o `localProfileId` como fallback otimista.
 * 3) Por último, busca diretamente em `profiles` via `auth.uid()`.
 *
 * IMPORTANTE: usa o cliente do Supabase EXTERNO (`@/lib/supabaseExternal`).
 */
export async function resolveActorId(localProfileId?: string | null): Promise<string> {
  // 1) RPC oficial
  try {
    const { data, error } = await (supabase as any).rpc('ensure_my_profile');
    if (!error && data) return data as string;
  } catch {
    /* fallback abaixo */
  }

  // 2) Descobre o auth uid antes de validar fallbacks
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id;
  if (!uid) throw new Error('Profile not found');

  // 3) Valida o id local antes de reutilizar (evita usar auth.uid no lugar de profiles.id)
  if (localProfileId) {
    const { data: localProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', localProfileId)
      .maybeSingle();

    if (localProfile?.id) return localProfile.id as string;
  }

  // 4) Último recurso: query direta por user_id
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  if (prof?.id) return prof.id as string;

  throw new Error('Profile not found');
}
