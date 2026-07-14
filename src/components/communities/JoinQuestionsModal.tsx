import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCommunityJoinQuestions, useJoinCommunityWithAnswers, useJoinCommunity } from '@/hooks/useCommunities';

interface JoinQuestionsModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  communityTitle?: string;
}

/**
 * Modal de portaria — exibido quando o candidato pede entrada e a comunidade
 * tem perguntas configuradas. Se não houver perguntas, faz join direto.
 */
export function JoinQuestionsModal({ open, onOpenChange, communityId, communityTitle }: JoinQuestionsModalProps) {
  const { data: questions, isLoading } = useCommunityJoinQuestions(communityId, open);
  const joinWithAnswers = useJoinCommunityWithAnswers(communityId);
  const directJoin = useJoinCommunity(communityId);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) setAnswers({});
  }, [open]);

  // Se não há perguntas ativas, faz join direto e fecha
  useEffect(() => {
    if (!open || isLoading) return;
    if ((questions ?? []).length === 0) {
      directJoin.mutate(undefined as any, {
        onSettled: () => onOpenChange(false),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, questions]);

  const handleSubmit = async () => {
    const payload = (questions ?? []).map((q) => ({
      question_id: q.id,
      answer: (answers[q.id] || '').trim(),
    }));
    await joinWithAnswers.mutateAsync(payload);
    onOpenChange(false);
  };

  if ((questions ?? []).length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Portaria{communityTitle ? ` — ${communityTitle}` : ''}</DialogTitle>
          <DialogDescription>
            Responda para que os moderadores conheçam você antes de aprovar.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-2">
          <div className="space-y-4">
            {(questions ?? []).map((q) => (
              <div key={q.id} className="space-y-1.5">
                <Label className="text-sm">
                  {q.question}
                  {q.is_required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <Textarea
                  rows={2}
                  maxLength={500}
                  placeholder="Sua resposta…"
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={joinWithAnswers.isPending}>
            {joinWithAnswers.isPending ? 'Enviando…' : 'Enviar e entrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
