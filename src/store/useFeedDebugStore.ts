import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FeedDebugLogType = 'query' | 'cache_expire' | 'stale' | 'render' | 'fresh';

export interface FeedDebugLog {
  timestamp: number;
  type: FeedDebugLogType;
  message: string;
  details?: any;
}

interface FeedDebugState {
  isDebugEnabled: boolean;
  logs: FeedDebugLog[];
  toggleDebug: () => void;
  setDebug: (enabled: boolean) => void;
  addLog: (type: FeedDebugLogType, message: string, details?: any) => void;
  clearLogs: () => void;
}

const MAX_LOGS = 50;

/**
 * Diagnóstico do feed (somente para o admin master).
 *
 * IMPORTANTE para performance: `addLog` é chamado em caminhos quentes
 * (cada query do feed e cada evento realtime da plataforma). Por isso:
 *  - com o diagnóstico DESLIGADO ele não faz nada (nenhum set de estado,
 *    nenhum console.log) — antes, cada chamada atualizava a store e
 *    re-renderizava todos os componentes inscritos nela, inclusive o feed;
 *  - componentes devem ler a store sempre com seletor
 *    (`useFeedDebugStore(s => s.isDebugEnabled)`), nunca a store inteira.
 */
export const useFeedDebugStore = create<FeedDebugState>()(
  persist(
    (set, get) => ({
      isDebugEnabled: false,
      logs: [],
      toggleDebug: () => set((state) => ({ isDebugEnabled: !state.isDebugEnabled })),
      setDebug: (enabled) => set({ isDebugEnabled: enabled }),
      addLog: (type, message, details) => {
        if (!get().isDebugEnabled) return;
        const newLog: FeedDebugLog = { timestamp: Date.now(), type, message, details };
        // eslint-disable-next-line no-console
        console.log(`[FeedDebug] [${type.toUpperCase()}] ${message}`, details ?? '');
        set((state) => ({ logs: [newLog, ...state.logs].slice(0, MAX_LOGS) }));
      },
      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'feed-debug-storage',
      partialize: (state) => ({ isDebugEnabled: state.isDebugEnabled }),
    }
  )
);

/** Atalho estável para registrar logs fora de componentes (ou sem re-render). */
export const feedDebugLog = (type: FeedDebugLogType, message: string, details?: any) =>
  useFeedDebugStore.getState().addLog(type, message, details);
