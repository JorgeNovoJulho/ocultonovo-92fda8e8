/**
 * ProfileAffinityBadge — tag de afinidade entre usuário logado e perfil visitado.
 *
 * IMPORTANTE: o cálculo é centralizado em `@/lib/affinityScore` para garantir
 * que o MESMO par (logado × alvo) sempre exiba a MESMA porcentagem em qualquer
 * tela do app (carrossel de descoberta, perfil etc.).
 */
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeAffinity } from '@/lib/affinityScore';

interface Props {
  myProfileId?: string | null;
  targetProfileId?: string | null;
  /** Mantido por compatibilidade — não afeta mais o cálculo. */
  signals?: Record<string, unknown>;
  className?: string;
}

export function ProfileAffinityBadge({ myProfileId, targetProfileId, className }: Props) {
  const result = computeAffinity(myProfileId, targetProfileId);
  if (!result) return null;
  const { score, tone, label } = result;

  const palette =
    tone === 'high'
      ? 'bg-[hsl(135,90%,48%)] text-black ring-2 ring-[hsl(135,100%,72%)]/80 shadow-[0_0_14px_-2px_hsl(135,100%,55%/0.85)]'
      : tone === 'mid'
      ? 'bg-[hsl(48,100%,55%)] text-black ring-2 ring-[hsl(48,100%,75%)]/75 shadow-[0_0_12px_-2px_hsl(48,100%,55%/0.8)]'
      : tone === 'low'
      ? 'bg-[hsl(20,100%,55%)] text-black ring-2 ring-[hsl(20,100%,72%)]/75 shadow-[0_0_12px_-2px_hsl(20,100%,55%/0.8)]'
      : 'bg-[hsl(0,90%,52%)] text-white ring-2 ring-[hsl(0,100%,72%)]/80 shadow-[0_0_14px_-2px_hsl(0,100%,55%/0.85)]';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide',
        palette,
        className,
      )}
      title={`${score}% — ${label} com você`}
      aria-label={`${score}% de afinidade com você`}
    >
      <Sparkles className="h-3 w-3" />
      <span className="tabular-nums">{score}%</span>
      <span className="hidden sm:inline normal-case text-[10px] font-bold opacity-90">{label}</span>
    </span>
  );
}
