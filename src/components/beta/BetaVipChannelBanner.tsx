/**
 * BetaVipChannelBanner — faixa discreta e persistente exibida no topo do
 * Canal VIP enquanto o período de testes do Oculto estiver ativo.
 *
 * - Reforça que o conteúdo VIP está liberado gratuitamente durante o Beta.
 * - Some automaticamente quando `betaActive` for falso (modo != beta ou
 *   `beta_ends_at` ultrapassado), sem necessidade de deploy.
 * - Mostra contagem regressiva amigável quando há data limite configurada.
 */
import { Sparkles } from 'lucide-react';
import { usePlatformPhase } from '@/hooks/usePlatformPhase';

function formatRemaining(endsAt: Date | null): string | null {
  if (!endsAt) return null;
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 2) return `termina em ${days} dias`;
  if (days === 1) return 'termina amanhã';
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `termina em ${hours}h`;
}

export function BetaVipChannelBanner() {
  const { betaActive, betaEndsAt } = usePlatformPhase();
  if (!betaActive) return null;

  const remaining = formatRemaining(betaEndsAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        w-full border-b border-amber-400/30
        bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent
        text-amber-100
      "
    >
      <div className="container max-w-6xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
        <p className="text-[11px] sm:text-xs leading-snug">
          <strong className="font-semibold">Beta:</strong>{' '}
          <span className="opacity-90">
            conteúdo VIP liberado gratuitamente — sem cobranças nos cliques de “comprar”.
          </span>
          {remaining && (
            <span className="ml-1 hidden sm:inline opacity-75">· {remaining}</span>
          )}
        </p>
      </div>
    </div>
  );
}

export default BetaVipChannelBanner;
