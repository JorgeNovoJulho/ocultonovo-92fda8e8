import { Crown, Lock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface VipChatPaywallProps {
  recipientName: string;
  recipientId: string;
  messageCost: number;
  onPayPerMessage?: () => void;
}

export function VipChatPaywall({
  recipientName,
  recipientId,
  messageCost,
  onPayPerMessage,
}: VipChatPaywallProps) {
  return (
    <div className="p-4 border-t border-[hsl(45,93%,47%)]/20 bg-gradient-to-r from-[hsl(45,93%,47%)]/5 via-transparent to-[hsl(45,93%,47%)]/5">
      <div className="flex items-center gap-2 mb-3">
        <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
        <p className="text-sm font-medium text-foreground">
          {recipientName} é um <span className="text-[hsl(45,93%,47%)]">Criador VIP</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={onPayPerMessage}
          className="w-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-background hover:opacity-90 font-semibold gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          Pagar R$ {messageCost.toFixed(2).replace('.', ',')} para enviar mensagem
        </Button>

        <Link to={`/creator/${recipientId}`} className="w-full">
          <Button
            variant="outline"
            className="w-full border-[hsl(45,93%,47%)]/50 text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10 gap-2"
          >
            <Crown className="h-4 w-4" />
            Assinar Canal do Criador
          </Button>
        </Link>
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-2">
        Assinantes conversam sem custos adicionais
      </p>
    </div>
  );
}
