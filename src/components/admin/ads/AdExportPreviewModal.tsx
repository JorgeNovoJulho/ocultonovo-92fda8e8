/**
 * AdExportPreviewModal — mostra a prévia do PNG gerado antes de baixar.
 * Permite Download e Copiar para clipboard.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Copy,
  CheckCircle2,
  X,
  Loader2,
  AlertCircle,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateAdPreviewImage,
  downloadBlob,
  copyImageBlobToClipboard,
  type GeneratedPreview,
} from "@/lib/exportAdPreview";
import { toStructuredError, type AdStructuredError, type AdErrorAction } from "@/lib/adErrors";
import { AdErrorAlert } from "./AdErrorAlert";

interface Ad {
  title: string;
  description?: string;
  ctaText: string;
  imageUrl?: string;
  accent?: string;
  badge?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ad: Ad;
  filename: string;
}

export function AdExportPreviewModal({ open, onOpenChange, ad, filename }: Props) {
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [error, setError] = useState<AdStructuredError | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setCopied(false);
      return;
    }
    let cancelled = false;
    setGenerating(true);
    setError(null);
    generateAdPreviewImage(ad)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) setError(toStructuredError("export", e));
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ad]);

  const handleDownload = () => {
    if (!preview) return;
    downloadBlob(preview.blob, filename);
    toast.success("PNG baixado");
  };

  const handleCopy = async () => {
    if (!preview) return;
    const ok = await copyImageBlobToClipboard(preview.blob);
    if (ok) {
      setCopied(true);
      toast.success("Imagem copiada para a área de transferência");
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error("Seu navegador não suporta copiar imagens", {
        description: "Use o botão Baixar e cole o arquivo manualmente.",
      });
    }
  };

  const handleErrorAction = (a: AdErrorAction) => {
    if (a === "retry") {
      setError(null);
      setGenerating(true);
      generateAdPreviewImage(ad)
        .then(setPreview)
        .catch((e) => setError(toStructuredError("export", e)))
        .finally(() => setGenerating(false));
    } else if (a === "cancel") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] sm:w-full p-0 gap-0 overflow-hidden">
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Download className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">Prévia da exportação</h3>
              <p className="text-[11px] text-muted-foreground truncate">
                {generating
                  ? "Gerando imagem…"
                  : preview
                    ? `${Math.round(preview.width / 2)}×${Math.round(preview.height / 2)} px · PNG`
                    : "—"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 bg-muted/30 max-h-[60vh] overflow-auto">
          {generating && (
            <div className="space-y-2">
              <Skeleton className="w-full aspect-[3/1] rounded-md" />
              <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Renderizando preview…
              </p>
            </div>
          )}

          {!generating && error && (
            <AdErrorAlert error={error} onAction={handleErrorAction} onDismiss={() => onOpenChange(false)} />
          )}

          {!generating && preview && !error && (
            <div className="space-y-2">
              <img
                src={preview.dataUrl}
                alt="Prévia da exportação"
                className="w-full h-auto rounded-md border border-border shadow-sm bg-background"
              />
              <p className="text-[11px] text-center text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Imagem pronta para baixar ou copiar
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-card">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!preview || generating}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" /> Copiado
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copiar imagem
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!preview || generating}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> Baixar PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
