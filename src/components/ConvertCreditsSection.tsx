import { useState } from "react";
import { Coins, ArrowRight, Info, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCredits, useConvertToCredits } from "@/hooks/useCredits";

export function ConvertCreditsSection() {
  const [amount, setAmount] = useState("");
  const { data: creditsData, isLoading } = useCredits();
  const convertMutation = useConvertToCredits();

  const balance = creditsData?.balance || 0;
  const maxConvertible = creditsData?.maxConvertible || 0;
  const creditsBalance = creditsData?.credits?.credits_balance || 0;
  const isFrozen = creditsData?.balanceFrozen || creditsData?.credits?.credits_frozen;

  const inputAmount = parseFloat(amount) || 0;
  const isValidAmount = inputAmount >= 0.50 && inputAmount <= maxConvertible;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleConvert = () => {
    if (!isValidAmount) return;
    convertMutation.mutate(inputAmount, {
      onSuccess: () => {
        setAmount("");
      },
    });
  };

  const handleMaxClick = () => {
    setAmount(maxConvertible.toFixed(2));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[hsl(45,93%,47%)]/20 bg-gradient-to-br from-[hsl(45,93%,47%)]/5 to-background">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)]">
              <Coins className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Converter em Créditos</CardTitle>
              <CardDescription>Use créditos para enviar presentes</CardDescription>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                Converta até 50% do seu saldo em créditos. 
                1 crédito = R$ 1,00. Use créditos para enviar presentes 
                no chat. Valor mínimo: R$ 0,50.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isFrozen && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {creditsData?.balanceFrozen 
                ? `Seu saldo está congelado. Motivo: ${creditsData?.balanceFrozenReason || 'Não informado'}`
                : 'Seus créditos estão congelados.'
              }
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Saldo Disponível</p>
            <p className="text-xl font-bold">{formatCurrency(balance)}</p>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-r from-[hsl(45,93%,47%)]/10 to-[hsl(330,80%,60%)]/10">
            <p className="text-xs text-muted-foreground mb-1">Seus Créditos</p>
            <p className="text-xl font-bold text-[hsl(45,93%,47%)]">{formatCurrency(creditsBalance)}</p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Máximo convertível (50%)</span>
            <button 
              onClick={handleMaxClick}
              className="text-primary hover:underline font-medium"
              disabled={isFrozen}
            >
              {formatCurrency(maxConvertible)}
            </button>
          </div>
          
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                R$
              </span>
              <Input
                type="number"
                min="0.50"
                step="0.01"
                max={maxConvertible}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isFrozen || convertMutation.isPending}
                className="pl-10"
                placeholder="0,00"
              />
            </div>
            <Button
              onClick={handleConvert}
              disabled={!isValidAmount || isFrozen || convertMutation.isPending}
              className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] hover:opacity-90 text-white shrink-0"
            >
              {convertMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Converter
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground mt-2">
            Mínimo: R$ 0,50 • 1 crédito = R$ 1,00
          </p>
        </div>

        {inputAmount > 0 && inputAmount < 0.50 && (
          <p className="text-sm text-destructive">
            O valor mínimo para conversão é R$ 0,50
          </p>
        )}
        {inputAmount > maxConvertible && (
          <p className="text-sm text-destructive">
            Você pode converter no máximo {formatCurrency(maxConvertible)} (50% do saldo)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
