import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

export interface EventRating {
  id: string;
  event_id: string;
  user_id: string;
  rating: number;
  feedback: string | null;
  aspects: {
    organization?: number;
    venue?: number;
    attendees?: number;
  } | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export interface RatingSummary {
  average: number;
  total: number;
  distribution: Record<number, number>;
  aspects: {
    organization: number | null;
    venue: number | null;
    attendees: number | null;
  };
}

// Get ratings for an event (organizer view)
export function useEventRatings(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-ratings", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      if (!eventId) return [];

      const { data: ratings, error } = await (supabase as any)
        .from("event_ratings")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (ratings || []) as any[];
      if (list.length === 0) return [] as EventRating[];

      const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))];
      const { data: users } = userIds.length
        ? await (supabase as any).from("profiles").select("id, username, avatar_url").in("id", userIds)
        : { data: [] as any[] };

      const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
      return list.map((r) => ({ ...r, user: userMap.get(r.user_id) || null })) as EventRating[];
    },
  });
}

// Get user's own rating for an event
export function useMyEventRating(eventId: string | undefined) {
  return useQuery({
    queryKey: ["my-event-rating", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      if (!eventId) return null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return null;

      const { data, error } = await supabase
        .from("event_ratings")
        .select("*")
        .eq("event_id", eventId)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (error) throw error;
      return data as EventRating | null;
    },
  });
}

// Check if user can rate (has check-in)
export function useCanRateEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ["can-rate-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      if (!eventId) return false;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return false;

      // Check if user has check-in
      const { data: checkin } = await supabase
        .from("event_checkins")
        .select("id")
        .eq("event_id", eventId)
        .eq("user_id", profile.id)
        .maybeSingle();

      return !!checkin;
    },
  });
}

// Submit rating
export function useSubmitEventRating() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      eventId,
      rating,
      feedback,
      aspects,
    }: {
      eventId: string;
      rating: number;
      feedback?: string;
      aspects?: { organization?: number; venue?: number; attendees?: number };
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      const { error } = await supabase.from("event_ratings").insert({
        event_id: eventId,
        user_id: profile.id,
        rating,
        feedback: feedback || null,
        aspects: aspects || {},
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event-ratings", variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ["my-event-rating", variables.eventId] });
      toast({
        title: "⭐ Obrigado pela avaliação!",
        description: "Sua opinião ajuda a melhorar os próximos eventos.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar avaliação",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Update rating
export function useUpdateEventRating() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      ratingId,
      eventId,
      rating,
      feedback,
      aspects,
    }: {
      ratingId: string;
      eventId: string;
      rating: number;
      feedback?: string;
      aspects?: { organization?: number; venue?: number; attendees?: number };
    }) => {
      const { error } = await supabase
        .from("event_ratings")
        .update({
          rating,
          feedback: feedback || null,
          aspects: aspects || {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", ratingId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event-ratings", variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ["my-event-rating", variables.eventId] });
      toast({
        title: "Avaliação atualizada",
        description: "Sua avaliação foi atualizada com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a avaliação.",
        variant: "destructive",
      });
    },
  });
}

// Calculate rating summary
export function calculateRatingSummary(ratings: EventRating[]): RatingSummary {
  if (ratings.length === 0) {
    return {
      average: 0,
      total: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      aspects: { organization: null, venue: null, attendees: null },
    };
  }

  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  let orgSum = 0, orgCount = 0;
  let venueSum = 0, venueCount = 0;
  let attendeesSum = 0, attendeesCount = 0;

  ratings.forEach((r) => {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    
    if (r.aspects?.organization) {
      orgSum += r.aspects.organization;
      orgCount++;
    }
    if (r.aspects?.venue) {
      venueSum += r.aspects.venue;
      venueCount++;
    }
    if (r.aspects?.attendees) {
      attendeesSum += r.aspects.attendees;
      attendeesCount++;
    }
  });

  return {
    average: sum / ratings.length,
    total: ratings.length,
    distribution,
    aspects: {
      organization: orgCount > 0 ? orgSum / orgCount : null,
      venue: venueCount > 0 ? venueSum / venueCount : null,
      attendees: attendeesCount > 0 ? attendeesSum / attendeesCount : null,
    },
  };
}
