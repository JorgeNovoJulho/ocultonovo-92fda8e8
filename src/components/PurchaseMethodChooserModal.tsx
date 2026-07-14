import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, CreditCard, Zap, ShieldCheck } from "lucide-react";

export type PurchaseMethod = "pix" | "card";

interface PurchaseMethodChooserModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  price: number;
  itemName?: string;
  onChoose: (method: PurchaseMethod) => void;
}

/**
 * Modal padrão de escolha de método (PIX vs Cartão) antes do checkout real.
 * Padronizado com gradiente dourado e efeitos sutis.
 */
export function PurchaseMethodChooserModal({
  open,
  onOpenChange,
  price,
  itemName,
  onChoose,
}: PurchaseMethodChooserModalProps) {
  const formatted = price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const pick = (method: PurchaseMethod) => {
    onChoose(method);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[hsl(45,93%,47%)]" />
            Como você prefere pagar?
          </DialogTitle>
          <DialogDescription>
            {itemName ? <>Compra: <strong>{itemName}</strong> · </> : null}
            Total <strong className="text-[hsl(45,93%,55%)]">{formatted}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => pick("pix")}
            className="group relative rounded-xl border border-[hsl(45,93%,47%)]/30 bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-transparent p-4 text-left transition-all hover:border-[hsl(45,93%,47%)] hover:shadow-[0_0_25px_hsl(45,93%,47%,0.25)] hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="h-10 w-10 rounded-lg bg-[hsl(45,93%,47%)]/15 flex items-center justify-center">
                <QrCode className="h-5 w-5 text-[hsl(45,93%,55%)]" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Instantâneo
              </span>
            </div>
            <p className="font-semibold text-sm">PIX</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">QR Code · liberação automática após pagamento</p>
          </button>

          <button
            type="button"
            onClick={() => pick("card")}
            className="group relative rounded-xl border border-[hsl(45,93%,47%)]/30 bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-transparent p-4 text-left transition-all hover:border-[hsl(45,93%,47%)] hover:shadow-[0_0_25px_hsl(45,93%,47%,0.25)] hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="h-10 w-10 rounded-lg bg-[hsl(45,93%,47%)]/15 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-[hsl(45,93%,55%)]" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">Visa · Master</span>
            </div>
            <p className="font-semibold text-sm">Cartão de crédito</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Aprovação imediata · seguro com criptografia</p>
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
