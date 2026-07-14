/**
 * specialPostTile — enriquece posts especiais (community_topic / voice_bio /
 * audio / link / texto) para renderizar cards do PinterestMasonry com capa +
 * overlay útil, em vez dos quadrados cinzas vazios.
 *
 * Usado tanto na aba "Posts" quanto em "Curtidos" do perfil.
 */
import { useEffect, useState } from "react";
import { Users2, Mic, Play, Link as LinkIcon, FileText, Headphones } from "lucide-react";
import { parseCommunityTopicSnapshot } from "./CommunityTopicFeedCard";
import { fetchLinkPreview, type LinkPreviewData } from "@/components/LinkPreviewCard";

/** Cache cross-mount: a primeira resolução fica persistida em memória da aba. */
const linkPreviewMemo = new Map<string, LinkPreviewData | null>();

function proxify(image: string | null | undefined): string | null {
  if (!image) return null;
  if (image.startsWith("/")) return image;
  if (typeof window !== "undefined" && image.startsWith(window.location.origin)) return image;
  return `/api/link-cover-image?url=${encodeURIComponent(image)}`;
}

/** Hook leve: devolve a capa OG do link, ou null enquanto resolve. Cache permanente em memória. */
function useLinkCover(url: string | null | undefined): { image: string | null; title: string | null } {
  const cached = url ? linkPreviewMemo.get(url) : undefined;
  const [data, setData] = useState<LinkPreviewData | null>(cached ?? null);
  useEffect(() => {
    if (!url) return;
    if (linkPreviewMemo.has(url)) { setData(linkPreviewMemo.get(url) ?? null); return; }
    let cancelled = false;
    fetchLinkPreview(url).then((p) => {
      linkPreviewMemo.set(url, p);
      if (!cancelled) setData(p);
    }).catch(() => { linkPreviewMemo.set(url, null); });
    return () => { cancelled = true; };
  }, [url]);
  return { image: proxify(data?.image || null), title: data?.title || null };
}

export type SpecialKind =
  | "community_topic"
  | "voice_bio"
  | "audio"
  | "link"
  | "text";

export interface EnrichedSpecialPost {
  id: string;
  __special?: SpecialKind;
  __snapshot?: ReturnType<typeof parseCommunityTopicSnapshot> | null;
  __audioUrl?: string | null;
  __audioDuration?: number | null;
  __linkUrl?: string | null;
  __linkHost?: string | null;
  __textPreview?: string | null;
  [key: string]: any;
}

const URL_REGEX = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/i;

function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = String(text).match(URL_REGEX);
  if (!m) return null;
  const raw = m[1];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function safeHost(u: string | null): string | null {
  if (!u) return null;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
}

function cleanTextPreview(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = String(text)
    .replace(/^__COMMUNITY_TOPIC__[\s\S]*?__END__\s*/i, "")
    .replace(URL_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length ? t.slice(0, 220) : null;
}

/**
 * Mapeia posts crus em items aceitos pelo PinterestMasonry, garantindo
 * thumbnail/overlay útil para CADA tipo de post — eliminando o card cinza.
 */
export function enrichPostsForGrid(posts: any[]): EnrichedSpecialPost[] {
  if (!Array.isArray(posts)) return [];
  return posts.map((p): EnrichedSpecialPost => {
    const hasVisualMedia =
      !!(p?.thumbnail_url || p?.preview_url) ||
      (!!p?.media_url && !["audio"].includes(String(p?.media_type || "")));

    // 1) Bio de áudio (voice_bio)
    if (p?.post_type === "voice_bio") {
      return {
        ...p,
        media_url: null, thumbnail_url: null, preview_url: null,
        media_type: "audio",
        __special: "voice_bio",
        __audioUrl: p?.media_url ?? null,
        __audioDuration: p?.media_duration_seconds ?? p?.video_duration_seconds ?? null,
      };
    }

    // 2) Áudio genérico (não voice_bio)
    if (p?.media_type === "audio" || p?.post_type === "audio") {
      return {
        ...p,
        media_url: null, thumbnail_url: null, preview_url: null,
        media_type: "audio",
        __special: "audio",
        __audioUrl: p?.media_url ?? null,
        __audioDuration: p?.media_duration_seconds ?? p?.video_duration_seconds ?? null,
        __textPreview: cleanTextPreview(p?.content_text),
      };
    }

    // 3) Tópico de comunidade
    const snap = parseCommunityTopicSnapshot(p?.content_text);
    if (snap) {
      const cover = snap.community_cover_url || snap.community_avatar_url || null;
      return {
        ...p,
        thumbnail_url: cover,
        preview_url: cover,
        media_url: cover || p?.media_url || null,
        media_type: "image",
        __special: "community_topic",
        __snapshot: snap,
      };
    }

    // 4) Sem mídia visual: detectar LINK ou TEXTO
    if (!hasVisualMedia) {
      const url = extractFirstUrl(p?.content_text);
      if (url) {
        return {
          ...p,
          __special: "link",
          __linkUrl: url,
          __linkHost: safeHost(url),
          __textPreview: cleanTextPreview(p?.content_text),
        };
      }
      const preview = cleanTextPreview(p?.content_text);
      if (preview) {
        return { ...p, __special: "text", __textPreview: preview };
      }
    }

    return p;
  });
}

/**
 * Overlay renderizado pelo PinterestMasonry sobre cada tile especial.
 * Sempre preenche o card com algo legível, nunca cinza vazio.
 */
export function SpecialPostOverlay({ item }: { item: EnrichedSpecialPost }) {
  if (item?.__special === "community_topic") {
    const snap = item.__snapshot;
    if (!snap) return null;
    const accent = snap.accent_color || "#a855f7";
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] rounded-b-lg p-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent">
        <div
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide mb-1"
          style={{ background: `${accent}cc`, color: "white" }}
        >
          <Users2 className="h-2.5 w-2.5" /> Tópico
        </div>
        <div className="text-[11px] sm:text-xs font-semibold text-white leading-tight line-clamp-2">
          {snap.topic_title}
        </div>
      </div>
    );
  }

  if (item?.__special === "voice_bio") {
    const dur = item.__audioDuration;
    return (
      <div className="pointer-events-none absolute inset-0 z-[1] rounded-lg flex flex-col items-center justify-center bg-gradient-to-br from-fuchsia-600/30 via-purple-700/30 to-indigo-800/30 min-h-[140px]">
        <div className="h-12 w-12 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
          <Play className="h-6 w-6 text-purple-700 fill-purple-700 ml-0.5" />
        </div>
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-black/55 px-2 py-0.5 rounded-full">
          <Mic className="h-3 w-3" /> Bio em áudio{dur ? ` · ${Math.round(dur)}s` : ""}
        </div>
      </div>
    );
  }

  if (item?.__special === "audio") {
    const dur = item.__audioDuration;
    return (
      <div className="pointer-events-none absolute inset-0 z-[1] rounded-lg flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-indigo-600/70 via-purple-700/70 to-fuchsia-600/70 min-h-[140px]">
        <div className="h-12 w-12 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
          <Headphones className="h-6 w-6 text-indigo-700" />
        </div>
        {item.__textPreview && (
          <div className="mt-2 text-[11px] font-medium text-white/95 line-clamp-3 leading-snug">
            {item.__textPreview}
          </div>
        )}
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-black/55 px-2 py-0.5 rounded-full">
          <Play className="h-3 w-3 fill-white" /> Áudio{dur ? ` · ${Math.round(dur)}s` : ""}
        </div>
      </div>
    );
  }

  if (item?.__special === "link") {
    return <LinkSpecialOverlay item={item} />;
  }


  if (item?.__special === "text") {
    return (
      <div className="pointer-events-none absolute inset-0 z-[1] rounded-lg flex flex-col p-3 bg-gradient-to-br from-rose-500/70 via-pink-600/70 to-fuchsia-600/70 min-h-[140px]">
        <div className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-white/95 text-rose-700">
          <FileText className="h-2.5 w-2.5" /> Texto
        </div>
        <div className="mt-2 text-[12px] font-semibold text-white leading-snug line-clamp-6">
          {item.__textPreview}
        </div>
      </div>
    );
  }

  return null;
}

function LinkSpecialOverlay({ item }: { item: EnrichedSpecialPost }) {
  const { image, title } = useLinkCover(item.__linkUrl);
  const headline = title || item.__textPreview || item.__linkHost || "Abrir link";
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] rounded-lg overflow-hidden">
      {image ? (
        <img
          src={image}
          alt={headline}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-sky-600/80 via-cyan-600/70 to-emerald-600/70" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
      <div className="absolute inset-0 flex flex-col p-3 min-h-[140px]">
        <div className="inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-white/95 text-sky-700">
          <LinkIcon className="h-2.5 w-2.5" /> Link
        </div>
        <div className="mt-auto">
          <div className="text-[11px] sm:text-xs font-semibold text-white leading-tight line-clamp-3 drop-shadow">
            {headline}
          </div>
          <div className="mt-1 text-[10px] font-semibold text-white/90 truncate">
            🔗 {item.__linkHost || item.__linkUrl}
          </div>
        </div>
      </div>
    </div>
  );
}

