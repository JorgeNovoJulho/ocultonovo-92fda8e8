import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActivePromotions, Promotion } from "@/hooks/usePromotions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gift, Percent, Users, Crown, Sparkles, Loader2, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PromotionDetailModal } from "./PromotionDetailModal";
import { useProfile } from "@/hooks/useProfile";
import { useIsAdmin } from "@/hooks/useUserRoles";
import { useNavigate } from "react-router-dom";

const typeConfig: Record<Promotion["type"], { label: string; icon: typeof Gift; color: string }> = {
  referral: { label: "Indicação", icon: Users, color: "text-blue-400" },
  cashback: { label: "Cashback", icon: Percent, color: "text-emerald-400" },
  bonus_plan: { label: "Bônus Plano", icon: Crown, color: "text-[hsl(45,93%,47%)]" },
  creator_commission: { label: "Comissão", icon: Sparkles, color: "text-purple-400" },
  custom: { label: "Especial", icon: Gift, color: "text-pink-400" },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function getPromoLockInfo(
  p: Promotion,
  planType: string,
  isAdmin: boolean
): { locked: boolean; lockMessage: string } {
  if (isAdmin) return { locked: false, lockMessage: "" };

  const title = p.title.toLowerCase();
  const isMadrinhaPromo = title.includes("madrinha") || p.type === "creator_commission";
  const isFundadorPromo = title.includes("fundador") || title.includes("50%") || p.type === "bonus_plan";

  if (planType === "free" || planType === "premium" || planType === "monthly") {
    if (isMadrinhaPromo) return { locked: true, lockMessage: "Exclusivo para VIP — Fazer upgrade" };
    if (isFundadorPromo) return { locked: true, lockMessage: "Exclusivo para VIP — Fazer upgrade" };
  }

  if (planType === "vip") {
    if (isFundadorPromo) return { locked: true, lockMessage: "Exclusivo para Administradores" };
  }

  return { locked: false, lockMessage: "" };
}

export function PromotionsModal({ open, onOpenChange }: Props) {
  const { data: promotions, isLoading } = useActivePromotions();
  const [selectedPromo, setSelectedPromo] = useState<Promotion | null>(null);
  const { profile } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const planType = profile?.plan_type || 'free';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Promoções Ativas
            </DialogTitle>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto space-y-3 pr-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !promotions?.length ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhuma promoção ativa no momento.
              </div>
            ) : (
              promotions.map((p) => {
                const cfg = typeConfig[p.type];
                const Icon = cfg.icon;
                const { locked, lockMessage } = getPromoLockInfo(p, planType, !!isAdmin);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (locked) {
                        if (lockMessage.includes("Administradores")) return; // admin-only, no redirect
                        onOpenChange(false);
                        navigate('/checkout');
                        return;
                      }
                      setSelectedPromo(p);
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-primary/30 transition-all space-y-2 cursor-pointer group relative",
                      locked && "opacity-70"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5", cfg.color)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-foreground truncate">{p.title}</h3>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                            {cfg.label}
                          </Badge>
                        </div>
                        {locked ? (
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-500 font-medium">
                            <Lock className="h-3.5 w-3.5" />
                            {lockMessage}
                          </div>
                        ) : (
                          <>
                            {p.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                            )}
                            {p.rules && (
                              <p className="text-[11px] text-muted-foreground/70 mt-1 italic">📋 {p.rules}</p>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.reward_value > 0 && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                            {`${p.reward_value}%`}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PromotionDetailModal
        promotion={selectedPromo}
        open={!!selectedPromo}
        onOpenChange={(v) => { if (!v) setSelectedPromo(null); }}
      />
    </>
  );
}
