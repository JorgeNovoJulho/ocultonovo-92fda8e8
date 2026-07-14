/**
 * Hook para Safety Check-in
 * Sistema de verificação de segurança para encontros
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export type CheckinType = 'meetup' | 'date' | 'event' | 'custom';
export type CheckinStatus = 'scheduled' | 'checked_in' | 'missed' | 'alert_sent' | 'cancelled';

export interface EmergencyContact {
  name: string;
  phone?: string;
  email?: string;
  relationship: string;
}

export interface SafetyCheckin {
  id: string;
  user_id: string;
  checkin_type: CheckinType;
  related_event_id: string | null;
  related_user_id: string | null;
  location_description: string | null;
  location_lat: number | null;
  location_lng: number | null;
  scheduled_at: string;
  grace_period_minutes: number;
  emergency_contacts: EmergencyContact[] | null;
  emergency_message: string | null;
  status: CheckinStatus;
  checked_in_at: string | null;
  alert_sent_at: string | null;
  notes: string | null;
  share_location_with_contacts: boolean;
  meeting_profile_url?: string | null;
  tracking_enabled?: boolean;
  tracking_active?: boolean;
  recording_enabled?: boolean;
  recording_active?: boolean;
  deactivation_pin_hash?: string | null;
  deactivation_pin_salt?: string | null;
  tracking_started_at?: string | null;
  tracking_stopped_at?: string | null;
  recording_started_at?: string | null;
  recording_stopped_at?: string | null;
  last_location_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyCheckinLocation {
  id: string;
  checkin_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  maps_url: string | null;
  waze_url: string | null;
  created_at: string;
}

export async function hashSafetyPin(pin: string, salt: string = crypto.randomUUID()) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt };
}

export interface SafetyAlert {
  id: string;
  checkin_id: string;
  user_id: string;
  alert_type: 'missed_checkin' | 'panic_button' | 'location_share';
  contacts_notified: Array<{
    contact_info: EmergencyContact;
    notification_type: string;
    sent_at: string;
    delivered: boolean;
  }> | null;
  responded_at: string | null;
  response_type: 'false_alarm' | 'needs_help' | 'resolved' | null;
  response_notes: string | null;
  authorities_notified: boolean;
  authorities_notified_at: string | null;
  created_at: string;
}

// Hook para listar check-ins do usuário
export function useSafetyCheckins(status?: CheckinStatus) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['safety-checkins', user?.id, status],
    queryFn: async (): Promise<SafetyCheckin[]> => {
      if (!user) return [];

      let query = supabase
        .from('safety_checkins')
        .select('*')
        .eq('user_id', user.id)
        .order('scheduled_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        emergency_contacts: item.emergency_contacts as unknown as EmergencyContact[] | null,
      })) as SafetyCheckin[];
    },
    enabled: !!user,
  });
}

// Hook para check-ins pendentes (para notificações)
export function usePendingCheckins() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-checkins', user?.id],
    queryFn: async (): Promise<SafetyCheckin[]> => {
      if (!user) return [];

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('safety_checkins')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        emergency_contacts: item.emergency_contacts as unknown as EmergencyContact[] | null,
      })) as SafetyCheckin[];
    },
    enabled: !!user,
    refetchInterval: 60000, // Verificar a cada minuto
  });
}

// Hook para criar check-in
export function useCreateCheckin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      checkinType: CheckinType;
      scheduledAt: Date;
      gracePeriodMinutes?: number;
      locationDescription?: string;
      locationLat?: number;
      locationLng?: number;
      relatedEventId?: string;
      relatedUserId?: string;
      emergencyContacts?: EmergencyContact[];
      emergencyMessage?: string;
      shareLocationWithContacts?: boolean;
      meetingProfileUrl?: string;
      trackingEnabled?: boolean;
      recordingEnabled?: boolean;
      deactivationPin?: string;
      notes?: string;
    }) => {
      if (!user) throw new Error('Usuário não autenticado');

      const {
        checkinType,
        scheduledAt,
        gracePeriodMinutes = 30,
        locationDescription,
        locationLat,
        locationLng,
        relatedEventId,
        relatedUserId,
        emergencyContacts,
        emergencyMessage,
        shareLocationWithContacts = false,
        meetingProfileUrl,
        trackingEnabled = false,
        recordingEnabled = false,
        deactivationPin,
        notes,
      } = params;

      const pinData = deactivationPin ? await hashSafetyPin(deactivationPin) : null;

      const insertData = {
        user_id: user.id,
        checkin_type: checkinType,
        scheduled_at: scheduledAt.toISOString(),
        grace_period_minutes: gracePeriodMinutes,
        location_description: locationDescription ?? null,
        location_lat: locationLat ?? null,
        location_lng: locationLng ?? null,
        related_event_id: relatedEventId ?? null,
        related_user_id: relatedUserId ?? null,
        emergency_contacts: (emergencyContacts ?? null) as unknown as Record<string, unknown>[] | null,
        emergency_message: emergencyMessage ||
          'Estou verificando minha segurança. Se você recebeu este alerta, significa que não confirmei meu check-in. Por favor, tente entrar em contato comigo.',
        share_location_with_contacts: shareLocationWithContacts,
        meeting_profile_url: meetingProfileUrl ?? null,
        tracking_enabled: trackingEnabled,
        tracking_active: trackingEnabled,
        recording_enabled: recordingEnabled,
        recording_active: false,
        tracking_started_at: trackingEnabled ? new Date().toISOString() : null,
        deactivation_pin_hash: pinData?.hash ?? null,
        deactivation_pin_salt: pinData?.salt ?? null,
        notes: notes ?? null,
      };

      const { data, error } = await supabase
        .from('safety_checkins')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['pending-checkins'] });
      toast({
        title: '🛡️ Check-in Agendado',
        description: 'Você receberá um lembrete para confirmar sua segurança.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar check-in',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para confirmar check-in (estou seguro)
export function useConfirmCheckin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (checkinId: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('safety_checkins')
        .update({
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
        })
        .eq('id', checkinId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['pending-checkins'] });
      toast({
        title: '✅ Check-in Confirmado',
        description: 'Ótimo! Sua segurança foi confirmada.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao confirmar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para cancelar check-in
export function useCancelCheckin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (checkinId: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('safety_checkins')
        .update({ status: 'cancelled' })
        .eq('id', checkinId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['pending-checkins'] });
      toast({
        title: 'Check-in Cancelado',
        description: 'O check-in foi cancelado.',
      });
    },
  });
}

// Hook para excluir check-in permanentemente
export function useDeleteCheckin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (checkinId: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('safety_checkins')
        .delete()
        .eq('id', checkinId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['pending-checkins'] });
      toast({
        title: 'Check-in Excluído',
        description: 'O encontro foi removido.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para botão de pânico (SOS)
export function usePanicButton() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: {
      checkinId?: string;
      message?: string;
    }) => {
      if (!user) throw new Error('Usuário não autenticado');

      // Caso 1: SOS associado a checkin existente
      if (params?.checkinId) {
        const { data: alert, error } = await supabase
          .from('safety_alerts')
          .insert({
            checkin_id: params.checkinId,
            user_id: user.id,
            alert_type: 'panic_button',
            response_notes: params.message ?? null,
          })
          .select()
          .single();

        if (error) throw error;

        await supabase
          .from('safety_checkins')
          .update({ status: 'alert_sent', alert_sent_at: new Date().toISOString() })
          .eq('id', params.checkinId);

        return alert;
      }

      // Caso 2: SOS sem checkin → cria checkin emergencial dedicado
      const nowIso = new Date().toISOString();
      const { data: emergencyCheckin, error: createErr } = await supabase
        .from('safety_checkins')
        .insert({
          user_id: user.id,
          checkin_type: 'custom',
          scheduled_at: nowIso,
          grace_period_minutes: 0,
          status: 'alert_sent',
          alert_sent_at: nowIso,
          emergency_message: params?.message ||
            '🚨 BOTÃO DE PÂNICO ACIONADO — preciso de ajuda imediata.',
          notes: 'Check-in emergencial criado automaticamente pelo SOS.',
        })
        .select('id')
        .single();

      if (createErr) throw createErr;

      const { data: alert, error: alertErr } = await supabase
        .from('safety_alerts')
        .insert({
          checkin_id: emergencyCheckin.id,
          user_id: user.id,
          alert_type: 'panic_button',
          response_notes: params?.message ?? null,
        })
        .select()
        .single();

      if (alertErr) throw alertErr;
      return alert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['pending-checkins'] });
      queryClient.invalidateQueries({ queryKey: ['safety-alerts'] });
      toast({
        title: '🚨 Alerta Enviado!',
        description: 'Seus contatos de emergência serão notificados.',
        variant: 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar alerta',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useSaveCheckinLocation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { checkinId: string; latitude: number; longitude: number; accuracy?: number | null }) => {
      if (!user) throw new Error('Usuário não autenticado');
      const mapsUrl = `https://www.google.com/maps?q=${params.latitude},${params.longitude}`;
      const wazeUrl = `https://waze.com/ul?ll=${params.latitude},${params.longitude}&navigate=yes`;
      const nowIso = new Date().toISOString();

      const { data, error } = await (supabase as any).from('safety_checkin_locations').insert({
        checkin_id: params.checkinId,
        user_id: user.id,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy ?? null,
        maps_url: mapsUrl,
        waze_url: wazeUrl,
      }).select().single();
      if (error) throw error;

      await (supabase as any).from('safety_checkins').update({
        location_lat: params.latitude,
        location_lng: params.longitude,
        last_location_at: nowIso,
        tracking_active: true,
      }).eq('id', params.checkinId).eq('user_id', user.id);

      return data as SafetyCheckinLocation;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['safety-checkins'] }),
  });
}

export function useStopProtectedSafetyFeature() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ checkin, pin, feature }: { checkin: SafetyCheckin; pin: string; feature: 'tracking' | 'recording' | 'all' }) => {
      if (!user) throw new Error('Usuário não autenticado');
      if (checkin.deactivation_pin_hash && checkin.deactivation_pin_salt) {
        const pinData = await hashSafetyPin(pin, checkin.deactivation_pin_salt);
        if (pinData.hash !== checkin.deactivation_pin_hash) throw new Error('PIN incorreto. Rastreamento/gravação permanecem ativos.');
      }

      const nowIso = new Date().toISOString();
      const update: Record<string, unknown> = {};
      if (feature === 'tracking' || feature === 'all') Object.assign(update, { tracking_active: false, tracking_stopped_at: nowIso });
      if (feature === 'recording' || feature === 'all') Object.assign(update, { recording_active: false, recording_stopped_at: nowIso });

      const { error } = await (supabase as any).from('safety_checkins').update(update).eq('id', checkin.id).eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety-checkins'] });
      toast({ title: 'Proteção desativada', description: 'A alteração foi registrada com data e hora.' });
    },
    onError: (error: Error) => toast({ title: 'Não foi possível desativar', description: error.message, variant: 'destructive' }),
  });
}

// Hook para listar alertas
export function useSafetyAlerts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['safety-alerts', user?.id],
    queryFn: async (): Promise<SafetyAlert[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('safety_alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        contacts_notified: item.contacts_notified as unknown as SafetyAlert['contacts_notified'],
      })) as SafetyAlert[];
    },
    enabled: !!user,
  });
}

// Labels em português
export const checkinTypeLabels: Record<CheckinType, string> = {
  meetup: 'Encontro',
  date: 'Date',
  event: 'Evento',
  custom: 'Personalizado',
};

export const checkinStatusLabels: Record<CheckinStatus, string> = {
  scheduled: 'Agendado',
  checked_in: 'Confirmado',
  missed: 'Perdido',
  alert_sent: 'Alerta Enviado',
  cancelled: 'Cancelado',
};
