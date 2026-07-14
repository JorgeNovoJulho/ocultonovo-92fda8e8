/**
 * useFeedEmbedEngagementStore — contador MOCK in-memory de engajamento dos
 * players embutidos no Feed (YouTube/Vimeo/MP4 direto).
 *
 * Persiste APENAS em sessionStorage para o usuário/desenvolvedor inspecionar
 * sem poluir o banco. Não é enviado para nenhum backend.
 *
 * Métricas por embedKey (`${kind}:${id}`):
 *   - hover: nº de vezes que o mouse entrou no player
 *   - play:  nº de cliques/toques na área do player (proxy de play)
 *   - lastAt: timestamp ISO do último evento
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface EmbedEngagementEntry {
  hover: number;
  play: number;
  lastAt: string;
}

interface State {
  events: Record<string, EmbedEngagementEntry>;
  trackHover: (key: string) => void;
  trackPlay: (key: string) => void;
  reset: () => void;
}

const EMPTY: EmbedEngagementEntry = { hover: 0, play: 0, lastAt: '' };

export const useFeedEmbedEngagementStore = create<State>()(
  persist(
    (set) => ({
      events: {},
      trackHover: (key) =>
        set((s) => {
          if (!key) return s;
          const prev = s.events[key] ?? EMPTY;
          return {
            events: {
              ...s.events,
              [key]: { ...prev, hover: prev.hover + 1, lastAt: new Date().toISOString() },
            },
          };
        }),
      trackPlay: (key) =>
        set((s) => {
          if (!key) return s;
          const prev = s.events[key] ?? EMPTY;
          return {
            events: {
              ...s.events,
              [key]: { ...prev, play: prev.play + 1, lastAt: new Date().toISOString() },
            },
          };
        }),
      reset: () => set({ events: {} }),
    }),
    {
      name: 'oculto:feed-embed-engagement',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.sessionStorage : (undefined as unknown as Storage),
      ),
    },
  ),
);
