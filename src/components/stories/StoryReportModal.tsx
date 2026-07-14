import { useState } from 'react';
import { Flag, AlertTriangle, ShieldAlert, UserX, Ban, CheckCircle2, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCreateReport, REPORT_CATEGORIES, type ReportCategory } from '@/hooks/useContentReports';
import { toast } from 'sonner';

interface StoryReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyId: string;
  storyAuthorId: string;
}

type Step = 'category' | 'details' | 'success';

const CATEGORY_ICONS: Record<ReportCategory, React.ElementType> = {
  revenge_porn: ShieldAlert,
  minor: AlertTriangle,
  harassment: UserX,
  spam: Ban,
  fake_profile: UserX,
  other: Flag,
};

export function StoryReportModal({ 
  open, 
  onOpenChange, 
  storyId, 
  storyAuthorId 
}: StoryReportModalProps) {
  const [step, setStep] = useState<Step>('category');
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  
  const createReport = useCreateReport();

  const handleCategorySelect = (category: ReportCategory) => {
    setSelectedCategory(category);
    setStep('details');
  };

  const handleSubmit = async () => {
    if (!selectedCategory) return;

    try {
      await createReport.mutateAsync({
        story_id: storyId,
        reported_user_id: storyAuthorId,
        category: selectedCategory,
        description: description || undefined,
      });
      
      setStep('success');
      
      // Auto close after success
      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (error) {
      toast.error('Erro ao enviar denúncia. Tente novamente.');
    }
  };

  const handleClose = () => {
    setStep('category');
    setSelectedCategory(null);
    setDescription('');
    onOpenChange(false);
  };

  const selectedCategoryConfig = selectedCategory ? REPORT_CATEGORIES[selectedCategory] : null;
  const isCritical = selectedCategoryConfig?.priority === 'critical';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {/* Step: Category Selection */}
        {step === 'category' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-destructive" />
                Denunciar Story
              </DialogTitle>
              <DialogDescription>
                Selecione o motivo da denúncia
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 py-4">
              {(Object.entries(REPORT_CATEGORIES) as [ReportCategory, typeof REPORT_CATEGORIES[ReportCategory]][]).map(([key, config]) => {
                const Icon = CATEGORY_ICONS[key];
                const isCriticalCategory = config.priority === 'critical';
                
                return (
                  <button
                    key={key}
                    onClick={() => handleCategorySelect(key)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-left transition-all hover:bg-muted/50",
                      isCriticalCategory 
                        ? "border-destructive/30 hover:border-destructive/50" 
                        : "border-border"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-lg",
                      isCriticalCategory 
                        ? "bg-destructive/10 text-destructive" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{config.label}</span>
                        {isCriticalCategory && (
                          <Badge variant="destructive" className="text-[10px] px-1.5">
                            URGENTE
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {config.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Step: Details */}
        {step === 'details' && selectedCategoryConfig && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isCritical && <AlertTriangle className="h-5 w-5 text-destructive" />}
                {selectedCategoryConfig.label}
              </DialogTitle>
              <DialogDescription>
                {isCritical 
                  ? 'Esta denúncia será tratada com prioridade máxima.'
                  : 'Adicione detalhes para ajudar nossa equipe.'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {isCritical && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                    <ShieldAlert className="h-4 w-4" />
                    Denúncia Crítica
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Este tipo de conteúdo será analisado imediatamente. O story poderá ser removido cautelarmente.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">
                  Descrição {!isCritical && <span className="text-muted-foreground">(opcional)</span>}
                </Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o que você viu neste story..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-24 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('category')}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createReport.isPending || (isCritical && !description.trim())}
                className={cn(
                  "flex-1",
                  isCritical && "bg-destructive hover:bg-destructive/90"
                )}
              >
                {createReport.isPending ? 'Enviando...' : 'Enviar Denúncia'}
              </Button>
            </div>
          </>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="py-8 text-center">
            <div className={cn(
              "w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4",
              isCritical ? "bg-destructive/10" : "bg-green-500/10"
            )}>
              <CheckCircle2 className={cn(
                "h-8 w-8",
                isCritical ? "text-destructive" : "text-green-500"
              )} />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Denúncia Enviada
            </h3>
            <p className="text-sm text-muted-foreground">
              {isCritical 
                ? 'Nossa equipe irá analisar imediatamente.'
                : 'Nossa equipe irá analisar sua denúncia em breve.'
              }
            </p>
            <Button
              variant="outline"
              onClick={handleClose}
              className="mt-6"
            >
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}