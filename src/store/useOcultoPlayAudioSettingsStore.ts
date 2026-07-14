import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface OcultoPlayAudioSettingsState {
  shuffle: boolean;
  setShuffle: (enabled: boolean) => void;
  toggleShuffle: () => void;
}

const LEGACY_SHUFFLE_KEY = 'oculto-play:audio-shuffle';

function readLegacyShuffle(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = window.localStorage.getItem(LEGACY_SHUFFLE_KEY);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

function mirrorLegacyShuffle(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LEGACY_SHUFFLE_KEY, enabled ? '1' : '0'); } catch { /* noop */ }
}

export const useOcultoPlayAudioSettingsStore = create<OcultoPlayAudioSettingsState>()(
  persist(
    (set, get) => ({
      shuffle: readLegacyShuffle(),
      setShuffle: (enabled) => {
        mirrorLegacyShuffle(enabled);
        set({ shuffle: enabled });
      },
      toggleShuffle: () => {
        const next = !get().shuffle;
        mirrorLegacyShuffle(next);
        set({ shuffle: next });
      },
    }),
    {
      name: 'oculto-play:audio-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ shuffle: state.shuffle }),
      onRehydrateStorage: () => (state) => {
        if (state) mirrorLegacyShuffle(state.shuffle);
      },
    },
  ),
);