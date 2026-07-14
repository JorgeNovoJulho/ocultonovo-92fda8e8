import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SimulatedPaymentStatus = 'active' | 'overdue' | 'suspended' | null;
export type ViewportMode = 'desktop' | 'mobile';
export type SimulatedShadowbanMode = 'off' | 'as_banned_user' | 'as_external_viewer' | null;

interface TargetUser {
  id: string;
  name: string;
  username?: string;
  plan_type: string;
  avatar_url?: string;
  is_shadowbanned?: boolean;
}

interface ImpersonationState {
  isImpersonating: boolean;
  targetUser: TargetUser | null;
  originalAdminId: string | null;
  sessionId: string | null;
  startedAt: string | null;
  simulatedStatus: SimulatedPaymentStatus;
  viewportMode: ViewportMode;
  simulatedShadowban: SimulatedShadowbanMode;
  
  // Actions
  startImpersonation: (user: TargetUser, adminId: string, sessionId: string) => void;
  endImpersonation: () => void;
  getImpersonationInfo: () => { user: TargetUser | null; duration: number } | null;
  setSimulatedStatus: (status: SimulatedPaymentStatus) => void;
  setViewportMode: (mode: ViewportMode) => void;
  setSimulatedShadowban: (mode: SimulatedShadowbanMode) => void;
}

export const useImpersonationStore = create<ImpersonationState>()(
  persist(
    (set, get) => ({
      isImpersonating: false,
      targetUser: null,
      originalAdminId: null,
      sessionId: null,
      startedAt: null,
      simulatedStatus: null,
      viewportMode: 'mobile', // Default to mobile for testing
      simulatedShadowban: null,

      startImpersonation: (user, adminId, sessionId) => {
        set({
          isImpersonating: true,
          targetUser: user,
          originalAdminId: adminId,
          sessionId,
          startedAt: new Date().toISOString(),
          simulatedStatus: null,
          viewportMode: 'mobile',
          simulatedShadowban: null,
        });
      },

      endImpersonation: () => {
        set({
          isImpersonating: false,
          targetUser: null,
          originalAdminId: null,
          sessionId: null,
          startedAt: null,
          simulatedStatus: null,
          viewportMode: 'desktop',
          simulatedShadowban: null,
        });
      },

      getImpersonationInfo: () => {
        const state = get();
        if (!state.isImpersonating || !state.targetUser) return null;
        
        const duration = state.startedAt 
          ? Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000 / 60)
          : 0;
        
        return {
          user: state.targetUser,
          duration,
        };
      },

      setSimulatedStatus: (status) => {
        set({ simulatedStatus: status });
      },

      setViewportMode: (mode) => {
        set({ viewportMode: mode });
      },

      setSimulatedShadowban: (mode) => {
        set({ simulatedShadowban: mode });
      },
    }),
    {
      name: 'oculto-impersonation',
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name);
        },
      },
    }
  )
);
