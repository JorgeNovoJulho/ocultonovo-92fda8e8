/**
 * useOcultoPlaySessionScoreStore — placar MOCK de sessão (in-memory only).
 *
 * Conta ações que o usuário faz enquanto navega no feed/Play:
 *   - curtir / descurtir / comentar / salvar / compartilhar
 *
 * NÃO persiste nada — é apenas um "scoreboard" leve para feedback visual
 * e gamificação imediata. Os contadores reais continuam sendo gravados no
 * banco pelos hooks de ações (useOcultoPlayActions).
 *
 * Resetar com `reset()` (por ex. ao fechar o app ou no logout).
 */
import { create } from 'zustand';

export type SessionScoreAction = 'like' | 'dislike' | 'comment' | 'save' | 'share';

interface SessionScoreState {
  like: number;
  dislike: number;
  comment: number;
  save: number;
  share: number;
  bump: (action: SessionScoreAction, delta?: number) => void;
  reset: () => void;
  total: () => number;
}

export const useOcultoPlaySessionScoreStore = create<SessionScoreState>((set, get) => ({
  like: 0,
  dislike: 0,
  comment: 0,
  save: 0,
  share: 0,
  bump: (action, delta = 1) =>
    set((s) => ({ ...s, [action]: Math.max(0, (s[action] ?? 0) + delta) })),
  reset: () => set({ like: 0, dislike: 0, comment: 0, save: 0, share: 0 }),
  total: () => {
    const s = get();
    return s.like + s.dislike + s.comment + s.save + s.share;
  },
}));
