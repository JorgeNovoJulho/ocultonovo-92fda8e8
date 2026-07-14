import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface Coupon {
  id: string;
  creator_id: string;
  campaign_name: string;
  code: string;
  discount: number;
  start_date: string;
  end_date: string;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_at: string;
}

// In the external DB, profiles.id IS the auth user id
async function getProfileId(userId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  return data?.id || userId; // fallback to userId since id === auth uid
}

// Fetch creator's coupons
export function useCreatorCoupons() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-coupons', user?.id],
    queryFn: async (): Promise<Coupon[]> => {
      if (!user) return [];

      const profileId = await getProfileId(user.id);
      if (!profileId) return [];

      // Use any type to bypass type generation timing issue
      const { data, error } = await (supabase as any)
        .from('coupons')
        .select('*')
        .eq('creator_id', profileId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Coupon[];
    },
    enabled: !!user,
  });
}

// Create a new coupon
export function useCreateCoupon() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (coupon: {
      campaign_name: string;
      code: string;
      discount: number;
      start_date: Date;
      end_date: Date;
      platform_source?: string;
    }): Promise<Coupon> => {
      if (!user) throw new Error('User not authenticated');

      const profileId = await getProfileId(user.id);
      if (!profileId) throw new Error('Profile not found');

      const { data, error } = await (supabase as any)
        .from('coupons')
        .insert({
          creator_id: profileId,
          campaign_name: coupon.campaign_name,
          code: coupon.code.toUpperCase(),
          discount: coupon.discount,
          start_date: coupon.start_date.toISOString(),
          end_date: coupon.end_date.toISOString(),
          platform_source: coupon.platform_source || 'other',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Já existe um cupom com este código');
        }
        throw error;
      }

      return data as Coupon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-coupons'] });
      toast({
        title: 'Cupom criado!',
        description: 'Seu cupom promocional está ativo.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar cupom',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Toggle coupon active status
export function useToggleCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ couponId, isActive }: { couponId: string; isActive: boolean }) => {
      const { error } = await (supabase as any)
        .from('coupons')
        .update({ is_active: isActive })
        .eq('id', couponId);

      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['creator-coupons'] });
      toast({
        title: isActive ? 'Cupom ativado' : 'Cupom pausado',
        description: isActive 
          ? 'O cupom está disponível para uso.' 
          : 'O cupom foi temporariamente desativado.',
      });
    },
  });
}

// Delete a coupon
export function useDeleteCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (couponId: string) => {
      const { error } = await (supabase as any)
        .from('coupons')
        .delete()
        .eq('id', couponId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-coupons'] });
      toast({
        title: 'Cupom removido',
        description: 'O cupom foi excluído permanentemente.',
      });
    },
  });
}

// Validate a coupon code (for checkout)
export async function validateCouponCode(code: string): Promise<Coupon | null> {
  const now = new Date().toISOString();

  const { data, error } = await (supabase as any)
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .lte('start_date', now)
    .gte('end_date', now)
    .single();

  if (error || !data) return null;

  // Check if max uses reached
  if (data.max_uses !== null && data.current_uses >= data.max_uses) {
    return null;
  }

  return data as Coupon;
}

// Increment coupon usage (after successful checkout)
export async function incrementCouponUsage(couponId: string): Promise<void> {
  // Get current uses
  const { data: coupon } = await (supabase as any)
    .from('coupons')
    .select('current_uses')
    .eq('id', couponId)
    .single();

  if (coupon) {
    await (supabase as any)
      .from('coupons')
      .update({ current_uses: (coupon.current_uses || 0) + 1 })
      .eq('id', couponId);
  }
}

// Hook to use coupon on checkout
export function useUseCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (couponId: string) => {
      await incrementCouponUsage(couponId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-coupons'] });
    },
  });
}
