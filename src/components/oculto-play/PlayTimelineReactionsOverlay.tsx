/**
 * PlayTimelineReactionsOverlay — Etapa 49
 *
 * Mostra emojis flutuantes quando o playback alcança a posição de uma
 * reação agregada e oferece um botão "Reagir" que grava o emoji no
 * timestamp atual do player.
 */
import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayTimelineReactions } from '@/hooks/useOcultoPlayTimelineReactions';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  itemId: string | null | undefined;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  hidden?: boolean;
}

const QUICK_EMOJIS = ['❤️', '🔥', '😂', '😮', '👏', '🥵'];

interface FloatingBubble {
  key: number;
  emoji: string;
  left: number;  // 0..100 %
}

export function PlayTimelineReactionsOverlay({ itemId, mediaRef, hidden }: Props) {
  const { user } = useAuth();
  const { data, addReaction } = useOcultoPlayTimelineReactions(itemId);
  const [bubbles, setBubbles] = useState<FloatingBubble[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef(0);

  // Reset cache de buckets vistos quando item troca.
  useEffect(() => { seenRef.current = new Set(); lastTimeRef.current = 0; }, [itemId]);

  // Observa timeupdate e dispara bolhas para buckets recém-atingidos.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || data.length === 0) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const t = el.currentTime || 0;
      // detecta seek pra trás: libera buckets futuros novamente
      if (t + 1 < lastTimeRef.current) seenRef.current = new Set();
      lastTimeRef.current = t;
      for (const r of data) {
        const key = `${r.position_seconds}|${r.emoji}`;
        if (seenRef.current.has(key)) continue;
        if (t >= r.position_seconds && t <= r.position_seconds + 2) {
          seenRef.current.add(key);
          // até 3 bolhas por reação agregada (qty limitado a 3 visual)
          const count = Math.min(3, r.qty);
          for (let i = 0; i < count; i++) {
            const bubble: FloatingBubble = {
              key: performance.now() + Math.random(),
              emoji: r.emoji,
              left: 20 + Math.random() * 60,
            };
            setBubbles(prev => [...prev, bubble]);
            const k = bubble.key;
            setTimeout(() => {
              setBubbles(prev => prev.filter(b => b.key !== k));
            }, 2800);
          }
        }
      }
    };
    const throttled = () => { if (!raf) raf = requestAnimationFrame(tick); };
    el.addEventListener('timeupdate', throttled);
    return () => {
      el.removeEventListener('timeupdate', throttled);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [data, mediaRef]);

  const handleReact = async (emoji: string) => {
    if (!user) { toast.error('Faça login para reagir'); return; }
    const el = mediaRef.current;
    const pos = el?.currentTime ?? 0;
    const ok = await addReaction(pos, emoji);
    if (ok) {
      // bolha local imediata
      const bubble: FloatingBubble = {
        key: performance.now(),
        emoji,
        left: 50,
      };
      setBubbles(prev => [...prev, bubble]);
      setTimeout(() => {
        setBubbles(prev => prev.filter(b => b.key !== bubble.key));
      }, 2800);
    } else {
      toast.error('Não foi possível registrar a reação');
    }
    setPickerOpen(false);
  };

  if (!itemId) return null;

  return (
    <>
      {/* Bolhas flutuantes */}
      <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
        {bubbles.map(b => (
          <span
            key={b.key}
            className="absolute bottom-28 text-3xl select-none animate-[float-up_2.8s_ease-out_forwards]"
            style={{ left: `${b.left}%` }}
          >
            {b.emoji}
          </span>
        ))}
      </div>

      {/* Botão de reação */}
      {!hidden && (
        <div
          data-no-gesture
          className="absolute bottom-32 right-3 z-30 flex flex-col items-end gap-2"
        >
          {pickerOpen && (
            <div className="flex gap-1 rounded-full bg-black/70 backdrop-blur px-2 py-1 border border-white/20">
              {QUICK_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => handleReact(e)}
                  className="text-xl hover:scale-125 transition-transform px-0.5"
                  title={`Reagir com ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setPickerOpen(o => !o)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
              'bg-black/60 hover:bg-fuchsia-500/70 text-white backdrop-blur',
              'border border-white/20 transition-colors',
              pickerOpen && 'bg-fuchsia-500/70',
            )}
            title="Reagir neste momento"
          >
            <Smile className="h-3.5 w-3.5" />
            Reagir
          </button>
        </div>
      )}

      {/* keyframes locais — sobem suaves e somem */}
      <style>{`
        @keyframes float-up {
          0%   { transform: translateY(0) scale(0.8); opacity: 0; }
          15%  { transform: translateY(-20px) scale(1.1); opacity: 1; }
          100% { transform: translateY(-180px) scale(1); opacity: 0; }
        }
      `}</style>
    </>
  );
}
