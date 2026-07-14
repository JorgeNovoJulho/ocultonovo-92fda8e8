import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface MarketplaceAd {
  id: string;
  title: string;
  short_description: string;
  full_description: string | null;
  price: number;
  main_image_url: string;
  gallery_images: string[];
  video_url: string | null;
  advertiser_profile_id: string | null;
  external_url: string | null;
  is_active: boolean;
  display_order: number;
  views_count: number;
  clicks_count: number;
  created_at: string;
  updated_at: string;
  advertiser?: {
    id: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
  reputation?: {
    rating: number;
    total_reviews: number;
  } | null;
}

export interface UserReputation {
  profile_id: string;
  rating: number;
  total_reviews: number;
  notes: string | null;
}

// =====================================================
// Feature flag: enable_marketplace_ads
// =====================================================
export function useMarketplaceAdsEnabled(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['marketplace-ads-enabled'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('system_settings')
        .select('value')
        .eq('key', 'enable_marketplace_ads')
        .maybeSingle();
      return data?.value === true || data?.value === 'true';
    },
    staleTime: 30_000,
  });
}

export function useToggleMarketplaceAdsEnabled() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('system_settings')
        .update({ value: enabled, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('key', 'enable_marketplace_ads');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-ads-enabled'] });
    },
  });
}

// =====================================================
// Fetch ads + decoupled advertiser profile + reputation
// =====================================================
async function enrichAds(ads: MarketplaceAd[]): Promise<MarketplaceAd[]> {
  if (!ads || ads.length === 0) return [];
  const profileIds = [...new Set(ads.map(a => a.advertiser_profile_id).filter(Boolean) as string[])];

  const [profilesRes, reputationsRes] = await Promise.all([
    profileIds.length
      ? (supabase as any).from('v_public_profiles').select('id, name, username, avatar_url').in('id', profileIds)
      : Promise.resolve({ data: [] }),
    profileIds.length
      ? (supabase as any).from('oculto_user_reputation').select('profile_id, rating, total_reviews').in('profile_id', profileIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const repMap = new Map((reputationsRes.data || []).map((r: any) => [r.profile_id, r]));

  return ads.map(ad => ({
    ...ad,
    advertiser: ad.advertiser_profile_id ? (profileMap.get(ad.advertiser_profile_id) as any) || null : null,
    reputation: ad.advertiser_profile_id ? (repMap.get(ad.advertiser_profile_id) as any) || null : null,
  }));
}

// Active ads for the public feed
export function useActiveMarketplaceAds(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['marketplace-ads-active'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_marketplace_ads')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return enrichAds((data || []) as MarketplaceAd[]);
    },
    staleTime: 60_000,
  });
}

// All ads for the admin panel
export function useAllMarketplaceAds() {
  return useQuery({
    queryKey: ['marketplace-ads-all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_marketplace_ads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return enrichAds((data || []) as MarketplaceAd[]);
    },
  });
}

export interface MarketplaceAdInput {
  id?: string;
  title: string;
  short_description: string;
  full_description?: string | null;
  price: number;
  main_image_url: string;
  gallery_images: string[];
  video_url?: string | null;
  advertiser_profile_id?: string | null;
  external_url?: string | null;
  is_active?: boolean;
  display_order?: number;
}

export function useUpsertMarketplaceAd() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: MarketplaceAdInput) => {
      if (!user) throw new Error('Not authenticated');
      const payload: any = {
        title: input.title,
        short_description: input.short_description,
        full_description: input.full_description ?? null,
        price: input.price,
        main_image_url: input.main_image_url,
        gallery_images: input.gallery_images.slice(0, 10),
        video_url: input.video_url ?? null,
        advertiser_profile_id: input.advertiser_profile_id ?? null,
        external_url: input.external_url ?? null,
        is_active: input.is_active ?? true,
        display_order: input.display_order ?? 0,
      };
      if (input.id) {
        const { error } = await (supabase as any)
          .from('oculto_marketplace_ads')
          .update(payload)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        payload.created_by = user.id;
        const { error } = await (supabase as any)
          .from('oculto_marketplace_ads')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-ads-all'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-ads-active'] });
    },
  });
}

export function useDeleteMarketplaceAd() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('oculto_marketplace_ads')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-ads-all'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-ads-active'] });
    },
  });
}

// =====================================================
// Reputation
// =====================================================
export function useUpsertReputation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { profile_id: string; rating: number; total_reviews?: number; notes?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase as any)
        .from('oculto_user_reputation')
        .upsert({
          profile_id: input.profile_id,
          rating: input.rating,
          total_reviews: input.total_reviews ?? 0,
          notes: input.notes ?? null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'profile_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-ads-all'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-ads-active'] });
    },
  });
}

// Increment counters (best-effort)
export async function incrementAdView(adId: string) {
  try {
    await (supabase as any).rpc('increment_oculto_ad_view', { ad_id: adId });
  } catch {
    // Best-effort; ignore
  }
}

export async function incrementAdClick(adId: string) {
  try {
    const { data: current } = await (supabase as any)
      .from('oculto_marketplace_ads')
      .select('clicks_count')
      .eq('id', adId)
      .maybeSingle();
    if (current) {
      await (supabase as any)
        .from('oculto_marketplace_ads')
        .update({ clicks_count: (current.clicks_count || 0) + 1 })
        .eq('id', adId);
    }
  } catch {}
}
