/**
 * Botão de Denúncia Anônima
 * Permite reportar conteúdo ou usuários de forma segura
 */
import { useState } from "react";
import { Flag, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  useCreateAnonymousReport, 
  ReportCategory, 
  ReportTargetType,
  reportCategoryLabels 
} from "@/hooks/useAnonymousReport";

interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId?: string;
  targetUserId?: string;
  variant?: "icon" | "button" | "menu-item";
  className?: string;
}

export function ReportButton({ 
  targetType, 
  targetId, 
  targetUserId,
  variant = "icon",
  className 
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [description, setDescription] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  const createReport = useCreateAnonymousReport();

  const handleSubmit = async () => {
    if (!category) return;

    await createReport.mutateAsync({
      targetType,
      targetId,
      targetUserId,
      category,
      description: description.trim() || undefined,
      isUrgent,
    });

    setOpen(false);
    setCategory("");
    setDescription("");
    setIsUrgent(false);
  };

  const renderTrigger = () => {
    switch (variant) {
      case "icon":
        return (
          <Button variant="ghost" size="icon" className={className} aria-label="Sinalizar">
            <Flag className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </Button>
        );
      case "button":
        return (
          <Button variant="outline" size="sm" className={`gap-2 ${className}`}>
            <Flag className="h-4 w-4" />
            Denunciar
          </Button>
        );
      case "menu-item":
        return (
          <div className={`flex items-center gap-2 text-destructive cursor-pointer ${className}`}>
            <Flag className="h-4 w-4" />
            Denunciar
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {renderTrigger()}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Denúncia Anônima
          </DialogTitle>
          <DialogDescription>
            Sua identidade será protegida. Todas as denúncias são analisadas pela nossa equipe de moderação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Categoria */}
          <div className="space-y-2">
            <Label>Motivo da denúncia *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(reportCategoryLabels) as [ReportCategory, string][]).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label>Detalhes (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o que aconteceu..."
              rows={4}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/1000 caracteres
            </p>
          </div>

          {/* Urgente */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <Checkbox
              id="urgent"
              checked={isUrgent}
              onCheckedChange={(checked) => setIsUrgent(checked === true)}
            />
            <div className="space-y-1">
              <label 
                htmlFor="urgent" 
                className="text-sm font-medium cursor-pointer flex items-center gap-2"
              >
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Situação Urgente
              </label>
              <p className="text-xs text-muted-foreground">
                Marque se houver risco imediato para alguém
              </p>
            </div>
          </div>

          {/* Aviso de anonimato */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs text-muted-foreground">
              🔒 <strong>100% Anônimo:</strong> Não armazenamos informações que possam identificá-lo. 
              Sua denúncia será analisada com total sigilo.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!category || createReport.isPending}
            className="flex-1 gap-2"
          >
            {createReport.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Flag className="h-4 w-4" />
            )}
            Enviar Denúncia
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
