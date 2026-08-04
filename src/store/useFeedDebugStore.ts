import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FeedDebugState {
  isDebugEnabled: boolean;
  logs: {
    timestamp: number;
    type: 'query' | 'cache_expire' | 'stale' | 'render' | 'fresh';
    message: string;
    details?: any;
  }[];
  toggleDebug: () => void;
  setDebug: (enabled: boolean) => void;
  addLog: (type: 'query' | 'cache_expire' | 'stale' | 'render' | 'fresh', message: string, details?: any) => void;
  clearLogs: () => void;
}

export const useFeedDebugStore = create<FeedDebugState>()(
  persist(
    (set) => ({
      isDebugEnabled: false,
      logs: [],
      toggleDebug: () => set((state) => ({ isDebugEnabled: !state.isDebugEnabled })),
      setDebug: (enabled) => set({ isDebugEnabled: enabled }),
      addLog: (type, message, details) =>
        set((state) => {
          const newLog = { timestamp: Date.now(), type, message, details };
          console.log(`[FeedDebug] [${type.toUpperCase()}] ${message}`, details || '');
          // Keep only last 50 logs
          return { logs: [newLog, ...state.logs].slice(0, 50) };
        }),
      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'feed-debug-storage',
      partialize: (state) => ({ isDebugEnabled: state.isDebugEnabled }),
    }
  )
);
