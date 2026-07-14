/**
 * Modal de Denúncia de Conteúdo Avançado
 * Suporta categorias com priorização jurídica e upload de evidências
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  useCreateReport,
  useUploadEvidence,
  REPORT_CATEGORIES,
  type ReportCategory,
} from "@/hooks/useContentReports";
import {
  ShieldAlert,
  AlertTriangle,
  UserX,
  Ban,
  Flag,
  Upload,
  X,
  Loader2,
  Send,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId?: string;
  reportedUserId?: string;
  contentPreview?: string;
}

// Mapeamento de ícones
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  ShieldAlert,
  AlertTriangle,
  UserX,
  Ban,
  Flag,
};

export function ContentReportModal({
  open,
  onOpenChange,
  postId,
  reportedUserId,
  contentPreview,
}: ContentReportModalProps) {
  const createReport = useCreateReport();
  const uploadEvidence = useUploadEvidence();

  const [step, setStep] = useState<'category' | 'details' | 'success'>('category');
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCritical = selectedCategory === 'revenge_porn' || selectedCategory === 'minor';
  const categoryConfig = selectedCategory ? REPORT_CATEGORIES[selectedCategory] : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`Arquivo ${f.name} muito grande (máx 10MB)`);
        return false;
      }
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} não é uma imagem válida`);
        return false;
      }
      return true;
    });
    setEvidenceFiles(prev => [...prev, ...validFiles].slice(0, 3));
  };

  const removeFile = (index: number) => {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedCategory) {
      toast.error("Selecione uma categoria");
      return;
    }

    if (isCritical && !description.trim()) {
      toast.error("Descrição obrigatória para denúncias urgentes");
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload de evidências primeiro
      const paths: string[] = [];
      for (const file of evidenceFiles) {
        const path = await uploadEvidence.mutateAsync(file);
        paths.push(path);
      }
      setUploadedPaths(paths);

      // Criar denúncia
      await createReport.mutateAsync({
        post_id: postId,
        reported_user_id: reportedUserId,
        category: selectedCategory,
        description: description.trim() || undefined,
        evidence_urls: paths.length > 0 ? paths : undefined,
      });

      setStep('success');
    } catch (error) {
      toast.error("Erro ao enviar denúncia. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('category');
    setSelectedCategory(null);
    setDescription("");
    setEvidenceFiles([]);
    setUploadedPaths([]);
    onOpenChange(false);
  };

  const renderCategoryStep = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecione o motivo da denúncia. Categorias críticas têm prioridade máxima e SLA de 2 horas.
      </p>

      <RadioGroup
        value={selectedCategory || ""}
        onValueChange={(value) => setSelectedCategory(value as ReportCategory)}
        className="space-y-3"
      >
        {Object.entries(REPORT_CATEGORIES).map(([key, config]) => {
          const Icon = CATEGORY_ICONS[config.icon] || Flag;
          const isCriticalCategory = key === 'revenge_porn' || key === 'minor';

          return (
            <div
              key={key}
              className={cn(
                "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
                selectedCategory === key
                  ? isCriticalCategory
                    ? "border-[#FF007F] bg-[#FF007F]/10 ring-1 ring-[#FF007F]"
                    : "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/50",
                isCriticalCategory && "border-destructive/30"
              )}
              onClick={() => setSelectedCategory(key as ReportCategory)}
            >
              <RadioGroupItem value={key} id={key} className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Icon className={cn(
                    "h-4 w-4",
                    isCriticalCategory ? "text-[#FF007F]" : "text-muted-foreground"
                  )} />
                  <Label htmlFor={key} className="font-medium cursor-pointer">
                    {config.label}
                  </Label>
                  {isCriticalCategory && (
                    <Badge className="bg-[#FF007F] text-white text-[10px] px-1.5">
                      URGENTE
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {config.description}
                </p>
              </div>
            </div>
          );
        })}
      </RadioGroup>

      <div className="flex gap-2 pt-4">
        <Button variant="outline" className="flex-1" onClick={handleClose}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          onClick={() => setStep('details')}
          disabled={!selectedCategory}
        >
          Continuar
        </Button>
      </div>
    </div>
  );

  const renderDetailsStep = () => (
    <div className="space-y-4">
      {/* Aviso de prioridade */}
      {isCritical && (
        <div className="p-3 rounded-lg bg-[#FF007F]/10 border border-[#FF007F]/30">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-[#FF007F] text-white gap-1 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              ALERTA VERMELHO
            </Badge>
            <span className="text-sm font-medium text-[#FF007F]">Prioridade Máxima</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>SLA: Resolução em até <strong className="text-foreground">2 horas</strong></span>
          </div>
        </div>
      )}

      {/* Preview do conteúdo */}
      {contentPreview && (
        <div className="p-3 rounded-lg bg-muted/30 border">
          <Label className="text-xs text-muted-foreground">Conteúdo denunciado:</Label>
          <p className="text-sm mt-1 line-clamp-2">{contentPreview}</p>
        </div>
      )}

      {/* Descrição */}
      <div className="space-y-2">
        <Label htmlFor="description">
          Descreva a situação {isCritical && <span className="text-destructive">*</span>}
        </Label>
        <Textarea
          id="description"
          placeholder="Forneça detalhes sobre o conteúdo denunciado..."
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="focus:ring-[#FF007F] focus:border-[#FF007F]"
        />
      </div>

      {/* Upload de evidência */}
      {(isCritical || categoryConfig?.requiresEvidence) && (
        <div className="space-y-2">
          <Label>
            Anexar evidência (captura de tela)
            {isCritical && <span className="text-muted-foreground text-xs ml-1">(recomendado)</span>}
          </Label>
          
          {evidenceFiles.length < 3 && (
            <div className="relative">
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="evidence-upload"
                multiple
              />
              <Label
                htmlFor="evidence-upload"
                className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-muted-foreground/50 transition-colors"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Clique para anexar imagens (máx 3 arquivos, 10MB cada)
                </span>
              </Label>
            </div>
          )}

          {/* Lista de arquivos */}
          {evidenceFiles.length > 0 && (
            <div className="space-y-2">
              {evidenceFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                >
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-2 pt-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setStep('category')}
          disabled={isSubmitting}
        >
          Voltar
        </Button>
        <Button
          className={cn(
            "flex-1 gap-2",
            isCritical && "bg-[#FF007F] hover:bg-[#FF007F]/90"
          )}
          onClick={handleSubmit}
          disabled={isSubmitting || (isCritical && !description.trim())}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isCritical ? 'Enviar Denúncia Urgente' : 'Enviar Denúncia'}
        </Button>
      </div>

      {/* Aviso legal */}
      <p className="text-[10px] text-muted-foreground text-center">
        Denúncias falsas podem resultar em responsabilização civil e criminal.
      </p>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="text-center py-6 space-y-4">
      <div className={cn(
        "w-16 h-16 rounded-full mx-auto flex items-center justify-center",
        isCritical ? "bg-[#FF007F]/20" : "bg-green-500/20"
      )}>
        <CheckCircle2 className={cn(
          "h-8 w-8",
          isCritical ? "text-[#FF007F]" : "text-green-500"
        )} />
      </div>

      <div>
        <h3 className="text-lg font-semibold">Denúncia Registrada!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isCritical ? (
            <>
              <span className="text-[#FF007F] font-medium">ALERTA VERMELHO ativado.</span>
              <br />
              O conteúdo será analisado em até 2 horas.
            </>
          ) : (
            "Nossa equipe irá analisar sua denúncia em breve."
          )}
        </p>
      </div>

      {isCritical && (
        <div className="p-3 rounded-lg bg-muted/30 border">
          <p className="text-sm">
            📌 O conteúdo já foi sinalizado para <strong>remoção cautelar</strong> enquanto 
            nossa equipe de moderação analisa o caso.
          </p>
        </div>
      )}

      <Button onClick={handleClose} className="w-full">
        Fechar
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {step !== 'success' && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[#FF007F]" />
              Denunciar Conteúdo
            </DialogTitle>
            <DialogDescription>
              {step === 'category' 
                ? 'Selecione o tipo de violação para prosseguir.'
                : `Categoria: ${categoryConfig?.label}`
              }
            </DialogDescription>
          </DialogHeader>
        )}

        {step === 'category' && renderCategoryStep()}
        {step === 'details' && renderDetailsStep()}
        {step === 'success' && renderSuccessStep()}
      </DialogContent>
    </Dialog>
  );
}
