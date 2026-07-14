/**
 * AdminBroadcastPushCard
 * Allows admins to send a global push notification to all real users (excl. bots).
 * Calls dispatch-smart-push with event=admin_broadcast.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Send, Loader2, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export function AdminBroadcastPushCard() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: tokenCount } = useQuery({
    queryKey: ["admin-push-token-count"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("push_tokens")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim()) throw new Error("Título e mensagem são obrigatórios");
      const { data, error } = await supabase.functions.invoke("dispatch-smart-push", {
        body: {
          event: "admin_broadcast",
          broadcast: true,
          broadcast_title: title.trim(),
          broadcast_body: body.trim(),
        },
      });
      if (error) throw error;
      return data as { sent: number; targets: number };
    },
    onSuccess: (result) => {
      toast({
        title: "📢 Broadcast enviado!",
        description: `Entregue a ${result.sent} de ${result.targets} dispositivos.`,
      });
      setTitle("");
      setBody("");
    },
    onError: (e: any) =>
      toast({ title: "Erro ao enviar broadcast", description: e.message, variant: "destructive" }),
  });

  const charLimitBody = 150;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/20">
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          Broadcast Push Global
          <Badge variant="outline" className="ml-auto text-xs gap-1">
            <Users className="h-3 w-3" />
            {tokenCount ?? "–"} dispositivos
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Envia uma notificação push a todos os utilizadores reais (excluindo bots).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Título</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: 🚀 Nova funcionalidade disponível!"
            className="h-9 text-sm"
            maxLength={80}
          />
          <p className="text-[10px] text-muted-foreground text-right">{title.length}/80</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Mensagem</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Descrição curta e clara do aviso ou novidade…"
            className="text-sm resize-none h-20"
            maxLength={charLimitBody}
          />
          <p
            className={`text-[10px] text-right ${
              body.length > charLimitBody - 20
                ? "text-orange-400"
                : "text-muted-foreground"
            }`}
          >
            {body.length}/{charLimitBody}
          </p>
        </div>

        {/* Preview */}
        {(title || body) && (
          <div className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</p>
            <p className="text-sm font-semibold text-foreground">{title || "Sem título"}</p>
            <p className="text-xs text-muted-foreground">{body || "Sem mensagem"}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Esta acção não pode ser desfeita. Mensagens serão entregues a todos os dispositivos registados.
          </p>
        </div>

        <Button
          onClick={() => broadcastMutation.mutate()}
          disabled={broadcastMutation.isPending || !title.trim() || !body.trim()}
          className="w-full gap-2 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
        >
          {broadcastMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
            </>
          ) : broadcastMutation.isSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Enviado!
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Enviar Broadcast
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
