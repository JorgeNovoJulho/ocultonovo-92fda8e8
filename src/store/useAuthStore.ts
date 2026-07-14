import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ProfileType = 'single' | 'couple';
export type Gender = 'homem' | 'mulher' | 'casal' | 'trans';
export type Desire = 'menage' | 'voyeur' | 'soft' | 'full' | 'exibicionismo' | 'fetiche' | 'bdsm' | 'role-play';

export type PlanType = 'free' | 'premium' | 'vip';

export interface MockUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  avatar2?: string; // For couples
  isCreator: boolean;
  createdAt: string;
  profileType: ProfileType;
  gender: Gender;
  partnerName1?: string; // For couples
  partnerName2?: string; // For couples
  desires: Desire[];
  isVerifiedCreator: boolean;
  isVerifiedCouple: boolean;
  verified: boolean; // ID verification status
  isBiometricallyVerified: boolean; // Liveness check passed
  bio?: string;
  age?: number;
  location?: string;
  planType: PlanType;
  birthDate?: string;
  genderOther?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: MockUser | null;
  myEvents: string[]; // Event IDs the user has RSVP'd to
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<MockUser>) => void;
  rsvpEvent: (eventId: string) => void;
  cancelRsvp: (eventId: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      myEvents: [],
      
      login: async (email: string, _password: string) => {
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const mockUser: MockUser = {
          id: 'user-' + Date.now(),
          email,
          name: email.split('@')[0],
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
          isCreator: false,
          createdAt: new Date().toISOString(),
          profileType: 'single',
          gender: 'homem',
          desires: [],
          isVerifiedCreator: false,
          isVerifiedCouple: false,
          verified: false,
          isBiometricallyVerified: false,
          age: 28,
          location: 'São Paulo',
          planType: 'free',
        };
        
        set({ isAuthenticated: true, user: mockUser });
        return true;
      },
      
      signup: async (email: string, _password: string, name: string) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mockUser: MockUser = {
          id: 'user-' + Date.now(),
          email,
          name,
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop',
          isCreator: false,
          createdAt: new Date().toISOString(),
          profileType: 'single',
          gender: 'homem',
          desires: [],
          isVerifiedCreator: false,
          isVerifiedCouple: false,
          verified: false,
          isBiometricallyVerified: false,
          age: 28,
          location: 'São Paulo',
          planType: 'free',
        };
        
        set({ isAuthenticated: true, user: mockUser });
        return true;
      },
      
      logout: () => {
        set({ isAuthenticated: false, user: null, myEvents: [] });
      },

      updateProfile: (updates: Partial<MockUser>) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...updates } });
        }
      },

      rsvpEvent: (eventId: string) => {
        const { myEvents } = get();
        if (!myEvents.includes(eventId)) {
          set({ myEvents: [...myEvents, eventId] });
        }
      },

      cancelRsvp: (eventId: string) => {
        const { myEvents } = get();
        set({ myEvents: myEvents.filter(id => id !== eventId) });
      },
    }),
    {
      name: 'oculto-auth-storage',
    }
  )
);
