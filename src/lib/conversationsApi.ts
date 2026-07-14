import { supabase } from '@/lib/supabaseExternal';

/**
 * Resolve get_or_create_conversation tentando ambas as assinaturas
 * presentes no banco externo: (p1, p2) e (p_user1_id, p_user2_id).
 * Retorna o id da conversa ou um erro normalizado.
 */
export async function getOrCreateConversationId(user1: string, user2: string) {
  // Tentativa 1: assinatura curta (p1, p2)
  let res = await (supabase as any).rpc('get_or_create_conversation', { p1: user1, p2: user2 });

  // Se a função não existir com essa assinatura, tenta a assinatura longa
  if (res.error && /Could not find the function|PGRST202/i.test(res.error.message || '')) {
    res = await (supabase as any).rpc('get_or_create_conversation', {
      p_user1_id: user1,
      p_user2_id: user2,
    });
  }

  if (res.error) {
    return { id: null as string | null, error: res.error };
  }

  return { id: (res.data as string) ?? null, error: null };
}