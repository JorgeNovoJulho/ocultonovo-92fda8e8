/**
 * useSubscribedVipPosts
 *
 * Busca os posts VIP/pagos/narrativos diretamente da tabela `posts` para os
 * criadores que o usuário assina. Necessário porque a view `v_feed_posts`
 * (fonte padrão do feed) oculta conteúdo VIP de não-donos.
 *
 * Implementação com `useInfiniteQuery` (cursor por `created_at`) para garantir
 * que ao buscar posts mais antigos a aba "Meu Conteúdo VIP" continue
 * sincronizada com o canal VIP do criador.
 */
import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";

const POST_COLUMNS =
  "id, author_id, creator_id, title, subtitle, teaser, content_text, media_url, media_urls, preview_url, privacy_level, is_paid, paid_price, is_hidden, is_flash, is_pinned, pinned_at, likes_count, dislikes_count, comments_count, saves_count, created_at, updated_at, post_type, media_type, thumbnail_url, section_type, content_format, series_id, series_title, chapter_number, read_time_minutes, narrative_status, is_adult";

const POST_COLUMNS_NO_ADULT =
  "id, author_id, creator_id, title, subtitle, teaser, content_text, media_url, media_urls, preview_url, privacy_level, is_paid, paid_price, is_hidden, is_flash, is_pinned, pinned_at, likes_count, dislikes_count, comments_count, saves_count, created_at, updated_at, post_type, media_type, thumbnail_url, section_type, content_format, series_id, series_title, chapter_number, read_time_minutes, narrative_status";

const PROFILE_COLUMNS =
  "id, user_id, username, display_name, name, avatar_url, is_verified, is_creator, plan_type, gender, profile_type";

const NARRATIVE_SECTIONS = new Set([
  "story",
  "chapter",
  "diary",
  "article",
  "series",
  "text_post",
  "backstage",
  "narrative",
]);

const PAGE_SIZE = 24;

function isMissingPostColumnError(error: any) {
  const code = String(error?.code || "").toUpperCase();
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("column") && message.includes("posts")) ||
    message.includes("schema cache")
  );
}

type PageResult = {
  rows: any[];
  nextCursor: string | null;
};

export function useSubscribedVipPosts(opts: {
  subscribedUserIds: string[];
  subscribedProfileIds?: string[];
  explicitPostIds?: string[];
  enabled?: boolean;
}) {
  const {
    subscribedUserIds,
    subscribedProfileIds = [],
    explicitPostIds = [],
    enabled = true,
  } = opts;
  const queryClient = useQueryClient();

  const ids = useMemo(
    () =>
      Array.from(
        new Set(
          [...(subscribedUserIds || []), ...(subscribedProfileIds || [])].filter(Boolean)
        )
      ),
    [subscribedUserIds, subscribedProfileIds]
  );
  const postIds = useMemo(
    () => Array.from(new Set((explicitPostIds || []).filter(Boolean))),
    [explicitPostIds]
  );

  const idsKey = ids.slice().sort().join(",");
  const postIdsKey = postIds.slice().sort().join(",");

  // Realtime: invalida ao detectar novo post de qualquer criador assinado.
  useEffect(() => {
    if (!enabled || (ids.length === 0 && postIds.length === 0)) return;
    const unsub = subscribeTable('posts', (payload: any) => {
      const row = payload.new || payload.old || {};
      const owner = row.author_id || null;
      if ((owner && ids.includes(owner)) || (row?.id && postIds.includes(row.id))) {
        queryClient.invalidateQueries({ queryKey: ["subscribed-vip-posts"] });
      }
    });
    return () => { unsub(); };
  }, [enabled, idsKey, postIdsKey, ids, postIds, queryClient]);


  const query = useInfiniteQuery({
    queryKey: ["subscribed-vip-posts", idsKey, postIdsKey],
    enabled: enabled && (ids.length > 0 || postIds.length > 0),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    initialPageParam: null as string | null,
    getNextPageParam: (last: PageResult) => last.nextCursor,
    queryFn: async ({ pageParam }): Promise<PageResult> => {
      const cursor = pageParam as string | null;
      const targetIds = Array.from(new Set(ids.filter(Boolean)));
      const targetPostIds = Array.from(new Set(postIds.filter(Boolean)));
      if (targetIds.length === 0 && targetPostIds.length === 0) {
        return { rows: [], nextCursor: null };
      }

      const fetchWithColumns = async (columns: string) => {
      const buildBase = () => {
        let q = (supabase as any)
          .from("posts")
          .select(columns)
          .in("author_id", targetIds)
          .not("is_hidden", "is", true)
          .not("post_type", "in", "(voice_bio,audio_bio)")
          .not("media_type", "eq", "audio")
          .or("is_flash.eq.false,is_flash.is.null")
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);
        if (cursor) q = q.lt("created_at", cursor);
        return q;
      };

      const vipQuery = targetIds.length
        ? buildBase().in("privacy_level", ["vip", "subscribers"])
        : Promise.resolve({ data: [], error: null } as any);

      const paidQuery = targetIds.length
        ? buildBase().eq("is_paid", true)
        : Promise.resolve({ data: [], error: null } as any);

      const narrativeQuery = targetIds.length
        ? buildBase().eq("content_format", "narrative")
        : Promise.resolve({ data: [], error: null } as any);

      // Explicit posts (compras avulsas) só na primeira página — não paginamos.
      const explicitPostsQuery =
        !cursor && targetPostIds.length
          ? (supabase as any)
              .from("posts")
              .select(columns)
              .in("id", targetPostIds)
              .not("is_hidden", "is", true)
              .order("created_at", { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [], error: null } as any);

      const [
        { data: vipRows, error: vipError },
        { data: paidRows, error: paidError },
        { data: narrativeRows, error: narrativeError },
        { data: explicitRows, error: explicitError },
      ] = await Promise.all([vipQuery, paidQuery, narrativeQuery, explicitPostsQuery]);

      return { vipRows, paidRows, narrativeRows, explicitRows, error: vipError || paidError || narrativeError || explicitError };
      };

      let { vipRows, paidRows, narrativeRows, explicitRows, error } = await fetchWithColumns(POST_COLUMNS);
      if (error && isMissingPostColumnError(error)) {
        ({ vipRows, paidRows, narrativeRows, explicitRows, error } = await fetchWithColumns(POST_COLUMNS_NO_ADULT));
      }

      if (error) {
        console.warn("[useSubscribedVipPosts] fetch error:", error.message);
        return { rows: [], nextCursor: null };
      }

      const merged = Array.from(
        new Map(
          (
            [
              ...(vipRows || []),
              ...(paidRows || []),
              ...(narrativeRows || []),
              ...(explicitRows || []),
            ] as any[]
          )
            .filter((row) => {
              if (row?.post_type === "voice_bio" || row?.post_type === "audio_bio") return false;
              if (row?.media_type === "audio") return false;
              if (row?.narrative_status && row.narrative_status !== "published") return false;
              const url = row?.media_url || (Array.isArray(row?.media_urls) ? row.media_urls[0] : null);
              if (typeof url === "string" && /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url)) return false;
              return true;
            })
            .map((row) => [row.id, row])
        ).values()
      ) as any[];

      // Normaliza media_url
      for (const row of merged) {
        if (!row.media_url && Array.isArray(row.media_urls) && row.media_urls.length > 0) {
          row.media_url = row.media_urls[0];
        }
      }

      // Ordena desc por created_at — fonte de verdade entre as 3 queries.
      merged.sort((a, b) => {
        const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      // Hidrata profiles dos autores (batch)
      const lookupIds = Array.from(new Set(merged.map((p: any) => p.author_id).filter(Boolean)));
      let profMap = new Map<string, any>();
      if (lookupIds.length > 0) {
        const [byId, byUserId] = await Promise.all([
          (supabase as any).from("profiles").select(PROFILE_COLUMNS).in("id", lookupIds),
          (supabase as any).from("profiles").select(PROFILE_COLUMNS).in("user_id", lookupIds),
        ]);
        for (const p of (byId.data || []) as any[]) {
          if (p.id) profMap.set(p.id, p);
          if (p.user_id) profMap.set(p.user_id, p);
        }
        for (const p of (byUserId.data || []) as any[]) {
          if (p.id) profMap.set(p.id, p);
          if (p.user_id) profMap.set(p.user_id, p);
        }
      }

      const rows = merged.map((post: any) => {
        const prof = profMap.get(post.author_id) || null;
        const normalizedSection = String(post.section_type || "").toLowerCase();
        const isNarrative =
          post?.content_format === "narrative" || NARRATIVE_SECTIONS.has(normalizedSection);
        return {
          ...post,
          user_id: prof?.user_id || post.author_id,
          profiles: prof,
          author: prof,
          section_type: normalizedSection || post.section_type || null,
          content_format: isNarrative ? "narrative" : post.content_format,
        };
      });

      // Cursor da próxima página: timestamp do último item recorrente
      // (excluindo explicits, que só vêm na 1ª página).
      const paginatedRows = [
        ...((vipRows || []) as any[]),
        ...((paidRows || []) as any[]),
        ...((narrativeRows || []) as any[]),
      ];
      const oldest = paginatedRows.reduce<string | null>((acc, r: any) => {
        const t = r?.created_at;
        if (!t) return acc;
        if (!acc) return t;
        return new Date(t).getTime() < new Date(acc).getTime() ? t : acc;
      }, null);

      // Só há próxima página se alguma das queries retornou PAGE_SIZE itens
      // (heurística simples e segura).
      const reachedPage =
        (vipRows?.length || 0) >= PAGE_SIZE ||
        (paidRows?.length || 0) >= PAGE_SIZE ||
        (narrativeRows?.length || 0) >= PAGE_SIZE;

      return {
        rows,
        nextCursor: reachedPage ? oldest : null,
      };
    },
  });

  const flat = useMemo(() => {
    const pages = (query.data?.pages || []) as PageResult[];
    const seen = new Set<string>();
    const out: any[] = [];
    for (const page of pages) {
      for (const row of page.rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
    }
    return out;
  }, [query.data]);

  return {
    data: flat,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

export default useSubscribedVipPosts;
