import { useState } from "react";
import { useSavedPosts } from "@/hooks/usePosts";
import { MediaLightbox } from "@/components/MediaLightbox";
import { Bookmark, Play, Globe, Users, Flame, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SavedPage() {
  const { data: savedPosts = [], isLoading } = useSavedPosts();
  const [selectedPost, setSelectedPost] = useState<any | null>(null);

  // Map DB post to the Post interface expected by MediaLightbox
  const mapToLightboxPost = (post: any) => {
    const author = post.author || {};
    return {
      id: post.id,
      creator: {
        id: author.id || post.user_id || '',
        // Privacidade: nunca expor nome real — sempre @username.
        name: author.username ? `@${author.username}` : '@usuario',
        handle: author.username ? `@${author.username}` : '@usuario',
        avatar: author.avatar_url || '/placeholder.svg',
        banner: author.cover_url || '',
        bio: author.bio || '',
        isVerified: author.is_verified || false,
        followers: 0,
        following: 0,
        posts: 0,
        views: 0,
        recommendations: 0,
        profileType: 'individual' as const,
        gender: 'other' as const,
        location: '',
        isOnline: false,
        interests: [],
        joinDate: '',
      },
      type: post.media_type === 'video' ? 'video' : 'image',
      content: post.content || post.caption || '',
      mediaUrl: post.media_url || post.image_url || '',
      likes: post.likes_count || 0,
      comments: post.comments_count || 0,
      shares: 0,
      isLiked: false,
      createdAt: post.created_at || '',
    };
  };

  const getVisibilityBadge = (visibility?: string) => {
    switch (visibility) {
      case 'vip':
        return {
          label: "VIP",
          icon: Flame,
          className: "bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)]",
        };
      case 'friends':
        return {
          label: "Amigos",
          icon: Users,
          className: "bg-blue-500/90 text-white",
        };
      default:
        return {
          label: "Público",
          icon: Globe,
          className: "bg-muted/80 text-foreground",
        };
    }
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bookmark className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Salvos</h1>
            <p className="text-muted-foreground">
              {savedPosts.length} itens salvos
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : savedPosts.length > 0 ? (
        <div className="columns-2 md:columns-3 gap-2 space-y-2">
          {savedPosts.map((post: any, index: number) => {
            const badge = getVisibilityBadge(post.visibility);
            const BadgeIcon = badge.icon;
            const heightClass = index % 3 === 0 ? "aspect-[3/4]" : index % 3 === 1 ? "aspect-square" : "aspect-[4/3]";
            const mediaUrl = post.media_url || post.image_url;

            if (!mediaUrl) return null;

            return (
              <div
                key={post.id}
                className={cn(
                  "relative break-inside-avoid rounded-lg overflow-hidden cursor-pointer group",
                  heightClass
                )}
                onClick={() => setSelectedPost(mapToLightboxPost(post))}
              >
                <img
                  src={mediaUrl}
                  alt="Saved"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Visibility Badge */}
                <div className={cn(
                  "absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1",
                  badge.className
                )}>
                  <BadgeIcon className="h-3 w-3" />
                  {badge.label}
                </div>

                {/* Video Indicator */}
                {post.media_type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center">
                      <Play className="h-6 w-6 text-foreground fill-current ml-1" />
                    </div>
                  </div>
                )}

                {/* Saved Badge */}
                <div className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm">
                  <Bookmark className="h-4 w-4 text-primary fill-primary" />
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                  <span className="text-sm font-medium text-foreground">Ver</span>
                  {(post.author as any)?.username && (
                    <span className="text-xs text-muted-foreground">por @{(post.author as any).username}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Bookmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Nenhum item salvo
          </h3>
          <p className="text-muted-foreground max-w-sm">
            Quando você salvar posts, eles aparecerão aqui.
          </p>
        </div>
      )}

      {/* Lightbox Modal */}
      <MediaLightbox
        post={selectedPost}
        onClose={() => setSelectedPost(null)}
      />
    </div>
  );
}
