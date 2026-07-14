/**
 * FeedContentTypeModal — modal que espelha o card "Tipo de conteúdo no feed"
 * das configurações. Permite alternar entre 'Apenas +18' e 'Experiência completa'
 * com efeito imediato (otimista + realtime), sem reload.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Flame, Globe2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFeedExperienceMode } from '@/hooks/useFeedExperienceMode';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function FeedContentTypeModal({ open, onOpenChange }: Props) {
  const { mode, setMode, isUpdating } = useFeedExperienceMode();

  const options = [
    {
      id: 'adult_only' as const,
      icon: Flame,
      title: 'Apenas conteúdo +18',
      desc: 'Feed restrito a postagens marcadas como +18. Stories, comunidades, salas e Oculto Play ficam ocultos no feed (continuam acessíveis pelo menu).',
    },
    {
      id: 'complete' as const,
      icon: Globe2,
      title: 'Experiência completa',
      desc: 'Mostra tudo: posts, stories, comunidades, salas ocultas, Oculto Play e todo o universo do Oculto.',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-background to-amber-500/5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Tipo de conteúdo no feed
          </DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            Escolha entre ver apenas conteúdo adulto (+18) ou a experiência completa.
            A mudança tem efeito imediato e sincroniza entre seus dispositivos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5">
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setMode(opt.id);
                  setTimeout(() => onOpenChange(false), 280);
                }}
                disabled={isUpdating}
                aria-pressed={active}
                className={cn(
                  'text-left rounded-xl border-2 p-3 transition-all flex items-start gap-2.5',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
                  active
                    ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                    : 'border-border/60 hover:border-amber-500/60 hover:bg-amber-500/5'
                )}
              >
                <div
                  className={cn(
                    'shrink-0 h-9 w-9 rounded-lg flex items-center justify-center',
                    active ? 'bg-amber-500 text-black' : 'bg-muted text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold leading-tight">{opt.title}</span>
                    {active && (
                      <Badge className="h-4 px-1 text-[9px] gap-0.5 bg-amber-500 text-black hover:bg-amber-500">
                        <Check className="h-2.5 w-2.5" /> Ativo
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                    {opt.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
