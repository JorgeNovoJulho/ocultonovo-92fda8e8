/**
 * OcultoPlaySkeleton — placeholder leve durante o load do feed.
 * Sem shimmer pesado para preservar performance mobile.
 */
export function OcultoPlaySkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border/40 bg-muted/20 aspect-[9/14] sm:aspect-video animate-pulse"
        />
      ))}
    </div>
  );
}
