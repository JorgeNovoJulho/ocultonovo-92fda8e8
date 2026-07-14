/**
 * AdErrorAlert — exibe AdStructuredError com código, mensagem e ações.
 */
import { AlertCircle, X, RotateCcw, WifiOff, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type AdStructuredError,
  type AdErrorAction,
  actionLabel,
} from "@/lib/adErrors";

interface Props {
  error: AdStructuredError | null;
  onAction?: (a: AdErrorAction) => void;
  onDismiss?: () => void;
  className?: string;
  compact?: boolean;
}

const ICON: Record<AdErrorAction, any> = {
  retry: RotateCcw,
  cancel: X,
  check_connection: WifiOff,
  change_query: Search,
  contact_support: MessageCircle,
};

export function AdErrorAlert({ error, onAction, onDismiss, className, compact }: Props) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive",
        compact ? "px-2 py-1.5 text-[11px]" : "p-3 text-xs",
        className,
      )}
    >
      <AlertCircle className={cn("shrink-0 mt-0.5", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold">{error.title}</span>
          <code className="text-[9px] bg-destructive/20 px-1 py-0.5 rounded font-mono opacity-80">
            {error.code}
          </code>
        </div>
        <p className="opacity-90 leading-snug">{error.message}</p>
        {error.actions.length > 0 && onAction && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {error.actions.map((a) => {
              const Icon = ICON[a];
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => onAction(a)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors",
                    "border-destructive/40 hover:bg-destructive/20",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {actionLabel(a)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-destructive/70 hover:text-destructive shrink-0"
          aria-label="Fechar"
        >
          <X className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      )}
    </div>
  );
}
