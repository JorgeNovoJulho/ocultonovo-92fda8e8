/**
 * CreatorSurgeBanner — Etapa 28.
 * Banner discreto exibido no topo do OCULTO PLAY quando o criador
 * tem itens com surge de views nos últimos 30min. Click abre o item
 * via deep-link (#play-item-<id>) usando o sheet da Etapa 25.
 */
import { Flame, TrendingUp, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useOcultoPlayCreatorSurges } from '@/hooks/useOcultoPlayCreatorSurges';
import { openPlayItemDeepLink } from './PlayItemDeepLinkSheet';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'oculto-play.surge.dismissed-ids';

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch {
    /* no-op */
  }
}

export function CreatorSurgeBanner() {
  const { data, isLoading } = useOcultoPlayCreatorSurges();
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  const visible = useMemo(
    () => (data ?? []).filter((s) => !dismissed.has(s.item_id)).slice(0, 3),
    [data, dismissed],
  );

  if (isLoading || visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  return (
    <div className="mb-3 space-y-1.5">
      {visible.map((s) => (
        <div
          key={s.item_id}
          className={cn(
            "relative flex items-center gap-2 rounded-xl border border-orange-500/40",
            "bg-gradient-to-r from-orange-500/15 via-rose-500/10 to-fuchsia-500/15 p-2",
          )}
        >
          {s.thumb_url ? (
            <img
              src={s.thumb_url}
              alt=""
              loading="lazy"
              className="h-10 w-10 rounded-lg object-cover border border-orange-500/30"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-orange-500/20 grid place-items-center text-orange-300">
              <Flame className="h-5 w-5" />
            </div>
          )}

          <button
            onClick={() => openPlayItemDeepLink(s.item_id)}
            className="flex-1 text-left min-w-0"
          >
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-orange-300 font-bold">
              <Flame className="h-3 w-3" />
              Pico agora
            </div>
            <p className="text-xs font-semibold truncate text-foreground">
              {s.title || 'Seu item está bombando'}
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {s.recent_views} views nos últimos 30min · {s.surge_ratio}× a média
            </p>
          </button>

          <button
            onClick={() => dismiss(s.item_id)}
            className="grid place-items-center h-6 w-6 rounded-full hover:bg-foreground/10 text-muted-foreground"
            title="Dispensar"
            aria-label="Dispensar pico"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
