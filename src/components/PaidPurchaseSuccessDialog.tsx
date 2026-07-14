import { memo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download, Eye, Sparkles, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useContentSalesStats } from '@/hooks/useContentSales';
import { useVipDownloads } from '@/hooks/useVipDownloads';

interface PaidPurchaseSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  price: number;
  sellerName?: string;
}

/**
 * Tela de status pós-compra de mídia paga.
 * Mostra confirmação de acesso liberado + permissões reais agora ativas na conta.
 * Dados reais: total de mídias liberadas (useVipDownloads).
 */
export const PaidPurchaseSuccessDialog = memo(function PaidPurchaseSuccessDialog({
  open, onOpenChange, postId, price, sellerName,
}: PaidPurchaseSuccessDialogProps) {
  const navigate = useNavigate();
  const { data: downloads = [] } = useVipDownloads();
  const totalUnlocked = downloads.length;
  const formattedPrice = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-[hsl(45,93%,47%)]/40 max-w-[calc(100vw-2rem)] sm:max-w-md z-[9999] shadow-[0_0_60px_rgba(234,179,8,0.25)]">
        <DialogHeader className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[hsl(45,93%,47%)]/20 to-[hsl(35,80%,40%)]/20 flex items-center justify-center mx-auto mb-3 ring-4 ring-[hsl(45,93%,47%)]/20">
            <CheckCircle2 className="h-10 w-10 text-[hsl(45,93%,47%)]" />
          </div>
          <DialogTitle className="text-xl font-bold text-center">
            Acesso liberado!
          </DialogTitle>
          <DialogDescription className="text-center">
            {sellerName ? <>Compra confirmada de <span className="font-medium text-foreground">{sellerName}</span> · </> : null}
            <span className="font-semibold text-[hsl(45,93%,47%)]">{formattedPrice}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-[hsl(45,93%,47%)]/20 bg-[hsl(45,93%,47%)]/5 p-4 space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(45,93%,47%)] mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Permissões agora ativas
          </p>
          <div className="flex items-start gap-2.5 text-sm">
            <Eye className="h-4 w-4 text-[hsl(45,93%,47%)] mt-0.5 shrink-0" />
            <span className="text-foreground">Visualização permanente sem blur deste conteúdo</span>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <Download className="h-4 w-4 text-[hsl(45,93%,47%)] mt-0.5 shrink-0" />
            <span className="text-foreground">Adicionado em <span className="font-medium">Meus Downloads VIP</span></span>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <ShieldCheck className="h-4 w-4 text-[hsl(45,93%,47%)] mt-0.5 shrink-0" />
            <span className="text-foreground">URL temporária protegida (renovação automática)</span>
          </div>
        </div>

        <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Total de mídias liberadas na sua conta</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{totalUnlocked}</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Continuar no feed
          </Button>
          <Button
            onClick={() => { onOpenChange(false); navigate('/vip-downloads'); }}
            className="flex-1 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold hover:opacity-90 gap-1.5"
          >
            <Download className="h-4 w-4" />
            Ver downloads
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
