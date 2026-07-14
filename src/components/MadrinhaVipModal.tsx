import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

const VIP_MONTHLY_PRICE = 145.90;
const DISCOUNT_PERCENT = 30;
const DISCOUNTED_PRICE = +(VIP_MONTHLY_PRICE * (1 - DISCOUNT_PERCENT / 100)).toFixed(2);

interface MadrinhaVipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  madrinhaName: string;
  referralCode: string;
}

const VIP_BENEFITS = [
  "Criar e vender conteúdo exclusivo",
  "Saques via PIX ilimitados",
  "Mensagens ilimitadas",
  "Radar de descoberta prioritário",
  "Leilões e álbuns cronometrados",
  "Badge VIP verificado",
];

export function MadrinhaVipModal({ open, onOpenChange, madrinhaName, referralCode }: MadrinhaVipModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = () => {
    setLoading(true);
    // Navigate to checkout with madrinha discount params
    navigate(`/checkout?plan=monthly&amount=${DISCOUNTED_PRICE}&discount=madrinha&ref=${referralCode}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border/50 p-0 overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-yellow-500/20 via-pink-500/20 to-purple-500/20 p-6 pb-4">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3 p-3 rounded-full bg-yellow-500/20 w-fit">
              <Crown className="h-8 w-8 text-yellow-400" />
            </div>
            <DialogTitle className="text-xl font-bold">
              Plano VIP — Indicação Exclusiva
            </DialogTitle>
            <DialogDescription className="text-sm">
              Indicado(a) por <span className="text-pink-400 font-semibold">{madrinhaName}</span>
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 pt-4 space-y-5">
          {/* Pricing */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span className="text-muted-foreground line-through text-lg">
                R$ {VIP_MONTHLY_PRICE.toFixed(2).replace('.', ',')}
              </span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                -{DISCOUNT_PERCENT}%
              </Badge>
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-bold text-foreground">
                R$ {DISCOUNTED_PRICE.toFixed(2).replace('.', ',')}
              </span>
              <span className="text-muted-foreground text-sm">/mês</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Primeiro mês com desconto exclusivo
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-2.5">
            {VIP_BENEFITS.map((benefit, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                <span className="text-sm text-foreground/90">{benefit}</span>
              </div>
            ))}
          </div>

          {/* Info */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-pink-400" />
              A comissão da indicação aplica-se apenas sobre conteúdos vendidos
            </p>
          </div>

          {/* CTA */}
          <Button
            className="w-full bg-gradient-to-r from-yellow-500 to-pink-500 hover:from-yellow-600 hover:to-pink-600 text-white font-semibold h-12 text-base"
            onClick={handleSubscribe}
            disabled={loading}
          >
            {loading ? "Redirecionando..." : (
              <>
                <Crown className="h-5 w-5 mr-2" />
                Assinar VIP com 30% OFF
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground text-center">
            Assinatura mínima de 1 mês. Cancele quando quiser.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
