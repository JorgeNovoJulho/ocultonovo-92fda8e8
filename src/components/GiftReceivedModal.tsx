import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Gift, User, MessageCircle, X, Sparkles, Loader2, Heart, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateConversationId } from "@/lib/conversationsApi";
import { resolveAuthUserIdFromAnyId } from "@/lib/chatIdentity";
import { supabase } from "@/lib/supabaseExternal";

const DEFAULT_THANKS_MSG = '🎁❤️😘 Muito obrigado(a) pelo seu presente de XP! Você fez meu dia! 💝';

interface GiftReceivedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  senderName: string;
  senderUsername?: string;
  senderAvatar?: string;
  senderId: string;
  amount: number;
  message?: string;
  /** Id canônico do gift em oculto_aura_xp_gifts ou notificationId no formato "gift:<id>". */
  giftId?: string;
  notificationId?: string;
}

export function GiftReceivedModal({
  open,
  onOpenChange,
  senderName,
  senderUsername,
  senderAvatar,
  senderId,
  amount,
  message,
  giftId,
  notificationId,
}: GiftReceivedModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showContent, setShowContent] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [thanksOpen, setThanksOpen] = useState(false);
  const [thanksText, setThanksText] = useState(DEFAULT_THANKS_MSG);
  const [sendingThanks, setSendingThanks] = useState(false);

  const canonicalGiftId = giftId
    ?? (notificationId?.startsWith('gift:') ? notificationId.slice(5) : undefined);

  useEffect(() => {
    if (open) {
      setShowContent(true);
      // Disparar confetti
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.6 },
          colors: ['#FFD700', '#FF69B4', '#9333EA', '#FF007F'],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.6 },
          colors: ['#FFD700', '#FF69B4', '#9333EA', '#FF007F'],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    } else {
      setShowContent(false);
    }
  }, [open]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleViewProfile = () => {
    onOpenChange(false);
    navigate(`/creator/${senderId}`);
  };

  const handleOpenChat = async () => {
    if (!user?.id) {
      toast.error("Faça login para abrir o chat.");
      return;
    }
    if (!senderId) {
      toast.error("Remetente desconhecido.");
      return;
    }
    setOpeningChat(true);
    try {
      // Resolve qualquer id (profile.id / profile.user_id / auth.id) para auth.users.id
      const targetAuthId = (await resolveAuthUserIdFromAnyId(senderId)) || senderId;
      const { id, error } = await getOrCreateConversationId(user.id, targetAuthId);
      if (error || !id) {
        console.error("[GiftReceivedModal] getOrCreateConversationId fail:", error);
        toast.error("Não foi possível abrir a conversa. Tente novamente.");
        return;
      }
      onOpenChange(false);
      navigate(`/messages?c=${id}`);
    } catch (err: any) {
      console.error("[GiftReceivedModal] handleOpenChat error:", err);
      toast.error(err?.message || "Falha ao abrir a conversa.");
    } finally {
      setOpeningChat(false);
    }
  };

  const handleSendThanks = async () => {
    if (!user?.id) { toast.error("Faça login para agradecer."); return; }
    if (!senderId) { toast.error("Remetente desconhecido."); return; }
    const text = (thanksText || '').trim();
    if (!text) { toast.error("Escreva uma mensagem de agradecimento."); return; }
    setSendingThanks(true);
    try {
      const targetAuthId = (await resolveAuthUserIdFromAnyId(senderId)) || senderId;
      const { id: conversationId, error } = await getOrCreateConversationId(user.id, targetAuthId);
      if (error || !conversationId) throw error || new Error("no_conv");
      await (supabase as any).from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: text,
      });
      if (canonicalGiftId) {
        try {
          await (supabase as any)
            .from('oculto_aura_xp_gifts')
            .update({ thanked_at: new Date().toISOString() })
            .eq('id', canonicalGiftId);
        } catch { /* coluna pode não existir; silencioso */ }
      }
      toast.success("Agradecimento enviado! 🎁");
      setThanksOpen(false);
      onOpenChange(false);
      navigate(`/messages?c=${conversationId}`);
    } catch (err: any) {
      console.error("[GiftReceivedModal] handleSendThanks error:", err);
      toast.error(err?.message || "Não foi possível enviar o agradecimento.");
    } finally {
      setSendingThanks(false);
    }
  };



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          p-0 overflow-hidden border-0 bg-transparent shadow-none
          w-[calc(100vw-1rem)] sm:w-full sm:max-w-md
          max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)]
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
              className="relative bg-gradient-to-br from-[hsl(45,93%,47%)] via-[hsl(330,80%,60%)] to-[hsl(280,80%,50%)] rounded-2xl p-1 max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col"
            >
              {/* Close button */}
              <button
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
                className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors shadow-lg backdrop-blur-sm"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              <div className="bg-gradient-to-br from-background via-background to-muted rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto overscroll-contain">
                {/* Icon animado */}
                <motion.div
                  initial={{ y: -20 }}
                  animate={{ y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 10,
                    repeat: 3,
                    repeatType: "reverse"
                  }}
                  className="flex justify-center pt-2"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] rounded-full blur-xl opacity-50 animate-pulse" />
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] flex items-center justify-center">
                      <Gift className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
                    </div>
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                      className="absolute -top-1 -right-1"
                    >
                      <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-[hsl(45,93%,47%)]" />
                    </motion.div>
                  </div>
                </motion.div>

                {/* Título */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-[hsl(45,93%,47%)] via-[hsl(330,80%,60%)] to-[hsl(280,80%,50%)] bg-clip-text text-transparent px-6">
                    🎁 Você recebeu um Presente!
                  </h2>
                </motion.div>

                {/* Avatar e @username do doador */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col items-center gap-2 sm:gap-3"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] rounded-full blur-md opacity-60" />
                    <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-[hsl(45,93%,47%)] relative">
                      <AvatarImage src={senderAvatar} alt={`@${senderUsername || 'usuario'}`} />
                      <AvatarFallback className="bg-gradient-to-br from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] text-white text-2xl sm:text-3xl">
                        {(senderUsername?.[0] || '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-lg font-semibold text-foreground break-all px-2">
                      @{senderUsername || 'usuario'}
                    </p>
                  </div>
                </motion.div>

                {/* Valor em XP */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-center"
                >
                  <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] bg-clip-text text-transparent">
                    {Math.round(amount)} XP
                  </p>
                </motion.div>

                {/* Mensagem */}
                {message && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-muted/30 rounded-lg p-3 sm:p-4 text-center"
                  >
                    <p className="text-sm sm:text-base text-muted-foreground italic break-words">"{message}"</p>
                  </motion.div>
                )}

                {/* Botões */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="flex flex-col gap-2 sm:gap-3 pb-1"
                >
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <Button
                      onClick={handleViewProfile}
                      variant="outline"
                      className="flex-1 gap-2 border-[hsl(45,93%,47%)]/50 hover:bg-[hsl(45,93%,47%)]/10"
                    >
                      <User className="h-4 w-4" />
                      Ver Perfil
                    </Button>
                    <Button
                      onClick={handleOpenChat}
                      disabled={openingChat || !user?.id}
                      className="flex-1 gap-2 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(330,80%,60%)] hover:opacity-90 text-white"
                    >
                      {openingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                      {openingChat ? "Abrindo…" : "Abrir Chat"}
                    </Button>
                  </div>
                  <Button
                    onClick={() => { onOpenChange(false); navigate('/my-gifts'); }}
                    className="w-full gap-2 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-rose-500 hover:opacity-90 text-white shadow-[0_0_22px_-6px_rgba(244,63,94,0.7)]"
                  >
                    <Heart className="h-4 w-4 fill-current" />
                    Agradecer
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>

      {/* Sub-modal: compositor de agradecimento */}
      <Dialog open={thanksOpen} onOpenChange={(v) => !sendingThanks && setThanksOpen(v)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border border-pink-400/30 bg-[#120817]">
          <VisuallyHidden.Root>
            <DialogTitle>Enviar agradecimento</DialogTitle>
            <DialogDescription>Envie uma mensagem de agradecimento ao remetente do presente.</DialogDescription>
          </VisuallyHidden.Root>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 blur-md opacity-60" />
                <Avatar className="relative h-12 w-12 ring-2 ring-pink-400/60">
                  <AvatarImage src={senderAvatar} alt={`@${senderUsername || 'usuario'}`} />
                  <AvatarFallback className="bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white">
                    {(senderUsername?.[0] || '?').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-300/80">Enviar agradecimento</div>
                <div className="text-sm font-semibold text-white truncate">Para @{senderUsername || 'usuario'}</div>
              </div>
            </div>

            <Textarea
              value={thanksText}
              onChange={(e) => setThanksText(e.target.value.slice(0, 500))}
              rows={4}
              maxLength={500}
              autoFocus
              disabled={sendingThanks}
              placeholder="Escreva uma mensagem carinhosa de agradecimento…"
              className="resize-none bg-white/[0.04] border-white/10 text-white placeholder:text-white/40 focus-visible:ring-pink-400/50"
            />
            <div className="flex items-center justify-between text-[11px] text-white/45">
              <span>Será enviada como mensagem privada no chat.</span>
              <span>{thanksText.length}/500</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => setThanksOpen(false)}
                disabled={sendingThanks}
                className="border-white/15 bg-white/[0.03] text-white/85 hover:bg-white/[0.08]"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSendThanks}
                disabled={sendingThanks || !thanksText.trim()}
                className="gap-2 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-rose-500 hover:opacity-90 text-white"
              >
                {sendingThanks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendingThanks ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
