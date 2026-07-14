import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Persistência local (Zustand + localStorage) do MEU plano (plan_type + expiresAt).
 *
 * Objetivo: manter o paywall coerente mesmo offline / após reload, sem precisar
 * esperar a query da Supabase. Auto-invalida quando `expiresAt` passa, voltando
 * o usuário ao estado `free` para que o paywall reapareça automaticamente.
 */
export interface PersistedMyPlan {
  userId: string;
  plan: string;          // 'free' | 'premium' | 'vip' | ...
  expiresAt: string | null; // ISO; null = vitalício
  savedAt: string;
}

interface State {
  current: PersistedMyPlan | null;
  setPlan: (entry: Omit<PersistedMyPlan, 'savedAt'>) => void;
  clear: () => void;
  /** Retorna o plano efetivo (pruning embutido). Se expirou, devolve null. */
  effective: () => PersistedMyPlan | null;
  prune: () => void;
}

export const useMyPlanPersistStore = create<State>()(
  persist(
    (set, get) => ({
      current: null,
      setPlan: (entry) =>
        set({ current: { ...entry, savedAt: new Date().toISOString() } }),
      clear: () => set({ current: null }),
      effective: () => {
        const c = get().current;
        if (!c) return null;
        if (!c.expiresAt) return c; // vitalício / sem expiração
        if (new Date(c.expiresAt).getTime() <= Date.now()) return null;
        return c;
      },
      prune: () =>
        set((s) => {
          const c = s.current;
          if (!c) return s;
          if (!c.expiresAt) return s;
          if (new Date(c.expiresAt).getTime() <= Date.now()) {
            // Mantém registro mas marca como expirado virando 'free'
            return { current: { ...c, plan: 'free' } };
          }
          return s;
        }),
    }),
    {
      name: 'oculto-my-plan-persist',
      version: 1,
      onRehydrateStorage: () => (state) => {
        try { state?.prune(); } catch {}
      },
    }
  )
);

if (typeof window !== 'undefined') {
  const tick = () => {
    try { useMyPlanPersistStore.getState().prune(); } catch {}
  };
  window.setTimeout(tick, 1000);
  window.setInterval(tick, 15_000);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  window.addEventListener('online', tick);
}
