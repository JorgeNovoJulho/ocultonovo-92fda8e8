import { supabase } from '@/lib/supabaseExternal';
import type { AuraRoomItem } from '@/hooks/useAuraRoomsList';

/**
 * Retorna a lista textual de requisitos mínimos da sala
 * (renderizada nos gates / badges / observer hints).
 */
export function describeRoomRequirements(room: Pick<AuraRoomItem,
  'vip_only' | 'required_plan' | 'requires_kyc' | 'couple_only' |
  'min_aura_level' | 'min_social_score' | 'min_prestige_xp' |
  'hour_from' | 'hour_to' | 'allowed_genders'
>): string[] {
  const out: string[] = [];
  if (room.vip_only) out.push('Plano VIP ativo');
  else if (room.required_plan === 'premium') out.push('Plano Premium ou VIP');
  else if (room.required_plan && room.required_plan !== 'free') {
    out.push(`Plano ${room.required_plan.toUpperCase()}`);
  }
  if (room.requires_kyc) out.push('Verificação KYC concluída');
  if (room.couple_only) out.push('Conta de casal');
  const genders = (room.allowed_genders ?? []).filter(Boolean);
  if (!room.couple_only && genders.length > 0) {
    const labelMap: Record<string, string> = { homem: 'Homem', mulher: 'Mulher', casal: 'Casal', trans: 'Trans' };
    const pretty = genders.map((g) => labelMap[g] ?? g).join(' · ');
    out.push(`Tipo permitido: ${pretty}`);
  }
  if (room.min_aura_level > 0) out.push(`Aura nível ${room.min_aura_level}+`);
  if (room.min_social_score > 0) out.push(`Score Social ${room.min_social_score}+`);
  if (room.min_prestige_xp > 0) out.push(`Prestígio ${room.min_prestige_xp}+ XP`);
  if (room.hour_from != null && room.hour_to != null) {
    out.push(`Janela ${String(room.hour_from).padStart(2,'0')}h–${String(room.hour_to).padStart(2,'0')}h`);
  }
  return out;
}

export interface UnavailabilityResult {
  /** Card simples para o "Foto temp." quando não temos user_id */
  unavailable: boolean;
  /** Motivo legível em PT-BR */
  reason: string;
  /** Código curto */
  code:
    | 'profile_unsynced'
    | 'banned'
    | 'shadowbanned'
    | 'frozen'
    | 'invisible'
    | 'unknown'
    | 'ok';
  /** auth.user_id resolvido (se existir) */
  userId: string | null;
}

/**
 * Resolve o real motivo pelo qual o card mostra "Usuário indisponível".
 * Retorna sempre um objeto — `unavailable=false` quando tudo OK.
 */
export async function resolveUserUnavailability(identifier: string): Promise<UnavailabilityResult> {
  // Resilient lookup: aceita id, user_id ou username — combina os 3 e usa o que vier
  const fields = 'id, user_id, username, is_banned, is_shadowbanned, is_frozen, frozen_until, is_invisible, profile_completed_at';
  const tryQuery = async (col: 'id' | 'user_id' | 'username') => {
    const { data } = await (supabase as any)
      .from('profiles')
      .select(fields)
      .eq(col, identifier)
      .maybeSingle();
    return data;
  };

  let data = await tryQuery('id');
  if (!data) data = await tryQuery('user_id');
  if (!data && typeof identifier === 'string' && !identifier.includes('-')) {
    data = await tryQuery('username');
  }

  // ⚠️ Importante: se o card existe mas a leitura falhou (RLS/cache), NÃO
  // exibimos "indisponível" para evitar mensagens erradas em perfis válidos
  // como Demeter / casaltomate. Tratamos como "ok" silencioso.
  if (!data) {
    return { unavailable: false, reason: '', code: 'ok', userId: null };
  }

  const uid = (data as any).user_id ?? null;

  // Cadastro incompleto SOMENTE se realmente não há user_id E o profile_completed_at
  // também é nulo (evita falso-positivo em perfis legados completos).
  if (!uid && !(data as any).profile_completed_at) {
    return {
      unavailable: true,
      reason: 'Cadastro incompleto: peça à pessoa que finalize o perfil para receber interações.',
      code: 'profile_unsynced',
      userId: null,
    };
  }
  if (data.is_banned === true) {
    return { unavailable: true, reason: 'Conta suspensa pela moderação.', code: 'banned', userId: uid };
  }
  if (data.is_shadowbanned === true) {
    return { unavailable: true, reason: 'Visibilidade reduzida temporariamente — interaja mais tarde.', code: 'shadowbanned', userId: uid };
  }
  if (data.is_frozen === true || (data.frozen_until && new Date(data.frozen_until) > new Date())) {
    return { unavailable: true, reason: 'Conta congelada — disciplina ativa pela moderação.', code: 'frozen', userId: uid };
  }
  if (data.is_invisible === true) {
    return { unavailable: true, reason: 'Usuário em modo invisível agora.', code: 'invisible', userId: uid };
  }
  return { unavailable: false, reason: '', code: 'ok', userId: uid };
}

const NOTIFY_CACHE_KEY = (uid: string) => `oculto:notify_complete_profile:${uid}`;

/**
 * Envia notificação ao usuário pedindo regularização (apenas para profile_unsynced).
 * Throttle local de 24h para evitar spam.
 */
export async function notifyUserToRegularize(targetUserId: string | null, code: UnavailabilityResult['code']) {
  if (!targetUserId || code !== 'profile_unsynced') return;
  try {
    const key = NOTIFY_CACHE_KEY(targetUserId);
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    await (supabase as any).from('notifications').insert({
      user_id: targetUserId,
      type: 'profile_regularize',
      title: '✨ Finalize seu perfil para receber Aura Match',
      body: 'Alguém tentou interagir com você no Aura Match, mas seu perfil ainda não está completo. Conclua para voltar a aparecer e ser descoberto.',
    } as any);
  } catch {
    /* silencioso */
  }
}
