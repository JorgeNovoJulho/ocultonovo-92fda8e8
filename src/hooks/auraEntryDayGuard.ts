// Pure helpers — sem dependência de supabase/dom, seguro para testes unitários.
export const NEW_ACCOUNT_RARE_LOCK_DAYS = 1;
export const ENTRY_DAY_XP_CAP = 100;
export const ENTRY_DAY_LEVEL_CAP = 2;
export const RARE_XP_THRESHOLD = 10000;
export const RARE_LEVEL_THRESHOLD = 25;

export interface EntryDayMetricsLike {
  total_xp: number;
  current_level: number;
  account_age_days: number;
}

export function accountAgeDaysFromCreatedAt(createdAt?: string | null): number {
  if (!createdAt) return 0;
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

/**
 * Guard de regressão: nenhum usuário no "dia da entrada" (account_age_days < 1)
 * pode exibir XP >= 10000 ou nível >= 25. Força fallback 100 XP / nível 2.
 */
export function sanitizeEntryDayMetrics<T extends EntryDayMetricsLike>(m: T): T {
  const ageDays = Math.max(0, Number(m.account_age_days ?? 0));
  if (ageDays >= NEW_ACCOUNT_RARE_LOCK_DAYS) return m;
  const xp = Math.max(0, Number(m.total_xp ?? 0));
  const lvl = Math.max(1, Number(m.current_level ?? 1));
  if (xp < RARE_XP_THRESHOLD && lvl < RARE_LEVEL_THRESHOLD) return m;
  return {
    ...m,
    total_xp: ENTRY_DAY_XP_CAP,
    current_level: ENTRY_DAY_LEVEL_CAP,
  };
}

export function sanitizeEntryDayProgress<T extends { xp: number; level: number }>(
  progress: T,
  createdAt?: string | null,
): T {
  const sanitized = sanitizeEntryDayMetrics({
    total_xp: Number(progress.xp ?? 0),
    current_level: Number(progress.level ?? 1),
    account_age_days: accountAgeDaysFromCreatedAt(createdAt),
  });
  if (sanitized.total_xp === progress.xp && sanitized.current_level === progress.level) return progress;
  return { ...progress, xp: sanitized.total_xp, level: sanitized.current_level };
}

export function isRareLockedForNewAccount(
  _achievementId: string,
  xpReward: number,
  metrics: { account_age_days: number },
): boolean {
  if (xpReward < RARE_XP_THRESHOLD) return false;
  if ((metrics.account_age_days || 0) >= NEW_ACCOUNT_RARE_LOCK_DAYS) return false;
  return true;
}
