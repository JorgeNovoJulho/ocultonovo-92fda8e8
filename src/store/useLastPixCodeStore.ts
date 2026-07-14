import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LastPixCodeEntry {
  code: string;
  postId?: string | null;
  amount?: number | null;
  copiedAt: string; // ISO
}

interface LastPixCodeState {
  /** Último código PIX copiado pelo usuário (memória local). */
  last: LastPixCodeEntry | null;
  /** Histórico curto dos últimos códigos copiados (até 10). */
  history: LastPixCodeEntry[];
  registerCopiedCode: (entry: Omit<LastPixCodeEntry, 'copiedAt'>) => void;
  clear: () => void;
}

/**
 * Registra o último código PIX copiado pelo usuário para auditoria/visualização rápida.
 * Persistência local — preferência/registro de UI, não dado de negócio.
 */
export const useLastPixCodeStore = create<LastPixCodeState>()(
  persist(
    (set) => ({
      last: null,
      history: [],
      registerCopiedCode: (entry) =>
        set((state) => {
          const full: LastPixCodeEntry = { ...entry, copiedAt: new Date().toISOString() };
          const nextHistory = [full, ...state.history.filter((h) => h.code !== full.code)].slice(0, 10);
          return { last: full, history: nextHistory };
        }),
      clear: () => set({ last: null, history: [] }),
    }),
    {
      name: 'oculto-last-pix-code',
      version: 1,
    }
  )
);
