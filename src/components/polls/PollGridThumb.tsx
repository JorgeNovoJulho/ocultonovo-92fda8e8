import { BarChart3 } from 'lucide-react';
import { usePollByPostId } from '@/hooks/usePolls';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useCallback } from 'react';

interface PollGridThumbProps {
  postId: string;
  className?: string;
}

/**
 * Pré-carrega os dados da enquete (cache do React Query).
 * Usado no hover/click para reduzir latência ao abrir o modal.
 */
function usePrefetchPoll(postId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.prefetchQuery({
      queryKey: ['poll', postId],
      queryFn: async () => {
        const { data } = await supabase
          .from('polls')
          .select('*, options:poll_options(*)')
          .eq('post_id', postId)
          .single();
        if (!data) return null;
        return {
          ...data,
          options: (data.options || []).sort(
            (a: any, b: any) => a.option_order - b.option_order
          ),
        };
      },
      staleTime: 1000 * 30,
    });
  }, [qc, postId]);
}

/**
 * Thumb usado no grid de posts (3 colunas) para representar uma enquete.
 * - Sem imagens: card textual com pergunta.
 * - Com 1, 2, 3 ou 4 imagens: colagem alinhada e dividida proporcionalmente.
 * - Faz prefetch automático ao passar o mouse.
 */
export function PollGridThumb({ postId, className }: PollGridThumbProps) {
  const { data: poll, isLoading } = usePollByPostId(postId);
  const prefetch = usePrefetchPoll(postId);

  if (isLoading) {
    return (
      <div
        className={cn(
          'w-full h-full bg-muted animate-pulse flex items-center justify-center',
          className
        )}
        onMouseEnter={prefetch}
      >
        <BarChart3 className="h-6 w-6 text-muted-foreground/40" />
      </div>
    );
  }

  const optionImages = (poll?.options || [])
    .map((o) => o.image_url)
    .filter(Boolean) as string[];

  const question = poll?.question || 'Enquete';

  // Sem imagens — card textual
  if (optionImages.length === 0) {
    return (
      <div
        onMouseEnter={prefetch}
        className={cn(
          'relative w-full h-full bg-gradient-to-br from-primary/15 via-background to-purple-500/10 flex flex-col items-center justify-center p-2 text-center',
          className
        )}
      >
        <BarChart3 className="h-7 w-7 text-primary mb-1.5" />
        <p className="text-[11px] font-semibold text-foreground line-clamp-3 leading-snug">
          {question}
        </p>
        <span className="absolute top-1.5 left-1.5 text-[9px] uppercase tracking-wider font-bold text-primary bg-background/80 px-1.5 py-0.5 rounded">
          Enquete
        </span>
      </div>
    );
  }

  // Com imagens — colagem 1, 2, 3 ou 4 fatias
  const slots = optionImages.slice(0, 4);
  const count = slots.length;

  return (
    <div
      className={cn('relative w-full h-full bg-background', className)}
      onMouseEnter={prefetch}
    >
      {count === 1 && (
        <div className="absolute inset-0">
          <img src={slots[0]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        </div>
      )}

      {count === 2 && (
        <div className="absolute inset-0 grid grid-cols-2 gap-px">
          {slots.map((url, i) => (
            <div key={i} className="relative overflow-hidden bg-muted">
              <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {count === 3 && (
        <div className="absolute inset-0 grid grid-cols-2 gap-px">
          <div className="relative overflow-hidden bg-muted">
            <img src={slots[0]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          </div>
          <div className="grid grid-rows-2 gap-px">
            <div className="relative overflow-hidden bg-muted">
              <img src={slots[1]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </div>
            <div className="relative overflow-hidden bg-muted">
              <img src={slots[2]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      )}

      {count === 4 && (
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
          {slots.map((url, i) => (
            <div key={i} className="relative overflow-hidden bg-muted">
              <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Overlay com pergunta */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/60 to-transparent p-1.5 pointer-events-none">
        <p className="text-[10px] font-semibold text-foreground line-clamp-2 leading-tight">
          {question}
        </p>
      </div>
      <span className="absolute top-1.5 left-1.5 flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-primary-foreground bg-primary/90 px-1.5 py-0.5 rounded">
        <BarChart3 className="h-2.5 w-2.5" /> Enquete
      </span>
    </div>
  );
}
