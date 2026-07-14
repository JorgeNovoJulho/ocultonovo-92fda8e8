import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  Lock,
  ImageOff,
  PhoneOff,
  HeartHandshake,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatSafetyGuidelinesModalProps {
  conversationId: string | null;
  recipientName?: string;
}

const STORAGE_KEY = "chat_safety_dismissed_v1";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* noop */
  }
}

export function ChatSafetyGuidelinesModal({ conversationId, recipientName }: ChatSafetyGuidelinesModalProps) {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  useEffect(() => {
    if (!conversationId) {
      setOpen(false);
      return;
    }
    const dismissed = getDismissed();
    if (!dismissed.has(conversationId)) {
      // Pequeno delay para não competir com a renderização do chat
      const t = setTimeout(() => setOpen(true), 350);
      return () => clearTimeout(t);
    }
  }, [conversationId]);

  const handleClose = () => {
    if (dontShowAgain && conversationId) {
      const dismissed = getDismissed();
      dismissed.add(conversationId);
      persistDismissed(dismissed);
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="
          p-0 gap-0 overflow-hidden border-primary/30 bg-background
          w-[calc(100vw-1rem)] sm:w-full sm:max-w-lg
          h-auto
          max-h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-7rem)]
          sm:max-h-[calc(100dvh-3rem)]
          rounded-2xl
          grid grid-rows-[auto_minmax(0,1fr)_auto]
        "
      >
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/50 bg-gradient-to-br from-primary/10 via-transparent to-[hsl(45,93%,47%)]/10">
          <div className="flex items-center gap-3 pr-6">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg leading-tight">
                Orientações de Segurança
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm mt-0.5 line-clamp-2">
                {recipientName
                  ? `Antes de conversar com ${recipientName}, leia com atenção:`
                  : "Antes de iniciar a conversa, leia com atenção:"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 px-4 sm:px-5 py-3 sm:py-4 [&_[data-radix-scroll-area-scrollbar]]:hidden">
          <div className="space-y-4 pb-2">
            <SafetyItem
              icon={<Lock className="h-4 w-4" />}
              title="Seus dados reais são criptografados"
              text="Nome real, endereço, e-mail e fotos de documentos NUNCA são compartilhados com outros usuários. Tudo fica criptografado em nossos servidores."
            />
            <SafetyItem
              icon={<PhoneOff className="h-4 w-4" />}
              title="Nunca compartilhe dados pessoais"
              text="Não envie telefone, WhatsApp, e-mail, redes sociais, endereço residencial ou de trabalho. Mantenha toda a comunicação dentro do Oculto."
            />
            <SafetyItem
              icon={<ImageOff className="h-4 w-4" />}
              title="Cuidado com fotos e vídeos íntimos"
              text="Evite mostrar rosto + corpo na mesma imagem, tatuagens identificáveis ou objetos do seu ambiente. Use as ferramentas de blur e mídia temporária do sistema."
            />
            <SafetyItem
              icon={<Sparkles className="h-4 w-4" />}
              title="Use as ferramentas do sistema"
              text="Áudios criptografados, mídia PPV, presentes e Super DM existem para proteger sua identidade. Prefira sempre os recursos internos a alternativas externas."
            />
            <SafetyItem
              icon={<AlertTriangle className="h-4 w-4 text-[hsl(45,93%,47%)]" />}
              title="Encontros reais — proteja-se"
              text="Marque sempre em locais públicos na primeira vez. Avise alguém de confiança, combine horário de retorno e nunca vá sozinho(a) a endereços desconhecidos sem checar a identidade."
            />

            <Link
              to="/profile?tab=safety"
              onClick={handleClose}
              className="block rounded-xl border border-[hsl(45,93%,47%)]/40 bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-primary/5 p-4 hover:from-[hsl(45,93%,47%)]/20 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-[hsl(45,93%,47%)]/20 flex items-center justify-center shrink-0">
                  <HeartHandshake className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Ative o Encontro Seguro
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Monitoramento automático com alertas via WhatsApp para contatos de confiança. Toque para abrir →
                  </p>
                </div>
              </div>
            </Link>

            <p className="text-[11px] text-muted-foreground text-center pt-1">
              Em caso de assédio, ameaça ou abuso, denuncie pelo menu da conversa.
              Nossa moderação age em até 24h.
            </p>
          </div>
        </ScrollArea>

        <div className="border-t border-border/50 p-3 sm:p-4 space-y-2 sm:space-y-3 bg-background">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(v === true)}
            />
            <span className="text-xs sm:text-sm text-muted-foreground">
              Não exibir novamente nesta conversa
            </span>
          </label>
          <Button onClick={handleClose} className="w-full" size="lg">
            Entendi e quero conversar com segurança
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SafetyItem({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
        <p className="text-xs sm:text-[13px] text-muted-foreground mt-1 leading-relaxed">
          {text}
        </p>
      </div>
    </div>
  );
}
