import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

export interface StoryReport {
  id: string;
  story_id: string | null;
  reporter_id: string;
  reported_user_id: string | null;
  category: string;
  description: string | null;
  priority_level: string;
  status: string;
  evidence_urls: string[] | null;
  content_hidden: boolean;
  sla_deadline: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  story?: {
    id: string;
    media_url: string | null;
    content_text: string | null;
  } | null;
}

export function useStoryReports(priority?: string) {
  return useQuery({
    queryKey: ["story-reports", priority],
    queryFn: async () => {
      let query = supabase
        .from("content_reports")
        .select("*")
        .not("story_id", "is", null)
        .in("status", ["pending", "under_review"])
        .order("created_at", { ascending: true });

      if (priority) {
        query = query.eq("priority_level", priority);
      }

      const { data, error } = await query;
      if (error) throw error;

      const reports = (data || []) as any[];
      const storyIds = [...new Set(reports.map((r) => r.story_id).filter(Boolean))];
      const { data: stories } = storyIds.length
        ? await (supabase as any).from("posts").select("id, media_url, content_text").in("id", storyIds)
        : { data: [] as any[] };
      const storyMap = new Map<string, any>((stories || []).map((s: any) => [s.id, s]));

      const enriched = reports.map((r) => ({ ...r, story: storyMap.get(r.story_id) || null }));

      // Sort by priority
      const priorityOrder: Record<string, number> = {
        critical: 1,
        high: 2,
        normal: 3,
        low: 4,
      };

      return enriched.sort((a, b) => {
        const aOrder = priorityOrder[a.priority_level] || 5;
        const bOrder = priorityOrder[b.priority_level] || 5;
        return aOrder - bOrder;
      }) as StoryReport[];
    },
  });
}

export function useHideStory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reportId, storyId }: { reportId: string; storyId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Hide the story (set is_active to false)
      const { error: storyError } = await supabase
        .from("posts")
        .update({ is_locked: true })
        .eq("id", storyId);

      if (storyError) throw storyError;

      // Update the report
      const { error: reportError } = await supabase
        .from("content_reports")
        .update({
          status: "resolved",
          content_hidden: true,
          hidden_at: new Date().toISOString(),
          hidden_by: user.id,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: "Story ocultado por moderação",
        })
        .eq("id", reportId);

      if (reportError) throw reportError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-reports"] });
      toast({
        title: "Story ocultado",
        description: "O conteúdo foi removido da visualização.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível ocultar o story.",
        variant: "destructive",
      });
    },
  });
}

export function useDismissReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reportId, notes }: { reportId: string; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("content_reports")
        .update({
          status: "dismissed",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: notes || "Denúncia dispensada - sem violação encontrada",
        })
        .eq("id", reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-reports"] });
      toast({
        title: "Denúncia dispensada",
        description: "A denúncia foi marcada como infundada.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível dispensar a denúncia.",
        variant: "destructive",
      });
    },
  });
}

export function useEscalateReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reportId, notes }: { reportId: string; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("content_reports")
        .update({
          status: "under_review",
          priority_level: "critical",
          resolution_notes: notes || "Escalado para revisão de admin master",
        })
        .eq("id", reportId);

      if (error) throw error;

      // Create admin notification
      await supabase.from("admin_notifications").insert({
        type: "escalated_report",
        title: "Denúncia escalada",
        body: "Uma denúncia de story foi escalada para revisão urgente.",
        data: { report_id: reportId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-reports"] });
      toast({
        title: "Denúncia escalada",
        description: "A denúncia foi enviada para revisão de um admin master.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível escalar a denúncia.",
        variant: "destructive",
      });
    },
  });
}
