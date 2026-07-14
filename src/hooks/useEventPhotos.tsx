import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

export interface EventPhoto {
  id: string;
  event_id: string;
  user_id: string;
  storage_path: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
  user?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

// Get photos for an event
export function useEventPhotos(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-photos", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      if (!eventId) return [];

      const { data: photos, error } = await (supabase as any)
        .from("event_photos")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (photos || []) as any[];
      if (list.length === 0) return [] as EventPhoto[];

      const userIds = [...new Set(list.map((p) => p.user_id).filter(Boolean))];
      const { data: users } = userIds.length
        ? await (supabase as any).from("profiles").select("id, username, avatar_url").in("id", userIds)
        : { data: [] as any[] };

      const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
      return list.map((p) => ({ ...p, user: userMap.get(p.user_id) || null })) as EventPhoto[];
    },
  });
}

// Upload event photo
export function useUploadEventPhoto() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      eventId,
      file,
      caption,
    }: {
      eventId: string;
      file: File;
      caption?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const storagePath = `${eventId}/${profile.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("event-images")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("event-images")
        .getPublicUrl(storagePath);

      // Insert record
      const { error } = await (supabase as any).from("event_photos").insert({
        event_id: eventId,
        user_id: profile.id,
        storage_path: storagePath,
        photo_url: publicUrl,
        caption: caption || null,
      });

      if (error) throw error;

      return { photo_url: publicUrl };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event-photos", variables.eventId] });
      toast({
        title: "📸 Foto adicionada!",
        description: "Sua foto foi adicionada à galeria do evento.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar foto",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Delete event photo
export function useDeleteEventPhoto() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ photoId, storagePath, eventId }: { 
      photoId: string; 
      storagePath: string;
      eventId: string;
    }) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("event-images")
        .remove([storagePath]);

      if (storageError) console.warn("Storage delete error:", storageError);

      // Delete record
      const { error } = await (supabase as any)
        .from("event_photos")
        .delete()
        .eq("id", photoId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event-photos", variables.eventId] });
      toast({
        title: "Foto removida",
        description: "A foto foi removida da galeria.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível remover a foto.",
        variant: "destructive",
      });
    },
  });
}
