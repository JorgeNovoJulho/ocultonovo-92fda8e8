import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildCreatorInviteUrl, normalizeCreatorInviteCode } from '@/lib/inviteLinks';

interface InviteCodeState {
  code: string | null;
  setCode: (code: string | null) => void;
  clear: () => void;
  getInviteLink: () => string | null;
}

export const useInviteCodeStore = create<InviteCodeState>()(
  persist(
    (set, get) => ({
      code: null,
      setCode: (code) => set({ code: normalizeCreatorInviteCode(code) }),
      clear: () => set({ code: null }),
      getInviteLink: () => {
        return buildCreatorInviteUrl(get().code);
      },
    }),
    { name: 'oculto-invite-code' },
  ),
);
