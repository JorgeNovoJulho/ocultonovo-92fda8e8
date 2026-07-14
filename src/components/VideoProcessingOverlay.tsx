import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface VideoProcessingOverlayProps {
  progress: number;
  poster?: string;
  className?: string;
}

/**
 * Shows a high-quality thumbnail with "Optimizing Quality..." indicator
 * while the server-side transcoding is running.
 */
export const VideoProcessingOverlay = memo(function VideoProcessingOverlay({
  progress,
  poster,
  className,
}: VideoProcessingOverlayProps) {
  const stage = progress < 30 ? 'Analisando...' : progress < 70 ? 'Otimizando Qualidade...' : 'Finalizando...';

  return (
    <div className={cn("relative rounded-lg overflow-hidden bg-black", className)} style={{ aspectRatio: '16/9' }}>
      {poster && (
        <img loading="lazy" decoding="async"
          src={poster}
          alt="Thumbnail do vídeo"
          className="w-full h-full object-cover"
          style={{
            filter: 'contrast(1.04) saturate(1.08)',
            imageRendering: 'crisp-edges',
          }}
        />
      )}
      
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <span className="text-sm font-medium text-white">{stage}</span>
        <div className="w-full max-w-48">
          <Progress value={progress} className="h-1.5" />
        </div>
        <span className="text-xs text-white/60">{progress}%</span>
      </div>
    </div>
  );
});
