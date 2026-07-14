import { cn } from "@/lib/utils";
import { Play } from "lucide-react";

interface StoryReplyPreviewProps {
  storyThumbnail?: string | null;
  storyText?: string | null;
  authorName: string;
  isOwnMessage?: boolean;
}

export function StoryReplyPreview({
  storyThumbnail,
  storyText,
  authorName,
  isOwnMessage = false,
}: StoryReplyPreviewProps) {
  const isVideo = storyThumbnail?.includes('.mp4') || storyThumbnail?.includes('.webm');

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 mb-1 rounded-t-xl border-l-2 border-primary",
        isOwnMessage 
          ? "bg-primary/10" 
          : "bg-muted/30"
      )}
    >
      {/* Thumbnail do Story */}
      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
        {storyThumbnail ? (
          <>
            {isVideo ? (
              <video preload="none"
                src={storyThumbnail}
                className="w-full h-full object-cover"
                muted
              />
            ) : (
              <img loading="lazy" decoding="async"
                src={storyThumbnail}
                alt="Story"
                className="w-full h-full object-cover"
              />
            )}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-3 w-3 text-white" fill="currentColor" />
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-secondary/30">
            <span className="text-xs text-muted-foreground">📸</span>
          </div>
        )}
      </div>

      {/* Info do Story */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">
          Em resposta ao story de{" "}
          <span className="font-medium text-foreground">@{authorName}</span>
        </p>
        {storyText && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            "{storyText}"
          </p>
        )}
      </div>
    </div>
  );
}
