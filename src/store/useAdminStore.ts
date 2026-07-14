import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AdminRole = 'ADMIN_MASTER' | 'ADMIN_REGIONAL' | 'MODERATOR';

export interface AdminPermissions {
  financialAccess: boolean;
  contentModeration: boolean;
  supportAccess: boolean;
  systemSettings: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  permissions: AdminPermissions;
  region?: string;
  createdAt: string;
  lastActive: string;
  isActive: boolean;
}

export interface ReportedUser {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  reason: 'violations' | 'spam' | 'harassment' | 'fake_profile' | 'other';
  reportedBy: string;
  createdAt: string;
  status: 'pending' | 'resolved' | 'dismissed';
}

export interface PlatformMetrics {
  totalRevenue: number;
  activeUsers: number;
  newSignupsToday: number;
  pendingReports: number;
  totalCreators: number;
  totalSubscriptions: number;
  monthlyGrowth: number;
}

export interface ManagedUser {
  id: string;
  avatar: string;
  username: string;
  email: string;
  role: 'creator' | 'user';
  status: 'active' | 'banned' | 'pending';
  spent: number;
  createdAt: string;
  isVerified: boolean;
}

export interface SystemSettings {
  maintenanceMode: boolean;
  pauseSignups: boolean;
  blockWithdrawals: boolean;
}

export interface ActiveLocation {
  id: string;
  lat: number;
  lng: number;
  city: string;
  activeUsers: number;
}

interface AdminState {
  // Current admin user simulation
  currentAdminRole: AdminRole | null;
  
  // Metrics
  metrics: PlatformMetrics;
  
  // Staff management
  staffMembers: StaffMember[];
  addStaffMember: (member: Omit<StaffMember, 'id' | 'createdAt' | 'lastActive'>) => void;
  updateStaffMember: (id: string, updates: Partial<StaffMember>) => void;
  removeStaffMember: (id: string) => void;
  
  // User management
  managedUsers: ManagedUser[];
  banUser: (userId: string, reason: string) => void;
  unbanUser: (userId: string) => void;
  verifyUser: (userId: string) => void;
  
  // Reports
  reportedUsers: ReportedUser[];
  resolveReport: (reportId: string) => void;
  dismissReport: (reportId: string) => void;
  
  // System settings
  systemSettings: SystemSettings;
  updateSystemSettings: (settings: Partial<SystemSettings>) => void;
  
  // Active locations for map
  activeLocations: ActiveLocation[];
  
  // Admin simulation
  setAdminRole: (role: AdminRole | null) => void;
}

// Mock data
const mockStaffMembers: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'Carlos Silva',
    email: 'carlos@oculto.com',
    role: 'ADMIN_MASTER',
    permissions: {
      financialAccess: true,
      contentModeration: true,
      supportAccess: true,
      systemSettings: true,
    },
    createdAt: '2024-01-01',
    lastActive: '2025-01-22T10:30:00',
    isActive: true,
  },
  {
    id: 'staff-2',
    name: 'Ana Santos',
    email: 'ana@oculto.com',
    role: 'ADMIN_REGIONAL',
    permissions: {
      financialAccess: true,
      contentModeration: true,
      supportAccess: true,
      systemSettings: false,
    },
    region: 'São Paulo - Capital',
    createdAt: '2024-03-15',
    lastActive: '2025-01-22T09:15:00',
    isActive: true,
  },
  {
    id: 'staff-3',
    name: 'Pedro Costa',
    email: 'pedro@oculto.com',
    role: 'MODERATOR',
    permissions: {
      financialAccess: false,
      contentModeration: true,
      supportAccess: true,
      systemSettings: false,
    },
    region: 'Rio de Janeiro',
    createdAt: '2024-06-20',
    lastActive: '2025-01-21T18:45:00',
    isActive: true,
  },
];

const mockManagedUsers: ManagedUser[] = [
  {
    id: 'user-1',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    username: 'julia_model',
    email: 'julia@email.com',
    role: 'creator',
    status: 'active',
    spent: 0,
    createdAt: '2024-08-15',
    isVerified: true,
  },
  {
    id: 'user-2',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    username: 'marcos_fan',
    email: 'marcos@email.com',
    role: 'user',
    status: 'active',
    spent: 459.90,
    createdAt: '2024-09-20',
    isVerified: true,
  },
  {
    id: 'user-3',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    username: 'camila_hot',
    email: 'camila@email.com',
    role: 'creator',
    status: 'active',
    spent: 0,
    createdAt: '2024-10-05',
    isVerified: true,
  },
  {
    id: 'user-4',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    username: 'spam_user_123',
    email: 'spam@fake.com',
    role: 'user',
    status: 'banned',
    spent: 0,
    createdAt: '2024-12-01',
    isVerified: false,
  },
  {
    id: 'user-5',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
    username: 'fernanda_beauty',
    email: 'fernanda@email.com',
    role: 'creator',
    status: 'pending',
    spent: 0,
    createdAt: '2025-01-18',
    isVerified: false,
  },
];

const mockReportedUsers: ReportedUser[] = [
  {
    id: 'report-1',
    userId: 'user-4',
    username: 'spam_user_123',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    reason: 'spam',
    reportedBy: 'julia_model',
    createdAt: '2025-01-20',
    status: 'pending',
  },
  {
    id: 'report-2',
    userId: 'user-6',
    username: 'fake_profile_99',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100',
    reason: 'fake_profile',
    reportedBy: 'camila_hot',
    createdAt: '2025-01-21',
    status: 'pending',
  },
];

const mockActiveLocations: ActiveLocation[] = [
  { id: 'loc-1', lat: -23.5505, lng: -46.6333, city: 'São Paulo', activeUsers: 1247 },
  { id: 'loc-2', lat: -22.9068, lng: -43.1729, city: 'Rio de Janeiro', activeUsers: 892 },
  { id: 'loc-3', lat: -19.9167, lng: -43.9345, city: 'Belo Horizonte', activeUsers: 456 },
  { id: 'loc-4', lat: -25.4284, lng: -49.2733, city: 'Curitiba', activeUsers: 321 },
  { id: 'loc-5', lat: -30.0346, lng: -51.2177, city: 'Porto Alegre', activeUsers: 287 },
  { id: 'loc-6', lat: -12.9714, lng: -38.5014, city: 'Salvador', activeUsers: 198 },
  { id: 'loc-7', lat: -3.7172, lng: -38.5433, city: 'Fortaleza', activeUsers: 176 },
  { id: 'loc-8', lat: -8.0476, lng: -34.8770, city: 'Recife', activeUsers: 154 },
];

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      currentAdminRole: 'ADMIN_MASTER', // Simulating admin access
      
      metrics: {
        totalRevenue: 847293.50,
        activeUsers: 12847,
        newSignupsToday: 127,
        pendingReports: 0,
        totalCreators: 1893,
        totalSubscriptions: 8472,
        monthlyGrowth: 12.4,
      },
      
      staffMembers: mockStaffMembers,
      managedUsers: mockManagedUsers,
      reportedUsers: mockReportedUsers,
      activeLocations: mockActiveLocations,
      
      systemSettings: {
        maintenanceMode: false,
        pauseSignups: false,
        blockWithdrawals: false,
      },
      
      addStaffMember: (member) => {
        const newMember: StaffMember = {
          ...member,
          id: `staff-${Date.now()}`,
          createdAt: new Date().toISOString().split('T')[0],
          lastActive: new Date().toISOString(),
        };
        set((state) => ({
          staffMembers: [...state.staffMembers, newMember],
        }));
      },
      
      updateStaffMember: (id, updates) => {
        set((state) => ({
          staffMembers: state.staffMembers.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        }));
      },
      
      removeStaffMember: (id) => {
        set((state) => ({
          staffMembers: state.staffMembers.filter((m) => m.id !== id),
        }));
      },
      
      banUser: (userId, _reason) => {
        set((state) => ({
          managedUsers: state.managedUsers.map((u) =>
            u.id === userId ? { ...u, status: 'banned' as const } : u
          ),
        }));
      },
      
      unbanUser: (userId) => {
        set((state) => ({
          managedUsers: state.managedUsers.map((u) =>
            u.id === userId ? { ...u, status: 'active' as const } : u
          ),
        }));
      },
      
      verifyUser: (userId) => {
        set((state) => ({
          managedUsers: state.managedUsers.map((u) =>
            u.id === userId ? { ...u, isVerified: true, status: 'active' as const } : u
          ),
        }));
      },
      
      resolveReport: (reportId) => {
        set((state) => ({
          reportedUsers: state.reportedUsers.map((r) =>
            r.id === reportId ? { ...r, status: 'resolved' as const } : r
          ),
          metrics: {
            ...state.metrics,
            pendingReports: Math.max(0, state.metrics.pendingReports - 1),
          },
        }));
      },
      
      dismissReport: (reportId) => {
        set((state) => ({
          reportedUsers: state.reportedUsers.map((r) =>
            r.id === reportId ? { ...r, status: 'dismissed' as const } : r
          ),
          metrics: {
            ...state.metrics,
            pendingReports: Math.max(0, state.metrics.pendingReports - 1),
          },
        }));
      },
      
      updateSystemSettings: (settings) => {
        set((state) => ({
          systemSettings: { ...state.systemSettings, ...settings },
        }));
      },
      
      setAdminRole: (role) => {
        set({ currentAdminRole: role });
      },
    }),
    {
      name: 'oculto-admin-storage',
      version: 3,
    }
  )
);
