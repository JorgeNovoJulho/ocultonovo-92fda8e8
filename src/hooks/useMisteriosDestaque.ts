import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { logger } from '@/lib/logger';

const CACHE_KEY = "oculto:misterios-destaque:v1";
const FIVE_MIN = 5 * 60 * 1000;

function readCache(key: string | number): any[] | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(`${CACHE_KEY}:${key}`) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return null;
    if (Date.now() - (parsed.savedAt || 0) > 24 * 60 * 60 * 1000) return null;
    return parsed.data;
  } catch { return null; }
}

function writeCache(key: string | number, data: any[]) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `${CACHE_KEY}:${key}`,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch { /* quota / private mode */ }
}

export interface MisterioPost {
  id: string;
  author_id: string | null;
  creator_id?: string | null;
  user_id: string | null;
  media_url: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  preview_url: string | null;
  content_text: string | null;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  created_at: string;
  is_paid?: boolean;
  preview_blur?: string | null;
  is_adult?: boolean | null;
  author?: {
    id: string;
    user_id: string | null;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
}

const FEED_VIEW_SELECTS = [
  "id, author_id, creator_id, content_text, media_url, media_urls, media_type, thumbnail_url, preview_url, preview_blur, privacy_level, is_locked, is_paid, paid_price, is_hidden, is_adult, likes_count, comments_count, saves_count, created_at, is_flash, post_type",
  "id, author_id, creator_id, content_text, media_url, media_urls, media_type, thumbnail_url, preview_url, preview_blur, privacy_level, is_locked, is_paid, paid_price, is_hidden, likes_count, comments_count, saves_count, created_at, is_flash, post_type",
  "id, author_id, creator_id, content_text, media_url, media_urls, media_type, thumbnail_url, preview_url, preview_blur, privacy_level, is_locked, is_paid, paid_price, is_adult, likes_count, comments_count, saves_count, created_at, is_flash, post_type",
  "id, author_id, creator_id, content_text, media_url, media_urls, media_type, thumbnail_url, preview_url, preview_blur, privacy_level, is_locked, is_paid, paid_price, likes_count, comments_count, saves_count, created_at, is_flash, post_type",
  "id, author_id, creator_id, content_text, media_url, media_type, thumbnail_url, preview_url, preview_blur, privacy_level, is_locked, is_paid, paid_price, is_adult, likes_count, comments_count, saves_count, created_at, post_type",
  "id, author_id, creator_id, content_text, media_url, media_type, thumbnail_url, preview_url, preview_blur, privacy_level, is_locked, is_paid, paid_price, likes_count, comments_count, saves_count, created_at, post_type",
  "id, author_id, creator_id, content_text, media_url, media_type, thumbnail_url, preview_url, preview_blur, privacy_level, is_paid, likes_count, comments_count, created_at",
];

const PROFILE_COLUMNS = "id, user_id, username, name, display_name, avatar_url";

function isMissingFeedColumnError(error: any) {
  const code = String(error?.code || "").toUpperCase();
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    (code === "42501" && (message.includes("v_feed_posts") || message.includes("permission denied"))) ||
    (message.includes("column") && (message.includes("v_feed_posts") || message.includes("posts"))) ||
    message.includes("schema cache")
  );
}

async function fetchPostsSince(sinceIso: string | null, limit: number): Promise<any[]> {
  const engagementOr = "likes_count.gt.0,comments_count.gt.0,saves_count.gt.0";
  for (const source of ["v_feed_posts", "posts"] as const) {
  for (const cols of FEED_VIEW_SELECTS) {
    const hasSaves = cols.includes("saves_count");
    const hasHidden = cols.includes("is_hidden");
    let q: any = (supabase as any)
      .from(source)
      .select(cols)
      .or(hasSaves ? engagementOr : "likes_count.gt.0,comments_count.gt.0")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (hasHidden) q = q.eq("is_hidden", false);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q;
    if (!error) return (data || []) as any[];
    if (!isMissingFeedColumnError(error)) return [];
  }
  }
  return [];
}

export type MisteriosWindow = "24h" | "7d" | "30d" | "1y" | "all";

const WINDOW_TO_DAYS: Record<MisteriosWindow, number | null> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "1y": 365,
  all: null,
};

function resolveMediaUrl(p: any): string | null {
  if (!p) return null;
  if (p.media_url) return p.media_url;
  if (Array.isArray(p.media_urls) && p.media_urls.length > 0) return p.media_urls[0];
  if (p.is_paid && p.preview_url) return p.preview_url;
  if (p.thumbnail_url) return p.thumbnail_url;
  if (p.preview_url) return p.preview_url;
  return null;
}

export function useMisteriosDestaque(limit = 12, windowKey: MisteriosWindow = "all") {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["misterios-destaque", limit, windowKey],
    staleTime: FIVE_MIN,
    gcTime: 30 * 60 * 1000,
    refetchInterval: FIVE_MIN,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    placeholderData: () => {
      const cached = readCache(`${limit}:${windowKey}`);
      return cached as any;
    },
    queryFn: async () => {
      const now = Date.now();
      const days = WINDOW_TO_DAYS[windowKey];
      const since = days ? new Date(now - days * 24 * 60 * 60 * 1000).toISOString() : null;
      const raw = await fetchPostsSince(since, 200);

      const posts = raw
        .map((p) => {
          const resolved = resolveMediaUrl(p);
          return resolved ? { ...p, media_url: resolved } : null;
        })
        .filter(Boolean)
        .filter(
          (p: any) =>
            p.is_hidden !== true &&
            (p.post_type == null || p.post_type === "feed" || p.post_type === "standard" || p.post_type === "poll" || p.post_type === "voice_bio") &&
            ((p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0)) >= 1,
        );

      if (typeof window !== "undefined" && (window as any).__DEBUG_MISTERIOS__) {
        // eslint-disable-next-line no-console
        logger.log("[MisteriosEmDestaque]", {
          windowKey,
          rawCount: raw.length,
          eligibleCount: posts.length,
          sample: raw.slice(0, 3),
        });
      }


      // Score: likes*1 + comments*2 + saves*3 (salvar é o sinal mais forte)
      const scored = (posts as any[])
        .map((p) => ({
          ...p,
          _score:
            (p.likes_count || 0) * 1 +
            (p.comments_count || 0) * 2 +
            (p.saves_count || 0) * 3,
        }))
        .sort((a, b) => b._score - a._score)
        .slice(0, limit);

      // Resolve autores
      const authorIds = Array.from(new Set(scored.map((p) => p.author_id).filter(Boolean)));
      const creatorIds = Array.from(new Set(scored.map((p) => p.creator_id).filter(Boolean)));
      const lookupIds = Array.from(new Set([...authorIds, ...creatorIds]));
      const profilesByKey = new Map<string, any>();

      if (lookupIds.length) {
        const [{ data: profsById }, { data: profsByUserId }] = await Promise.all([
          (supabase as any).from("profiles").select(PROFILE_COLUMNS).in("id", lookupIds),
          (supabase as any).from("profiles").select(PROFILE_COLUMNS).in("user_id", lookupIds),
        ]);

        const indexProfile = (pr: any) => {
          if (!pr) return;
          if (pr.id) profilesByKey.set(pr.id, pr);
          if (pr.user_id) profilesByKey.set(pr.user_id, pr);
        };

        for (const pr of (profsById || []) as any[]) indexProfile(pr);
        for (const pr of (profsByUserId || []) as any[]) indexProfile(pr);
      }

      const result = scored.map((p) => {
        const authorKey = p.author_id || p.creator_id || null;
        const pr = authorKey ? profilesByKey.get(authorKey) : null;
        return {
          ...p,
          user_id: pr?.user_id || p.creator_id || p.author_id || null,
          author: pr
            ? {
                id: pr.id,
                user_id: pr.user_id,
                username: pr.username,
                name: pr.display_name || pr.name || pr.username || "Usuário",
                avatar_url: pr.avatar_url,
              }
            : null,
        } as MisterioPost;
      });

      writeCache(`${limit}:${windowKey}`, result);
      return result;
    },
  });

  // Realtime: qualquer INSERT/UPDATE/DELETE em `posts` invalida a sessão.
  // Debounce de 1.5s para não martelar com bursts de likes/comentários.
  // Em DELETE também removemos imediatamente o item do cache (query + localStorage)
  // para o card sumir na hora, mesmo antes do refetch chegar.
  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["misterios-destaque"] });
      }, 1500);
    };

    const removeIdEverywhere = (id: string | null | undefined) => {
      if (!id) return;
      qc.setQueriesData({ queryKey: ["misterios-destaque"] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((p: any) => p?.id !== id);
      });
      try {
        if (typeof window === "undefined") return;
        const prefix = `${CACHE_KEY}:`;
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (!k || !k.startsWith(prefix)) continue;
          try {
            const raw = window.localStorage.getItem(k);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.data)) {
              parsed.data = parsed.data.filter((p: any) => p?.id !== id);
              window.localStorage.setItem(k, JSON.stringify(parsed));
            }
          } catch { /* noop */ }
        }
      } catch { /* noop */ }
    };

    const onPostsChange = (payload: any) => {
      const evt = payload?.eventType;
      if (evt === "DELETE") {
        removeIdEverywhere(payload?.old?.id);
      } else if (evt === "UPDATE" && payload?.new?.is_hidden === true) {
        removeIdEverywhere(payload?.new?.id);
      }
      schedule();
    };

    const unsubs = [
      subscribeTable("posts", onPostsChange),
      subscribeTable("post_likes", schedule),
      subscribeTable("post_comments", schedule),
      subscribeTable("saved_posts", schedule),
    ];

    return () => {
      if (timer) window.clearTimeout(timer);
      unsubs.forEach((u) => { try { u(); } catch { /* noop */ } });
    };
  }, [qc]);

  return query;
}

