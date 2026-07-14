import { useEffect, useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCommunityJoinQuestions, useSetCommunityJoinQuestions } from '@/hooks/useCommunities';

interface ManageJoinQuestionsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
}

interface DraftQuestion {
  id?: string;
  question: string;
  is_required: boolean;
}

export function ManageJoinQuestionsModal({ open, onOpenChange, communityId }: ManageJoinQuestionsModalProps) {
  const { data: existing } = useCommunityJoinQuestions(communityId, open);
  const setMutation = useSetCommunityJoinQuestions(communityId);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);

  useEffect(() => {
    if (!open) return;
    setDrafts(
      (existing ?? []).map((q) => ({ id: q.id, question: q.question, is_required: q.is_required })),
    );
  }, [open, existing]);

  const addRow = () => setDrafts((d) => [...d, { question: '', is_required: true }]);
  const removeRow = (idx: number) => setDrafts((d) => d.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<DraftQuestion>) =>
    setDrafts((d) => d.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    await setMutation.mutateAsync(
      drafts.map((d, i) => ({ question: d.question, is_required: d.is_required, position: i + 1 })),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Perguntas de portaria</DialogTitle>
          <DialogDescription>
            Faça perguntas que todo novo candidato precisa responder antes de entrar. Use para filtrar perfil, intenção ou idade.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-2">
          <div className="space-y-3">
            {drafts.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma pergunta. Adicione abaixo.
              </p>
            )}
            {drafts.map((d, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2 bg-card">
                <div className="flex items-start gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-2.5 shrink-0" />
                  <Input
                    placeholder={`Pergunta ${i + 1}`}
                    value={d.question}
                    onChange={(e) => updateRow(i, { question: e.target.value })}
                    maxLength={200}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <Switch
                    id={`req-${i}`}
                    checked={d.is_required}
                    onCheckedChange={(v) => updateRow(i, { is_required: v })}
                  />
                  <Label htmlFor={`req-${i}`} className="text-xs text-muted-foreground cursor-pointer">
                    Resposta obrigatória
                  </Label>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Button variant="outline" size="sm" onClick={addRow} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar pergunta
        </Button>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={setMutation.isPending}>
            {setMutation.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
