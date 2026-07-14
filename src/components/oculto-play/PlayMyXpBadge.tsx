/**
 * PlayMyXpBadge — Etapa 9
 * Pequena pílula compacta mostrando XP total / nível do usuário no Oculto Play.
 * Reaproveita RPC `oculto_play_my_xp` já existente.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type Xp = { xp_total: number; xp_today: number; level: number; next_level_xp: number };

export function PlayMyXpBadge({ className }: { className?: string }) {
  const [xp, setXp] = useState<Xp | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('oculto_play_my_xp');
        if (!alive || !data) return;
        setXp(data as Xp);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  if (!xp) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400',
        className
      )}
      title={`Nível ${xp.level} · próximo: ${xp.next_level_xp} XP`}
    >
      <Zap className="h-3 w-3" />
      <span>Nv {xp.level}</span>
      <span className="opacity-60">·</span>
      <span>{xp.xp_total} XP</span>
    </div>
  );
}
