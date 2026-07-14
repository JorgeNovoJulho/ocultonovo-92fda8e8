/**
 * BetaVipNoticeModal — alerta exibido aos visitantes/assinantes de canais VIP
 * informando que durante o Beta todo conteúdo VIP está liberado gratuitamente,
 * que cliques em "comprar" não geram cobrança, e que ao final do Beta as
 * assinaturas serão canceladas e o conteúdo precisará ser adquirido novamente.
 *
 * - Responsivo e adaptativo (mobile-first), com rolagem interna em telas curtas.
 * - Exibido em TODA visita ao canal VIP enquanto o Beta estiver ativo.
 * - Único CTA: "OK, entendi" — fecha o modal (reabre na próxima visita).
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Crown, Lock, AlertTriangle } from "lucide-react";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";

interface Props {
  /** Quando true, força exibição (ignora janela do Beta). */
  force?: boolean;
}

export function BetaVipNoticeModal({ force = false }: Props) {
  const [open, setOpen] = useState(false);
  const { betaActive } = usePlatformPhase();

  useEffect(() => {
    // Após o fim do período de testes o modal é definitivamente bloqueado.
    if (!force && !betaActive) {
      setOpen(false);
      return;
    }
    // Durante o Beta: abre em TODA visita ao canal (sem persistência).
    const t = window.setTimeout(() => setOpen(true), 350);
    return () => window.clearTimeout(t);
  }, [force, betaActive]);

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogContent
        className="
          w-[calc(100vw-1.5rem)] max-w-md sm:max-w-lg
          max-h-[90vh] overflow-y-auto
          rounded-2xl p-0
          border border-amber-400/40
          bg-gradient-to-b from-[#1a1306] via-background to-background
        "
      >
        <div className="p-5 sm:p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 border border-amber-400/40">
                <Crown className="h-4 w-4 text-amber-300" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                <Sparkles className="h-3 w-3" /> Beta Público
              </span>
            </div>
            <DialogTitle className="text-base sm:text-lg leading-snug">
              Conteúdos VIP liberados durante o período de testes
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Enquanto a plataforma Oculto está em Beta, <strong className="text-foreground">todo o conteúdo VIP está liberado gratuitamente</strong> para você explorar.
            </DialogDescription>
          </DialogHeader>

          <ul className="mt-4 space-y-2.5 text-xs sm:text-sm">
            <li className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 p-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-300 mt-0.5" />
              <span className="leading-snug">
                Cliques em <strong className="text-foreground">“comprar”</strong> ou em planos <strong className="text-foreground">não geram nenhuma cobrança</strong> agora — é tudo demonstração.
              </span>
            </li>
            <li className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 p-2.5">
              <Lock className="h-4 w-4 shrink-0 text-amber-300 mt-0.5" />
              <span className="leading-snug">
                Após o fim do período de testes, todos os conteúdos serão <strong className="text-foreground">bloqueados novamente</strong> e precisarão ser <strong className="text-foreground">comprados</strong> para serem exibidos.
              </span>
            </li>
            <li className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 p-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300 mt-0.5" />
              <span className="leading-snug">
                O encerramento do Beta também <strong className="text-foreground">cancela todas as assinaturas</strong>. Para continuar acessando os canais, será necessário <strong className="text-foreground">assinar novamente</strong>.
              </span>
            </li>
          </ul>

          <DialogFooter className="mt-5 sm:mt-6">
            <Button
              onClick={handleClose}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-400 text-black font-semibold hover:opacity-90"
            >
              OK, entendi
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BetaVipNoticeModal;
