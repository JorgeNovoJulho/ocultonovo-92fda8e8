import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

export interface EventInvite {
  id: string;
  event_id: string;
  sender_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  message: string | null;
  created_at: string;
  responded_at: string | null;
  event?: {
    id: string;
    title: string;
    event_date: string;
    event_time: string;
    location: string;
    image_url: string | null;
  } | null;
  sender?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
  recipient?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

// Get invites I received
export function useReceivedInvites() {
  return useQuery({
    queryKey: ["received-invites"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return [];

      const { data: invites, error } = await (supabase as any)
        .from("event_invites")
        .select("*")
        .eq("recipient_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (invites || []) as any[];
      if (list.length === 0) return [] as EventInvite[];

      const eventIds = [...new Set(list.map((i) => i.event_id).filter(Boolean))];
      const senderIds = [...new Set(list.map((i) => i.sender_id).filter(Boolean))];

      const [eventsRes, sendersRes] = await Promise.all([
        eventIds.length
          ? (supabase as any).from("events").select("id, title, event_date, event_time, location, image_url").in("id", eventIds)
          : Promise.resolve({ data: [] }),
        senderIds.length
          ? (supabase as any).from("profiles").select("id, username, avatar_url").in("id", senderIds)
          : Promise.resolve({ data: [] }),
      ]);

      const eventMap = new Map<string, any>((eventsRes.data || []).map((e: any) => [e.id, e]));
      const senderMap = new Map<string, any>((sendersRes.data || []).map((p: any) => [p.id, p]));

      return list.map((i) => ({
        ...i,
        event: eventMap.get(i.event_id) || null,
        sender: senderMap.get(i.sender_id) || null,
      })) as EventInvite[];
    },
  });
}

// Get pending invites count
export function usePendingInvitesCount() {
  return useQuery({
    queryKey: ["pending-invites-count"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return 0;

      const { count, error } = await supabase
        .from("event_invites")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profile.id)
        .eq("status", "pending");

      if (error) throw error;
      return count || 0;
    },
  });
}

// Get invites I sent for an event
export function useSentInvites(eventId: string | undefined) {
  return useQuery({
    queryKey: ["sent-invites", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      if (!eventId) return [];

      const { data: invites, error } = await (supabase as any)
        .from("event_invites")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (invites || []) as any[];
      if (list.length === 0) return [] as EventInvite[];

      const recipientIds = [...new Set(list.map((i) => i.recipient_id).filter(Boolean))];
      const { data: recipients } = recipientIds.length
        ? await (supabase as any).from("profiles").select("id, username, avatar_url").in("id", recipientIds)
        : { data: [] as any[] };

      const recipientMap = new Map<string, any>((recipients || []).map((p: any) => [p.id, p]));
      return list.map((i) => ({
        ...i,
        recipient: recipientMap.get(i.recipient_id) || null,
      })) as EventInvite[];
    },
  });
}

// Send invite
export function useSendInvite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      eventId,
      recipientIds,
      message,
    }: {
      eventId: string;
      recipientIds: string[];
      message?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      // Insert invites for all recipients
      const invites = recipientIds.map((recipientId) => ({
        event_id: eventId,
        sender_id: profile.id,
        recipient_id: recipientId,
        message: message || null,
      }));

      const { error } = await supabase.from("event_invites").insert(invites);
      if (error) throw error;

      // Create notifications for each recipient
      for (const recipientId of recipientIds) {
        await supabase.from("notifications").insert({
          user_id: recipientId,
          type: "event_invite",
          title: "Convite VIP para Evento! 🎉",
          body: "Você recebeu um convite exclusivo para um evento.",
          data: { event_id: eventId },
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sent-invites", variables.eventId] });
      toast({
        title: "🎉 Convites enviados!",
        description: `${variables.recipientIds.length} convite(s) enviado(s) com sucesso.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar convites",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Respond to invite
export function useRespondToInvite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      inviteId,
      status,
    }: {
      inviteId: string;
      status: "accepted" | "declined";
    }) => {
      const { error } = await supabase
        .from("event_invites")
        .update({
          status,
          responded_at: new Date().toISOString(),
        })
        .eq("id", inviteId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["received-invites"] });
      queryClient.invalidateQueries({ queryKey: ["pending-invites-count"] });
      toast({
        title: variables.status === "accepted" ? "Convite aceito! 🎉" : "Convite recusado",
        description:
          variables.status === "accepted"
            ? "Você confirmou presença no evento."
            : "O convite foi recusado.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível responder ao convite.",
        variant: "destructive",
      });
    },
  });
}
