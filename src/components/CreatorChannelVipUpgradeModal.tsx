import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Crown, Check, ArrowRight, Sparkles, Tv2, DollarSign, Wallet,
  Users, MessageSquare, Star, Calendar, BarChart3, ShieldCheck, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBetaGuard } from "@/hooks/useBetaGuard";
import { BetaMonetizationBanner } from "@/components/beta/BetaMonetizationBanner";

const VIP_MONTHLY = 145.90;
const VIP_ANNUAL = 1399.90;

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const VIP_BENEFITS: { icon: any; label: string; highlight?: boolean }[] = [
  { icon: Tv2, label: "Crie seu Canal VIP com capa, banner e trailer", highlight: true },
  { icon: DollarSign, label: "Defina preços mensal, anual e vitalício do seu canal" },
  { icon: Wallet, label: "Receba assinaturas recorrentes diretamente na sua carteira" },
  { icon: Sparkles, label: "Publique conteúdo exclusivo (vídeos, fotos e áudios)" },
  { icon: ShieldCheck, label: "Venda conteúdo avulso (PPV) com preço por item" },
  { icon: Users, label: "Acesso a Eventos VIP e grupo de criadores" },
  { icon: MessageSquare, label: "Mensagens ilimitadas e mídia exclusiva no chat" },
  { icon: Star, label: "Selo VIP dourado e prioridade no algoritmo do feed" },
  { icon: BarChart3, label: "Dashboard de fãs, ranking de assinantes e analytics" },
  { icon: Calendar, label: "Agendamento de posts e broadcasts em massa" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreatorChannelVipUpgradeModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const { isLocked: betaLocked, lockedLabel, guard } = useBetaGuard('subscriptions');

  const amount = cycle === "monthly" ? VIP_MONTHLY : VIP_ANNUAL;
  const annualPerMonth = VIP_ANNUAL / 12;
  const annualSavings = VIP_MONTHLY * 12 - VIP_ANNUAL;
  const savingsPct = Math.round((annualSavings / (VIP_MONTHLY * 12)) * 100);

  const handleUpgrade = () => {
    guard(() => {
      onOpenChange(false);
      const url = `/checkout?plan=${cycle}&amount=${amount.toFixed(2)}&tier=VIP&original=${(cycle === "monthly" ? VIP_MONTHLY : VIP_MONTHLY * 12).toFixed(2)}`;
      navigate(url);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 bg-card border-[hsl(45,93%,47%)]/30 overflow-hidden flex flex-col",
          "w-screen h-[100dvh] max-w-none rounded-none",
          "sm:w-[95vw] sm:max-w-lg sm:h-auto sm:max-h-[92dvh] sm:rounded-xl",
        )}
      >
        {/* Header */}
        <div className="relative flex-shrink-0 px-5 pt-5 pb-3 bg-gradient-to-br from-[hsl(45,93%,47%)]/15 via-primary/5 to-transparent border-b border-border/40">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-lg bg-[hsl(45,93%,47%)]/20 flex items-center justify-center">
                <Crown className="h-5 w-5 text-[hsl(45,93%,55%)]" />
              </div>
              <Badge className="bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)] gap-1 text-[10px]">
                Plano VIP
              </Badge>
            </div>
            <DialogTitle className="text-lg sm:text-xl font-extrabold leading-tight">
              Crie seu Canal de Conteúdo VIP
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              O Canal VIP é exclusivo para assinantes do plano <strong>VIP</strong>.
              Faça upgrade e libere todas as ferramentas de monetização.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scroll body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4"
          style={{ scrollbarWidth: "none" }}
        >
          <BetaMonetizationBanner feature="subscriptions" />
          {/* Cycle toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={cn(
                "rounded-lg border-2 p-3 text-left transition-colors",
                cycle === "monthly"
                  ? "border-primary bg-primary/10"
                  : "border-border/40 bg-muted/20 hover:border-border",
              )}
            >
              <p className="text-[11px] text-muted-foreground">Mensal</p>
              <p className="text-base font-extrabold text-foreground">
                {formatBRL(VIP_MONTHLY)}
                <span className="text-[10px] text-muted-foreground font-normal">/mês</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => setCycle("annual")}
              className={cn(
                "relative rounded-lg border-2 p-3 text-left transition-colors",
                cycle === "annual"
                  ? "border-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10"
                  : "border-border/40 bg-muted/20 hover:border-border",
              )}
            >
              <Badge className="absolute -top-2 right-2 bg-[hsl(142,76%,36%)] text-white text-[9px] px-1.5 py-0">
                {savingsPct}% OFF
              </Badge>
              <p className="text-[11px] text-muted-foreground">Anual</p>
              <p className="text-base font-extrabold text-foreground">
                {formatBRL(annualPerMonth)}
                <span className="text-[10px] text-muted-foreground font-normal">/mês</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                Total {formatBRL(VIP_ANNUAL)}
              </p>
            </button>
          </div>

          {/* Benefits */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">
              O que você libera com o VIP:
            </p>
            <ul className="space-y-1.5">
              {VIP_BENEFITS.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <div className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                    b.highlight ? "bg-[hsl(45,93%,47%)]/25" : "bg-primary/15",
                  )}>
                    <Check className={cn(
                      "h-3 w-3",
                      b.highlight ? "text-[hsl(45,93%,55%)]" : "text-primary",
                    )} />
                  </div>
                  <span className={cn(
                    "leading-snug",
                    b.highlight ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}>
                    {b.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[10px] text-muted-foreground leading-snug">
            Pagamento seguro via PIX ou cartão. Após confirmação, seu plano é atualizado
            automaticamente para VIP e o Canal de Conteúdo fica disponível na hora.
          </p>
        </div>

        {/* Footer CTAs */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-border/40 bg-card space-y-2">
          <Button
            onClick={handleUpgrade}
            disabled={betaLocked}
            className="w-full h-11 bg-gradient-to-r from-[hsl(45,93%,47%)] to-primary hover:opacity-90 font-bold text-sm gap-2 disabled:opacity-60"
          >
            {betaLocked ? <Lock className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
            {betaLocked ? lockedLabel : <>Fazer Upgrade — {formatBRL(amount)}</>}
            {!betaLocked && <ArrowRight className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full text-xs text-muted-foreground"
          >
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
