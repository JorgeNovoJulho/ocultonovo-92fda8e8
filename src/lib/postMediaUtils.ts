/**
 * Defensive helpers for rendering feed posts of ANY media type
 * (text / image / gif / video / link / poll) without breaking the UI.
 *
 * Centraliza:
 *  - Resolução tolerante da URL principal (media_url ?? media_urls[0] ?? preview_url ?? video_master_url)
 *  - Fallback de duração entre `media_duration_seconds` (novo) e `video_duration_seconds` (legado)
 *  - Detecção do tipo de mídia ("video" | "gif" | "image" | "link" | "text" | "poll" | "unknown")
 *  - Log padronizado de falhas de render (`[Feed][media-error] …`) para identificar
 *    rapidamente qual post/usuário causou o problema.
 */

import { isGifUrl, isImageUrl, isVideoUrl } from "@/lib/mediaType";

export type PostKind = "video" | "gif" | "image" | "link" | "text" | "poll" | "unknown";

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;

/** Procura uma URL "viável" em vários campos para não quebrar posts antigos. */
export function resolvePostMediaUrl(post: any): string | null {
  if (!post) return null;
  const urls = Array.isArray(post.media_urls) ? post.media_urls.filter(Boolean) : [];
  return (
    post.media_url ||
    urls[0] ||
    post.video_master_url ||
    post.video_preview_url ||
    post.preview_url ||
    null
  );
}

/** Fallback de duração — aceita o campo novo OU o legado. */
export function getPostDurationSeconds(post: any): number {
  if (!post) return 0;
  const v = Number(
    post.media_duration_seconds ?? post.video_duration_seconds ?? 0,
  );
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Detecta se há link clicável no texto (post de "link" puro). */
export function extractFirstLink(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  return m ? m[0] : null;
}

/** Classifica o post para escolher o renderer correto. */
export function classifyPost(post: any): PostKind {
  if (!post) return "unknown";
  if (post.post_type === "poll") return "poll";

  const url = resolvePostMediaUrl(post);
  const declared = (post.media_type || "").toLowerCase();

  if (declared === "video" || isVideoUrl(url)) return "video";
  if (isGifUrl(url)) return "gif";
  if (declared === "image" || isImageUrl(url)) return "image";

  // Sem mídia: pode ser link ou texto puro
  if (!url) {
    if (extractFirstLink(post.content_text)) return "link";
    if (post.content_text && String(post.content_text).trim()) return "text";
    return "unknown";
  }

  // Tem URL mas extensão desconhecida — tratamos como imagem por padrão (com onError).
  return "image";
}

/** Log padronizado — facilita encontrar o post problemático no console. */
export function logMediaError(
  scope: string,
  post: any,
  err?: unknown,
): void {
  try {
    // eslint-disable-next-line no-console
    console.error(`[Feed][media-error][${scope}]`, {
      postId: post?.id,
      authorId: post?.author_id,
      creatorId: post?.creator_id,
      username: post?.author?.username,
      mediaType: post?.media_type,
      url: resolvePostMediaUrl(post),
      duration: getPostDurationSeconds(post),
      error: err instanceof Error ? err.message : err,
    });
  } catch {
    /* swallow — logger não pode quebrar render */
  }
}
