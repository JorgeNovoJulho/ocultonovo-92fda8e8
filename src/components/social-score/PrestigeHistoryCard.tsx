import { useEffect, useState } from 'react';
import { Sparkles, Eye, Flame, Crown, Gem, Star, History } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, eye: Eye, flame: Flame, crown: Crown, gem: Gem, star: Star,
};

interface Item {
  rank: number; name: string; badge_icon: string; glow_color: string;
  xp_at: number; reached_at: string;
}

interface Props { userId?: string | null; className?: string; }

export function PrestigeHistoryCard({ userId, className }: Props) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await (supabase as any).rpc('social_prestige_history', { p_user: userId ?? null });
      if (!cancel) setItems(Array.isArray(data) ? (data as Item[]) : []);
    })();
    return () => { cancel = true; };
  }, [userId]);

  if (items === null) {
    return <div className={cn('h-20 rounded-xl bg-muted/40 animate-pulse', className)} />;
  }
  if (items.length === 0) return null;

  return (
    <div className={cn('rounded-xl border border-border/50 p-3 bg-muted/20', className)}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
        <History className="h-3 w-3" /> Sua jornada de prestígio
      </div>
      <ol className="space-y-1.5 border-l border-border/50 pl-3">
        {items.map((h) => {
          const I = ICONS[h.badge_icon] ?? Sparkles;
          return (
            <li key={h.rank} className="text-xs flex items-center gap-2">
              <I className="h-3 w-3 shrink-0" style={{ color: `hsl(${h.glow_color})` }} />
              <span className="font-medium truncate">{h.name}</span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {new Date(h.reached_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
