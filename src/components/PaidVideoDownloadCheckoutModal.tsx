import { CheckCircle2, Copy, Download, QrCode, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PaidVideoDownloadCheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoTitle?: string | null;
  price: number;
  onConfirmMockPayment: () => void | Promise<void>;
  onBackToMedia?: () => void;
}

const MOCK_PIX_CODE = "00020126580014br.gov.bcb.pix0136download-video-pago-oculto520400005303986540";

export function PaidVideoDownloadCheckoutModal({
  open,
  onOpenChange,
  videoTitle,
  price,
  onConfirmMockPayment,
  onBackToMedia,
}: PaidVideoDownloadCheckoutModalProps) {
  const { toast } = useToast();
  const [receipt, setReceipt] = useState<{ paidAt: string; title: string; amount: number } | null>(null);
  const formattedPrice = price.toFixed(2).replace(".", ",");
  const pixCode = `${MOCK_PIX_CODE}${formattedPrice.replace(",", "")}5802BR5925OCULTO DOWNLOAD VIDEO6009SAO PAULO62140510MOCKVIDEO6304ABCD`;

  useEffect(() => {
    if (!open) setReceipt(null);
  }, [open, videoTitle]);

  const copyPix = async () => {
    await navigator.clipboard.writeText(pixCode);
    toast({ title: "Código Pix copiado" });
  };

  const confirmPayment = async () => {
    await onConfirmMockPayment();
    setReceipt({ paidAt: new Date().toLocaleString("pt-BR"), title: videoTitle || "Vídeo pago", amount: price });
    toast({ title: "Download liberado", description: "Pagamento mock confirmado para este vídeo." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:p-6 scrollbar-hide">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Download do vídeo pago
          </DialogTitle>
          <DialogDescription>{receipt ? "Resumo do pagamento mock aprovado." : "Confirme o pagamento PIX mock para liberar o botão de download deste vídeo."}</DialogDescription>
        </DialogHeader>

        {receipt ? (
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <CheckCircle2 className="h-5 w-5" /> Status: Pago
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Data/hora:</span> {receipt.paidAt}</p>
              <p><span className="text-muted-foreground">Vídeo:</span> {receipt.title}</p>
              <p><span className="text-muted-foreground">Valor:</span> R$ {receipt.amount.toFixed(2).replace('.', ',')}</p>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Vídeo</p>
            <p className="text-sm font-medium line-clamp-2">{videoTitle || "Vídeo pago"}</p>
            <p className="mt-2 text-2xl font-bold text-primary">R$ {formattedPrice}</p>
          </div>

          <div className="rounded-lg border border-border p-4 text-center space-y-3">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-lg bg-muted">
              <QrCode className="h-12 w-12 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">PIX copia e cola mock</p>
            <code className="block rounded-md bg-muted/60 p-2 text-[10px] text-muted-foreground break-all">
              {pixCode}
            </code>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={copyPix} aria-label="Copiar código Pix do download do vídeo">
              <Copy className="h-4 w-4" />
              Copiar código Pix
            </Button>
          </div>
        </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {receipt ? (
            <Button type="button" onClick={() => { onBackToMedia?.(); onOpenChange(false); }} className="w-full gap-2">
              <RotateCcw className="h-4 w-4" /> Voltar para a mídia
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="button" onClick={confirmPayment} className="gap-2"><Download className="h-4 w-4" />Já paguei — liberar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
