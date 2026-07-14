import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface GiftHistory {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  credits_used: number;
  message_id: string | null;
  conversation_id: string | null;
  thank_you_type: 'message' | 'photo' | 'coupon' | null;
  thank_you_sent_at: string | null;
  is_visible: boolean;
  created_at: string;
  sender?: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
  receiver?: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export function useSendGift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      receiverProfileId,
      amount,
      conversationId,
    }: {
      receiverProfileId: string;
      amount: number;
      conversationId?: string;
    }) => {
      if (amount < 0.50) {
        throw new Error('Valor mínimo de R$ 0,50');
      }

      const { data, error } = await supabase.rpc('send_gift', {
        p_receiver_profile_id: receiverProfileId,
        p_amount: amount,
        p_conversation_id: conversationId || null,
      });

      if (error) throw error;
      
      const result = data as { 
        success: boolean; 
        error?: string; 
        gift_id?: string;
        message_id?: string;
        amount?: number;
        receiver_name?: string;
      };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao enviar presente');
      }

      return result;
    },
    onSuccess: (data) => {
      toast.success(`🎁 Presente de R$ ${data.amount} enviado para ${data.receiver_name}!`);
      queryClient.invalidateQueries({ queryKey: ['user-credits'] });
      queryClient.invalidateQueries({ queryKey: ['gift-history'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Missão diária "Envie um presente"
      import('@/lib/auraQuests').then(({ progressAuraQuest }) => {
        void progressAuraQuest('send_gift', 1);
      }).catch(() => {});
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useGiftHistory(filters?: {
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  receiverId?: string;
}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['gift-history', 'sent', user?.id, filters],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get profile id
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      let query = supabase
        .from('gift_history')
        .select('*')
        .eq('sender_id', profile.id)
        .eq('is_visible', true)
        .order('created_at', { ascending: false });

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }
      if (filters?.minAmount) {
        query = query.gte('amount', filters.minAmount);
      }
      if (filters?.maxAmount) {
        query = query.lte('amount', filters.maxAmount);
      }
      if (filters?.receiverId) {
        query = query.eq('receiver_id', filters.receiverId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching gift history:', error);
        return [];
      }

      // Fetch receiver profiles separately
      const gifts = data || [];
      const receiverIds = [...new Set(gifts.map(g => g.receiver_id))];
      
      const { data: receivers } = await (supabase as any)
        .from('v_public_profiles')
        .select('id, name, username, avatar_url')
        .in('id', receiverIds);

      const receiverMap = new Map(receivers?.map(r => [r.id, r]) || []);

      return gifts.map(g => ({
        ...g,
        receiver: receiverMap.get(g.receiver_id) || undefined,
      })) as GiftHistory[];
    },
    enabled: !!user?.id,
  });
}

export function useGiftsReceived() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['gift-history', 'received', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get profile id
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from('gift_history')
        .select('*')
        .eq('receiver_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching received gifts:', error);
        return [];
      }

      // Fetch sender profiles separately
      const gifts = data || [];
      const senderIds = [...new Set(gifts.map(g => g.sender_id))];
      
      const { data: senders } = await (supabase as any)
        .from('v_public_profiles')
        .select('id, name, username, avatar_url')
        .in('id', senderIds);

      const senderMap = new Map(senders?.map(s => [s.id, s]) || []);

      return gifts.map(g => ({
        ...g,
        sender: senderMap.get(g.sender_id) || undefined,
      })) as GiftHistory[];
    },
    enabled: !!user?.id,
  });
}

export function useRepeatGift() {
  const sendGift = useSendGift();

  return useMutation({
    mutationFn: async (giftId: string) => {
      // Get the original gift
      const { data: gift, error } = await supabase
        .from('gift_history')
        .select('receiver_id, amount, conversation_id')
        .eq('id', giftId)
        .single();

      if (error || !gift) {
        throw new Error('Presente não encontrado');
      }

      // Send the same gift again
      return sendGift.mutateAsync({
        receiverProfileId: gift.receiver_id,
        amount: gift.amount,
        conversationId: gift.conversation_id || undefined,
      });
    },
  });
}

export function useDeleteGiftHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (giftId: string) => {
      const { error } = await supabase
        .from('gift_history')
        .update({ is_visible: false })
        .eq('id', giftId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Presente removido do histórico');
      queryClient.invalidateQueries({ queryKey: ['gift-history'] });
    },
    onError: () => {
      toast.error('Erro ao remover presente');
    },
  });
}

export function useGiftStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['gift-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Get profile id
      const { data: profile } = await (supabase as any)
        .from('v_public_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return null;

      // Get sent gifts stats
      const { data: sent } = await supabase
        .from('gift_history')
        .select('amount')
        .eq('sender_id', profile.id)
        .eq('is_visible', true);

      // Get received gifts stats
      const { data: received } = await supabase
        .from('gift_history')
        .select('amount')
        .eq('receiver_id', profile.id);

      const totalSent = sent?.reduce((sum, g) => sum + Number(g.amount), 0) || 0;
      const totalReceived = received?.reduce((sum, g) => sum + Number(g.amount), 0) || 0;

      return {
        totalSent,
        totalReceived,
        sentCount: sent?.length || 0,
        receivedCount: received?.length || 0,
      };
    },
    enabled: !!user?.id,
  });
}
