import { forwardRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadProgress } from '@/lib/smartUpload';

interface UploadProgressOverlayProps {
  progress: UploadProgress | null;
  className?: string;
}

/**
 * Shows blurry placeholder + real progress bar during uploads.
 * Lightweight, no heavy animations for C55 compat.
 * forwardRef: necessário para uso dentro de modais Radix (CreatePostModal).
 */
export const UploadProgressOverlay = forwardRef<HTMLDivElement, UploadProgressOverlayProps>(
  function UploadProgressOverlay({ progress, className }, ref) {
    if (!progress) return null;

    const isDone = progress.phase === 'done';
    const isError = progress.phase === 'error';

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-lg overflow-hidden bg-muted/50',
          className
        )}
      >
        {/* Blurry placeholder background */}
        {progress.blurPreview && (
          <img loading="lazy" decoding="async"
            src={progress.blurPreview}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: 'blur(20px)' }}
            aria-hidden
          />
        )}

        {/* Overlay */}
        <div className="relative z-10 flex flex-col items-center justify-center p-4 gap-2 min-h-[120px] bg-black/40">
          {isDone ? (
            <CheckCircle className="h-8 w-8 text-green-400" />
          ) : isError ? (
            <AlertCircle className="h-8 w-8 text-destructive" />
          ) : (
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          )}

          <p className="text-sm text-white font-medium text-center">
            {progress.message}
          </p>

          {!isDone && !isError && (
            <Progress
              value={progress.percent}
              className="w-full max-w-[200px] h-2 bg-white/20"
            />
          )}
        </div>
      </div>
    );
  }
);
