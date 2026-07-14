/**
 * PlayRailPulse — banner dourado com contador de novidades do OCULTO PLAY.
 *
 * - Contador persiste em localStorage e incrementa em tempo real quando novos
 *   itens são inseridos em `oculto_play_items`.
 * - Ao clicar, zera o contador (salva timestamp de "visto") e navega para /play.
 * - Tons de dourado degradê com contorno em contraste.
 */
import { useEffect, useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOcultoPlayAccess } from '@/hooks/useOcultoPlayAccess';
import { supabase } from '@/lib/supabaseExternal';

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

export function PlayRailPulse() {
  const { canAccess } = useOcultoPlayAccess();
  const [count, setCount] = useState<number>(() => readCount());

  // Backfill inicial: conta itens criados após o último "visto" (best effort).
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
      } catch { /* RLS pode bloquear; segue com count local */ }
    })();
    return () => { cancelled = true; };
  }, [canAccess]);

  // Realtime: incrementa a cada novo arquivo.
  useEffect(() => {
    if (!canAccess) return;
    const ch = supabase
      .channel('oculto-play-rail-news')
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

  // Sincroniza entre abas
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
    <div className="px-3 mb-2">
      <Link
        to="/oculto-play"
        onClick={handleClick}
        className="group relative flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold
                   bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-600
                   border-2 border-amber-200/80 ring-1 ring-amber-900/40
                   shadow-[0_2px_10px_-2px_rgba(180,120,0,0.45)]
                   text-amber-950 hover:from-amber-200 hover:via-yellow-300 hover:to-amber-500
                   transition-colors overflow-hidden"
        aria-label={`Novidades no Oculto Play${count > 0 ? ` — ${count} ${count === 1 ? 'novo item' : 'novos itens'}` : ''}`}
      >
        <span
          className="relative grid h-7 w-7 place-items-center rounded-lg
                     bg-gradient-to-br from-amber-800 to-amber-950
                     ring-1 ring-amber-200/80 text-amber-100 shadow-inner"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-amber-200 animate-pulse" />
          )}
        </span>
        <span className="flex-1 truncate tracking-wide">
          Novidades no <span className="font-black uppercase">OCULTO PLAY</span>
        </span>
        {count > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full
                       bg-amber-950 text-amber-100 text-[11px] font-black tabular-nums
                       ring-2 ring-amber-200/90 shadow"
            aria-hidden
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
        <Sparkles className="h-3.5 w-3.5 text-amber-950/90" />
      </Link>
    </div>
  );
}
