/**
 * Modal para Denúncia de Revenge Porn / Conteúdo Não Autorizado
 * Cria ticket com prioridade URGENTE no painel admin
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCreateTicket } from "@/hooks/useSupportTickets";
import {
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Send,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface RevengePortnReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RevengePortnReportModal({ open, onOpenChange }: RevengePortnReportModalProps) {
  const { toast } = useToast();
  const createTicket = useCreateTicket();
  
  const [formData, setFormData] = useState({
    contentUrl: "",
    description: "",
    isVictim: false,
    hasPoliceReport: false,
    urgentRemoval: true,
  });

  const handleSubmit = async () => {
    if (!formData.description.trim()) {
      toast({
        title: "Descrição obrigatória",
        description: "Descreva a situação para que possamos agir.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Criar ticket com prioridade URGENTE e prefixo especial
      await createTicket.mutateAsync({
        subject: `[🚨 REVENGE PORN - URGENTE] Solicitação de Remoção de Conteúdo Não Autorizado`,
        description: `
=== DENÚNCIA PRIORITÁRIA - REVENGE PORN ===

📌 URL do conteúdo (se disponível): ${formData.contentUrl || "Não informada"}

📝 Descrição da situação:
${formData.description}

ℹ️ Informações adicionais:
- Denunciante é a vítima: ${formData.isVictim ? "Sim" : "Não/Não informado"}
- Possui B.O. ou registro policial: ${formData.hasPoliceReport ? "Sim" : "Não"}
- Solicitação de remoção urgente: ${formData.urgentRemoval ? "Sim" : "Não"}

⚠️ Este chamado requer ação IMEDIATA conforme Lei 13.718/2018 e Marco Civil da Internet.
        `.trim(),
        priority: "urgent",
      });

      toast({
        title: "Denúncia registrada com prioridade máxima! 🚨",
        description: "Nossa equipe irá analisar e agir em até 24 horas.",
      });

      // Resetar formulário
      setFormData({
        contentUrl: "",
        description: "",
        isVictim: false,
        hasPoliceReport: false,
        urgentRemoval: true,
      });
      
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Erro ao enviar denúncia",
        description: "Tente novamente ou entre em contato direto pelo email.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Denúncia de Conteúdo Não Autorizado
          </DialogTitle>
          <DialogDescription>
            Canal prioritário para remoção de conteúdo íntimo divulgado sem consentimento (Revenge Porn).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Aviso de Prioridade */}
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-destructive text-destructive-foreground gap-1">
                <AlertTriangle className="h-3 w-3" />
                URGENTE
              </Badge>
              <span className="text-sm font-medium text-destructive">Prioridade Máxima</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Este chamado será tratado com prioridade absoluta. Nossa equipe age em conformidade 
              com a Lei 13.718/2018 e o Marco Civil da Internet.
            </p>
          </div>

          {/* URL do Conteúdo */}
          <div className="space-y-2">
            <Label htmlFor="content-url">URL do Conteúdo (se disponível)</Label>
            <Input
              id="content-url"
              placeholder="https://oculto.app/post/..."
              value={formData.contentUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, contentUrl: e.target.value }))}
              className="focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descreva a situação *</Label>
            <Textarea
              id="description"
              placeholder="Descreva o conteúdo, como você o encontrou, e qualquer informação que possa nos ajudar a identificá-lo rapidamente..."
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Checkbox
                id="is-victim"
                checked={formData.isVictim}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, isVictim: checked as boolean }))
                }
                className="mt-0.5"
              />
              <Label htmlFor="is-victim" className="text-sm cursor-pointer">
                Sou a pessoa retratada no conteúdo (vítima)
              </Label>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Checkbox
                id="has-police-report"
                checked={formData.hasPoliceReport}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, hasPoliceReport: checked as boolean }))
                }
                className="mt-0.5"
              />
              <Label htmlFor="has-police-report" className="text-sm cursor-pointer">
                Já registrei Boletim de Ocorrência ou notificação policial
              </Label>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
              <Checkbox
                id="urgent-removal"
                checked={formData.urgentRemoval}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, urgentRemoval: checked as boolean }))
                }
                className="mt-0.5"
              />
              <Label htmlFor="urgent-removal" className="text-sm cursor-pointer">
                Solicito remoção imediata do conteúdo (até 24h)
              </Label>
            </div>
          </div>

          {/* Tempo de Resposta */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Tempo médio de resposta: <strong className="text-foreground">4-12 horas</strong></span>
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={createTicket.isPending}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-destructive hover:bg-destructive/90 gap-2"
              onClick={handleSubmit}
              disabled={!formData.description.trim() || createTicket.isPending}
            >
              {createTicket.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar Denúncia Urgente
            </Button>
          </div>

          {/* Aviso Legal */}
          <p className="text-[10px] text-muted-foreground text-center">
            Denúncias falsas podem resultar em responsabilização civil e criminal. 
            Ao enviar, você declara que as informações são verdadeiras.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}