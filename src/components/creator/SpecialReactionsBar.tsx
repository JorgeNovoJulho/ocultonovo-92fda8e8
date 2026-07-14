import { cn } from "@/lib/utils";
import { SPECIAL_REACTIONS, useSpecialReactions } from "@/hooks/useSpecialReactions";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";

interface Props {
  postId: string;
  className?: string;
  compact?: boolean;
}

/**
 * Barra de reações especiais VIP (🔥 💎 👑 ✨).
 * Gated por platform_runtime_settings.vip_special_reactions_enabled.
 */
export function SpecialReactionsBar({ postId, className, compact = false }: Props) {
  const { runtime } = usePlatformPhase();
  const enabled = runtime?.vip_special_reactions_enabled !== false;
  const { rows, toggle, isToggling } = useSpecialReactions(enabled ? postId : null);

  if (!enabled) return null;

  const byKey = new Map(rows.map((r) => [r.reaction, r]));

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2",
        className
      )}
      aria-label="Reações especiais"
    >
      {!compact && (
        <span className="text-[10px] uppercase tracking-widest text-amber-400/80 mr-1">
          Reagir
        </span>
      )}
      {SPECIAL_REACTIONS.map((r) => {
        const row = byKey.get(r.key);
        const mine = !!row?.mine;
        const total = row?.total ?? 0;
        return (
          <button
            key={r.key}
            type="button"
            disabled={isToggling}
            onClick={() => toggle(r.key)}
            aria-pressed={mine}
            aria-label={`${r.label} (${total})`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition active:scale-95",
              mine
                ? "border-amber-400/70 bg-amber-400/15 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]"
                : "border-border/60 bg-background/60 text-foreground/80 hover:border-amber-400/40 hover:text-amber-200"
            )}
          >
            <span className="text-base leading-none">{r.emoji}</span>
            {total > 0 && (
              <span className="tabular-nums text-[11px] font-semibold">{total}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
