import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

export interface EventCheckin {
  id: string;
  event_id: string;
  user_id: string;
  checked_in_by: string | null;
  checked_in_at: string;
  notes: string | null;
  user?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export interface EventMessage {
  id: string;
  event_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

// Get checkins for an event
export function useEventCheckins(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-checkins", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      if (!eventId) return [];

      const { data: checkins, error } = await (supabase as any)
        .from("event_checkins")
        .select("*")
        .eq("event_id", eventId)
        .order("checked_in_at", { ascending: false });

      if (error) throw error;
      const list = (checkins || []) as any[];
      if (list.length === 0) return [] as EventCheckin[];

      const userIds = [...new Set(list.map((c) => c.user_id).filter(Boolean))];
      const { data: users } = userIds.length
        ? await (supabase as any).from("profiles").select("id, username, avatar_url").in("id", userIds)
        : { data: [] as any[] };
      const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
      return list.map((c) => ({ ...c, user: userMap.get(c.user_id) || null })) as EventCheckin[];
    },
  });
}

// Check in a user
export function useCheckInUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      eventId,
      userId,
      notes,
    }: {
      eventId: string;
      userId: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      const { error } = await supabase.from("event_checkins").insert({
        event_id: eventId,
        user_id: userId,
        checked_in_by: profile.id,
        notes: notes || null,
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event-checkins", variables.eventId] });
      toast({
        title: "✅ Check-in realizado!",
        description: "Presença confirmada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro no check-in",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Remove check-in
export function useRemoveCheckin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) => {
      const { error } = await supabase
        .from("event_checkins")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event-checkins", variables.eventId] });
      toast({
        title: "Check-in removido",
        description: "O check-in foi cancelado.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível remover o check-in.",
        variant: "destructive",
      });
    },
  });
}

// Get messages for an event
export function useEventMessages(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-messages", eventId],
    enabled: !!eventId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    queryFn: async () => {
      if (!eventId) return [];

      const { data: messages, error } = await (supabase as any)
        .from("event_messages")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const list = (messages || []) as any[];
      if (list.length === 0) return [] as EventMessage[];

      const senderIds = [...new Set(list.map((m) => m.sender_id).filter(Boolean))];
      const { data: senders } = senderIds.length
        ? await (supabase as any).from("profiles").select("id, username, avatar_url").in("id", senderIds)
        : { data: [] as any[] };
      const senderMap = new Map<string, any>((senders || []).map((s: any) => [s.id, s]));
      return list.map((m) => ({ ...m, sender: senderMap.get(m.sender_id) || null })) as EventMessage[];
    },
  });
}

// Send message with push notifications
export function useSendEventMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, content }: { eventId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, username")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      // Insert message
      const { error } = await supabase.from("event_messages").insert({
        event_id: eventId,
        sender_id: profile.id,
        content,
      });

      if (error) throw error;

      // Get event info
      const { data: event } = await supabase
        .from("events")
        .select("title, creator_id")
        .eq("id", eventId)
        .single();

      // Get all participants (RSVPs + accepted invites) excluding sender
      const [rsvpsResult, invitesResult] = await Promise.all([
        (supabase as any)
          .from("event_rsvps")
          .select("user_id, mute_notifications")
          .eq("event_id", eventId),
        (supabase as any)
          .from("event_invites")
          .select("recipient_id")
          .eq("event_id", eventId)
          .eq("status", "accepted"),
      ]);

      // Collect profile.ids needing user_id resolution
      const profileIds = new Set<string>();
      (rsvpsResult.data || []).forEach((r: any) => { if (r.user_id && !r.mute_notifications) profileIds.add(r.user_id); });
      (invitesResult.data || []).forEach((i: any) => { if (i.recipient_id) profileIds.add(i.recipient_id); });

      const { data: participantProfiles } = profileIds.size
        ? await (supabase as any).from("profiles").select("id, user_id").in("id", Array.from(profileIds))
        : { data: [] as any[] };

      const participantUserIds = new Set<string>();
      (participantProfiles || []).forEach((p: any) => {
        if (p.user_id && p.user_id !== user.id) participantUserIds.add(p.user_id);
      });

      // Add event creator if not sender
      if (event) {
        const { data: creatorProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", event.creator_id)
          .single();

        if (creatorProfile?.user_id && creatorProfile.user_id !== user.id) {
          participantUserIds.add(creatorProfile.user_id);
        }
      }

      // Create notifications for all participants
      const senderName = profile.username ? `@${profile.username}` : profile.name || "Alguém";
      const notifications = Array.from(participantUserIds).map((userId) => ({
        user_id: userId,
        type: "event_chat" as const,
        title: `💬 ${event?.title || "Evento"}`,
        body: `${senderName}: ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}`,
        data: { event_id: eventId, sender_id: profile.id },
      }));

      if (notifications.length > 0) {
        await supabase.from("notifications").insert(notifications);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event-messages", variables.eventId] });
    },
  });
}

// Upload event image
export async function uploadEventImage(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const fileExt = file.name.split('.').pop();
  const fileName = `${user.id}/${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("event-images")
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/event-images/${fileName}`;
}
