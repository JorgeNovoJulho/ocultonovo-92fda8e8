import { memo } from 'react';
import { useDestinoSocial, type DestinyRarity } from '@/social-universe';
import { Heart } from 'lucide-react';

const RARITY_LABEL: Record<DestinyRarity, string> = {
  common: 'comum',
  uncommon: 'incomum',
  rare: 'raro',
  epic: 'épico',
  mythic: 'mítico',
};
const RARITY_COLOR: Record<DestinyRarity, string> = {
  common: 'text-white/60',
  uncommon: 'text-emerald-300',
  rare: 'text-sky-300',
  epic: 'text-fuchsia-300',
  mythic: 'text-amber-300',
};

/**
 * DestinoSocialCard — top conexões raras do usuário.
 * Lista enxuta (5 itens), avatar pequeno, sem glow no mobile-low.
 */
function DestinoSocialCardComp() {
  const { data: links = [], isLoading } = useDestinoSocial(5);

  if (isLoading) return null;
  if (links.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-1 text-[12px] font-bold text-white/90">
        <Heart className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden />
        Destino social
      </div>
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.other_user} className="flex items-center gap-2 text-[11px]">
            {l.avatar_url ? (
              <img
                src={l.avatar_url}
                alt=""
                loading="lazy"
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-white/10" />
            )}
            <div className="min-w-0 flex-1 truncate text-white/85">
              {l.username ? `@${l.username}` : 'aura'}
            </div>
            <span className={`text-[9px] uppercase tracking-wider ${RARITY_COLOR[l.rarity]}`}>
              {RARITY_LABEL[l.rarity]}
            </span>
            <span className="text-[10px] tabular-nums text-white/60">{l.affinity}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const DestinoSocialCard = memo(DestinoSocialCardComp);
