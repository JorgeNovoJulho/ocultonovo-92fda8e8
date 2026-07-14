import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BlurLevel = 'light' | 'medium' | 'strong';

interface CreatorBlurPreferenceState {
  /** Default blur level applied to new paid posts. Strong por padrão (conteúdo quase invisível). */
  defaultBlur: BlurLevel;
  setDefaultBlur: (level: BlurLevel) => void;
}

/**
 * Persiste a preferência de blur padrão escolhida pelo criador para novos posts pagos / VIP.
 * Persistência local (UI preference) — não é dado de negócio, é configuração de interface.
 */
export const useCreatorBlurPreferenceStore = create<CreatorBlurPreferenceState>()(
  persist(
    (set) => ({
      defaultBlur: 'strong',
      setDefaultBlur: (level) => set({ defaultBlur: level }),
    }),
    {
      name: 'oculto-creator-blur-preference',
      version: 1,
    }
  )
);
