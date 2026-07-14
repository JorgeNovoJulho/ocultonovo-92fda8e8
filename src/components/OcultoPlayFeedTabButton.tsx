/**
 * OcultoPlayFeedTabButton — substitui o antigo botão "Meu Conteúdo VIP" na barra de abas do feed.
 *
 * - Link direto para /oculto-play
 * - Mostra um contador em destaque com a quantidade de itens novos
 *   adicionados ao OCULTO PLAY desde a última visita.
 * - Conta em tempo real via Realtime (INSERT em oculto_play_items).
 * - Persiste em localStorage e zera ao clicar.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayAccess } from '@/hooks/useOcultoPlayAccess';
import { cn } from '@/lib/utils';
import { FEED_BTN_BASE, FeedTabNewBadge } from '@/components/FeedTabs';

const STORAGE_KEY = 'oculto-play-rail-news-count';
const SEEN_KEY = 'oculto-play-rail-seen-at';

function readCount(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY) ?? '0');
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch { return 0; }
}
function writeCount(n: number) {
  try { localStorage.setItem(STORAGE_KEY, String(Math.max(0, n))); } catch { /* noop */ }
}
function readSeen(): string {
  try { return localStorage.getItem(SEEN_KEY) ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString(); }
  catch { return new Date(Date.now() - 24 * 3600 * 1000).toISOString(); }
}

export function OcultoPlayFeedTabButton() {
  const { canAccess } = useOcultoPlayAccess();
  const [count, setCount] = useState<number>(() => readCount());

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    (async () => {
      try {
        const seenAt = readSeen();
        const { count: c } = await supabase
          .from('oculto_play_items')
          .select('id', { count: 'exact', head: true })
          .gt('created_at', seenAt);
        if (cancelled) return;
        if (typeof c === 'number' && c > 0) {
          const merged = Math.max(readCount(), c);
          writeCount(merged);
          setCount(merged);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    const ch = supabase
      .channel('oculto-play-tab-news')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'oculto_play_items' },
        () => {
          setCount((prev) => {
            const next = prev + 1;
            writeCount(next);
            return next;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canAccess]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCount(readCount());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleClick = () => {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
      writeCount(0);
    } catch { /* noop */ }
    setCount(0);
  };

  if (!canAccess) return null;

  return (
    <Link
      to="/oculto-play"
      onClick={handleClick}
      title="Abrir OCULTO PLAY"
      aria-label={`OCULTO PLAY${count > 0 ? ` — ${count} ${count === 1 ? 'novo item' : 'novos itens'}` : ''}`}
      className={cn(
        FEED_BTN_BASE,
        "border-2 gap-1.5",
        "border-amber-300/70",
        "bg-gradient-to-r from-yellow-500/45 via-amber-500/40 to-orange-500/45",
        "shadow-[0_0_0_1px_rgba(251,191,36,0.5),0_0_18px_rgba(251,191,36,0.5)]",
        "hover:brightness-110",
      )}
    >
      <FeedTabNewBadge tone="amber" />
      <Play
        className="h-4 w-4 shrink-0 fill-current text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.85)]"
        strokeWidth={2.6}
      />
      <span
        className={cn(
          "truncate bg-clip-text text-transparent bg-gradient-to-r",
          "from-yellow-200 via-amber-200 to-orange-200",
          "drop-shadow-[0_0_8px_rgba(251,191,36,0.85)]",
        )}
      >
        Oculto Play
      </span>
      {count > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full",
            "bg-black text-amber-300 text-[11px] font-black tabular-nums",
            "ring-2 ring-amber-200 shadow-[0_0_10px_rgba(250,204,21,0.85)] animate-pulse",
          )}
          aria-hidden
        >
          +{count > 99 ? '99+' : count}
        </span>
      )}
      <Sparkles className="h-3.5 w-3.5 text-amber-200 drop-shadow-[0_0_6px_rgba(251,191,36,0.85)]" />
    </Link>
  );
}
