import { memo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Ghost, CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { useAddonConfig } from "@/hooks/useAddonConfig";
import { useActivateGhostMode } from "@/hooks/useGhostMode";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GhostModeCheckoutModal = memo(function GhostModeCheckoutModal({ open, onOpenChange }: Props) {
  const { data: config, isLoading } = useAddonConfig("ghost_mode");
  const activateGhost = useActivateGhostMode();
  const { toast } = useToast();
  const lockRef = useRef(false);
  const [step, setStep] = useState<"offer" | "processing" | "success">("offer");

  const price = config?.price_monthly ?? 9.9;

  const handlePurchase = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    setStep("processing");

    try {
      await activateGhost.mutateAsync();
      setStep("success");
      setTimeout(() => {
        onOpenChange(false);
        setStep("offer");
        lockRef.current = false;
      }, 1500);
    } catch {
      toast({
        title: "Erro no pagamento",
        description: "Tente novamente. Seus dados estão seguros.",
        variant: "destructive",
      });
      setStep("offer");
      lockRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (step !== "processing") onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Ghost className="h-5 w-5 text-primary" />
            Modo Fantasma
          </DialogTitle>
          <DialogDescription>
            Navegue de forma invisível na plataforma
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-32 mx-auto" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : step === "success" ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
            <p className="text-lg font-semibold text-foreground">Desbloqueado!</p>
            <p className="text-sm text-muted-foreground">Modo Fantasma ativado</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">
                R$ {price.toFixed(2).replace(".", ",")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Pagamento único</p>
            </div>

            <ul className="text-sm text-muted-foreground space-y-1.5 px-2">
              <li className="flex items-center gap-2">
                <Ghost className="h-3.5 w-3.5 text-primary shrink-0" />
                Invisível na lista de visitantes
              </li>
              <li className="flex items-center gap-2">
                <Ghost className="h-3.5 w-3.5 text-primary shrink-0" />
                Criadores não são notificados
              </li>
              <li className="flex items-center gap-2">
                <Ghost className="h-3.5 w-3.5 text-primary shrink-0" />
                Ative e desative quando quiser
              </li>
            </ul>

            <Button
              onClick={handlePurchase}
              disabled={step === "processing"}
              className="w-full bg-primary text-primary-foreground"
            >
              {step === "processing" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pagar R$ {price.toFixed(2).replace(".", ",")}
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
