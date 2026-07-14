/**
 * Store do Modo Espião (Spy Mode)
 * Gerencia o estado do modo visitante sem login
 */
import { create } from 'zustand';

interface SpyModeState {
  isSpyMode: boolean;
  spyUsername: string;
  spyAvatar: string;
  postsLimit: number;
  viewedPosts: number;
  enableSpyMode: () => void;
  disableSpyMode: () => void;
  incrementViewedPosts: () => void;
  resetViewedPosts: () => void;
}

export const useSpyModeStore = create<SpyModeState>((set) => ({
  isSpyMode: false,
  spyUsername: 'CURIOSO',
  spyAvatar: '/placeholder.svg', // Avatar silhueta padrão
  postsLimit: 20,
  viewedPosts: 0,
  
  enableSpyMode: () => set({ isSpyMode: true, viewedPosts: 0 }),
  disableSpyMode: () => set({ isSpyMode: false, viewedPosts: 0 }),
  incrementViewedPosts: () => set((state) => ({ 
    viewedPosts: Math.min(state.viewedPosts + 1, state.postsLimit) 
  })),
  resetViewedPosts: () => set({ viewedPosts: 0 }),
}));
