type NotificationActorSource = {
  actor_id?: string | null;
  data?: unknown;
  title?: string | null;
  body?: string | null;
  message?: string | null;
  type?: string | null;
};

type ActorDisplaySource = {
  display_name?: string | null;
  name?: string | null;
  username?: string | null;
};

const ACTOR_ID_KEYS = [
  'actor_id',
  'actor_profile_id',
  'from_user_id',
  'sender_id',
  'user_id',
  'pair_user_id',
  'actor_user_id',
  'actor_username',
  'username',
] as const;

const ACTOR_AVATAR_KEYS = [
  'pair_user_avatar',
  'actor_avatar_url',
  'sender_avatar',
  'avatar_url',
] as const;

const ACTOR_NAME_KEYS = [
  'actor_name',
  'display_name',
  'name',
  'sender_name',
  'username',
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeActorLookupKey(value: string | null | undefined): string | null {
  const normalized = asNonEmptyString(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || null;
  return normalized || null;
}

function extractActorFromText(text?: string | null): string | null {
  const cleanText = asNonEmptyString(text);
  if (!cleanText) return null;

  const handleMatch = cleanText.match(/@([^\s:,.!?]+)/u);
  if (handleMatch?.[1]) {
    return handleMatch[1].trim();
  }

  const actorMatch = cleanText.match(/^@?(.+?)\s+(?:curtiu|comentou|respondeu|mencionou|começou|enviou|salvou|desbloqueou)\b/i);
  return asNonEmptyString(actorMatch?.[1]);
}

export function extractNotificationActorId(source: NotificationActorSource): string | null {
  const directActorId = asNonEmptyString(source.actor_id);
  if (directActorId) return directActorId;

  const data = asRecord(source.data);
  for (const key of ACTOR_ID_KEYS) {
    const value = asNonEmptyString(data[key]);
    if (value) return value;
  }

  for (const key of ACTOR_NAME_KEYS) {
    const value = asNonEmptyString(data[key]);
    if (value) return value;
  }

  return (
    extractActorFromText(source.title) ||
    extractActorFromText(source.body) ||
    extractActorFromText(source.message)
  );
}

export function extractNotificationAvatarFallback(source: NotificationActorSource): string | null {
  const data = asRecord(source.data);
  for (const key of ACTOR_AVATAR_KEYS) {
    const value = asNonEmptyString(data[key]);
    if (value) return value;
  }

  return null;
}

export function getActorDisplayLabel(actor?: ActorDisplaySource | null): string {
  // Regra de privacidade do projeto: SEMPRE preferir @username — nunca expor
  // nome real/display_name em UI pública. Mantém fallback vazio se faltar tudo.
  const uname = asNonEmptyString(actor?.username);
  if (uname) return `@${uname.replace(/^@+/, '')}`;
  return '';
}

export function getActorInitial(actor?: ActorDisplaySource | null): string {
  const label = getActorDisplayLabel(actor);
  return label ? label.charAt(0).toUpperCase() : '?';
}

/**
 * Resolve @username do ator a partir de TODAS as fontes possíveis (profile
 * resolvido, data da notificação, texto). NUNCA retorna nome real.
 */
function resolveActorHandle(
  source: NotificationActorSource,
  actor?: ActorDisplaySource | null,
): string | null {
  const fromActor = asNonEmptyString(actor?.username);
  if (fromActor) return `@${fromActor.replace(/^@+/, '')}`;
  const data = asRecord(source.data);
  const handleKeys = ['sender_username', 'actor_username', 'username', 'sender_handle', 'actor_handle'];
  for (const k of handleKeys) {
    const v = asNonEmptyString(data[k]);
    if (v) return `@${v.replace(/^@+/, '')}`;
  }
  const fromText =
    asNonEmptyString(source.title)?.match(/@([A-Za-z0-9_\.]+)/)?.[1] ||
    asNonEmptyString(source.body)?.match(/@([A-Za-z0-9_\.]+)/)?.[1] ||
    asNonEmptyString(source.message)?.match(/@([A-Za-z0-9_\.]+)/)?.[1] ||
    null;
  return fromText ? `@${fromText}` : null;
}

/**
 * Defesa em camadas: substitui prefixo "Nome Sobrenome" antes de verbos
 * conhecidos por "@username" (ou "Alguém" se username não disponível).
 * Aplica a QUALQUER notificação para garantir que nome real jamais vaze.
 */
function sanitizeRealNamePrefix(text: string, actorLabel: string | null): string {
  if (!text) return text;
  const label = actorLabel || 'Alguém';
  const verbs =
    '(?:te enviou|enviou|te acenou|acenou para você|acenou|te curtiu|curtiu|comentou|respondeu|mencionou|começou|salvou|desbloqueou)';
  const emojiPrefixMatch = text.match(/^([\p{Extended_Pictographic}\u2600-\u27BF]+\s*)/u);
  const emojiPrefix = emojiPrefixMatch ? emojiPrefixMatch[1] : '';
  const rest = text.slice(emojiPrefix.length);
  if (/^@[A-Za-z0-9_\.]+/.test(rest)) return text;
  const re = new RegExp(`^([^@]+?)\\s+${verbs}\\b`, 'i');
  const m = rest.match(re);
  if (!m) return text;
  const verbMatch = rest.slice(m[1].length).match(new RegExp(`^\\s+${verbs}`, 'i'));
  const verb = verbMatch ? verbMatch[0].trim() : '';
  const tail = rest.slice(m[1].length + (verbMatch ? verbMatch[0].length : 0));
  return `${emojiPrefix}${label} ${verb}${tail}`;
}

export function getNotificationDisplayTitle(
  source: NotificationActorSource,
  actor?: ActorDisplaySource | null,
): string {
  const rawTitle = asNonEmptyString(source.title);
  const rawBody = asNonEmptyString(source.body) || asNonEmptyString(source.message);
  const data = asRecord(source.data);
  const notificationType = asNonEmptyString(source.type) || asNonEmptyString(data.notification_type);
  const isLegacySaveTitle = rawTitle?.toLowerCase() === 'post salvo';
  const isSaveNotification = notificationType === 'save' || asNonEmptyString(data.notification_subtype) === 'save' || isLegacySaveTitle;

  const actorLabel = resolveActorHandle(source, actor);
  const sanitized = sanitizeRealNamePrefix(rawTitle || rawBody || '', actorLabel);

  if (!isSaveNotification) return sanitized || '';

  if (!isLegacySaveTitle && rawTitle) return sanitizeRealNamePrefix(rawTitle, actorLabel);

  const preferredActorLabel = actorLabel || getActorDisplayLabel(actor);
  return preferredActorLabel
    ? `${preferredActorLabel} salvou sua publicação`
    : sanitized || 'Alguém salvou sua publicação';
}

/**
 * Sanitiza o body — defesa em camadas, aplica em qualquer notificação.
 */
export function getNotificationDisplayBody(
  source: NotificationActorSource,
  actor?: ActorDisplaySource | null,
): string {
  const rawBody = asNonEmptyString(source.body) || asNonEmptyString(source.message) || '';
  if (!rawBody) return '';
  const actorLabel = resolveActorHandle(source, actor);
  return sanitizeRealNamePrefix(rawBody, actorLabel);
}
