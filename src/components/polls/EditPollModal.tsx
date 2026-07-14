import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Pencil, RotateCw } from 'lucide-react';
import { usePollByPostId, useUpdatePoll } from '@/hooks/usePolls';
import { isPast } from 'date-fns';

interface EditPollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  initialContentText?: string | null;
  /** Quando true, abre o modal já em modo "Reabrir": data de encerramento limpa e botão "Reabrir e salvar". */
  defaultReopen?: boolean;
}

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function plus24hLocal() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export function EditPollModal({ open, onOpenChange, postId, initialContentText, defaultReopen }: EditPollModalProps) {
  const { data: poll, isLoading } = usePollByPostId(postId);
  const update = useUpdatePoll();

  const [question, setQuestion] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [contentText, setContentText] = useState('');
  const [options, setOptions] = useState<{ id: string; text: string; image_url: string | null }[]>([]);
  const [reopenMode, setReopenMode] = useState(false);

  const isClosed = !!poll?.closes_at && isPast(new Date(poll.closes_at));

  useEffect(() => {
    if (!poll || !open) return;
    setQuestion(poll.question);
    setAllowMultiple(poll.allow_multiple_votes);
    setShowResults(poll.show_results_before_vote);
    setContentText(initialContentText || '');
    setOptions(
      poll.options.map((o) => ({
        id: o.id,
        text: o.option_text,
        image_url: o.image_url || null,
      }))
    );
    // Se aberto em modo reabrir e a enquete está encerrada, sugere +24h por padrão
    if (defaultReopen && isClosed) {
      setReopenMode(true);
      setClosesAt(plus24hLocal());
    } else {
      setReopenMode(false);
      setClosesAt(toLocalInputValue(poll.closes_at));
    }
  }, [poll, open, initialContentText, defaultReopen, isClosed]);

  // Reabre + sobe ao topo sempre que a enquete está encerrada e o novo prazo é futuro,
  // independentemente do CTA (Editar ou Reabrir) que abriu o modal.
  const futureClose = !!closesAt && !isPast(new Date(closesAt));
  const willReopen = (reopenMode || isClosed) && futureClose;

  const handleSave = async () => {
    if (!poll) return;
    await update.mutateAsync({
      pollId: poll.id,
      postId,
      question: question.trim(),
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      allow_multiple_votes: allowMultiple,
      show_results_before_vote: showResults,
      content_text: contentText.trim() || null,
      options: options.map((o) => ({ id: o.id, text: o.text.trim(), image_url: o.image_url })),
      bumpToTop: willReopen,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {reopenMode ? (
              <>
                <RotateCw className="h-5 w-5 text-primary" /> Reabrir Enquete
              </>
            ) : (
              <>
                <Pencil className="h-5 w-5 text-primary" /> Editar Enquete
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !poll ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {reopenMode && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-foreground">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <RotateCw className="h-3.5 w-3.5 text-primary" />
                  Reabertura da enquete
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Defina uma nova data de encerramento abaixo. Ao salvar, a enquete volta a aceitar votos e é movida para o topo do feed.
                </p>
              </div>
            )}

            {isClosed && !reopenMode && (
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Enquete encerrada</p>
                  <p className="text-xs text-muted-foreground">Reabra para aceitar novos votos.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setReopenMode(true);
                    setClosesAt(plus24hLocal());
                  }}
                >
                  <RotateCw className="h-3.5 w-3.5" /> Reabrir
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Pergunta</Label>
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Opções</Label>
              {options.map((o, i) => (
                <Input
                  key={o.id}
                  value={o.text}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = { ...next[i], text: e.target.value };
                    setOptions(next);
                  }}
                  placeholder={`Opção ${i + 1}`}
                />
              ))}
              <p className="text-xs text-muted-foreground">
                Imagens das opções não podem ser alteradas após a criação.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Encerramento</Label>
              <Input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
              {reopenMode && (!closesAt || isPast(new Date(closesAt))) && (
                <p className="text-xs text-destructive">
                  Escolha uma data futura para reabrir a enquete.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label>Permitir múltiplos votos</Label>
              <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Mostrar resultados antes de votar</Label>
              <Switch checked={showResults} onCheckedChange={setShowResults} />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              update.isPending ||
              !poll ||
              (reopenMode && (!closesAt || isPast(new Date(closesAt))))
            }
            className={reopenMode ? 'gap-1.5' : undefined}
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : reopenMode ? (
              <>
                <RotateCw className="h-4 w-4" />
                Reabrir e salvar
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
