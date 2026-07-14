import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Partner {
  id: string;
  name: string;
  code: string;
  discount: number; // e.g., 0.10 for 10%
  commission: number; // e.g., 0.20 for 20%
  pixKey: string;
  balance: number;
  totalSales: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface PartnerState {
  partners: Partner[];
  appliedCoupon: Partner | null;
  addPartner: (partner: Omit<Partner, 'id' | 'balance' | 'totalSales' | 'createdAt'>) => void;
  removePartner: (id: string) => void;
  togglePartnerStatus: (id: string) => void;
  validateCoupon: (code: string) => Partner | null;
  applyCoupon: (code: string) => boolean;
  clearCoupon: () => void;
  processPayment: (amount: number) => void;
  getUserReferralCode: (username: string) => string;
}

// Initial mock partners
const initialPartners: Partner[] = [
  {
    id: 'partner-1',
    name: 'Canal do João',
    code: 'JOAO20',
    discount: 0.20,
    commission: 0.20,
    pixKey: 'joao@email.com',
    balance: 1250.00,
    totalSales: 45,
    status: 'active',
    createdAt: '2025-01-10',
  },
  {
    id: 'partner-2',
    name: 'Ana Influencer',
    code: 'ANAVIP',
    discount: 0.10,
    commission: 0.15,
    pixKey: '11999999999',
    balance: 875.50,
    totalSales: 32,
    status: 'active',
    createdAt: '2025-01-05',
  },
  {
    id: 'partner-3',
    name: 'Podcast Adulto',
    code: 'PROMO10',
    discount: 0.10,
    commission: 0.20,
    pixKey: 'podcast@pix.com',
    balance: 2340.00,
    totalSales: 78,
    status: 'active',
    createdAt: '2024-12-20',
  },
  {
    id: 'partner-4',
    name: 'Blog Sensual',
    code: 'BLOG15',
    discount: 0.15,
    commission: 0.18,
    pixKey: '12345678901',
    balance: 0,
    totalSales: 0,
    status: 'inactive',
    createdAt: '2025-01-15',
  },
];

export const usePartnerStore = create<PartnerState>()(
  persist(
    (set, get) => ({
      partners: initialPartners,
      appliedCoupon: null,

      addPartner: (partner) => {
        const newPartner: Partner = {
          ...partner,
          id: `partner-${Date.now()}`,
          balance: 0,
          totalSales: 0,
          createdAt: new Date().toISOString().split('T')[0],
        };
        set((state) => ({
          partners: [...state.partners, newPartner],
        }));
      },

      removePartner: (id) => {
        set((state) => ({
          partners: state.partners.filter((p) => p.id !== id),
        }));
      },

      togglePartnerStatus: (id) => {
        set((state) => ({
          partners: state.partners.map((p) =>
            p.id === id ? { ...p, status: p.status === 'active' ? 'inactive' : 'active' } : p
          ),
        }));
      },

      validateCoupon: (code) => {
        const { partners } = get();
        const partner = partners.find(
          (p) => p.code.toUpperCase() === code.toUpperCase() && p.status === 'active'
        );
        return partner || null;
      },

      applyCoupon: (code) => {
        const partner = get().validateCoupon(code);
        if (partner) {
          set({ appliedCoupon: partner });
          return true;
        }
        return false;
      },

      clearCoupon: () => {
        set({ appliedCoupon: null });
      },

      processPayment: (amount) => {
        const { appliedCoupon } = get();
        if (appliedCoupon) {
          const commission = amount * appliedCoupon.commission;
          set((state) => ({
            partners: state.partners.map((p) =>
              p.id === appliedCoupon.id
                ? {
                    ...p,
                    balance: p.balance + commission,
                    totalSales: p.totalSales + 1,
                  }
                : p
            ),
            appliedCoupon: null,
          }));
        }
      },

      getUserReferralCode: (username) => {
        // Generate a referral code from username
        const cleanUsername = username.replace('@', '').toUpperCase();
        return `${cleanUsername}10`;
      },
    }),
    {
      name: 'oculto-partner-storage',
      partialize: (state) => ({
        partners: state.partners,
      }),
    }
  )
);
