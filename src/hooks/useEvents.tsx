import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

export interface Event {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  location: string;
  event_date: string;
  event_time: string;
  image_url: string | null;
  max_attendees: number | null;
  price: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
  rsvp_count?: number;
}

export interface EventRsvp {
  id: string;
  event_id: string;
  user_id: string;
  created_at: string;
}

async function ensureEventsSchema() {
  const { data, error } = await supabase.functions.invoke("ensure-events-schema");
  if (error || (data as any)?.ok === false) {
    throw new Error((data as any)?.error || error?.message || "Não foi possível preparar a estrutura de eventos");
  }
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    // Eventos mudam pouco, mas vagas/RSVP sim: 5 min de cache e revalida
    // ao abrir a tela depois disso (antes: 30 min sem revalidar nunca).
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,

    queryFn: async () => {
      // Decoupled fetch (sem JOIN — evita PGRST200 em DB externo sem FK declarada)
      let { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .order("event_date", { ascending: true });

      if ((error as any)?.code === "PGRST205") {
        await ensureEventsSchema();
        const retry = await supabase
          .from("events")
          .select("*")
          .eq("is_active", true)
          .order("event_date", { ascending: true });
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      const events = (data || []) as any[];
      if (events.length === 0) return [] as Event[];

      const eventIds = events.map(e => e.id);
      const creatorIds = [...new Set(events.map(e => e.creator_id).filter(Boolean))];

      // Batch: criadores + contagem RSVP em paralelo
      const [creatorsRes, rsvpRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, user_id, username, avatar_url")
          .in("id", creatorIds),
        supabase
          .from("event_rsvps")
          .select("event_id")
          .in("event_id", eventIds),
      ]);

      const creatorMap = new Map<string, any>();
      (creatorsRes.data || []).forEach((c: any) => {
        if (c.id) creatorMap.set(c.id, c);
      });

      const countsMap = (rsvpRes.data || []).reduce((acc: Record<string, number>, r: any) => {
        acc[r.event_id] = (acc[r.event_id] || 0) + 1;
        return acc;
      }, {});

      return events.map(event => ({
        ...event,
        creator: creatorMap.get(event.creator_id) || null,
        rsvp_count: countsMap[event.id] || 0,
      })) as Event[];
    },
  });
}

export function useMyRsvps() {
  return useQuery({
    queryKey: ["my-rsvps"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get profile id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from("event_rsvps")
        .select("event_id")
        .eq("user_id", profile.id);

      if (error) throw error;
      return data?.map(r => r.event_id) || [];
    },
  });
}

export function useRsvpEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Get profile id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      const { error } = await supabase
        .from("event_rsvps")
        .insert({ event_id: eventId, user_id: profile.id });

      if (error) throw error;
    },
    onMutate: async (eventId: string) => {
      await queryClient.cancelQueries({ queryKey: ["my-rsvps"] });
      const prev = queryClient.getQueryData<string[]>(["my-rsvps"]);
      if (prev && !prev.includes(eventId)) {
        queryClient.setQueryData<string[]>(["my-rsvps"], [...prev, eventId]);
      }
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-rsvps"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({
        title: "🎉 Interesse confirmado!",
        description: "Você será notificado sobre atualizações deste evento.",
      });
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["my-rsvps"], ctx.prev);
      toast({
        title: "Erro",
        description: "Não foi possível confirmar interesse.",
        variant: "destructive",
      });
    },
  });
}

export function useCancelRsvp() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Get profile id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      const { error } = await supabase
        .from("event_rsvps")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", profile.id);

      if (error) throw error;
    },
    onMutate: async (eventId: string) => {
      await queryClient.cancelQueries({ queryKey: ["my-rsvps"] });
      const prev = queryClient.getQueryData<string[]>(["my-rsvps"]);
      if (prev) {
        queryClient.setQueryData<string[]>(["my-rsvps"], prev.filter(id => id !== eventId));
      }
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-rsvps"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({
        title: "Interesse cancelado",
        description: "Você não receberá mais atualizações deste evento.",
      });
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["my-rsvps"], ctx.prev);
      toast({
        title: "Erro",
        description: "Não foi possível cancelar interesse.",
        variant: "destructive",
      });
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (eventData: {
      title: string;
      description?: string;
      location: string;
      event_date: string;
      event_time: string;
      image_url?: string;
      max_attendees?: number;
      price?: string;
      tags?: string[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Get profile id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, plan_type")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");
      if (profile.plan_type !== "vip") throw new Error("Apenas usuários VIP podem criar eventos");

      let { error } = await supabase
        .from("events")
        .insert({
          ...eventData,
          creator_id: profile.id,
        });

      if ((error as any)?.code === "PGRST205") {
        await ensureEventsSchema();
        const retry = await supabase
          .from("events")
          .insert({
            ...eventData,
            creator_id: profile.id,
          });
        error = retry.error;
      }

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({
        title: "🎉 Evento criado!",
        description: "Seu evento foi publicado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
