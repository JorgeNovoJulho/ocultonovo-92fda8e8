/**
 * notificationTarget — ÚNICA regra de "para onde leva" cada notificação.
 *
 * Usada pelo sino (NotificationBell), pela página /notifications e pelo link
 * do push. Antes cada um tinha a sua tabela e elas divergiam — algumas
 * levavam a rotas inexistentes (/coupons, /verification, /play, /events/:id)
 * e a notificação de mural caía no feed com "sem post vinculado".
 *
 * Mensagens: confere se a conversa ainda existe e se o usuário participa
 * dela. Conversas apagadas ("Excluir para todos") deixavam a notificação
 * órfã — o clique abria um chat vazio. Agora abre o chat com quem enviou.
 */
import { resolveNotificationChatUrl, isChatNotificationType, getDirectNotificationChatUrl } from '@/lib/notificationChatLink';

export interface NotificationTarget {
  url: string;
  state?: Record<string, any>;
  toast?: string;
}

type NotificationLike = {
  id?: string;
  type?: string | null;
  data?: unknown;
  post_id?: string | null;
  related_id?: string | null;
  actor_id?: string | null;
};

type ActorLike = { id?: string | null; username?: string | null } | null | undefined;

type PostFocus = 'likes' | 'comments' | 'saved' | 'shares';

const readData = (n: NotificationLike): Record<string, any> =>
  n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? (n.data as Record<string, any>) : {};

/** Só aceita caminhos internos ("/algo"); URLs absolutas do próprio site viram caminho. */
export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const u = new URL(v);
    if (typeof window !== 'undefined' && u.origin === window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch { /* não é URL */ }
  return null;
}

function isSave(n: NotificationLike, data: Record<string, any>) {
  return data.notification_type === 'save' || data.kind === 'save' || n.type === 'save';
}

function resolvePostFocus(n: NotificationLike, data: Record<string, any>): PostFocus | null {
  if (isSave(n, data)) return 'saved';
  if (data.notification_type === 'share' || data.kind === 'share' || n.type === 'share') return 'shares';
  switch (String(n.type || '')) {
    case 'like': case 'dislike': case 'post_like': case 'gift_received':
      return 'likes';
    case 'comment': case 'reply': case 'mention': case 'post_comment': case 'comment_like': case 'comment_dislike':
      return 'comments';
    default:
      return null;
  }
}

function ownPostUrl(focus: PostFocus, postId: string, pollId?: string) {
  const p = new URLSearchParams({ tab: 'posts', focus, highlight: postId });
  if (pollId) p.set('poll', pollId);
  return `/profile?${p.toString()}`;
}

/** Destino síncrono (sem consultas). Para chat e comunidade sem slug, use `resolveNotificationTarget`. */
export function getNotificationTarget(n: NotificationLike, actor?: ActorLike): NotificationTarget {
  const data = readData(n);
  const type = String(n.type || '');
  const cta = safeInternalPath(data.cta_url) || safeInternalPath(data.url);
  const postId: string | undefined = n.post_id || data.post_id || data.related_id || n.related_id || undefined;
  const pollId: string | undefined = data.poll_id;

  // Mural do perfil (vem como type "mention", sem post).
  if (data.kind === 'mural_post' && data.profile_owner_id) {
    return { url: `/creator/${data.profile_owner_id}#mural`, state: { focusSection: 'mural' } };
  }

  if (isChatNotificationType(type)) {
    return { url: getDirectNotificationChatUrl(n) || '/messages' };
  }

  if (pollId && postId) {
    return {
      url: ownPostUrl('comments', postId, pollId),
      state: { scrollToPost: postId, focus: 'comments', highlight: postId, pollId },
    };
  }

  const focus = resolvePostFocus(n, data);
  if (focus && postId) {
    return { url: ownPostUrl(focus, postId), state: { scrollToPost: postId, focus, highlight: postId } };
  }

  const actorId = data.actor_id || data.sender_id || data.from_user_id || n.actor_id;
  const actorTarget = actor?.username || actor?.id || data.actor_username || data.sender_username || actorId;

  switch (type) {
    case 'visit':
    case 'follow':
      return { url: actorTarget ? `/creator/${actorTarget}` : (type === 'visit' ? '/visits' : '/followers') };
    case 'looking_now':
      return { url: actorTarget ? `/creator/${actorTarget}` : '/radar' };
    case 'match':
    case 'superlike':
    case 'looking_now_match': {
      if (data.conversation_id) return { url: `/messages?c=${encodeURIComponent(data.conversation_id)}` };
      return { url: actorTarget ? `/creator/${actorTarget}` : '/matches' };
    }
    case 'rating_received':
    case 'testimonial_received':
    case 'recommendation_received': {
      const section = data.section
        || (type === 'testimonial_received' ? 'testimonials' : type === 'recommendation_received' ? 'recommendations' : 'rating');
      return { url: `/profile#${section}`, state: { focusSection: section } };
    }
    case 'community_reply':
    case 'community_new_reply':
    case 'community_new_topic':
    case 'community_new_member':
    case 'community_topic_approved':
    case 'community_topic_rejected':
    case 'community_membership_request': {
      const slug = data.slug || data.community_slug;
      const topicId = data.topic_id;
      const hash = data.reply_id ? `#reply-${data.reply_id}` : '';
      if (slug && topicId) return { url: `/comunidades/${slug}/topico/${topicId}${hash}` };
      if (slug) return { url: `/comunidades/${slug}` };
      return { url: '/comunidades' };
    }
    case 'subscription': return { url: '/subscriptions' };
    case 'gift_received': return { url: '/my-gifts', toast: 'Presente sem post vinculado — abrindo Meus Presentes.' };
    case 'goal_contribution': return { url: '/my-gifts' };
    case 'balance_frozen': return { url: '/earnings' };
    case 'coupon_expiring': return { url: cta || '/earnings/coupons' };
    case 'referral_expired': return { url: cta || '/indicacoes' };
    case 'verification_rejected': return { url: '/couple-verification' };
    case 'looking_now_ping': return { url: '/radar' };
    case 'event_chat': return { url: '/events' };
    case 'support_response': return { url: '/support' };
    case 'audio_bio_request': return { url: cta || '/profile#voice-bio', state: { focusSection: 'voice-bio' } };
    case 'approach_received': return { url: cta || '/feed?focus=newcomers', state: { focusSection: 'newcomers' } };
    case 'unlock': return { url: cta || (postId ? ownPostUrl('comments', postId) : '/notifications') };
    case 'oculto_play_new':
      return { url: cta || (data.item_id ? `/oculto-play?item=${encodeURIComponent(data.item_id)}` : '/oculto-play') };
    default:
      break;
  }

  if (focus) {
    // Curtida/comentário de post que não existe mais.
    return { url: '/feed', state: { focus }, toast: 'A publicação desta notificação não está mais disponível — abrindo o feed.' };
  }
  return { url: cta || '/notifications' };
}

/** Confere se a conversa existe e se o usuário logado participa dela. */
async function conversationIsReachable(conversationId: string): Promise<boolean> {
  try {
    const { supabase } = await import('@/lib/supabaseExternal');
    const { data, error } = await (supabase as any)
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .limit(1);
    if (error) return true; // na dúvida, não bloqueia a navegação
    return Array.isArray(data) && data.length > 0;
  } catch {
    return true;
  }
}

function senderFromNotification(n: NotificationLike): string | null {
  const data = readData(n);
  const v = data.sender_id || data.actor_user_id || data.actor_id || data.from_user_id || n.actor_id;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Destino final, com as consultas necessárias (chat e comunidade). */
export async function resolveNotificationTarget(n: NotificationLike, actor?: ActorLike): Promise<NotificationTarget> {
  const data = readData(n);

  if (isChatNotificationType(String(n.type || '')) && data.kind !== 'mural_post') {
    const url = await resolveNotificationChatUrl(n as any);
    const cid = (() => {
      try { return new URL(url, 'https://oculto.local').searchParams.get('c'); } catch { return null; }
    })();
    if (cid && !(await conversationIsReachable(cid))) {
      const sender = senderFromNotification(n);
      if (sender) {
        return {
          url: `/messages?u=${encodeURIComponent(sender)}`,
          toast: 'Essa conversa foi excluída — abrimos um novo chat com quem te enviou a mensagem.',
        };
      }
      return { url: '/messages', toast: 'Essa conversa não está mais disponível.' };
    }
    return { url };
  }

  const target = getNotificationTarget(n, actor);

  // Comunidade sem slug no payload: resolve pelo id.
  const type = String(n.type || '');
  if (type.startsWith('community_') && target.url === '/comunidades' && data.community_id) {
    try {
      const { supabase } = await import('@/lib/supabaseExternal');
      const { data: row } = await (supabase as any)
        .from('oculto_communities')
        .select('slug')
        .eq('id', data.community_id)
        .maybeSingle();
      const slug = row?.slug;
      if (slug && data.topic_id) {
        const hash = data.reply_id ? `#reply-${data.reply_id}` : '';
        return { url: `/comunidades/${slug}/topico/${data.topic_id}${hash}` };
      }
      if (slug) return { url: `/comunidades/${slug}` };
    } catch { /* mantém /comunidades */ }
  }

  return target;
}
