/**
 * Free plan: limita 5 cards "ativos" (sem blur) por janela de 24h.
 * A cada 5 cards utilizados (swipe like/dislike/superlike), os próximos
 * ficam com blur e qualquer ação não persiste no banco até liberar
 * novamente após 24h (a partir do PRIMEIRO card da janela).
 *
 * Persiste no localStorage para sobreviver a refresh.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { isFreePlan } from '@/lib/planType';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const FREE_LIMIT = 5;

interface DailyState {
  windowStart: number; // timestamp ms
  used: number;
}

function storageKey(userId: string) {
  return `pp_daily_limit_${userId}`;
}

function readState(userId: string): DailyState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { windowStart: 0, used: 0 };
    const parsed = JSON.parse(raw) as DailyState;
    // Janela expirada → reset
    if (Date.now() - parsed.windowStart >= WINDOW_MS) {
      return { windowStart: 0, used: 0 };
    }
    return parsed;
  } catch {
    return { windowStart: 0, used: 0 };
  }
}

function writeState(userId: string, state: DailyState) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {}
}

export function usePerfectPairDailyLimit() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isFree = isFreePlan(profile?.plan_type);

  const [state, setState] = useState<DailyState>({ windowStart: 0, used: 0 });

  // Carrega estado ao montar / mudar usuário
  useEffect(() => {
    if (!user?.id) return;
    setState(readState(user.id));
  }, [user?.id]);

  // Re-checa a cada minuto se a janela expirou (libera novos 5 cards)
  useEffect(() => {
    if (!user?.id || !isFree) return;
    const id = window.setInterval(() => {
      setState((prev) => {
        if (prev.windowStart && Date.now() - prev.windowStart >= WINDOW_MS) {
          const reset = { windowStart: 0, used: 0 };
          writeState(user.id, reset);
          return reset;
        }
        return prev;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, [user?.id, isFree]);

  const reachedLimit = isFree && state.used >= FREE_LIMIT;
  const remaining = isFree ? Math.max(0, FREE_LIMIT - state.used) : Infinity;
  const resetsAt =
    isFree && state.windowStart > 0 ? state.windowStart + WINDOW_MS : null;

  /** Incrementa contador de cards usados. Se atingiu o limite, NÃO persiste mais. */
  const consumeCard = useCallback((): { allowed: boolean; reachedNow: boolean } => {
    if (!isFree || !user?.id) return { allowed: true, reachedNow: false };
    const current = readState(user.id);

    // Reset janela se expirou
    let next = current;
    if (current.windowStart && Date.now() - current.windowStart >= WINDOW_MS) {
      next = { windowStart: 0, used: 0 };
    }

    if (next.used >= FREE_LIMIT) {
      return { allowed: false, reachedNow: false };
    }

    const updated: DailyState = {
      windowStart: next.windowStart || Date.now(),
      used: next.used + 1,
    };
    writeState(user.id, updated);
    setState(updated);
    return { allowed: true, reachedNow: updated.used >= FREE_LIMIT };
  }, [isFree, user?.id]);

  return {
    isFree,
    used: state.used,
    remaining,
    reachedLimit,
    resetsAt,
    consumeCard,
    limit: FREE_LIMIT,
  };
}
