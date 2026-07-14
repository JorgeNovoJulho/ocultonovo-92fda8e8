import { Loader2, Sparkles } from "lucide-react";

interface LoginRedirectSkeletonProps {
  /** Mensagem atual do passo do redirecionamento. */
  message?: string;
  /** Etapa atual (1-based) usada apenas para a barra de progresso. */
  step?: number;
  /** Total de etapas estimadas (default 4). */
  totalSteps?: number;
}

/**
 * Skeleton premium exibido em tela cheia enquanto o login conclui
 * o redirecionamento. Mantém o usuário ciente do progresso com
 * uma barra animada e mensagens contextuais, evitando a sensação
 * de "tela travada".
 */
export function LoginRedirectSkeleton({
  message = "Preparando seu acesso...",
  step = 1,
  totalSteps = 4,
}: LoginRedirectSkeletonProps) {
  const pct = Math.min(100, Math.max(8, Math.round((step / totalSteps) * 100)));

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-dvh w-full bg-background flex items-center justify-center px-6"
    >
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-md animate-pulse" />
            <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {message}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Etapa {Math.min(step, totalSteps)} de {totalSteps}
            </p>
          </div>
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Skeleton rows */}
        <div className="mt-8 space-y-3">
          <div className="h-3 w-3/4 rounded bg-muted/40 animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-muted/30 animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-muted/30 animate-pulse" />
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-muted/30 animate-pulse"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>

        <p className="text-center text-[11px] text-muted-foreground/70 mt-8">
          Conexão segura · Privacidade absoluta
        </p>
      </div>
    </div>
  );
}
