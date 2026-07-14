import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

export type AudienceType = 'all_followers' | 'active_subscribers' | 'expired_subscribers';
export type BroadcastStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Broadcast {
  id: string;
  creator_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  is_ppv: boolean;
  ppv_price: number;
  audience_type: AudienceType;
  total_recipients: number;
  delivered_count: number;
  read_count: number;
  unlock_count: number;
  total_revenue: number;
  status: BroadcastStatus;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  // New scheduling fields
  is_scheduled: boolean;
  scheduled_for: string | null;
}

export interface BroadcastDelivery {
  id: string;
  broadcast_id: string;
  recipient_id: string;
  message_id: string | null;
  status: 'pending' | 'delivered' | 'read' | 'unlocked' | 'failed';
  delivered_at: string | null;
  read_at: string | null;
  unlocked_at: string | null;
  paid_amount: number;
  created_at: string;
}

// Hook para criar broadcast
export function useCreateBroadcast() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      content,
      mediaUrl,
      mediaType,
      isPpv,
      ppvPrice,
      audienceType,
      isScheduled,
      scheduledFor,
    }: {
      content?: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video';
      isPpv: boolean;
      ppvPrice?: number;
      audienceType: AudienceType;
      isScheduled?: boolean;
      scheduledFor?: Date;
    }) => {
      if (!user || !profile) throw new Error('Not authenticated');

      // Contar destinatários primeiro
      const recipientCount = await countRecipients(profile.id, audienceType);
      
      if (recipientCount === 0) {
        throw new Error('Nenhum destinatário encontrado para esta audiência');
      }

      // Criar broadcast
      const { data: broadcast, error } = await supabase
        .from('broadcasts')
        .insert({
          creator_id: profile.id,
          content,
          media_url: mediaUrl,
          media_type: mediaType,
          is_ppv: isPpv,
          ppv_price: isPpv ? (ppvPrice || 0) : 0,
          audience_type: audienceType,
          total_recipients: recipientCount,
          status: 'pending',
          is_scheduled: isScheduled || false,
          scheduled_for: isScheduled && scheduledFor ? scheduledFor.toISOString() : null,
        })
        .select()
        .single();

      if (error) throw error;

      // Se NÃO é agendado, processar imediatamente
      if (!isScheduled) {
        // Disparar Edge Function para processar
        const { error: fnError } = await supabase.functions.invoke('process-broadcast', {
          body: { broadcast_id: broadcast.id }
        });

        if (fnError) {
          console.error('Failed to start broadcast processing:', fnError);
          // Atualizar status para failed
          await supabase
            .from('broadcasts')
            .update({ status: 'failed', error_message: fnError.message })
            .eq('id', broadcast.id);
          throw fnError;
        }
      }

      return broadcast;
    },
    onSuccess: (broadcast) => {
      queryClient.invalidateQueries({ queryKey: ['my-broadcasts'] });
      if (broadcast.is_scheduled) {
        toast.success('Broadcast agendado! ⏰');
      } else {
        toast.success('Broadcast iniciado! 📢');
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao enviar: ${error.message}`);
    },
  });
}

// Hook para listar broadcasts do criador
export function useMyBroadcasts() {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['my-broadcasts', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('creator_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Broadcast[];
    },
    enabled: !!profile,
  });
}

// Hook para estatísticas de um broadcast específico com Realtime
export function useBroadcastStats(broadcastId: string | null) {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);

  useEffect(() => {
    if (!broadcastId) return;

    // Fetch initial data
    const fetchBroadcast = async () => {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .single();

      if (!error && data) {
        setBroadcast(data as Broadcast);
      }
    };

    fetchBroadcast();

    // Realtime via bus — filtra por id no handler.
    const unsub = subscribeTable('broadcasts', (payload: any) => {
      const row = payload.new as Broadcast | undefined;
      if (!row || row.id !== broadcastId) return;
      setBroadcast(row);
    }, { events: ['UPDATE'] });

    return unsub;
  }, [broadcastId]);

  return { broadcast };
}

// Hook para contar destinatários por tipo de audiência
export function useRecipientCount(audienceType: AudienceType | null) {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['recipient-count', profile?.id, audienceType],
    queryFn: async () => {
      if (!profile || !audienceType) return 0;
      return countRecipients(profile.id, audienceType);
    },
    enabled: !!profile && !!audienceType,
  });
}

// Função auxiliar para contar destinatários
async function countRecipients(creatorId: string, audienceType: AudienceType): Promise<number> {
  switch (audienceType) {
    case 'all_followers': {
      const { count, error } = await supabase
        .from('followers' as any)
        .select('*', { count: 'exact', head: true })
        .eq('following_id', creatorId);
      if (error) throw error;
      return count || 0;
    }
    case 'active_subscribers': {
      const { count, error } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId)
        .eq('status', 'active');
      if (error) throw error;
      return count || 0;
    }
    case 'expired_subscribers': {
      const { count, error } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', creatorId)
        .eq('status', 'expired');
      if (error) throw error;
      return count || 0;
    }
    default:
      return 0;
  }
}

// Hook para buscar entregas de um broadcast
export function useBroadcastDeliveries(broadcastId: string | null) {
  return useQuery({
    queryKey: ['broadcast-deliveries', broadcastId],
    queryFn: async () => {
      if (!broadcastId) return [];

      const { data: deliveries, error } = await supabase
        .from('broadcast_deliveries')
        .select('*')
        .eq('broadcast_id', broadcastId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const list = (deliveries || []) as any[];
      if (list.length === 0) return [];

      const recipientIds = [...new Set(list.map((d) => d.recipient_id).filter(Boolean))];
      const { data: recipients } = recipientIds.length
        ? await (supabase as any).from('v_public_profiles').select('id, name, username, avatar_url').in('id', recipientIds)
        : { data: [] as any[] };
      const recipientMap = new Map<string, any>((recipients || []).map((p: any) => [p.id, p]));
      return list.map((d) => ({ ...d, recipient: recipientMap.get(d.recipient_id) || null }));
    },
    enabled: !!broadcastId,
  });
}

// Hook para marcar broadcast como lido (quando usuário abre a mensagem)
export function useMarkBroadcastRead() {
  const { user } = useAuth();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: async (broadcastId: string) => {
      if (!profile) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('broadcast_deliveries')
        .update({ 
          status: 'read', 
          read_at: new Date().toISOString() 
        })
        .eq('broadcast_id', broadcastId)
        .eq('recipient_id', profile.id)
        .eq('status', 'delivered');

      if (error) throw error;
    },
  });
}

// Hook para registrar unlock de broadcast PPV
export function useRecordBroadcastUnlock() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ broadcastId, paidAmount }: { broadcastId: string; paidAmount: number }) => {
      if (!profile) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('broadcast_deliveries')
        .update({
          status: 'unlocked', 
          unlocked_at: new Date().toISOString(),
          paid_amount: paidAmount
        })
        .eq('broadcast_id', broadcastId)
        .eq('recipient_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcast-deliveries'] });
    },
  });
}
