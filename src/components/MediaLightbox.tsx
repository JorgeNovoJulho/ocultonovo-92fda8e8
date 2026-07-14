import { useState, useEffect, useRef } from "react";
import { Post } from "@/data/mockData";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { X, Heart, MessageCircle, Share2, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { SocialDrmOverlay, DrmViolationScreen } from "@/components/drm";
import { useDrmProtection } from "@/hooks/useDrmProtection";
import { useSavePost } from "@/hooks/usePosts";
import { useLikePost } from "@/hooks/usePosts";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { SharePostModal } from "./SharePostModal";

interface MediaLightboxProps {
  post: Post | null;
  onClose: () => void;
}

export function MediaLightbox({ post, onClose }: MediaLightboxProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { user } = useAuth();

  const savePost = useSavePost();
  const toggleLike = useLikePost();

  // DRM Protection
  const { isViolated, resetViolation } = useDrmProtection({
    containerRef: mediaContainerRef,
    enabled: !!post,
    onViolation: () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    },
  });

  useEffect(() => {
    if (post) {
      setIsLoading(true);
      setIsLiked(post.isLiked);
    }
  }, [post]);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleLike = () => {
    if (!post) return;
    if (!user?.id) {
      toast.error("Faça login para curtir");
      return;
    }
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    toggleLike.mutate(
      { postId: post.id, isLiked: isLiked },
      {
        onError: () => {
          setIsLiked(!newLiked);
          toast.error("Erro ao curtir");
        },
      }
    );
  };

  const handleSave = () => {
    if (!post) return;
    if (!user?.id) {
      toast.error("Faça login para salvar");
      return;
    }
    const newSaved = !isSaved;
    setIsSaved(newSaved);
    savePost.mutate(
      { postId: post.id, isSaved: isSaved },
      {
        onSuccess: () => {
          toast.success(newSaved ? "Salvo!" : "Removido dos salvos");
        },
        onError: () => {
          setIsSaved(!newSaved);
          toast.error("Erro ao salvar");
        },
      }
    );
  };

  const handleShare = () => {
    if (!post) return;
    setShowShareModal(true);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm");
    } catch {
      return dateStr;
    }
  };

  if (!post) return null;

  const mediaUrl = post.mediaUrl || "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1200&h=800&fit=crop";

  return (
    <>
    <Dialog open={!!post} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-[95vw] h-[90dvh] p-0 bg-background border-border/50 overflow-hidden flex flex-col">
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-50 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Scrollable vertical layout */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* 1. MEDIA on top */}
          <div
            ref={mediaContainerRef}
            className="relative bg-black flex items-center justify-center w-full"
            style={{ minHeight: '40dvh', maxHeight: '55dvh' }}
          >
            {isViolated && <DrmViolationScreen onReset={resetViolation} />}
            {!isViolated && <SocialDrmOverlay containerRef={mediaContainerRef} isActive={!!post} />}

            {isLoading && !isViolated && (
              <div className="absolute inset-0 flex items-center justify-center">
                <img loading="lazy" decoding="async" src={mediaUrl} alt="Loading..." className="w-full h-full object-cover blur-xl scale-110 opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            )}

            {!isViolated && (
              post.type === "video" ? (
                <video preload="none"
                  ref={videoRef}
                  src={mediaUrl}
                  className={cn("w-full h-full object-contain transition-opacity duration-300", isLoading ? "opacity-0" : "opacity-100")}
                  style={{ maxHeight: '55dvh', WebkitTouchCallout: 'none' } as React.CSSProperties}
                  controls
                  playsInline
                  controlsList="nodownload nofullscreen noremoteplayback"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                  onLoadedData={handleImageLoad}
                />
              ) : (
                <img loading="lazy" decoding="async"
                  src={mediaUrl}
                  alt="Media"
                  className={cn("w-full h-full object-contain transition-opacity duration-300 pointer-events-none select-none", isLoading ? "opacity-0" : "opacity-100")}
                  style={{ maxHeight: '55dvh', WebkitTouchCallout: 'none' } as React.CSSProperties}
                  draggable={false}
                  onLoad={handleImageLoad}
                />
              )
            )}
          </div>

          {/* 2. AUTHOR */}
          <div className="p-3 border-b border-border flex items-center gap-3 bg-background">
            <img loading="lazy" decoding="async"
              src={post.creator.avatar}
              alt={post.creator.name}
              className="w-9 h-9 rounded-full object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate text-sm">{post.creator.name}</p>
              <p className="text-xs text-muted-foreground truncate">{post.creator.handle}</p>
            </div>
          </div>

          {/* 3. DESCRIPTION */}
          {post.content && (
            <div className="px-3 py-2 border-b border-border bg-background">
              <p className="text-foreground/90 leading-relaxed text-sm">{post.content}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(post.createdAt)}</p>
            </div>
          )}

          {/* 4. ACTION BUTTONS */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
            <div className="flex gap-4">
              <button onClick={handleLike} className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors active:scale-90">
                <Heart className={cn("h-5 w-5 transition-all", isLiked && "fill-primary text-primary scale-110")} />
                <span className="text-sm">{post.likes.toLocaleString()}</span>
              </button>
              <button className="text-muted-foreground hover:text-foreground transition-colors active:scale-90">
                <MessageCircle className="h-5 w-5" />
              </button>
              <button onClick={handleShare} className="text-muted-foreground hover:text-foreground transition-colors active:scale-90">
                <Share2 className="h-5 w-5" />
              </button>
            </div>
            <button onClick={handleSave} className="text-muted-foreground hover:text-foreground transition-colors active:scale-90">
              <Bookmark className={cn("h-5 w-5", isSaved && "fill-foreground")} />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <SharePostModal
      open={showShareModal}
      onOpenChange={setShowShareModal}
      postId={post.id}
      postPreview={post.content || undefined}
    />
    </>
  );
}
