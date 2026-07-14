import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuthStore } from "@/store/useAuthStore";

export function useFounderVagas() {
  return useQuery({
    queryKey: ["founder-vagas-status"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("founder_vagas_status" as any)
          .select("*")
          .single();
        if (error) {
          console.warn('[Oculto] founder_vagas_status não existe, usando fallback');
          return { filled: 0, remaining: 100, total: 100, is_full: false };
        }
        return data as unknown as { filled: number; remaining: number; total: number; is_full: boolean };
      } catch {
        return { filled: 0, remaining: 100, total: 100, is_full: false };
      }
    },
    retry: false,
    staleTime: 60_000,
    refetchInterval: false,
  });
}

export function useMyFounderApplication() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ["my-founder-application", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      try {
        const { data, error } = await supabase
          .from("creator_founder_applications" as any)
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('[Oculto] creator_founder_applications não acessível');
          return null;
        }
        return data as any;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    retry: false,
    staleTime: 60_000,
  });
}

export function useIsCreatorFounder(userId?: string) {
  return useQuery({
    queryKey: ["is-creator-founder", userId],
    queryFn: async () => {
      if (!userId) return null;
      try {
        const { data, error } = await supabase
          .from("creator_founders" as any)
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (error) return null;
        return data as unknown as { id: string; user_id: string; free_period_ends: string; is_active: boolean } | null;
      } catch {
        return null;
      }
    },
    enabled: !!userId,
    retry: false,
    staleTime: 60_000,
  });
}

export function useSubmitFounderApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      user_id?: string | null;
      social_links: Record<string, string>;
      career_description: string;
      photo_url?: string;
      video_url?: string;
      applicant_name?: string;
      applicant_email?: string;
    }) => {
      const { data, error } = await supabase
        .from("creator_founder_applications" as any)
        .insert({
          ...payload,
          user_id: payload.user_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-founder-application"] });
    },
  });
}

export function useAdminFounderApplications() {
  return useQuery({
    queryKey: ["admin-founder-applications"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("creator_founder_applications" as any)
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return [];
        return (data || []) as any[];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useApproveFounder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, adminId }: { applicationId: string; adminId: string }) => {
      const { error } = await supabase.rpc("approve_creator_founder" as any, {
        p_application_id: applicationId,
        p_admin_id: adminId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-founder-applications"] });
      queryClient.invalidateQueries({ queryKey: ["founder-vagas-status"] });
    },
  });
}

export function useRejectFounder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, reason }: { applicationId: string; reason: string }) => {
      const { error } = await supabase
        .from("creator_founder_applications" as any)
        .update({ status: "rejected", rejection_reason: reason, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
        .eq("id", applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-founder-applications"] });
    },
  });
}
