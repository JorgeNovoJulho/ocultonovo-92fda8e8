/**
 * CreatorMilestonesBanner — Etapa 29.
 * Celebra marcos cruzados pelos itens do criador (views/likes).
 * Stateless no DB: usa localStorage para não repetir um marco já
 * visto. Mostra no máximo 2 marcos por vez no topo do PLAY.
 */
import { Trophy, Heart, Eye, X, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useOcultoPlayCreatorMilestones,
  type CreatorMilestone,
} from '@/hooks/useOcultoPlayCreatorMilestones';
import { openPlayItemDeepLink } from './PlayItemDeepLinkSheet';
import { cn } from '@/lib/utils';

const SEEN_KEY = 'oculto-play.milestones.seen';

function milestoneId(m: CreatorMilestone): string {
  return `${m.item_id}:${m.metric}:${m.threshold}`;
}

function loadSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    // Mantém só os últimos 500 marcos vistos
    const arr = [...set].slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* no-op */
  }
}

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

export function CreatorMilestonesBanner() {
  const { data, isLoading } = useOcultoPlayCreatorMilestones();
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());

  const pending = useMemo(
    () => (data ?? []).filter((m) => !seen.has(milestoneId(m))).slice(0, 2),
    [data, seen],
  );

  if (isLoading || pending.length === 0) return null;

  const dismiss = (m: CreatorMilestone) => {
    const next = new Set(seen);
    next.add(milestoneId(m));
    setSeen(next);
    saveSeen(next);
  };

  return (
    <div className="mb-3 space-y-1.5">
      {pending.map((m) => {
        const Icon = m.metric === 'views' ? Eye : Heart;
        return (
          <div
            key={milestoneId(m)}
            className={cn(
              "relative flex items-center gap-2 rounded-xl border p-2",
              m.metric === 'views'
                ? "border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-orange-500/15"
                : "border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-pink-500/10 to-fuchsia-500/15",
            )}
          >
            {m.thumb_url ? (
              <img
                src={m.thumb_url}
                alt=""
                loading="lazy"
                className="h-10 w-10 rounded-lg object-cover border border-foreground/10"
              />
            ) : (
              <div className={cn(
                "h-10 w-10 rounded-lg grid place-items-center",
                m.metric === 'views' ? "bg-amber-500/20 text-amber-200" : "bg-rose-500/20 text-rose-200",
              )}>
                <Sparkles className="h-5 w-5" />
              </div>
            )}

            <button
              onClick={() => openPlayItemDeepLink(m.item_id)}
              className="flex-1 text-left min-w-0"
            >
              <div className={cn(
                "flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold",
                m.metric === 'views' ? "text-amber-200" : "text-rose-200",
              )}>
                <Trophy className="h-3 w-3" />
                Marco atingido · {fmt(m.threshold)} {m.metric === 'views' ? 'views' : 'curtidas'}
              </div>
              <p className="text-xs font-semibold truncate text-foreground">
                {m.title || 'Seu item conquistou um marco'}
              </p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Icon className="h-3 w-3" />
                Total: {fmt(m.current_value)} {m.metric === 'views' ? 'views' : 'curtidas'}
                {m.reached_recent && ' · novinho 🔥'}
              </p>
            </button>

            <button
              onClick={() => dismiss(m)}
              className="grid place-items-center h-6 w-6 rounded-full hover:bg-foreground/10 text-muted-foreground"
              title="Dispensar"
              aria-label="Dispensar marco"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
