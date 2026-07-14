import { memo, useState } from 'react';
import { useConexoesOcultas } from '@/social-universe';
import { Sparkles, Eye } from 'lucide-react';
import { EconomyBuyButton } from './EconomyBuyButton';

const RARITY_COLOR: Record<string, string> = {
  rare: 'text-sky-300',
  epic: 'text-fuchsia-300',
  mythic: 'text-amber-300',
};

/**
 * ConexoesOcultasCard — descobertas raras (até 5/dia).
 * Hint visível antes da revelação. Avatar/nome aparecem só após revelar.
 */
function ConexoesOcultasCardComp() {
  const { items, isLoading, reveal } = useConexoesOcultas();
  const [revealing, setRevealing] = useState<string | null>(null);

  if (isLoading || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-1 text-[12px] font-bold text-white/90">
        <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden />
        Conexões ocultas
        <span className="ml-auto text-[10px] font-normal text-white/50">
          {items.length}/5 hoje
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.slice(0, 5).map((it) => (
          <li
            key={it.id}
            className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 text-[11px]"
          >
            {it.revealed && it.avatar_url ? (
              <img
                src={it.avatar_url}
                alt=""
                loading="lazy"
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-base">
                🔮
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-white/85">
                {it.revealed
                  ? (it.username ? `@${it.username}` : 'aura revelada')
                  : (it.hint || 'Alguém vibrando perto de você…')}
              </div>
              <div className={`text-[9px] uppercase tracking-wider ${RARITY_COLOR[it.rarity]}`}>
                {it.rarity}
              </div>
            </div>
            {!it.revealed && (
              <button
                type="button"
                onClick={async () => {
                  setRevealing(it.id);
                  try { await reveal(it.id); } finally { setRevealing(null); }
                }}
                disabled={revealing === it.id}
                className="flex items-center gap-1 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-50"
              >
                <Eye className="h-3 w-3" aria-hidden />
                {revealing === it.id ? '…' : 'revelar'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {/* Paywall PIX — desbloqueia +3 conexões ocultas hoje. Backend valida elegibilidade. */}
      <div className="mt-2">
        <EconomyBuyButton
          slug="conexoes_ocultas_x3"
          label="+3 conexões ocultas (PIX)"
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20"
        />
      </div>
    </div>
  );
}

export const ConexoesOcultasCard = memo(ConexoesOcultasCardComp);
