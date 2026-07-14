/**
 * ReportOcultoPlayContentModal — Modal de denúncia de item do Oculto Play.
 * Usa RPC `oculto_play_report` via useOcultoPlayActions().report.
 */
import { useState } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useOcultoPlayActions } from '@/hooks/useOcultoPlayContent';
import { Flag, Loader2 } from 'lucide-react';

interface Props {
  itemId: string | null;
  open: boolean;
  onClose: () => void;
}

const REASONS: { id: string; label: string }[] = [
  { id: 'proibido', label: 'Conteúdo proibido' },
  { id: 'menor_de_idade', label: 'Menor de idade' },
  { id: 'violencia_real', label: 'Violência real' },
  { id: 'discurso_de_odio', label: 'Discurso de ódio' },
  { id: 'dados_pessoais', label: 'Dados pessoais expostos' },
  { id: 'golpe_fraude', label: 'Golpe / Fraude' },
  { id: 'spam', label: 'Spam' },
  { id: 'sexual_explicito_publico', label: 'Conteúdo sexual explícito no Play público' },
  { id: 'copyright', label: 'Violação de direitos autorais' },
  { id: 'sem_autorizacao', label: 'Conteúdo sem autorização' },
  { id: 'outro', label: 'Outro' },
];

const schema = z.object({
  reason: z.string().min(1, 'Selecione um motivo'),
  details: z.string().trim().max(500, 'Máx. 500 caracteres').optional(),
});

export function ReportOcultoPlayContentModal({ itemId, open, onClose }: Props) {
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const { report } = useOcultoPlayActions();

  const reset = () => { setReason(''); setDetails(''); };
  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    if (!itemId) return;
    const parsed = schema.safeParse({ reason, details });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Verifique os campos');
      return;
    }
    try {
      await report.mutateAsync({
        itemId,
        reason: parsed.data.reason,
        details: parsed.data.details || undefined,
      });
      toast.success('Denúncia enviada. Nosso time vai analisar.');
      handleClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Não foi possível enviar a denúncia');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-rose-400" />
            Denunciar conteúdo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Motivo</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="grid gap-1.5 max-h-72 overflow-y-auto pr-1">
              {REASONS.map((r) => (
                <label
                  key={r.id}
                  htmlFor={`reason-${r.id}`}
                  className="flex items-center gap-2 rounded-md border border-border/40 bg-card/40 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-card/70"
                >
                  <RadioGroupItem id={`reason-${r.id}`} value={r.id} />
                  <span>{r.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="report-details" className="text-xs text-muted-foreground mb-1.5 block">
              Detalhes (opcional, até 500 caracteres)
            </Label>
            <Textarea
              id="report-details"
              value={details}
              maxLength={500}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Conte o que aconteceu…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={report.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={!reason || report.isPending || !itemId}
            className="bg-rose-500 hover:bg-rose-500/90 text-white"
          >
            {report.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Flag className="h-4 w-4 mr-2" />}
            Enviar denúncia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
