/**
 * Cache local (localStorage) do voto do usuário em uma enquete.
 * Atua como fallback de UX para que o estado "votado" permaneça instantâneo
 * mesmo após reload, antes do refetch do servidor concluir.
 *
 * O servidor continua sendo a fonte da verdade; este cache nunca substitui
 * o my_vote vindo do banco quando ele existir.
 */
const PREFIX = 'poll-vote:v1:';

export interface CachedPollVote {
  optionId: string;
  votedAt: number;
}

function key(pollId: string, userId: string) {
  return `${PREFIX}${pollId}:${userId}`;
}

export function readCachedVote(
  pollId: string | undefined,
  userId: string | undefined,
): CachedPollVote | null {
  if (!pollId || !userId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(pollId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPollVote;
    if (!parsed?.optionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedVote(
  pollId: string | undefined,
  userId: string | undefined,
  optionId: string,
) {
  if (!pollId || !userId || typeof window === 'undefined') return;
  try {
    const payload: CachedPollVote = { optionId, votedAt: Date.now() };
    window.localStorage.setItem(key(pollId, userId), JSON.stringify(payload));
  } catch {
    /* quota / disabled storage — silencioso */
  }
}
