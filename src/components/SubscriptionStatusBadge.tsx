import { Badge } from "@/components/ui/badge";
import { Crown, Clock, AlertTriangle, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscriptionStatus } from "@/hooks/useSubscriptions";

interface Props {
  creatorId: string | undefined;
  className?: string;
  /** compact = só ícone + dias; full = texto completo */
  variant?: "compact" | "full";
}

/**
 * Exibe status da assinatura (ativo / expirando / expirado) em tempo real.
 * Usa useSubscriptionStatus que já escuta Realtime na tabela subscriptions.
 */
export function SubscriptionStatusBadge({ creatorId, className, variant = "full" }: Props) {
  const { data: status, isLoading } = useSubscriptionStatus(creatorId);

  if (isLoading || !status || !status.active) return null;

  const isLifetime = !Number.isFinite(status.daysLeft);
  const expiringSoon = status.expiringSoon;

  const Icon = isLifetime ? InfinityIcon : expiringSoon ? AlertTriangle : Crown;
  const label = isLifetime
    ? "Vitalício"
    : expiringSoon
    ? `Expira em ${status.daysLeft}d`
    : `Ativo · ${status.daysLeft}d restantes`;

  const formattedDate = status.expiresAt
    ? new Date(status.expiresAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <Badge
      variant="outline"
      title={formattedDate ? `Renova/expira em ${formattedDate}` : "Acesso vitalício"}
      className={cn(
        "gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border-2 transition-colors",
        isLifetime && "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
        expiringSoon && !isLifetime && "border-orange-500/50 bg-orange-500/10 text-orange-300 animate-pulse",
        !expiringSoon && !isLifetime && "border-green-500/40 bg-green-500/10 text-green-300",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {variant === "full" ? label : isLifetime ? "∞" : `${status.daysLeft}d`}
      {variant === "full" && !isLifetime && (
        <Clock className="h-3 w-3 opacity-60 ml-0.5" />
      )}
    </Badge>
  );
}
