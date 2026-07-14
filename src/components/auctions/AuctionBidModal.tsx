import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Gavel, AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { Auction, usePlaceBid, useBidderCard, useVerifyCard } from "@/hooks/useAuctions";
import { AuctionTimer } from "./AuctionTimer";
import { cn } from "@/lib/utils";
import { useBetaGuard } from "@/hooks/useBetaGuard";

interface AuctionBidModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auction: Auction;
}

export function AuctionBidModal({ open, onOpenChange, auction }: AuctionBidModalProps) {
  const [step, setStep] = useState<"card" | "bid">("bid");
  const [bidAmount, setBidAmount] = useState("");
  const [cardData, setCardData] = useState({
    card_number: "",
    card_exp_month: "",
    card_exp_year: "",
    card_cvc: "",
  });

  const { data: bidderCard, isLoading: loadingCard } = useBidderCard();
  const placeBid = usePlaceBid();
  const verifyCard = useVerifyCard();
  const { isLocked: betaLocked, lockedLabel: betaLockedLabel } = useBetaGuard('monetization');

  const minBid = auction.current_bid > 0 
    ? auction.current_bid + auction.min_increment 
    : auction.starting_price;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleBid = async () => {
    const amount = parseFloat(bidAmount.replace(",", "."));
    
    if (isNaN(amount) || amount < minBid) {
      return;
    }

    try {
      await placeBid.mutateAsync({ auctionId: auction.id, amount });
      onOpenChange(false);
      setBidAmount("");
    } catch (error: any) {
      if (error.message === "REQUIRES_CARD") {
        setStep("card");
      }
    }
  };

  const handleVerifyCard = async () => {
    try {
      await verifyCard.mutateAsync(cardData);
      setStep("bid");
      setCardData({
        card_number: "",
        card_exp_month: "",
        card_exp_year: "",
        card_cvc: "",
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const chunks = [];
    for (let i = 0; i < cleaned.length && i < 16; i += 4) {
      chunks.push(cleaned.slice(i, i + 4));
    }
    return chunks.join(" ");
  };

  const isValidBid = () => {
    const amount = parseFloat(bidAmount.replace(",", "."));
    return !isNaN(amount) && amount >= minBid;
  };

  const quickBids = [
    minBid,
    minBid + auction.min_increment,
    minBid + auction.min_increment * 2,
    minBid + auction.min_increment * 5,
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            {step === "card" ? "Verificar Cartão" : "Dar Lance"}
          </DialogTitle>
          <DialogDescription>
            {step === "card" 
              ? "Para participar de leilões, você precisa ter um cartão válido cadastrado."
              : `Leilão: ${auction.title}`
            }
          </DialogDescription>
        </DialogHeader>

        {betaLocked && (
          <div className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">{betaLockedLabel}</div>
              <div className="text-amber-200/80">
                Leilões com cobrança real voltam no lançamento oficial. Durante o Beta, nenhum lance é cobrado.
              </div>
            </div>
          </div>
        )}

        {step === "card" ? (
          // Card verification step
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">Cartão obrigatório</p>
                <p className="text-muted-foreground">
                  Faremos uma pré-autorização de R$ 1,00 para validar seu cartão. 
                  Este valor NÃO será cobrado.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Número do Cartão</Label>
                <Input
                  placeholder="0000 0000 0000 0000"
                  value={formatCardNumber(cardData.card_number)}
                  onChange={(e) => 
                    setCardData({
                      ...cardData,
                      card_number: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  maxLength={19}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Mês</Label>
                  <Input
                    placeholder="MM"
                    value={cardData.card_exp_month}
                    onChange={(e) => 
                      setCardData({
                        ...cardData,
                        card_exp_month: e.target.value.replace(/\D/g, "").slice(0, 2),
                      })
                    }
                    maxLength={2}
                  />
                </div>
                <div>
                  <Label>Ano</Label>
                  <Input
                    placeholder="AA"
                    value={cardData.card_exp_year}
                    onChange={(e) => 
                      setCardData({
                        ...cardData,
                        card_exp_year: e.target.value.replace(/\D/g, "").slice(0, 2),
                      })
                    }
                    maxLength={2}
                  />
                </div>
                <div>
                  <Label>CVV</Label>
                  <Input
                    placeholder="123"
                    type="password"
                    value={cardData.card_cvc}
                    onChange={(e) => 
                      setCardData({
                        ...cardData,
                        card_cvc: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                    maxLength={4}
                  />
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleVerifyCard}
              disabled={
                verifyCard.isPending ||
                cardData.card_number.length < 13 ||
                cardData.card_exp_month.length < 2 ||
                cardData.card_exp_year.length < 2 ||
                cardData.card_cvc.length < 3
              }
            >
              {verifyCard.isPending ? (
                "Verificando..."
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Verificar Cartão
                </>
              )}
            </Button>
          </div>
        ) : (
          // Bid step
          <div className="space-y-4">
            {/* Card status */}
            {bidderCard ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">
                  Cartão verificado: •••• {bidderCard.card_last_four}
                </span>
              </div>
            ) : !loadingCard && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStep("card")}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Cadastrar Cartão
              </Button>
            )}

            {/* Auction info */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Lance atual:</span>
                <span className="font-bold text-lg">
                  {formatCurrency(auction.current_bid > 0 ? auction.current_bid : auction.starting_price)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tempo restante:</span>
                <AuctionTimer endsAt={auction.ends_at} />
              </div>
            </div>

            <Separator />

            {/* Bid input */}
            <div>
              <Label>Seu Lance (mínimo: {formatCurrency(minBid)})</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  R$
                </span>
                <Input
                  type="text"
                  placeholder={minBid.toFixed(2)}
                  className="pl-10 text-lg font-bold"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value.replace(/[^\d,.]/, ""))}
                />
              </div>
            </div>

            {/* Quick bid buttons */}
            <div className="flex flex-wrap gap-2">
              {quickBids.map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setBidAmount(amount.toFixed(2))}
                  className={cn(
                    parseFloat(bidAmount.replace(",", ".")) === amount && "border-primary"
                  )}
                >
                  {formatCurrency(amount)}
                </Button>
              ))}
            </div>

            <Separator />

            {/* Submit */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleBid}
              disabled={betaLocked || placeBid.isPending || !isValidBid() || !bidderCard}
            >
              {betaLocked ? (
                <><Lock className="h-4 w-4 mr-2" /> {betaLockedLabel}</>
              ) : placeBid.isPending ? (
                "Enviando lance..."
              ) : (
                <>
                  <Gavel className="h-4 w-4 mr-2" />
                  Confirmar Lance de {bidAmount ? formatCurrency(parseFloat(bidAmount.replace(",", "."))) : formatCurrency(minBid)}
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Ao dar um lance, você concorda que será cobrado automaticamente se vencer.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}