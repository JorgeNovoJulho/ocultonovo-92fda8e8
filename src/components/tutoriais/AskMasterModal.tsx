import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { getOrCreateConversationId } from '@/lib/conversationsApi';
import { findMasterUserId, Tutorial } from '@/hooks/useTutorials';
import { getTutorialCategory } from '@/config/tutorialCategories';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tutorial: Tutorial;
}

export function AskMasterModal({ open, onOpenChange, tutorial }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const cat = getTutorialCategory(tutorial.category);

  const handleSend = async () => {
    if (!user) {
      toast.error('Faça login para enviar.');
      return;
    }
    const q = question.trim();
    if (!q) {
      toast.error('Escreva sua dúvida.');
      return;
    }
    setSending(true);
    try {
      const masterId = await findMasterUserId();
      if (!masterId) throw new Error('Administrador master indisponível no momento.');

      const { id: convId, error: convErr } = await getOrCreateConversationId(user.id, masterId);
      if (convErr || !convId) throw new Error(convErr?.message ?? 'Não foi possível abrir a conversa.');

      const body = `📚 *Tutorial: ${cat.label}*\n*${tutorial.title}*\n\n${q}`;
      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        receiver_id: masterId,
        content: body,
        message_type: 'text',
      } as any);
      if (msgErr) throw msgErr;

      toast.success('Mensagem enviada ao administrador.');
      onOpenChange(false);
      navigate(`/messages?conversation=${convId}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Falar com o Administrador</DialogTitle>
          <DialogDescription>
            Sua dúvida será enviada por chat ao <strong>oculto_master</strong> junto com o título e a
            categoria do tutorial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs rounded-lg bg-muted/40 p-3 border border-border/50">
            <div><strong>Categoria:</strong> {cat.label}</div>
            <div><strong>Tutorial:</strong> {tutorial.title}</div>
          </div>
          <Textarea
            placeholder="Escreva sua dúvida aqui..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={5}
            maxLength={1000}
            disabled={sending}
          />
          <div className="text-[11px] text-muted-foreground text-right">{question.length}/1000</div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !question.trim()}>
            {sending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Enviar para o Master
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
