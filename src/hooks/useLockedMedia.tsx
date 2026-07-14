import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface LockedMediaMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  is_locked: boolean;
  unlock_price: number | null;
  unlocked_by: string[];
  is_read: boolean;
  created_at: string;
}

export interface MediaUnlock {
  id: string;
  message_id: string;
  user_id: string;
  creator_id: string;
  amount: number;
  created_at: string;
}

// Send a locked media message
export function useSendLockedMedia() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      mediaUrl,
      mediaType,
      unlockPrice,
      caption,
    }: {
      conversationId: string;
      mediaUrl: string;
      mediaType: 'image' | 'video';
      unlockPrice: number;
      caption?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: caption || '🔒 Mídia exclusiva',
          media_url: mediaUrl,
          media_type: mediaType,
          is_locked: true,
          unlock_price: unlockPrice,
          unlocked_by: [],
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Mídia exclusiva enviada!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao enviar: ${error.message}`);
    },
  });
}

// Unlock media by paying
export function useUnlockMedia() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      creatorId,
      amount,
    }: {
      messageId: string;
      creatorId: string;
      amount: number;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Get user's profile for balance check
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, balance')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      const currentBalance = Number(profile.balance) || 0;
      if (currentBalance < amount) {
        throw new Error('Saldo insuficiente. Recarregue sua carteira.');
      }

      // Deduct from user's balance
      const { error: deductError } = await supabase
        .from('profiles')
        .update({ balance: currentBalance - amount })
        .eq('user_id', user.id);

      if (deductError) throw deductError;

      // Add to creator's balance
      const { data: creatorProfile, error: creatorError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('user_id', creatorId)
        .single();

      if (creatorError) throw creatorError;

      const creatorBalance = Number(creatorProfile.balance) || 0;
      const creatorCut = amount * 0.8; // Creator gets 80%

      const { error: addError } = await supabase
        .from('profiles')
        .update({ balance: creatorBalance + creatorCut })
        .eq('user_id', creatorId);

      if (addError) throw addError;

      // Record the unlock
      const { error: unlockError } = await (supabase as any)
        .from('media_unlocks')
        .insert({
          message_id: messageId,
          user_id: user.id,
          creator_id: creatorId,
          amount,
        });

      if (unlockError) throw unlockError;

      // Update the message's unlocked_by array
      const { data: message } = await supabase
        .from('messages')
        .select('unlocked_by')
        .eq('id', messageId)
        .single();

      const currentUnlocked = (message?.unlocked_by as string[]) || [];
      
      await supabase
        .from('messages')
        .update({ 
          unlocked_by: [...currentUnlocked, user.id] 
        })
        .eq('id', messageId);

      // Create notification for creator (tipo 'gift' para ativar modal especial)
      await supabase
        .from('notifications')
        .insert({
          user_id: creatorId,
          type: 'gift',
          title: '🎁 Presente Recebido!',
          body: `Você recebeu R$ ${creatorCut.toFixed(2)} de presente pelo desbloqueio de mídia.`,
          data: {
            message_id: messageId,
            amount: creatorCut,
            from_user_id: user.id,
          },
        });

      // Record transaction for user
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (userProfile) {
        await supabase
          .from('transactions')
          .insert({
            user_id: userProfile.id,
            type: 'media_unlock',
            amount: -amount,
            status: 'completed',
            description: 'Desbloqueio de mídia exclusiva',
          });
      }

      // Record transaction for creator
      const { data: creatorProfileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', creatorId)
        .single();

      if (creatorProfileData) {
        await supabase
          .from('transactions')
          .insert({
            user_id: creatorProfileData.id,
            type: 'gift',
            amount: creatorCut,
            status: 'completed',
            description: 'Presente recebido - Desbloqueio de mídia exclusiva',
          });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Mídia desbloqueada! 🔓');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Check if user has unlocked a specific message
export function useHasUnlocked(messageId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['media-unlock', messageId, user?.id],
    queryFn: async () => {
      if (!user || !messageId) return false;

      const { data, error } = await (supabase as any)
        .from('media_unlocks')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return false;
      return !!data;
    },
    enabled: !!user && !!messageId,
  });
}

// Get user's unlock history
export function useMyUnlocks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-unlocks', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await (supabase as any)
        .from('media_unlocks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) return [];
      return (data || []) as MediaUnlock[];
    },
    enabled: !!user,
  });
}
