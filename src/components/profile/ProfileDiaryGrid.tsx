import { lazy, Suspense, useState } from "react";
import { BookOpen, Lock, Globe, Users, Flame, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CachedImage } from "@/components/common/CachedImage";

const ChannelContentViewer = lazy(() => import("@/components/creator/ChannelContentViewer"));

interface DiaryPost {
  id: string;
  title?: string | null;
  teaser?: string | null;
  subtitle?: string | null;
  thumbnail_url?: string | null;
  cover_url?: string | null;
  media_url?: string | null;
  preview_url?: string | null;
  privacy_level?: string | null;
  is_paid?: boolean | null;
  paid_price?: number | null;
  read_time_minutes?: number | null;
  section_type?: string | null;
  content_format?: string | null;
}

interface ProfileDiaryGridProps {
  posts: DiaryPost[];
  isLoading: boolean;
}

const SECTION_LABEL: Record<string, string> = {
  diary: "Diário VIP",
  story: "História",
  chapter: "Capítulo",
  article: "Texto",
  series: "Série",
  text_post: "Bastidor",
};

function privacyBadge(level?: string | null) {
  if (level === "vip") return { icon: Flame, label: "VIP", cls: "text-amber-400 bg-amber-500/15 border-amber-500/40" };
  if (level === "friends") return { icon: Users, label: "Amigos", cls: "text-sky-300 bg-sky-500/15 border-sky-500/40" };
  return { icon: Globe, label: "Público", cls: "text-emerald-300 bg-emerald-500/15 border-emerald-500/40" };
}

export function ProfileDiaryGrid({ posts, isLoading }: ProfileDiaryGridProps) {
  const [viewerPost, setViewerPost] = useState<DiaryPost | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="py-12 text-center mt-4">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
          <BookOpen className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">
          Você ainda não publicou conteúdo no Diário VIP.
        </p>
        <p className="text-muted-foreground/70 text-xs mt-1">
          Use o canal VIP para publicar histórias, capítulos e bastidores.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {posts.map((post) => {
          const cover =
            post.thumbnail_url || (post as any).cover_url || post.preview_url || post.media_url || "";
          const priv = privacyBadge(post.privacy_level);
          const PrivIcon = priv.icon;
          const isPaid = !!post.is_paid && Number(post.paid_price || 0) > 0;
          const sectionLabel = SECTION_LABEL[post.section_type || ""] || "Narrativa";

          return (
            <button
              type="button"
              key={post.id}
              onClick={() => setViewerPost(post)}
              className="group relative aspect-[3/4] rounded-lg overflow-hidden bg-card border border-border/40 hover:border-amber-500/50 transition-colors text-left"
            >
              {cover ? (
                <CachedImage
                  src={cover}
                  alt={post.title || "Capa"}
                  wrapperClassName="absolute inset-0"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-background flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-amber-500/60" />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

              {/* Top row badges */}
              <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start justify-between gap-1">
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 bg-background/80 backdrop-blur-sm border-amber-500/40 text-amber-300 uppercase tracking-wider"
                >
                  {sectionLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 h-4 backdrop-blur-sm border ${priv.cls} flex items-center gap-0.5`}
                >
                  <PrivIcon className="h-2.5 w-2.5" />
                  {priv.label}
                </Badge>
              </div>

              {/* Paid badge */}
              {isPaid && (
                <div className="absolute top-7 left-1.5 px-1.5 py-0.5 rounded bg-[hsl(45,93%,47%)]/95 text-[10px] font-bold text-[hsl(45,93%,10%)] flex items-center gap-1 shadow">
                  <Lock className="h-2.5 w-2.5" />
                  R$ {Number(post.paid_price || 0).toFixed(2)}
                </div>
              )}

              {/* Bottom info */}
              <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1">
                <p className="text-[12px] font-semibold text-foreground line-clamp-2 leading-tight">
                  {post.title || "Sem título"}
                </p>
                {post.teaser && (
                  <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">
                    {post.teaser}
                  </p>
                )}
                {post.read_time_minutes ? (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {post.read_time_minutes} min
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {viewerPost && (
        <Suspense fallback={null}>
          <ChannelContentViewer
            open={!!viewerPost}
            onOpenChange={(o) => !o && setViewerPost(null)}
            post={viewerPost}
          />
        </Suspense>
      )}
    </>
  );
}

export default ProfileDiaryGrid;
