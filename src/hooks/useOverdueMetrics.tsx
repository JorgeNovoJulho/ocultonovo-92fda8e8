import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

type PaymentStatus = 'active' | 'overdue' | 'suspended';

export interface AdminFinancialUser {
  id: string;
  user_id: string | null;
  name: string | null;
  username: string | null;
  plan_type: string | null;
  payment_status: PaymentStatus;
  payment_due_date: string | null;
  created_at: string | null;
  last_seen: string | null;
  totalInvested: number;
  postsCount: number;
  daysOverdue: number;
}

export interface OverdueMetrics {
  totalOverdueUsers: number;
  totalSuspendedUsers: number;
  totalPendingAmount: number;
  overdueByDays: {
    day1: number;
    day3: number;
    day7Plus: number;
  };
  users: AdminFinancialUser[];
  recentReminders: {
    id: string;
    user_id: string;
    reminder_day: number;
    sent_via: string;
    sent_at: string;
    user_name?: string;
  }[];
}

const planValue = (plan?: string | null) => (plan === 'vip' ? 145.9 : plan === 'premium' ? 25.9 : 0);

const moneyFields = ['amount', 'total_amount', 'gross_amount', 'price', 'value'];

function isMissingColumn(error: any) {
  return error?.code === '42703' || /column .* does not exist/i.test(error?.message || '');
}

async function fetchTransactionsByUsers(userIds: string[]) {
  if (userIds.length === 0) return [] as any[];

  for (const field of moneyFields) {
    const { data, error } = await (supabase as any)
      .from('transactions')
      .select(`user_id, ${field}, created_at, status`)
      .in('user_id', userIds)
      .in('status', ['completed', 'paid', 'approved', 'succeeded']);

    if (!error) {
      return (data || []).map((tx: any) => ({ ...tx, amount: Number(tx[field] || 0) }));
    }
    if (!isMissingColumn(error)) break;
  }

  return [] as any[];
}

async function fetchPostsCountByAuthors(authorIds: string[]) {
  const counts = new Map<string, number>();
  if (authorIds.length === 0) return counts;

  const { data, error } = await (supabase as any)
    .from('posts')
    .select('author_id')
    .in('author_id', authorIds)
    .limit(10000);

  if (error) return counts;
  (data || []).forEach((post: any) => counts.set(post.author_id, (counts.get(post.author_id) || 0) + 1));
  return counts;
}

function buildUserRows(profiles: any[], transactions: any[], postsCount: Map<string, number>, now = new Date()) {
  const txByUser = new Map<string, { total: number; latest?: string }>();

  transactions.forEach((tx: any) => {
    const key = tx.user_id;
    if (!key) return;
    const current = txByUser.get(key) || { total: 0, latest: undefined };
    current.total += Number(tx.amount || 0);
    if (!current.latest || new Date(tx.created_at).getTime() > new Date(current.latest).getTime()) {
      current.latest = tx.created_at;
    }
    txByUser.set(key, current);
  });

  return profiles.map((profile: any): AdminFinancialUser => {
    const tx = txByUser.get(profile.user_id) || txByUser.get(profile.id) || { total: 0, latest: undefined };
    const dueDate = profile.payment_due_date || tx.latest || profile.created_at;
    const daysOverdue = dueDate
      ? Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000))
      : 0;

    return {
      id: profile.id,
      user_id: profile.user_id || null,
      name: profile.name || null,
      username: profile.username || null,
      plan_type: profile.plan_type || 'free',
      payment_status: (profile.payment_status || (daysOverdue > 0 ? 'overdue' : 'active')) as PaymentStatus,
      payment_due_date: profile.payment_due_date || tx.latest || null,
      created_at: profile.created_at || null,
      last_seen: profile.last_seen || null,
      totalInvested: Number(tx.total || 0),
      postsCount: postsCount.get(profile.id) || postsCount.get(profile.user_id) || 0,
      daysOverdue,
    };
  });
}

export function useOverdueMetrics() {
  return useQuery({
    queryKey: ['overdue-metrics'],
    queryFn: async (): Promise<OverdueMetrics> => {
      const { data: profiles, error } = await (supabase as any)
        .from('profiles')
        .select('id, user_id, name, username, plan_type, payment_status, payment_due_date, created_at, last_seen')
        .in('plan_type', ['premium', 'vip'])
        .or('payment_status.in.(overdue,suspended),payment_due_date.lt.' + new Date().toISOString())
        .or('is_seed.eq.false,is_seed.is.null')
        .order('payment_due_date', { ascending: true, nullsFirst: false })
        .limit(200);

      if (error) throw error;

      const ids = Array.from(new Set<string>((profiles || []).flatMap((p: any) => [p.id, p.user_id].filter(Boolean) as string[])));
      const [transactions, postsCount] = await Promise.all([
        fetchTransactionsByUsers(ids),
        fetchPostsCountByAuthors(ids),
      ]);

      const users = buildUserRows(profiles || [], transactions, postsCount)
        .filter(user => user.payment_status === 'overdue' || user.payment_status === 'suspended' || user.daysOverdue > 0)
        .sort((a, b) => b.daysOverdue - a.daysOverdue);

      const totalOverdueUsers = users.filter(user => user.payment_status !== 'suspended').length;
      const totalSuspendedUsers = users.filter(user => user.payment_status === 'suspended').length;
      const totalPendingAmount = users.reduce((sum, user) => sum + planValue(user.plan_type), 0);

      return {
        totalOverdueUsers,
        totalSuspendedUsers,
        totalPendingAmount,
        overdueByDays: {
          day1: users.filter(user => user.daysOverdue >= 1 && user.daysOverdue < 3).length,
          day3: users.filter(user => user.daysOverdue >= 3 && user.daysOverdue < 7).length,
          day7Plus: users.filter(user => user.daysOverdue >= 7).length,
        },
        users,
        recentReminders: [],
      };
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

export function useInactiveUsers(periodDays: 30 | 90 | 180) {
  return useQuery({
    queryKey: ['inactive-users', periodDays],
    queryFn: async (): Promise<AdminFinancialUser[]> => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDays);

      const { data: profiles, error } = await (supabase as any)
        .from('profiles')
        .select('id, user_id, name, username, plan_type, payment_status, payment_due_date, created_at, last_seen')
        .or(`last_seen.lt.${cutoff.toISOString()},last_seen.is.null`)
        .or('is_seed.eq.false,is_seed.is.null')
        .order('last_seen', { ascending: true, nullsFirst: true })
        .limit(200);

      if (error) throw error;

      const ids = Array.from(new Set<string>((profiles || []).flatMap((p: any) => [p.id, p.user_id].filter(Boolean) as string[])));
      const [transactions, postsCount] = await Promise.all([
        fetchTransactionsByUsers(ids),
        fetchPostsCountByAuthors(ids),
      ]);

      return buildUserRows(profiles || [], transactions, postsCount).sort((a, b) => {
        const aTime = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bTime = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return aTime - bTime;
      });
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

export function useInactiveUserCounts() {
  const d30 = useInactiveUsers(30);
  const d90 = useInactiveUsers(90);
  const d180 = useInactiveUsers(180);

  return {
    data: {
      days30: d30.data?.length || 0,
      days90: d90.data?.length || 0,
      days180: d180.data?.length || 0,
    },
    isLoading: d30.isLoading || d90.isLoading || d180.isLoading,
  };
}