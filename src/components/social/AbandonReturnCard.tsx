/**
 * AbandonReturnCard — exibido UMA vez quando o usuário volta após 24h+.
 * Não modal. Dismissível. Persistido via RPC.
 */
import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRetentionState, dismissAbandonCard } from '@/hooks/retention/useRetention';
import { Sparkles, X } from 'lucide-react';

function AbandonReturnCardComp() {
  const { data } = useRetentionState();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  if (!data) return null;
  if (data.hours_since_active < 24) return null;
  if (data.abandon_card_dismissed_at) {
    const dismissedAt = new Date(data.abandon_card_dismissed_at).getTime();
    if (Date.now() - dismissedAt < 24 * 3600 * 1000) return null;
  }

  const close = () => {
    setHidden(true);
    dismissAbandonCard();
  };

  return (
    <div
      className="relative rounded-xl border border-white/10 p-3"
      style={{ background: 'linear-gradient(135deg, hsl(280 55% 18% / 0.7), hsl(320 55% 16% / 0.5))' }}
    >
      <button onClick={close} className="absolute right-2 top-2 p-1 text-white/50 hover:text-white/90" aria-label="Fechar">
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 mt-0.5 text-pink-200" />
        <div className="flex-1 pr-4">
          <div className="text-sm font-semibold text-white/95">O universo se moveu enquanto você esteve fora</div>
          <div className="mt-0.5 text-xs text-white/65">Novas conexões e salas surgiram. Quer ver agora?</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => { close(); navigate('/aura-match#aura-anchor-rooms'); }}
              className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
            >
              Ver salas ativas
            </button>
            <button
              onClick={() => { close(); navigate('/radar'); }}
              className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Quem está online
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const AbandonReturnCard = memo(AbandonReturnCardComp);
