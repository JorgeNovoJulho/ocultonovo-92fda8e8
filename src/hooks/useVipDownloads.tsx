import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import type { MediaItem } from "@/hooks/useMediaManager";
import { toast } from "sonner";

export interface VipDownloadRecord {
  id: string;
  amount_paid: number;
  purchased_at: string;
  post: MediaItem;
}

async function getCurrentProfileId(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.id || userId;
}

export function useVipDownloads() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["vip-downloads", user?.id],
    queryFn: async (): Promise<VipDownloadRecord[]> => {
      if (!user?.id) return [];
      const profileId = await getCurrentProfileId(user.id);
      const { data: access, error } = await (supabase as any)
        .from("media_access")
        .select("id, amount_paid, purchased_at, post_id")
        .eq("user_id", profileId)
        .order("purchased_at", { ascending: false });
      if (error) throw error;
      const list = (access || []) as any[];
      if (list.length === 0) return [];

      const postIds = [...new Set(list.map((r) => r.post_id).filter(Boolean))];
      const { data: posts } = postIds.length
        ? await (supabase as any)
            .from("posts")
            .select("id, author_id, content_text, media_url, media_type, thumbnail_url, privacy_level, is_locked, is_paid, paid_price, likes_count, comments_count, created_at, updated_at")
            .in("id", postIds)
        : { data: [] as any[] };

      const postMap = new Map<string, any>((posts || []).map((p: any) => [p.id, p]));

      return list
        .map((row: any) => ({ row, post: postMap.get(row.post_id) }))
        .filter(({ post }) => !!post?.media_url)
        .map(({ row, post }) => ({
          id: row.id,
          amount_paid: Number(row.amount_paid || post?.paid_price || 0),
          purchased_at: row.purchased_at,
          post: { ...post, user_id: post.author_id } as MediaItem,
        }));
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useUnlockVipDownload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: MediaItem) => {
      if (!user?.id) throw new Error("Você precisa estar logado.");
      if (!item.id || !item.user_id) throw new Error("Mídia inválida para liberação.");
      const profileId = await getCurrentProfileId(user.id);
      const { error } = await (supabase as any)
        .from("media_access")
        .upsert({
          user_id: profileId,
          post_id: item.id,
          seller_id: item.user_id,
          amount_paid: Number(item.paid_price || 0),
        }, { onConflict: "user_id,post_id" });
      if (error) throw error;
      return item.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vip-downloads"] });
      queryClient.invalidateQueries({ queryKey: ["media-access"] });
      queryClient.invalidateQueries({ queryKey: ["media-access-batch"] });
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao liberar download VIP"),
  });
}

export function useRemoveVipDownload() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accessId: string) => {
      if (!user?.id) throw new Error("Você precisa estar logado.");
      const { error } = await (supabase as any).from("media_access").delete().eq("id", accessId);
      if (error) throw error;
      return accessId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vip-downloads"] }),
    onError: (error: Error) => toast.error(error.message || "Erro ao remover download mock"),
  });
}
