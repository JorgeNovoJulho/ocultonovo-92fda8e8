import { supabase } from "@/lib/supabaseExternal";
import { useFeedCacheStore } from "@/store/useFeedCacheStore";

/**
 * Pré-aquece o cache Zustand (perfis + posts iniciais do feed) para
 * que /feed renderize instantaneamente após o login.
 *
 * Falhas são silenciosas — esta é uma otimização, não um caminho crítico.
 */
export async function warmFeedCache(userId: string) {
  try {
    const { data: ownProfile } = await supabase
      .from("profiles")
      .select(
        "id, user_id, username, name, avatar_url, plan_type, is_vip, is_creator, is_verified",
      )
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .maybeSingle();
    if (ownProfile) {
      useFeedCacheStore.getState().setProfiles([ownProfile as any]);
    }

    const { data: posts } = await supabase
      .from("posts")
      .select(
        "id, author_id, creator_id, created_at, content_text, media_url, thumbnail_url, preview_url, media_type, privacy_level, is_locked, is_paid, likes_count, comments_count",
      )
      .or("is_flash.eq.false,is_flash.is.null")
      .order("created_at", { ascending: false })
      .limit(20);

    const list = (posts as any[]) || [];
    if (!list.length) return;

    const authorIds = Array.from(
      new Set(list.map((p) => p.author_id).filter(Boolean)),
    );
    let profiles: any[] = [];
    if (authorIds.length) {
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, user_id, username, name, avatar_url, plan_type, is_vip, is_creator, is_verified",
        )
        .in("id", authorIds);
      profiles = (data as any[]) || [];
    }

    const byId = new Map(profiles.map((p) => [p.id, p]));
    const enriched = list.map((p) => {
      const prof = byId.get(p.author_id);
      return prof
        ? {
            ...p,
            username: prof.username,
            name: prof.name,
            avatar_url: prof.avatar_url,
          }
        : p;
    });

    const store = useFeedCacheStore.getState();
    if (profiles.length) store.setProfiles(profiles);
    store.setPosts(enriched, userId);
  } catch {
    /* silencioso */
  }
}
