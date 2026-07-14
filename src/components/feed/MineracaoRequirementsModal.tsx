/**
 * MineracaoRequirementsModal — Mostra os requisitos da Sala Mineração
 * (Aura nível 2, Score Social 500, Prestígio 500 XP) e, quando o usuário
 * cumpre tudo, oferece o botão "Entrar agora". Quando algo falta, lista o
 * que está pendente com explicação de como conseguir.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Pickaxe, ArrowRight, Sparkles, Star, Award } from 'lucide-react';

interface RequirementCheck {
  ok: boolean;
  current: number;
  required: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auraLevel: RequirementCheck;
  socialScore: RequirementCheck;
  prestige: RequirementCheck;
}

const HOW_TO: Record<string, { title: string; tips: string[] }> = {
  aura: {
    title: 'Aura nível 2',
    tips: [
      'Faça check-in diário no Aura Match.',
      'Entre em salas sociais regularmente — cada minuto ativo vira XP.',
      'Receba pulsos e destaque de outras pessoas.',
    ],
  },
  score: {
    title: 'Score Social 500',
    tips: [
      'Publique conteúdo no feed (post, foto, áudio ou vídeo).',
      'Receba curtidas, comentários e compartilhamentos.',
      'Mantenha consistência — postar regularmente acelera o score.',
    ],
  },
  prestige: {
    title: 'Prestígio 500 XP',
    tips: [
      'Ganhe XP em conexões reais e experiências sociais.',
      'Avaliações 5 estrelas e depoimentos elevam seu prestígio.',
      'Participe de eventos VIP e missões da plataforma.',
    ],
  },
};

export function MineracaoRequirementsModal({ open, onOpenChange, auraLevel, socialScore, prestige }: Props) {
  const navigate = useNavigate();
  const allOk = auraLevel.ok && socialScore.ok && prestige.ok;

  const items = useMemo(() => ([
    { key: 'aura',     icon: Sparkles, label: 'Aura',       check: auraLevel,   suffix: '' },
    { key: 'score',    icon: Star,     label: 'Score Social', check: socialScore, suffix: ' pts' },
    { key: 'prestige', icon: Award,    label: 'Prestígio',   check: prestige,    suffix: ' XP' },
  ] as const), [auraLevel, socialScore, prestige]);

  const enterRoom = () => {
    onOpenChange(false);
    navigate('/aura-match?room=mineracao');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Pickaxe className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Sala Mineração</DialogTitle>
              <DialogDescription className="text-xs">
                {allOk
                  ? 'Tudo certo! Você pode entrar agora.'
                  : 'Você ainda não atende todos os requisitos.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {items.map(({ key, icon: Icon, label, check, suffix }) => {
            const pct = Math.min(100, Math.round((check.current / Math.max(1, check.required)) * 100));
            return (
              <div
                key={key}
                className={`rounded-xl border p-3 ${
                  check.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {check.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-400" />
                    )}
                    <span className={`text-xs tabular-nums ${check.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {check.current}{suffix} / {check.required}{suffix}
                    </span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-background/60 overflow-hidden">
                  <div
                    className={`h-full transition-all ${check.ok ? 'bg-emerald-400' : 'bg-amber-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {!check.ok && (
                  <div className="mt-2 text-[11px] text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground/80">Como conseguir:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {HOW_TO[key].tips.map((t) => (<li key={t}>{t}</li>))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Fechar
          </Button>
          {allOk ? (
            <Button onClick={enterRoom} className="w-full sm:w-auto gap-2 bg-amber-500 hover:bg-amber-600 text-black">
              Entrar na Mineração <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => { onOpenChange(false); navigate('/aura-match'); }} className="w-full sm:w-auto gap-2">
              Evoluir minha aura <Sparkles className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
