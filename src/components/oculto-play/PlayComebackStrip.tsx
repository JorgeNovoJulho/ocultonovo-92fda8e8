/**
 * PlayComebackStrip — widget "Volte para Ver" exibido no topo do feed PLAY
 * quando o usuário tem itens vistos parcialmente. Só renderiza se houver dados.
 */
import { useOcultoPlayComeback } from '@/hooks/useOcultoPlayContent';
import { History, Play } from 'lucide-react';

export function PlayComebackStrip({ onPick }: { onPick?: (itemId: string) => void }) {
  const { data, isLoading } = useOcultoPlayComeback(12);

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-fuchsia-300" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fuchsia-200">
          Volte para ver
        </h3>
        <span className="text-[10px] text-muted-foreground">— continue de onde parou</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.map((it: any) => {
          const pct =
            it.duration_sec && it.duration_sec > 0
              ? Math.min(100, Math.round((it.watched_seconds / it.duration_sec) * 100))
              : 0;
          return (
            <button
              key={it.id}
              onClick={() => onPick?.(it.id)}
              className="relative group flex-shrink-0 w-28 aspect-[3/4] rounded-lg overflow-hidden bg-card border border-border/40"
              title={it.title ?? 'Voltar'}
            >
              {it.thumb_url || it.media_url ? (
                <img
                  src={it.thumb_url || it.media_url}
                  loading="lazy"
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                  <Play className="h-6 w-6" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                <div className="h-1 rounded-full bg-white/20 overflow-hidden">
                  <div className="h-full bg-fuchsia-400" style={{ width: `${pct}%` }} />
                </div>
                {it.title && (
                  <p className="text-[10px] text-white/90 mt-1 line-clamp-1 text-left">{it.title}</p>
                )}
              </div>
              <div className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-black/60 text-white">
                <Play className="h-3 w-3 fill-white" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
