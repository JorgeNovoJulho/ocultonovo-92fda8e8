/**
 * auraInteractionXp — wrapper único para o RPC `aura_xp_interaction_charge`.
 *
 * - Idempotente via `ref_key` (você passa ex.: `like:{postId}:{actorId}`).
 * - Mostra toasts claros de sucesso e erro (RPC ausente, sem XP, etc.).
 * - Anti-spam por ação (não polui o usuário com toasts duplicados).
 *
 * Catálogo (configurável em oculto_aura_xp_interaction_costs):
 *   post_like / post_dislike / post_comment / post_save / post_share /
 *   view_likers / view_comments
 */
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

export type AuraActionKey =
  | 'post_like'
  | 'post_dislike'
  | 'post_comment'
  | 'post_save'
  | 'post_share'
  | 'view_likers'
  | 'view_comments';

interface ChargeParams {
  actionKey: AuraActionKey;
  postId?: string | null;
  receiverId?: string | null;
  refKey: string;
  /** Se true, suprime o toast de sucesso (mantém só o de erro). */
  silentOnSuccess?: boolean;
}

interface ChargeResult {
  ok: boolean;
  reason: string;
  actor_cost: number;
  receiver_reward: number;
  actor_balance: number;
  receiver_balance: number;
}

// Anti-spam por ação (não repetir toast do mesmo erro em rajada)
const lastErrorAt = new Map<string, number>();
const ERROR_COOLDOWN_MS = 8_000;

function shouldShowError(key: string) {
  const now = Date.now();
  const last = lastErrorAt.get(key) ?? 0;
  if (now - last < ERROR_COOLDOWN_MS) return false;
  lastErrorAt.set(key, now);
  return true;
}

const ACTION_LABEL: Record<AuraActionKey, string> = {
  post_like: 'curtir',
  post_dislike: 'descurtir',
  post_comment: 'comentar',
  post_save: 'salvar',
  post_share: 'compartilhar',
  view_likers: 'ver curtidas',
  view_comments: 'ler comentários',
};

export async function chargeInteractionXp(params: ChargeParams): Promise<ChargeResult | null> {
  const { actionKey, postId, receiverId, refKey, silentOnSuccess } = params;
  const label = ACTION_LABEL[actionKey] ?? actionKey;

  try {
    const { data, error } = await (supabase as any).rpc('aura_xp_interaction_charge', {
      p_action_key: actionKey,
      p_post_id: postId ?? null,
      p_receiver_id: receiverId ?? null,
      p_ref_key: refKey,
    });

    if (error) {
      const msg = String(error?.message || '').toLowerCase();
      const code = String((error as any)?.code || '');
      if (!shouldShowError(`err:${actionKey}`)) return null;

      if (code === 'PGRST202' || msg.includes('does not exist') || msg.includes('function')) {
        toast.error('Economia de XP indisponível', {
          description: 'O RPC aura_xp_interaction_charge ainda não foi aplicado no banco.',
          duration: 4000,
        });
      } else if (msg.includes('not_authenticated') || msg.includes('jwt')) {
        toast.error('Faça login para registrar XP', { duration: 3000 });
      } else {
        toast.error(`Não foi possível registrar XP de ${label}`, {
          description: error.message,
          duration: 3000,
        });
      }
      return null;
    }

    const row: ChargeResult | undefined = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    // Caso de erro lógico vindo do RPC
    if (!row.ok) {
      if (!shouldShowError(`logic:${actionKey}:${row.reason}`)) return row;
      switch (row.reason) {
        case 'insufficient_xp':
          toast.error('XP insuficiente', {
            description: `Você precisa de ${row.actor_cost} XP para ${label}. Saldo atual: ${row.actor_balance}.`,
            duration: 3500,
          });
          break;
        case 'auth_required':
          toast.error('Faça login para ganhar/gastar XP');
          break;
        case 'profile_missing':
          toast.error('Perfil não sincronizado para XP');
          break;
        default:
          toast.error(`Falha na economia de XP: ${row.reason}`);
      }
      return row;
    }

    // Sucesso: só mostra toast se houve débito ou prêmio real
    if (!silentOnSuccess) {
      if (row.reason === 'already_charged') {
        // Não polui — interação repetida (idempotência)
      } else if (row.reason === 'self_action') {
        // Sem cobrança em interação consigo mesmo
      } else if (row.actor_cost > 0 || row.receiver_reward !== 0) {
        const parts: string[] = [];
        if (row.actor_cost > 0) parts.push(`-${row.actor_cost} XP`);
        if (row.receiver_reward > 0) parts.push(`+${row.receiver_reward} XP p/ autor`);
        if (row.receiver_reward < 0) parts.push(`${row.receiver_reward} XP p/ autor`);
        if (parts.length > 0) {
          toast(parts.join(' · '), {
            description: `Saldo: ${row.actor_balance} XP`,
            duration: 1600,
          });
        }
      }
    }

    return row;
  } catch (err: any) {
    if (shouldShowError(`net:${actionKey}`)) {
      toast.error('Falha de rede na economia de XP', {
        description: err?.message || 'Verifique sua conexão.',
        duration: 3000,
      });
    }
    return null;
  }
}
