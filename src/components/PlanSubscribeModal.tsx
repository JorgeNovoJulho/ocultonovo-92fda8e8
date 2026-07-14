import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard,
  Calendar,
  Infinity,
  CheckCircle2,
  Crown,
  ArrowRight,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanPaymentModal } from "./PlanPaymentModal";
import { getHandleInitial, getPublicHandle } from "@/lib/userHandle";
import { mockChannelSubsStore } from "@/lib/mockChannelSubscriptions";

export interface PlanWithCreator {
  id: string;
  profile_id: string;
  title: string;
  bio: string | null;
  banner_url: string | null;
  monthly_price: number;
  annual_price: number | null;
  lifetime_price: number | null;
  is_enabled: boolean;
  sort_order: number;
  creator: {
    id: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

type BillingCycle = "monthly" | "annual" | "lifetime";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PlanWithCreator | null;
  affiliateIdFromLink?: string | null;
  affiliateUsernameFromLink?: string | null;
}

export function PlanSubscribeModal({ open, onOpenChange, plan, affiliateIdFromLink = null, affiliateUsernameFromLink = null }: Props) {
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>("monthly");
  const [showPayment, setShowPayment] = useState(false);

  if (!plan) return null;

  const cycles: { key: BillingCycle; label: string; price: number | null; icon: any; color: string; badge?: string }[] = [
    {
      key: "monthly",
      label: "Mensal",
      price: plan.monthly_price,
      icon: CreditCard,
      color: "text-[hsl(45,93%,47%)]",
      badge: "Mais popular",
    },
    ...(plan.annual_price
      ? [{
          key: "annual" as BillingCycle,
          label: "Anual",
          price: plan.annual_price,
          icon: Calendar,
          color: "text-green-400",
          badge: "Economia de até 30%",
        }]
      : []),
    ...(plan.lifetime_price
      ? [{
          key: "lifetime" as BillingCycle,
          label: "Vitalício",
          price: plan.lifetime_price,
          icon: Infinity,
          color: "text-yellow-400",
          badge: "Acesso para sempre",
        }]
      : []),
  ];

  const selectedOption = cycles.find((c) => c.key === selectedCycle) ?? cycles[0];
  const selectedPrice = selectedOption?.price ?? plan.monthly_price;

  const bannerStyle = plan.banner_url
    ? { backgroundImage: `url(${plan.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(135deg, hsl(var(--primary)/0.4), hsl(var(--secondary)/0.4))" };

  const handlePay = () => {
    setShowPayment(true);
  };

  const handlePaymentSuccess = () => {
    // Mock: registra a assinatura localmente para liberar todo o conteúdo VIP
    // imediatamente, calcular validade e habilitar histórico no perfil.
    try {
      mockChannelSubsStore.upsert({
        creatorProfileId: plan.profile_id,
        creatorUserId: plan.creator?.id ?? null,
        channelName: plan.title,
        channelUsername: plan.creator?.username ?? null,
        channelAvatar: plan.creator?.avatar_url ?? null,
        planTitle: plan.title,
        cycle: selectedCycle,
        price: selectedPrice,
      });
    } catch {
      /* ignore */
    }
    setShowPayment(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open && !showPayment} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-md p-0 gap-0 bg-card border-border overflow-hidden flex flex-col max-h-[90dvh]">
          {/* Banner + Creator Info — fixed header */}
          <div className="h-32 relative flex-shrink-0" style={bannerStyle}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

            <div className="absolute bottom-3 left-4 right-10 z-10 flex items-end gap-3">
              <Avatar className="h-12 w-12 ring-2 ring-white/80 shadow-lg flex-shrink-0">
                <AvatarImage src={plan.creator.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-base">
                  {getHandleInitial(plan.creator)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-tight drop-shadow truncate">
                  {plan.title}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-white/80 text-xs drop-shadow truncate">
                    {getPublicHandle(plan.creator)}
                  </p>
                  {plan.creator.is_verified && (
                    <CheckCircle2 className="h-3 w-3 text-primary fill-primary/30 flex-shrink-0" />
                  )}
                  <Badge className="text-[10px] px-1.5 py-0 bg-yellow-500/20 text-yellow-300 border-yellow-500/30 ml-1 flex-shrink-0">
                    VIP
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-4"
            style={{ scrollbarWidth: "none" }}
          >
            <style>{`.plan-subscribe-scroll::-webkit-scrollbar{display:none}`}</style>

            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Crown className="h-4 w-4 text-[hsl(45,93%,47%)] flex-shrink-0" />
                Assinar Plano
              </DialogTitle>
              {plan.bio && (
                <DialogDescription className="text-xs text-muted-foreground">
                  {plan.bio}
                </DialogDescription>
              )}
            </DialogHeader>

            {/* Billing cycle selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Escolha o período:</p>
              <div className="flex flex-col gap-2">
                {cycles.map(({ key, label, price, icon: Icon, color, badge }) => {
                  if (price === null) return null;
                  const isSelected = selectedCycle === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedCycle(key)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-left",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border/40 bg-muted/20 hover:border-border hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "p-1.5 rounded-lg flex-shrink-0",
                          isSelected ? "bg-primary/20" : "bg-muted/50"
                        )}>
                          <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : color)} />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-foreground">{label}</p>
                          {badge && (
                            <p className="text-xs text-muted-foreground">{badge}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className={cn(
                          "font-bold text-sm",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {formatCurrency(price)}
                        </span>
                        {key === "annual" && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatCurrency(price / 12)}/mês
                          </span>
                        )}
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground fill-current" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator className="opacity-40" />

            {/* Summary */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-xs text-muted-foreground">Total a pagar</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(selectedPrice)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Período</p>
                <p className="text-sm font-semibold text-foreground capitalize">
                  {selectedOption?.label}
                </p>
              </div>
            </div>
          </div>

          {/* Fixed footer */}
          <div className="flex-shrink-0 px-4 pb-4 pt-2 space-y-2 border-t border-border/20 bg-card">
            <Button
              onClick={handlePay}
              className="w-full h-11 bg-gradient-to-r from-primary to-secondary hover:opacity-90 font-bold text-sm gap-2"
            >
              <Star className="h-4 w-4" />
              Pagar {formatCurrency(selectedPrice)}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Pagamento seguro via PIX. Acesso liberado imediatamente após confirmação.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <PlanPaymentModal
        open={showPayment}
        onOpenChange={setShowPayment}
        plan={plan}
        billingCycle={selectedCycle}
        amount={selectedPrice}
        onSuccess={handlePaymentSuccess}
        affiliateIdFromLink={affiliateIdFromLink}
        affiliateUsernameFromLink={affiliateUsernameFromLink}
      />
    </>
  );
}
