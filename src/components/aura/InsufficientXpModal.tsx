/**
 * InsufficientXpModal — Modal global de saldo insuficiente de XP.
 * Escuta evento `AURA_XP_INSUFFICIENT` disparado pelo hook useAuraXpInteraction.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, Sparkles, Info } from 'lucide-react';
import { AURA_XP_INSUFFICIENT_EVENT, type InsufficientXpDetail } from '@/hooks/useAuraXpInteraction';
import { AURA_XP_HOW_TO_STEPS } from '@/data/auraXpHowTo';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const ACTION_LABEL: Record<string, string> = {
  post_like: 'Curtir',
  post_dislike: 'Descurtir',
  post_comment: 'Comentar',
  post_save: 'Salvar',
  post_share: 'Compartilhar',
  view_likers: 'Ver quem curtiu',
  view_comments: 'Ler comentários',
};

export function InsufficientXpModal() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [detail, setDetail] = useState<InsufficientXpDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<InsufficientXpDetail>;
      if (!ce.detail) return;
      setDetail(ce.detail);
      setShowHowTo(false);
      setOpen(true);
    };
    window.addEventListener(AURA_XP_INSUFFICIENT_EVENT, handler);
    return () => window.removeEventListener(AURA_XP_INSUFFICIENT_EVENT, handler);
  }, []);

  if (!detail) return null;

  const label = ACTION_LABEL[detail.actionKey] || detail.actionKey;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          'gap-0 p-0 w-[calc(100vw-1rem)] sm:max-w-md',
          'grid grid-rows-[auto_minmax(0,1fr)_auto]'
        )}
        style={{
          maxHeight: 'calc(100svh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem)',
        }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 pr-10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-amber-400" />
            {showHowTo ? 'Como obter XP de Aura' : 'Saldo de XP insuficiente'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {showHowTo
              ? 'Estas são as formas de acumular XP rapidamente.'
              : `A ação "${label}" precisa de XP de Aura para ser realizada.`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="px-5 pb-3">
          {!showHowTo ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-amber-300/80">Seu saldo atual</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-amber-300">
                  {detail.balance} <span className="text-sm font-medium">XP</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Esta ação custa <span className="font-semibold text-foreground">{detail.required} XP</span>.
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Continue interagindo com o universo Oculto para ganhar XP — visitas diárias, missões,
                check-in, presentes recebidos e Super DMs liberam XP novo para você.
              </p>
            </div>
          ) : (
            <ol className="space-y-3 pb-1">
              {AURA_XP_HOW_TO_STEPS.map((step, idx) => (
                <li key={step.title} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-xs font-bold text-amber-300">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{step.title}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>

        <div className="border-t border-border/50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {!showHowTo ? (
            <>
              <Button variant="outline" onClick={() => setShowHowTo(true)} className="gap-2">
                <Info className="h-4 w-4" /> Saiba mais
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  navigate('/aura-match');
                }}
                className="gap-2 bg-gradient-to-r from-amber-400 to-pink-500 text-black hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" /> Ir ao Aura Match
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowHowTo(false)}>
                Voltar
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  navigate('/aura-match');
                }}
                className="gap-2 bg-gradient-to-r from-amber-400 to-pink-500 text-black hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" /> Ir ao Aura Match
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
