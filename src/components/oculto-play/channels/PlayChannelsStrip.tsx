/**
 * Faixa "Canais" dentro de cada seção do Play (Áudios, Vídeos, Filmes,
 * Filmes +18, Memes). Tocar num canal abre a página dele já na aba da seção.
 * Leve: só fotos pequenas, carregamento preguiçoso e sem animações contínuas.
 */
import { useNavigate } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlayChannelsStrip, type PlayChannelSection } from '@/hooks/usePlayChannels';

export function PlayChannelsStrip({ section, className }: { section: PlayChannelSection; className?: string }) {
  const navigate = useNavigate();
  const { data } = usePlayChannelsStrip(section);
  const channels = data ?? [];
  if (channels.length === 0) return null;

  return (
    <div className={cn('mb-2', className)}>
      <p className="mb-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wide opacity-80">Canais</p>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(`/play/c/${encodeURIComponent(c.slug)}?tab=${section}`)}
            className="flex w-[68px] shrink-0 flex-col items-center gap-1 text-center active:scale-95 transition-transform"
            title={c.name}
          >
            <span className="relative block h-14 w-14 overflow-hidden rounded-full bg-black/30 ring-2 ring-white/25">
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-lg font-extrabold">
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <span className="flex w-full items-center justify-center gap-0.5 text-[10.5px] font-semibold leading-tight">
              <span className="truncate">{c.name}</span>
              {c.is_official && <BadgeCheck className="h-3 w-3 shrink-0" aria-label="Oficial" />}
            </span>
            <span className="text-[9.5px] leading-none opacity-70">{c.item_count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
