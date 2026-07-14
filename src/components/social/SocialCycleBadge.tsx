/**
 * SocialCycleBadge — barra do ciclo social atual.
 * Reativa ao horário local + previsão do tempo. Quando há uma sessão de
 * ciclo especial aberta para o slug sugerido, o CTA vai DIRETO à sala
 * do bate-papo (em vez da tela do Aura Match).
 */
import { memo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useSocialCycle } from '@/hooks/retention/useRetention';
import {
  getCycleEnv,
  suggestionFor,
  type CycleSuggestion,
} from '@/lib/socialCycleWeather';
import { useSpecialRoomSession } from '@/hooks/useSpecialRoomSession';

function SocialCycleBadgeComp() {
  const { data: cycle } = useSocialCycle();
  const navigate = useNavigate();
  const [suggestion, setSuggestion] = useState<CycleSuggestion | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const env = await getCycleEnv();
        if (!alive) return;
        setSuggestion(suggestionFor(env));
      } catch { /* silencioso */ }
    })();
    return () => { alive = false; };
  }, []);

  // Consulta sessão especial pelo ciclo preferido da sugestão
  const { session: specialSession } = useSpecialRoomSession(suggestion?.preferredCycleKey ?? null);

  if (!cycle && !suggestion) {
    return (
      <div className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50">
        ⏳ Carregando ciclo social…
      </div>
    );
  }

  const hue = specialSession?.hue ?? suggestion?.hue ?? cycle?.hue ?? 280;
  const emoji = specialSession?.emoji ?? suggestion?.emoji ?? cycle?.emoji ?? '✨';
  const label = specialSession?.label ?? suggestion?.title ?? cycle?.label ?? 'Ciclo social';
  const message = suggestion?.message ?? cycle?.message ?? null;

  const handleGo = () => {
    if (specialSession?.room_slug) {
      navigate(`/aura-match?room=${encodeURIComponent(specialSession.room_slug)}#aura-anchor-rooms`);
    } else if (suggestion?.ctaRoute) {
      navigate(suggestion.ctaRoute);
    }
  };

  const ctaLabel = specialSession ? 'Entrar na sala' : (suggestion?.ctaLabel ?? null);

  return (
    <div
      className="w-full rounded-xl border border-white/15 px-3 py-2.5 flex items-center gap-3"
      style={{
        background: `linear-gradient(90deg, hsl(${hue} 70% 22% / 0.85), hsl(${hue} 60% 14% / 0.55))`,
      }}
    >
      <span className="text-xl leading-none shrink-0" aria-hidden>{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">
          {specialSession ? 'Ciclo especial agora' : 'Ciclo social agora'}
        </div>
        <div className="text-sm font-semibold text-white truncate">{label}</div>
        {message && (
          <div className="text-[11px] text-white/70 truncate sm:hidden">{message}</div>
        )}
      </div>
      {message && (
        <div className="hidden sm:block max-w-[45%] text-[11px] text-white/70 truncate">
          {message}
        </div>
      )}
      {ctaLabel && (
        <button
          type="button"
          onClick={handleGo}
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 transition px-2.5 py-1 text-[11px] font-semibold text-white"
          aria-label={ctaLabel}
        >
          {ctaLabel}
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export const SocialCycleBadge = memo(SocialCycleBadgeComp);
