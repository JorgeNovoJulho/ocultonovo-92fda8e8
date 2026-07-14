/**
 * PlayReactionHeatmapBar — Etapa 50
 *
 * Faixa fina sobre a borda inferior do player, mostrando "hotspots"
 * (concentração de reações) ao longo da duração do item. Clicar em
 * um hotspot busca o player para aquele momento. Reaproveita o hook
 * useOcultoPlayTimelineReactions (já carregado em outro overlay).
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useOcultoPlayTimelineReactions } from '@/hooks/useOcultoPlayTimelineReactions';

interface Props {
  itemId: string | null | undefined;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  hidden?: boolean;
}

const BUCKETS = 40; // resolução do heatmap

export function PlayReactionHeatmapBar({ itemId, mediaRef, hidden }: Props) {
  const { data } = useOcultoPlayTimelineReactions(itemId);
  const [duration, setDuration] = useState(0);

  // observa duração quando metadados carregarem
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const sync = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      setDuration(d > 0 ? d : 0);
    };
    sync();
    el.addEventListener('loadedmetadata', sync);
    el.addEventListener('durationchange', sync);
    return () => {
      el.removeEventListener('loadedmetadata', sync);
      el.removeEventListener('durationchange', sync);
    };
  }, [mediaRef, itemId]);

  const buckets = useMemo(() => {
    if (!duration || duration < 2 || data.length === 0) return [];
    const arr = new Array(BUCKETS).fill(0);
    let max = 0;
    for (const r of data) {
      const ratio = Math.min(0.999, Math.max(0, r.position_seconds / duration));
      const idx = Math.floor(ratio * BUCKETS);
      arr[idx] += r.qty;
      if (arr[idx] > max) max = arr[idx];
    }
    if (max === 0) return [];
    return arr.map(v => v / max); // normaliza 0..1
  }, [data, duration]);

  if (hidden || !itemId || buckets.length === 0) return null;

  const handleJump = (i: number) => {
    const el = mediaRef.current;
    if (!el || !duration) return;
    el.currentTime = (i / BUCKETS) * duration;
    el.play?.().catch(() => {});
  };

  return (
    <div
      data-no-gesture
      className="absolute bottom-20 inset-x-0 z-30 px-4 pointer-events-none"
    >
      <div className="max-w-3xl mx-auto pointer-events-auto">
        <div className="flex items-end gap-[2px] h-6 bg-black/40 rounded-md backdrop-blur px-1 py-1">
          {buckets.map((v, i) => (
            <button
              key={i}
              onClick={() => handleJump(i)}
              className={cn(
                'flex-1 rounded-sm transition-colors hover:bg-fuchsia-300',
                v > 0 ? 'bg-fuchsia-500/80' : 'bg-white/10',
              )}
              style={{ height: `${Math.max(8, v * 100)}%` }}
              title={
                v > 0
                  ? `Hotspot — ${Math.round(v * 100)}% de pico`
                  : 'Sem reações neste trecho'
              }
            />
          ))}
        </div>
        <div className="text-[10px] text-white/70 text-center mt-1">
          🔥 Momentos mais reagidos · toque para pular
        </div>
      </div>
    </div>
  );
}
