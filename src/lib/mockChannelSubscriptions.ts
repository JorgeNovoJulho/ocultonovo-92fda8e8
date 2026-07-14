/**
 * Mock local de assinaturas de canais VIP.
 * Persistido em localStorage. Reativo via window event "oculto:mock-channel-subs".
 *
 * Usado para simular liberação imediata de conteúdo após o checkout do canal,
 * mostrar contagem regressiva de validade e reaplicar paywall automaticamente
 * quando a assinatura expira — sem depender do backend.
 */

const STORAGE_KEY = "oculto.mock.channel-subs.v1";
const EVENT = "oculto:mock-channel-subs";

export type MockBillingCycle = "monthly" | "annual" | "lifetime";

export interface MockChannelSubscription {
  /** profiles.id do criador (usado por useMyVipAccess) */
  creatorProfileId: string;
  /** auth user_id do criador (para casar com posts.user_id) */
  creatorUserId?: string | null;
  channelName: string;
  channelUsername?: string | null;
  channelAvatar?: string | null;
  planTitle: string;
  cycle: MockBillingCycle;
  price: number;
  startISO: string;
  /** null = vitalício */
  endISO: string | null;
  createdAt: string;
}

function read(): MockChannelSubscription[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: MockChannelSubscription[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export function cycleDurationDays(cycle: MockBillingCycle): number | null {
  if (cycle === "monthly") return 30;
  if (cycle === "annual") return 365;
  return null; // lifetime
}

export const mockChannelSubsStore = {
  STORAGE_KEY,
  EVENT,
  list(): MockChannelSubscription[] {
    return read();
  },
  /** Retorna apenas assinaturas ativas (endISO no futuro ou null=vitalício). */
  active(): MockChannelSubscription[] {
    const now = Date.now();
    return read().filter((s) => !s.endISO || new Date(s.endISO).getTime() > now);
  },
  /** Sobrescreve / cria uma assinatura para o criador. */
  upsert(input: Omit<MockChannelSubscription, "startISO" | "endISO" | "createdAt"> & {
    startISO?: string;
    endISO?: string | null;
  }) {
    const startISO = input.startISO ?? new Date().toISOString();
    const days = cycleDurationDays(input.cycle);
    const endISO =
      input.endISO !== undefined
        ? input.endISO
        : days
        ? new Date(Date.now() + days * 86400_000).toISOString()
        : null;

    const next: MockChannelSubscription = {
      creatorProfileId: input.creatorProfileId,
      creatorUserId: input.creatorUserId ?? null,
      channelName: input.channelName,
      channelUsername: input.channelUsername ?? null,
      channelAvatar: input.channelAvatar ?? null,
      planTitle: input.planTitle,
      cycle: input.cycle,
      price: input.price,
      startISO,
      endISO,
      createdAt: new Date().toISOString(),
    };

    const current = read().filter(
      (s) => s.creatorProfileId !== input.creatorProfileId,
    );
    write([next, ...current]);
    return next;
  },
  remove(creatorProfileId: string) {
    write(read().filter((s) => s.creatorProfileId !== creatorProfileId));
  },
  clear() {
    write([]);
  },
  subscribe(fn: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const handler = () => fn();
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  },
};

/** Status derivado de uma assinatura mock para UI. */
export function getMockSubStatus(sub: MockChannelSubscription) {
  const now = Date.now();
  if (!sub.endISO) {
    return {
      active: true,
      lifetime: true,
      daysRemaining: Infinity as number,
      pctElapsed: 0,
      expired: false,
    };
  }
  const end = new Date(sub.endISO).getTime();
  const start = new Date(sub.startISO).getTime();
  const totalMs = Math.max(end - start, 1);
  const elapsedMs = Math.max(now - start, 0);
  const remainingMs = end - now;
  const daysRemaining = Math.max(Math.ceil(remainingMs / 86400_000), 0);
  return {
    active: remainingMs > 0,
    lifetime: false,
    daysRemaining,
    pctElapsed: Math.min(100, Math.round((elapsedMs / totalMs) * 100)),
    expired: remainingMs <= 0,
  };
}
