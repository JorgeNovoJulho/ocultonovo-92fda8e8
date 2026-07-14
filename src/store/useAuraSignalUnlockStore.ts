import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuraSignalKind = 'attention' | 'profile_view';

interface UnlockEntry {
  expiresAt: number; // epoch ms
}

interface AuraSignalUnlockState {
  unlocks: Record<AuraSignalKind, UnlockEntry | null>;
  setUnlock: (kind: AuraSignalKind, secondsLeft: number) => void;
  clearUnlock: (kind: AuraSignalKind) => void;
  getSecondsLeft: (kind: AuraSignalKind) => number;
}

export const useAuraSignalUnlockStore = create<AuraSignalUnlockState>()(
  persist(
    (set, get) => ({
      unlocks: { attention: null, profile_view: null },
      setUnlock: (kind, secondsLeft) =>
        set((s) => ({
          unlocks: {
            ...s.unlocks,
            [kind]: secondsLeft > 0 ? { expiresAt: Date.now() + secondsLeft * 1000 } : null,
          },
        })),
      clearUnlock: (kind) =>
        set((s) => ({ unlocks: { ...s.unlocks, [kind]: null } })),
      getSecondsLeft: (kind) => {
        const entry = get().unlocks[kind];
        if (!entry) return 0;
        return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
      },
    }),
    {
      name: 'aura-signal-unlocks',
      version: 1,
    }
  )
);
