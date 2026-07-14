import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface EconomyBuyButtonProps {
  slug: string;
  label?: string;
  className?: string;
  onActivated?: () => void;
}

interface QrPayload {
  payment_id: string;
  purchase_id: string | null;
  amount_cents: number;
  qr_code_base64: string;
  copy_paste: string;
}

/**
 * EconomyBuyButton — paywall unificado da Economia Social Premium.
 * Chama edge function pix-checkout-economy → exibe QR PIX → polling do status.
 * Webhook ASAAS ativará o produto via social_economy_mark_paid.
 */
function EconomyBuyButtonComp({ slug, label, className, onActivated }: EconomyBuyButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const pollRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleBuy = useCallback(async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('pix-checkout-economy', {
        body: { slug },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao iniciar compra');
      setQr({
        payment_id: data.payment_id,
        purchase_id: data.purchase_id,
        amount_cents: data.amount_cents,
        qr_code_base64: data.qr_code_base64,
        copy_paste: data.copy_paste,
      });
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível gerar o PIX');
    } finally {
      setBusy(false);
    }
  }, [slug]);

  // Polling do status da compra (max 5 min)
  useEffect(() => {
    if (!open || !qr?.payment_id || confirmed) return;
    let attempts = 0;
    pollRef.current = window.setInterval(async () => {
      attempts += 1;
      if (attempts > 100) { cleanup(); return; }
      const { data } = await (supabase as any)
        .from('oculto_social_economy_purchases')
        .select('status')
        .eq('asaas_payment_id', qr.payment_id)
        .maybeSingle();
      if (data?.status === 'paid' || data?.status === 'activated') {
        setConfirmed(true);
        cleanup();
        toast.success('Pagamento confirmado! Produto ativado.');
        onActivated?.();
      }
    }, 3000);
    return cleanup;
  }, [open, qr?.payment_id, confirmed, cleanup, onActivated]);

  const handleCopy = useCallback(async () => {
    if (!qr?.copy_paste) return;
    try {
      await navigator.clipboard.writeText(qr.copy_paste);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* noop */ }
  }, [qr?.copy_paste]);

  return (
    <>
      <button
        type="button"
        onClick={handleBuy}
        disabled={busy}
        className={
          className ??
          'inline-flex items-center justify-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1.5 text-[12px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20 disabled:opacity-50'
        }
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
        {label ?? 'Desbloquear'}
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { cleanup(); setConfirmed(false); setQr(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pagamento PIX</DialogTitle>
            <DialogDescription>
              {confirmed
                ? 'Confirmado! Produto ativado.'
                : `Escaneie o QR Code para pagar R$ ${(((qr?.amount_cents ?? 0) / 100)).toFixed(2)}`}
            </DialogDescription>
          </DialogHeader>

          {qr && !confirmed && (
            <div className="flex flex-col items-center gap-3">
              <img
                src={`data:image/png;base64,${qr.qr_code_base64}`}
                alt="QR Code PIX"
                className="h-56 w-56 rounded-lg bg-white p-2"
              />
              <Button variant="outline" size="sm" onClick={handleCopy} className="w-full">
                {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar código PIX'}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Aguardando confirmação automática…
              </p>
            </div>
          )}

          {confirmed && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                <Check className="h-7 w-7 text-emerald-400" />
              </div>
              <Button onClick={() => setOpen(false)} className="w-full">Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export const EconomyBuyButton = memo(EconomyBuyButtonComp);
