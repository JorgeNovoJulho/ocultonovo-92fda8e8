import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export type NoteCategory = "idea" | "project" | "personal" | "other";

export interface UserNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  color_tag: string;
  pinned: boolean;
  category: NoteCategory;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useUserNotes() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["user-notes", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oculto_user_notes")
        .select("*")
        .eq("user_id", user!.id)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as UserNote[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: Partial<UserNote>) => {
      if (!user) throw new Error("Faça login para criar notas");
      const { data, error } = await (supabase as any)
        .from("oculto_user_notes")
        .insert({
          user_id: user.id,
          title: input.title ?? "",
          content: input.content ?? "",
          color_tag: input.color_tag ?? "default",
          pinned: input.pinned ?? false,
          category: input.category ?? "other",
          reminder_at: input.reminder_at ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as UserNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-notes", user?.id] }),
    onError: (e: any) => toast({ title: "Erro ao criar nota", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<UserNote> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("oculto_user_notes")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user!.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as UserNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-notes", user?.id] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("oculto_user_notes")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-notes", user?.id] }),
  });

  return { ...query, create, update, remove };
}
