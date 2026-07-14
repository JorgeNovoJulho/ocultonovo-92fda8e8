const CHAT_TYPES = new Set(['message', 'new_message', 'super_dm', 'attention_ping']);

type NotificationLike = {
  type?: string | null;
  actor_id?: string | null;
  data?: unknown;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const readData = (notification: NotificationLike) =>
  notification.data && typeof notification.data === 'object' && !Array.isArray(notification.data)
    ? (notification.data as Record<string, any>)
    : {};

export function isChatNotificationType(type?: string | null) {
  return CHAT_TYPES.has(String(type || ''));
}

function normalizeMessagesUrl(rawUrl?: unknown): string | null {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl, 'https://oculto.local');
    if (parsed.pathname !== '/messages') return null;
    const cid = firstString(
      parsed.searchParams.get('c'),
      parsed.searchParams.get('conversation'),
      parsed.searchParams.get('conversation_id'),
      parsed.searchParams.get('conversationId'),
      parsed.searchParams.get('chat'),
      parsed.searchParams.get('chat_id'),
    );
    if (cid) return `/messages?c=${encodeURIComponent(cid)}`;
    const uid = firstString(
      parsed.searchParams.get('u'),
      parsed.searchParams.get('user'),
      parsed.searchParams.get('user_id'),
      parsed.searchParams.get('sender_id'),
      parsed.searchParams.get('profile_id'),
      parsed.searchParams.get('to'),
    );
    if (uid) return `/messages?u=${encodeURIComponent(uid)}`;
    return '/messages';
  } catch {
    return null;
  }
}

function getConversationIdFromPayload(notification: NotificationLike): string | null {
  const data = readData(notification);
  const urlConversation = normalizeMessagesUrl(
    data.url || data.cta_url || data.action_url || data.link || data.deep_link,
  );
  if (urlConversation?.includes('?c=')) {
    return new URL(urlConversation, 'https://oculto.local').searchParams.get('c');
  }
  return firstString(
    data.conversation_id,
    data.conversationId,
    data.conversation,
    data.chat_id,
    data.chatId,
    (notification as any).conversation_id,
  );
}

function getSenderIdFromPayload(notification: NotificationLike): string | null {
  const data = readData(notification);
  const urlTarget = normalizeMessagesUrl(
    data.url || data.cta_url || data.action_url || data.link || data.deep_link,
  );
  if (urlTarget?.includes('?u=')) {
    return new URL(urlTarget, 'https://oculto.local').searchParams.get('u');
  }
  return firstString(
    data.sender_id,
    data.senderId,
    data.from_user_id,
    data.fromUserId,
    data.actor_id,
    data.actor_profile_id,
    data.profile_id,
    (notification as any).actor_id,
  );
}

export function getDirectNotificationChatUrl(notification: NotificationLike): string | null {
  if (!isChatNotificationType(notification.type as string)) return null;
  const cid = getConversationIdFromPayload(notification);
  if (cid) return `/messages?c=${encodeURIComponent(cid)}`;
  const senderId = getSenderIdFromPayload(notification);
  if (senderId) return `/messages?u=${encodeURIComponent(senderId)}`;
  return null;
}

export async function resolveNotificationChatUrl(notification: NotificationLike): Promise<string> {
  if (!isChatNotificationType(notification.type as string)) return '/messages';

  const cid = getConversationIdFromPayload(notification);
  if (cid) return `/messages?c=${encodeURIComponent(cid)}`;

  const data = readData(notification);
  const messageId = firstString(
    data.message_id,
    data.messageId,
    data.msg_id,
    data.last_message_id,
    data.lastMessageId,
    (notification as any).message_id,
  );

  if (messageId) {
    try {
      const { supabase } = await import('@/lib/supabaseExternal');
      const { data: msg } = await (supabase as any)
        .from('messages')
        .select('conversation_id, sender_id')
        .eq('id', messageId)
        .maybeSingle();
      if (msg?.conversation_id) return `/messages?c=${encodeURIComponent(msg.conversation_id)}`;
      if (msg?.sender_id) return `/messages?u=${encodeURIComponent(msg.sender_id)}`;
    } catch {
      // fallback abaixo
    }
  }

  const senderId = getSenderIdFromPayload(notification);
  if (senderId) return `/messages?u=${encodeURIComponent(senderId)}`;

  const url = normalizeMessagesUrl(data.url || data.cta_url || data.action_url || data.link || data.deep_link);
  return url || '/messages';
}