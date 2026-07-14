import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { Zap } from 'lucide-react';

/** Contador compacto de presentes XP recebidos para um post.
 *  Usa RPC público `aura_xp_gifts_count_for_post` e atualiza em realtime
 *  ao detectar novos INSERTs com este post_id. */
export function PostGiftCounter({ postId }: { postId: string | null | undefined }) {
  const [count, setCount] = useState<number>(0);
  const [xp, setXp] = useState<number>(0);

  useEffect(() => {
    if (!postId) return;
    let alive = true;

    const load = async () => {
      try {
        const { data } = await (supabase as any).rpc('aura_xp_gifts_count_for_post', {
          p_post_id: postId,
        });
        const row: any = Array.isArray(data) ? data[0] : data;
        if (!alive || !row) return;
        setCount(Number(row.gifts_count ?? 0));
        setXp(Number(row.total_xp ?? 0));
      } catch {/* silently ignore */}
    };

    load();

    const unsub = subscribeTable('oculto_aura_xp_gifts', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      if (payload?.new?.post_id !== postId) return;
      load();
    }, { events: ['INSERT'] });

    return () => {
      alive = false;
      unsub();
    };
  }, [postId]);


  if (count <= 0) {
    return <span className="hidden sm:inline text-xs">Presente</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <span className="tabular-nums">{count}</span>
      <span className="hidden sm:inline-flex items-center gap-0.5 text-amber-300/90">
        <Zap className="h-3 w-3" /> {xp}
      </span>
    </span>
  );
}
