import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface CartAbandonmentData {
  plan_type: 'monthly' | 'annual';
  amount: number;
  coupon_code?: string;
  ghost_mode?: boolean;
  creator_id?: string;
  phone_number: string;
  user_name?: string;
  user_email?: string;
}

export interface CartAbandonment {
  id: string;
  user_id: string | null;
  plan_type: string;
  amount: number;
  coupon_code: string | null;
  ghost_mode: boolean;
  creator_id: string | null;
  phone_number: string;
  user_name: string | null;
  user_email: string | null;
  status: 'pending' | 'recovered' | 'sent' | 'expired' | 'failed' | 'clicked';
  created_at: string;
  magic_link_expires_at: string | null;
  scheduled_send_at: string;
  sent_at: string | null;
  recovered_at: string | null;
  clicked_at: string | null;
  magic_link_token: string;
}

// Hook to create a cart abandonment record when user starts checkout
export function useCreateCartAbandonment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CartAbandonmentData) => {
      // Get user's profile ID if logged in
      let profileId: string | null = null;
      
      if (user?.id) {
        const { data: profile } = await (supabase as any)
          .from('v_public_profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();
        
        profileId = profile?.id || null;
      }

      const { data: cart, error } = await (supabase as any)
        .from('cart_abandonment')
        .insert({
          user_id: profileId,
          plan_type: data.plan_type,
          amount: data.amount,
          coupon_code: data.coupon_code || null,
          ghost_mode: data.ghost_mode || false,
          creator_id: data.creator_id || null,
          phone_number: data.phone_number,
          user_name: data.user_name || null,
          user_email: data.user_email || user?.email || null,
        })
        .select()
        .single();

      if (error) throw error;
      return cart as CartAbandonment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart-abandonment'] });
    },
  });
}

// Hook to mark cart as recovered (user completed purchase)
export function useMarkCartRecovered() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cartId?: string) => {
      if (!user?.id) return;

      // Get profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.id) return;

      // Update the most recent pending cart for this user
      const { error } = await (supabase as any)
        .from('cart_abandonment')
        .update({
          status: 'recovered',
          recovered_at: new Date().toISOString(),
        })
        .eq('user_id', profile.id)
        .eq('status', 'pending');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart-abandonment'] });
    },
  });
}

// Hook to fetch cart by magic link token (for resume checkout)
export function useCartByToken(token: string | null) {
  return useQuery({
    queryKey: ['cart-by-token', token],
    queryFn: async () => {
      if (!token) return null;

      const { data, error } = await (supabase as any)
        .from('cart_abandonment')
        .select('*')
        .eq('magic_link_token', token)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as CartAbandonment;
    },
    enabled: !!token,
  });
}

// Hook to mark cart as clicked (user opened magic link)
export function useMarkCartClicked() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const { error } = await (supabase as any)
        .from('cart_abandonment')
        .update({
          status: 'clicked',
          clicked_at: new Date().toISOString(),
        })
        .eq('magic_link_token', token)
        .in('status', ['pending', 'sent']);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart-abandonment'] });
    },
  });
}

// Admin hook to fetch recovery metrics
export function useCartRecoveryMetrics() {
  return useQuery({
    queryKey: ['cart-recovery-metrics'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('cart_recovery_metrics')
        .select('*')
        .order('date', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as Array<{
        date: string;
        total_carts: number;
        recovered_count: number;
        sent_count: number;
        clicked_count: number;
        expired_count: number;
        recovery_rate: number;
        recovered_revenue: number;
      }>;
    },
  });
}

// Phone number formatting helper
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  
  if (digits.length === 13 && digits.startsWith('55')) {
    const local = digits.slice(2);
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  
  return phone;
}

// Phone validation helper
export function isValidBrazilianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  
  // 11 digits for mobile (DDD + 9 + 8 digits)
  // or 13 digits with country code (55 + DDD + 9 + 8 digits)
  return digits.length === 11 || (digits.length === 13 && digits.startsWith('55'));
}
