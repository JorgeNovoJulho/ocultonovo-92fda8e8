import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Gift, MessageCircle, X, Sparkles, Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export interface AffiliateApprovedData {
  conversationId: string;
  channelName: string;
  channelBanner?: string | null;
  ownerUsername?: string | null;
  ownerAvatar?: string | null;
  referralCode?: string | null;
  referralLink?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: AffiliateApprovedData;
}

/**
 * Modal de "Parabéns! Aprovado como afiliado".
 * Visual e efeitos (confetti + spring + pulse) inspirados em GiftReceivedModal,
 * para manter a mesma identidade do "Você recebeu um Presente!".
 */
export function AffiliateApprovedModal({ open, onOpenChange, data }: Props) {
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowContent(false);
      return;
    }
    setShowContent(true);

    // Confetti igual ao do presente
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ["#FFD700", "#FF69B4", "#9333EA", "#FF007F"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ["#FFD700", "#FF69B4", "#9333EA", "#FF007F"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [open]);

  const handleOpenChat = () => {
    onOpenChange(false);
    navigate(`/messages?conversation=${encodeURIComponent(data.conversationId)}`);
  };

  const handleCopyLink = async () => {
    if (!data.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      toast.success("Link de afiliado copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const ownerHandle = data.ownerUsername ? `@${data.ownerUsername}` : "@criador";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          p-0 overflow-hidden border-0 bg-transparent shadow-none
          w-[calc(100vw-1rem)] sm:w-full sm:max-w-md
          max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]
        "
      >
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        <AnimatePresence>
          {showContent && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative bg-gradient-to-br from-[hsl(45,93%,47%)] via-[hsl(330,80%,60%)] to-[hsl(280,80%,50%)] rounded-2xl p-[2px] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col"
            >
              <button
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
                className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors shadow-lg backdrop-blur-sm"
              >
                <X className="h-4 w-4" />
              </button>

              <div
                className="bg-gradient-to-br from-background via-background to-muted rounded-[14px] p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {/* Ícone animado (compacto) */}
                <motion.div
                  initial={{ y: -16 }}
                  animate={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 12, repeat: 2, repeatType: "reverse" }}
                  className="flex justify-center pt-0.5"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] rounded-full blur-lg opacity-50 animate-pulse" />
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] flex items-center justify-center">
                      <Gift className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                    </div>
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.2 }}
                      className="absolute -top-1 -right-1"
                    >
                      <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-[hsl(45,93%,47%)]" />
                    </motion.div>
                  </div>
                </motion.div>

                {/* Título */}
                <motion.h2
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-lg sm:text-xl font-bold text-center bg-gradient-to-r from-[hsl(45,93%,47%)] via-[hsl(330,80%,60%)] to-[hsl(280,80%,50%)] bg-clip-text text-transparent px-2 leading-tight"
                >
                  🎉 Você foi aprovado(a) como Afiliado(a)!
                </motion.h2>

                {/* Banner do canal VIP + nome do canal + @username do criador */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="relative w-full">
                    <div className="absolute -inset-[2px] bg-gradient-to-r from-[hsl(45,93%,47%)] via-[hsl(330,80%,60%)] to-[hsl(280,80%,50%)] rounded-2xl opacity-70" />
                    <div className="relative w-full aspect-[16/7] rounded-2xl overflow-hidden bg-muted">
                      {data.channelBanner ? (
                        <img
                          src={data.channelBanner}
                          alt={data.channelName}
                          className="w-full h-full object-cover"
                          loading="eager"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[hsl(45,93%,47%)]/30 via-[hsl(330,80%,60%)]/30 to-[hsl(280,80%,50%)]/30 flex items-center justify-center">
                          <Sparkles className="h-8 w-8 text-[hsl(45,93%,47%)]" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 text-center">
                        <p className="text-sm sm:text-base font-bold text-white break-words drop-shadow-lg leading-tight">
                          {data.channelName}
                        </p>
                        <p className="text-[11px] sm:text-xs text-white/80 mt-0.5">
                          por {ownerHandle}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Subtítulo / instrução */}
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="text-center text-xs sm:text-sm text-muted-foreground px-1 leading-snug"
                >
                  O criador enviou seu <strong className="text-foreground">link exclusivo de afiliado</strong> no chat.
                  Toda venda originada por ele gera comissão para você.
                </motion.p>

                {/* Botões */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  {data.referralLink && (
                    <Button
                      onClick={handleCopyLink}
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2 border-[hsl(45,93%,47%)]/50 hover:bg-[hsl(45,93%,47%)]/10"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar link
                    </Button>
                  )}
                  <Button
                    onClick={handleOpenChat}
                    size="sm"
                    className="flex-1 gap-2 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] hover:opacity-90 text-white"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Abrir Chat
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>

    </Dialog>
  );
}
