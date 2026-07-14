import { memo } from 'react';
import { useExperienciasReais } from '@/social-universe';
import { MapPin, Users, Crown } from 'lucide-react';

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

/**
 * ExperienciasReaisStrip — próximos eventos locais aprovados.
 * Tira horizontal compacta. Mostra cidade, data e contagem de "indo".
 */
function ExperienciasReaisStripComp() {
  const { data: items = [], isLoading } = useExperienciasReais(8);
  if (isLoading || items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-[12px] font-bold text-white/90 px-1">
        <MapPin className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
        Experiências reais perto de você
      </div>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {items.map((ev) => (
          <article
            key={ev.id}
            className="w-[200px] shrink-0 snap-start rounded-xl border border-white/10 bg-card/40 p-2.5"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] uppercase tracking-wider text-white/50">{ev.kind}</span>
              {ev.vip_only && (
                <Crown className="h-3 w-3 text-amber-300" aria-hidden />
              )}
            </div>
            <h3 className="mt-1 line-clamp-2 text-[12px] font-semibold text-white/90">
              {ev.title}
            </h3>
            <div className="mt-1.5 space-y-0.5 text-[10px] text-white/65">
              <div className="truncate">📅 {fmtDate(ev.starts_at)}</div>
              {(ev.city || ev.state) && (
                <div className="truncate">📍 {[ev.city, ev.state].filter(Boolean).join(' · ')}</div>
              )}
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden /> {ev.going_count} confirmados
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export const ExperienciasReaisStrip = memo(ExperienciasReaisStripComp);
