import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Promotion } from "@/hooks/usePromotions";
import { usePromotionTracking } from "@/hooks/usePromotionTracking";
import { useCreatorReferralCode } from "@/hooks/useCreatorReferrals";
import { toast } from "sonner";
import {
  Gift, Percent, Users, Crown, Sparkles,
  Copy, Check, Share2,
  Shield, Calendar, Award, LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const typeConfig: Record<Promotion["type"], { label: string; icon: typeof Gift; color: string }> = {
  referral: { label: "Indicação", icon: Users, color: "text-blue-400" },
  cashback: { label: "Cashback", icon: Percent, color: "text-emerald-400" },
  bonus_plan: { label: "Bônus Plano", icon: Crown, color: "text-[hsl(45,93%,47%)]" },
  creator_commission: { label: "Comissão", icon: Sparkles, color: "text-purple-400" },
  custom: { label: "Especial", icon: Gift, color: "text-pink-400" },
};

interface Props {
  promotion: Promotion | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type PromotionShareConfig = {
  promoKey: string;
  generatorLabel: string;
  helperText: string;
};

function getPromotionShareConfig(promotion: Promotion): PromotionShareConfig {
  const title = promotion.title.toLowerCase();

  if (title.includes("madrinha") || promotion.type === "creator_commission") {
    return {
      promoKey: "programa-madrinhas",
      generatorLabel: "Gerar link: Programa Madrinhas",
      helperText:
        "Este link apresenta o convite para virar criador(a) VIP, com mais alcance e colaboração de 5% do faturamento mensal por 12 meses.",
    };
  }

  if (title.includes("fundador") || title.includes("50%") || promotion.type === "bonus_plan") {
    return {
      promoKey: "fundador-vip-50off",
      generatorLabel: "Gerar link: Fundador VIP 50% OFF",
      helperText:
        "Este link apresenta a oferta Fundador VIP com 50% OFF para os 100 primeiros criadores no plano anual VIP.",
    };
  }

  if (title.includes("indique") || title.includes("ganhe") || promotion.type === "referral") {
    return {
      promoKey: "indique-ganhe-creditos",
      generatorLabel: "Gerar link: Indique e Ganhe Créditos",
      helperText:
        "Este link mostra o convite para conhecer a OCULTO, descobrir os segredos mais quentes e compartilhar desejos mais ocultos.",
    };
  }

  return {
    promoKey: "promocao-especial",
    generatorLabel: "Gerar Meu Link de Indicação",
    helperText: "Compartilhe e convide pessoas para conhecer a plataforma OCULTO.",
  };
}

export function PromotionDetailModal({ promotion, open, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);

  const { track } = usePromotionTracking();
  const { code: referralCode, isLoading: codeLoading, generateCode, isGenerating } = useCreatorReferralCode();

  if (!promotion) return null;

  const cfg = typeConfig[promotion.type];
  const Icon = cfg.icon;
  const shareConfig = getPromotionShareConfig(promotion);

  const shareUrl = referralCode
    ? `${window.location.origin}/share/${referralCode}?promo=${shareConfig.promoKey}`
    : null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      track(promotion.id, "conversion");
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar link");
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] p-0 overflow-hidden [&>button]:z-20"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
        <style>{`.promo-detail-scroll::-webkit-scrollbar { display: none; }`}</style>
        {/* Header with gradient */}
        <div className="relative p-6 pb-4 bg-gradient-to-br from-primary/15 via-background to-background">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn("p-2.5 rounded-xl bg-card border border-border/50", cfg.color)}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-bold text-foreground leading-tight">
                  {promotion.title}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                    {cfg.label}
                  </Badge>
                  {promotion.reward_value > 0 && (
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                      {promotion.type === "cashback" ? `${promotion.reward_value}%` : `R$${promotion.reward_value}`}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="promo-detail-scroll px-6 pb-6 space-y-5 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
          {/* Description */}
          {promotion.description && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5" /> Sobre
              </h4>
              <p className="text-sm text-foreground/90 leading-relaxed">
                Torne-se um embaixador(a) e ganhe 5% de comissão sobre o valor da primeira assinatura de cada indicado (mensal ou anual).
              </p>
            </div>
          )}

          {/* Rules */}
          {promotion.rules && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Regras
              </h4>
              <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  📋 {promotion.rules}
                </p>
              </div>
            </div>
          )}

          {/* Dates */}
          {(promotion.start_date || promotion.end_date) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {promotion.start_date && (
                <span>De {new Date(promotion.start_date).toLocaleDateString("pt-BR")}</span>
              )}
              {promotion.end_date && (
                <span>até {new Date(promotion.end_date).toLocaleDateString("pt-BR")}</span>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Share Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Share2 className="h-3.5 w-3.5" /> Seu link exclusivo
            </h4>

            {shareUrl ? (
                <div className="flex gap-2">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="bg-muted text-xs flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

            ) : (
              <Button
                onClick={() => generateCode()}
                disabled={isGenerating || codeLoading}
                className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground gap-2"
              >
                <LinkIcon className="h-4 w-4" />
                {isGenerating ? 'Gerando...' : shareConfig.generatorLabel}
              </Button>
            )}

            <p className="text-[11px] text-muted-foreground/70 text-center leading-relaxed">
              {shareConfig.helperText}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
