import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Persistência local (Zustand + localStorage) do período assinado por criador.
 *
 * Função principal: SERVIR DE FALLBACK ao paywall enquanto a query da
 * assinatura no Supabase ainda não respondeu (cold reload), evitando o
 * "blink" de bloqueio nos posts pagos. NÃO substitui a verificação remota
 * — apenas mantém a UI liberada até `expires_at`. Após a expiração, o
 * estado local é descartado e o paywall volta a bloquear normalmente.
 *
 * Estrutura: chave `subscriberUserId::creatorId` → { expiresAt, planId, savedAt }.
 */
export interface PersistedSubscription {
  creatorId: string;
  subscriberUserId: string;
  planId?: string | null;
  /** ISO; null = vitalícia (raro) */
  expiresAt: string | null;
  savedAt: string;
}

interface State {
  byKey: Record<string, PersistedSubscription>;
  remember: (entry: Omit<PersistedSubscription, 'savedAt'>) => void;
  forget: (subscriberUserId: string, creatorId: string) => void;
  isActive: (subscriberUserId: string | null | undefined, creatorId: string | null | undefined) => boolean;
  get: (subscriberUserId: string | null | undefined, creatorId: string | null | undefined) => PersistedSubscription | null;
  pruneExpired: () => void;
}

const k = (sub: string, creator: string) => `${sub}::${creator}`;

export const useSubscriptionPersistStore = create<State>()(
  persist(
    (set, get) => ({
      byKey: {},
      remember: (entry) =>
        set((s) => ({
          byKey: {
            ...s.byKey,
            [k(entry.subscriberUserId, entry.creatorId)]: {
              ...entry,
              savedAt: new Date().toISOString(),
            },
          },
        })),
      forget: (subscriberUserId, creatorId) =>
        set((s) => {
          const next = { ...s.byKey };
          delete next[k(subscriberUserId, creatorId)];
          return { byKey: next };
        }),
      isActive: (subscriberUserId, creatorId) => {
        if (!subscriberUserId || !creatorId) return false;
        const entry = get().byKey[k(subscriberUserId, creatorId)];
        if (!entry) return false;
        if (!entry.expiresAt) return true; // vitalícia
        return new Date(entry.expiresAt).getTime() > Date.now();
      },
      get: (subscriberUserId, creatorId) => {
        if (!subscriberUserId || !creatorId) return null;
        return get().byKey[k(subscriberUserId, creatorId)] ?? null;
      },
      pruneExpired: () =>
        set((s) => {
          const now = Date.now();
          const next: Record<string, PersistedSubscription> = {};
          for (const [key, v] of Object.entries(s.byKey)) {
            if (!v.expiresAt || new Date(v.expiresAt).getTime() > now) next[key] = v;
          }
          return { byKey: next };
        }),
    }),
    {
      name: 'oculto-subscription-persist',
      version: 1,
      onRehydrateStorage: () => (state) => {
        // Prune imediato no boot — remove qualquer entrada já vencida.
        try { state?.pruneExpired(); } catch {}
      },
    }
  )
);

// Auto-prune periódico (a cada 30s, lado cliente apenas).
// Garante que assim que o período assinado expira o paywall volte a bloquear
// imediatamente, sem precisar de F5.
if (typeof window !== 'undefined') {
  const tick = () => {
    try { useSubscriptionPersistStore.getState().pruneExpired(); } catch {}
  };
  // Primeiro tick logo após o load
  window.setTimeout(tick, 1000);
  window.setInterval(tick, 30_000);
  // Quando a aba volta ao foco, valida na hora
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('online', tick);
}
