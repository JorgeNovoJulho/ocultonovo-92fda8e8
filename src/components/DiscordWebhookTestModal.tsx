import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Wifi } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Status = "idle" | "loading" | "success" | "error";

export function DiscordWebhookTestModal({ open, onOpenChange }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const handleTest = useCallback(async () => {
    setStatus("loading");
    setMessage("");

    try {
      // Fire-and-forget style: invoke edge function asynchronously
      const { data, error } = await supabase.functions.invoke("test-discord-webhook", {
        method: "POST",
      });

      if (error) throw error;

      if (data?.success) {
        setStatus("success");
        setMessage(data.message ?? "Mensagem enviada com sucesso!");
      } else {
        setStatus("error");
        setMessage(data?.error ?? "Falha desconhecida");
      }
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Erro ao conectar com o servidor");
    }
  }, []);

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation completes
    setTimeout(() => {
      setStatus("idle");
      setMessage("");
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4 text-primary" />
            Teste de Webhook Discord
          </DialogTitle>
          <DialogDescription className="text-xs">
            Envia uma mensagem de teste para confirmar a conexão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Status indicator */}
          <div className="rounded-lg border bg-muted/40 p-3 min-h-[72px] flex items-center justify-center">
            {status === "idle" && (
              <p className="text-xs text-muted-foreground text-center">
                Clique em "Testar Agora" para verificar a conexão com o Discord.
              </p>
            )}
            {status === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando mensagem de teste…
              </div>
            )}
            {status === "success" && (
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-6 w-6 text-primary" />
                <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                  Conexão OK
                </Badge>
                <p className="text-xs text-muted-foreground">{message}</p>
              </div>
            )}
            {status === "error" && (
              <div className="flex flex-col items-center gap-2 text-center">
                <XCircle className="h-6 w-6 text-destructive" />
                <Badge variant="destructive" className="text-xs">
                  Falha na Conexão
                </Badge>
                <p className="text-xs text-muted-foreground break-all">{message}</p>
              </div>
            )}
          </div>

          {/* Split info — static, no heavy compute */}
          <div className="rounded-lg bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Split configurado
            </p>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">74% Criador</Badge>
              <Badge variant="secondary" className="text-xs">20% Plataforma</Badge>
              <Badge variant="secondary" className="text-xs">6% Impostos</Badge>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleClose}
            >
              Fechar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleTest}
              disabled={status === "loading"}
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Enviando…
                </>
              ) : status === "success" ? (
                "Testar Novamente"
              ) : (
                "Testar Agora"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
