import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface AdCampaign {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  target_url: string | null;
  cta_text: string;
  placement: 'feed' | 'sidebar' | 'banner' | 'modal';
  priority: number;
  impressions_count: number;
  clicks_count: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch active ads for a specific placement
export function useActiveAds(placement: AdCampaign['placement']) {
  return useQuery({
    queryKey: ['ads', 'active', placement],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('placement', placement)
        .eq('is_active', true)
        .lte('starts_at', new Date().toISOString())
        .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
        .order('priority', { ascending: false });

      if (error) throw error;
      return data as AdCampaign[];
    },
  });
}

// Admin: Fetch all ads
export function useAllAds() {
  return useQuery({
    queryKey: ['ads', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AdCampaign[];
    },
  });
}

// Create ad campaign
export function useCreateAd() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (ad: Omit<AdCampaign, 'id' | 'impressions_count' | 'clicks_count' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .insert({
          ...ad,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ads'] });
    },
  });
}

// Update ad campaign
export function useUpdateAd() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AdCampaign> & { id: string }) => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ads'] });
    },
  });
}

// Delete ad campaign
export function useDeleteAd() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ad_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ads'] });
    },
  });
}

// Track ad interaction
export function useTrackAdInteraction() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ adId, type }: { adId: string; type: 'impression' | 'click' }) => {
      // Insert interaction record
      await supabase.from('ad_interactions').insert({
        ad_id: adId,
        user_id: user?.id,
        interaction_type: type,
      });

      // Update counter on ad manually
      const { data: ad } = await supabase
        .from('ad_campaigns')
        .select('impressions_count, clicks_count')
        .eq('id', adId)
        .single();

      if (ad) {
        const updates = type === 'impression' 
          ? { impressions_count: (ad.impressions_count || 0) + 1 }
          : { clicks_count: (ad.clicks_count || 0) + 1 };
        
        await supabase.from('ad_campaigns').update(updates).eq('id', adId);
      }
    },
  });
}
