import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface ContentSale {
  id: string;
  post_id: string;
  user_id: string;
  amount_paid: number;
  purchased_at: string;
  buyer_name: string | null;
  buyer_avatar: string | null;
  buyer_username: string | null;
  post_preview: string | null;
}

/**
 * Fetch sales history for the current creator (seller).
 * Joins media_access with buyer profile and post preview text.
 */
export function useContentSales() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['content-sales', user?.id],
    queryFn: async (): Promise<ContentSale[]> => {
      if (!user?.id) return [];

      // Get profile id first
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      const { data: sales, error } = await (supabase as any)
        .from('media_access')
        .select('id, post_id, user_id, amount_paid, purchased_at')
        .eq('seller_id', profile.id)
        .order('purchased_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const list = (sales || []) as any[];
      if (list.length === 0) return [];

      const buyerProfileIds = [...new Set(list.map((s) => s.user_id).filter(Boolean))];
      const postIds = [...new Set(list.map((s) => s.post_id).filter(Boolean))];

      const [buyersRes, postsRes] = await Promise.all([
        buyerProfileIds.length
          ? (supabase as any).from('profiles').select('id, user_id, name, avatar_url, username').or(`id.in.(${buyerProfileIds.join(',')}),user_id.in.(${buyerProfileIds.join(',')})`)
          : Promise.resolve({ data: [] }),
        postIds.length
          ? (supabase as any).from('posts').select('id, content_text').in('id', postIds)
          : Promise.resolve({ data: [] }),
      ]);

      const buyerMap = new Map<string, any>();
      (buyersRes.data || []).forEach((b: any) => {
        if (b.id) buyerMap.set(b.id, b);
        if (b.user_id) buyerMap.set(b.user_id, b);
      });
      const postMap = new Map<string, any>((postsRes.data || []).map((p: any) => [p.id, p]));

      return list.map((row: any) => {
        const buyer = buyerMap.get(row.user_id);
        const post = postMap.get(row.post_id);
        return {
          id: row.id,
          post_id: row.post_id,
          user_id: row.user_id,
          amount_paid: row.amount_paid,
          purchased_at: row.purchased_at,
          buyer_name: buyer?.name || null,
          buyer_avatar: buyer?.avatar_url || null,
          buyer_username: buyer?.username || null,
          post_preview: post?.content_text?.substring(0, 80) || null,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Get total sales stats for the current creator.
 */
export function useContentSalesStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['content-sales-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalSales: 0, totalRevenue: 0, uniqueBuyers: 0 };

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return { totalSales: 0, totalRevenue: 0, uniqueBuyers: 0 };

      const { data, error } = await (supabase as any)
        .from('media_access')
        .select('amount_paid, user_id')
        .eq('seller_id', profile.id);

      if (error || !data) return { totalSales: 0, totalRevenue: 0, uniqueBuyers: 0 };

      const totalRevenue = data.reduce((sum: number, r: any) => sum + (r.amount_paid || 0), 0);
      const uniqueBuyers = new Set(data.map((r: any) => r.user_id)).size;

      return {
        totalSales: data.length,
        totalRevenue,
        uniqueBuyers,
      };
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });
}
