import { create } from 'zustand';
import { supabase } from '@/lib/supabaseExternal';

/**
 * Single-room enforcement: o usuário só pode estar em uma sala por vez.
 * Master admin (isMaster=true ao set) ignora a restrição e pode estar em N salas.
 */
export type LastExitStatus = 'idle' | 'pending' | 'ok' | 'fallback' | 'error';

interface ActiveAuraRoomStore {
  currentSlug: string | null;
  isMaster: boolean;
  lastExitStatus: LastExitStatus;
  lastExitAt: number | null;
  setMaster: (v: boolean) => void;
  enter: (slug: string) => Promise<void>;
  exit: (slug: string) => Promise<void>;
  setExitStatus: (s: LastExitStatus) => void;
}

export const useActiveAuraRoom = create<ActiveAuraRoomStore>((set, get) => ({
  currentSlug: null,
  isMaster: false,
  lastExitStatus: 'idle',
  lastExitAt: null,
  setMaster: (v) => set({ isMaster: v }),
  setExitStatus: (s) => set({ lastExitStatus: s, lastExitAt: Date.now() }),
  enter: async (slug) => {
    const { currentSlug, isMaster } = get();
    if (!isMaster && currentSlug && currentSlug !== slug) {
      try {
        await (supabase as any).rpc('aura_room_leave', { p_slug: currentSlug });
      } catch {}
    }
    set({ currentSlug: slug });
  },
  exit: async (slug) => {
    const { currentSlug } = get();
    if (currentSlug === slug) set({ currentSlug: null });
  },
}));
