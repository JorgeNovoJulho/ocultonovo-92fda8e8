import { Check, X, Crown, Star, User } from "lucide-react";
import { PLAN_FEATURE_CATALOG, PlanTypeKey } from "@/lib/planFeatureCatalog";
import { cn } from "@/lib/utils";

interface PlanPermissionsPreviewProps {
  editingType: PlanTypeKey;
  editingToggles: Record<string, boolean>;
}

const PLAN_META: Record<PlanTypeKey, { label: string; icon: typeof Crown; accent: string; ringClass: string; bg: string }> = {
  free: { label: "Free", icon: User, accent: "text-muted-foreground", ringClass: "ring-border", bg: "bg-muted/20" },
  premium: { label: "Premium", icon: Star, accent: "text-blue-500", ringClass: "ring-blue-500/40", bg: "bg-blue-500/5" },
  vip: { label: "VIP", icon: Crown, accent: "text-amber-500", ringClass: "ring-amber-500/40", bg: "bg-amber-500/5" },
};

/**
 * Pré-visualização lado a lado: 3 cards (Free / Premium / VIP).
 * O card do tipo em edição (editingType) reflete os toggles em tempo real.
 */
export function PlanPermissionsPreview({ editingType, editingToggles }: PlanPermissionsPreviewProps) {
  const types: PlanTypeKey[] = ["free", "premium", "vip"];

  const stateFor = (t: PlanTypeKey, key: string, fallback: boolean): boolean => {
    if (t === editingType && key in editingToggles) return !!editingToggles[key];
    return fallback;
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/40 bg-muted/10 p-3">
      <div>
        <p className="text-xs sm:text-sm font-semibold">Pré-visualização lado a lado</p>
        <p className="text-[11px] text-muted-foreground">
          Compare em tempo real. Editando: <span className="font-medium capitalize">{editingType}</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {types.map((t) => {
          const Meta = PLAN_META[t];
          const Icon = Meta.icon;
          const isEditing = t === editingType;
          let on = 0;
          const features: { label: string; on: boolean; changed: boolean }[] = [];
          for (const def of PLAN_FEATURE_CATALOG) {
            const value = stateFor(t, def.key, def.defaults[t]);
            if (value) on++;
            const changed =
              isEditing &&
              def.key in editingToggles &&
              editingToggles[def.key] !== def.defaults[t];
            features.push({ label: def.label, on: value, changed });
          }
          return (
            <div
              key={t}
              className={cn(
                "rounded-md border border-border/40 p-2 flex flex-col min-h-[180px]",
                Meta.bg,
                isEditing && "ring-2 ring-primary/60"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <Icon className={cn("w-3.5 h-3.5", Meta.accent)} />
                  {Meta.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {on}/{PLAN_FEATURE_CATALOG.length}
                </span>
              </div>
              <ul className="space-y-0.5 text-[11px] flex-1 overflow-y-auto max-h-56 pr-1">
                {features.map((f) => (
                  <li
                    key={f.label}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-1 py-0.5",
                      f.changed && "ring-1 ring-inset ring-primary/40 bg-primary/5"
                    )}
                  >
                    {f.on ? (
                      <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                    ) : (
                      <X className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    )}
                    <span className={cn("truncate", !f.on && "text-muted-foreground line-through/0 opacity-70")}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
