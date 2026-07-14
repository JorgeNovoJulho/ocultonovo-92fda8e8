import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminCardSkeletonProps {
  /** Tailwind height classes, ex: "h-32", "h-[220px]". */
  className?: string;
  /** Mensagem opcional sobreposta ao skeleton. */
  label?: string;
  /** Mostra ícone de loader ao centro. */
  showSpinner?: boolean;
}

/**
 * Skeleton premium para cards do AdminDashboard.
 * Apresenta cabeçalho + linhas para reduzir sensação de travamento
 * enquanto componentes lazy carregam.
 */
export function AdminCardSkeleton({
  className,
  label,
  showSpinner = false,
}: AdminCardSkeletonProps) {
  return (
    <Card
      className={cn(
        "bg-card border-border/50 overflow-hidden relative",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="p-4 space-y-3 h-full">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2 w-1/2" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-11/12" />
          <Skeleton className="h-2 w-4/5" />
        </div>
      </div>
      {showSpinner && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        </div>
      )}
      {label && (
        <div className="absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {label}
        </div>
      )}
    </Card>
  );
}
