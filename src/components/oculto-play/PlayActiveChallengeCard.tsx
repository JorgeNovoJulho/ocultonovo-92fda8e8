/**
 * PlayActiveChallengeCard — Etapa 9
 * Card minimalista que mostra o desafio ativo em destaque no Oculto Play.
 * Tom adulto/premium. Sem visual infantil.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Trophy, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  xp_reward: number;
  ends_at: string | null;
  is_featured: boolean;
};

function fmtRemaining(ends: string | null) {
  if (!ends) return null;
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return 'encerrado';
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h restantes`;
  return `${Math.floor(h / 24)}d restantes`;
}

export function PlayActiveChallengeCard({ className }: { className?: string }) {
  const [items, setItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('oculto_play_challenges_active', { p_limit: 3 });
        if (!alive) return;
        if (error) { setItems([]); return; }
        setItems((data ?? []) as Challenge[]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 px-1">
        <Trophy className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Desafios do Oculto Play
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {items.map((c) => {
          const rem = fmtRemaining(c.ends_at);
          return (
            <div
              key={c.id}
              className={cn(
                'min-w-[260px] max-w-[300px] shrink-0 rounded-xl border border-border/40 bg-card/60 p-3',
                c.is_featured && 'border-amber-500/40 bg-gradient-to-br from-amber-950/20 to-card/60'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-semibold leading-tight">{c.title}</div>
                <div className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                  +{c.xp_reward} XP
                </div>
              </div>
              {c.description && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
              )}
              {rem && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> {rem}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
