import { Crown, Clock, AlertTriangle, Infinity as InfinityIcon, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMyPlanStatus, formatPlanCountdown } from '@/hooks/useMyPlanStatus';

interface Props {
  className?: string;
  /** compact = só ícone + tempo; full = label completo */
  variant?: 'compact' | 'full';
}

/**
 * Mostra o status do MEU plano (ativo/expirando/expirado) + contagem regressiva.
 * Usado no painel da AuraRoomLive (header e banner).
 */
export function MyPlanStatusPill({ className, variant = 'full' }: Props) {
  const status = useMyPlanStatus();
  if (!status || status.status === 'none') return null;

  const lifetime = status.msLeft < 0;
  const countdown = formatPlanCountdown(status.msLeft);
  const planLabel = status.plan.toUpperCase();

  let Icon = Crown;
  let cls = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  let label = `${planLabel} ativo · ${countdown} restantes`;

  if (status.status === 'expired') {
    Icon = ShieldOff;
    cls = 'border-red-500/50 bg-red-500/10 text-red-200';
    label = `${planLabel} expirado`;
  } else if (status.status === 'expiring') {
    Icon = AlertTriangle;
    cls = 'border-orange-500/50 bg-orange-500/10 text-orange-200 animate-pulse';
    label = `${planLabel} expira em ${countdown}`;
  } else if (lifetime) {
    Icon = InfinityIcon;
    cls = 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200';
    label = `${planLabel} vitalício`;
  }

  const title = status.expiresAt
    ? `Renova/expira em ${new Date(status.expiresAt).toLocaleString('pt-BR')}`
    : lifetime ? 'Acesso vitalício' : label;

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap',
        cls,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {variant === 'full' ? label : (lifetime ? '∞' : countdown)}
      {variant === 'full' && !lifetime && status.status !== 'expired' && (
        <Clock className="h-3 w-3 opacity-60" />
      )}
    </span>
  );
}
