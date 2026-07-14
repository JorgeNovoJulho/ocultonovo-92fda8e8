import { memo, useEffect, useState } from 'react';
import { getDailyCycle, type DailyCycle } from '@/lib/auraDailyCycle';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

interface RisingRoom {
  slug: string; name: string; emoji: string | null; hue: number; energy: number; mood: string | null;
}

/**
 * Banner discreto do ciclo diário + salas em ascensão (até 3).
 * 1 fetch leve a cada 120s. Sem realtime.
 */
function AuraDailyCycleBannerComp() {
  const [cycle, setCycle] = useState<DailyCycle>(() => getDailyCycle());
  const [rising, setRising] = useState<RisingRoom[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => setCycle(getDailyCycle()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const fetchRising = async () => {
      try {
        const { data, error } = await (supabase as any).rpc('aura_rooms_rising_now');
        if (!error && !cancelled) {
          setRising(((data as RisingRoom[]) ?? []).slice(0, 3));
          return;
        }

        const { data: fallback, error: fallbackError } = await (supabase as any).rpc('aura_rooms_list');
        if (fallbackError || cancelled) return;

        const derived = ((fallback as any[]) ?? [])
          .filter((room) => room?.rising)
          .slice(0, 3)
          .map((room) => ({
            slug: room.slug,
            name: room.name,
            emoji: room.emoji ?? null,
            hue: room.hue,
            energy: Math.min(100, Math.max(0, Number(room.active_count || 0) * 12)),
            mood: room.mood ?? null,
          } satisfies RisingRoom));

        setRising(derived);
      } catch { /* silencioso */ }
    };
    fetchRising();
    timer = window.setInterval(fetchRising, 120_000);
    const onVis = () => { if (!document.hidden) fetchRising(); };
    document.addEventListener('visibilitychange', onVis);

    const unsubP = subscribeTable('oculto_aura_room_presence', () => { if (!document.hidden) void fetchRising(); });
    const unsubR = subscribeTable('oculto_aura_room_reactions', () => { if (!document.hidden) void fetchRising(); });

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      unsubP(); unsubR();
    };
  }, []);


  return (
    <div className="space-y-1">
      <div
        className="flex items-center justify-center gap-2 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-[11px]"
        role="status"
        aria-live="polite"
        style={{
          background: `linear-gradient(90deg, hsla(${cycle.hueA},70%,30%,0.18), hsla(${cycle.hueC},70%,30%,0.18))`,
        }}
      >
        <span aria-hidden>{cycle.emoji}</span>
        <span className="font-semibold" style={{ color: `hsl(${cycle.hueA}, 80%, 75%)` }}>
          {cycle.name}
        </span>
        <span className="text-muted-foreground">— {cycle.vibe}</span>
      </div>

      {rising.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 overflow-x-auto px-2 text-[10px]">
          <span className="shrink-0 text-fuchsia-300">🔥 Em ascensão:</span>
          {rising.map((r) => (
            <span
              key={r.slug}
              className="shrink-0 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 font-semibold"
              style={{ color: `hsl(${r.hue},80%,80%)` }}
              title={`Energia ${r.energy}/100 · ${r.mood ?? ''}`}
            >
              {r.emoji} {r.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const AuraDailyCycleBanner = memo(AuraDailyCycleBannerComp);
