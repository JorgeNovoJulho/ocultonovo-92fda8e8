import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sparkles, Lock, Check } from 'lucide-react';
import type { SocialScore } from '@/hooks/useSocialScore';

const LABEL: Record<string, string> = {
  discount_sub: 'Desconto na assinatura mensal',
  discount_vip: 'Desconto na assinatura VIP',
  discount_fee: 'Desconto na taxa da plataforma',
  boost_radar: 'Boost no Radar',
  boost_aura: 'Boost de Aura',
  highlight: 'Destaque visual',
  custom: 'Benefício',
};

export function AuraSocialPerksModal({
  open, onClose, score,
}: { open: boolean; onClose: () => void; score: SocialScore }) {
  const glow = `hsl(${score.glow_color})`;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles style={{ color: glow }} className="h-5 w-5" />
            Sua Aura Social — {score.level_name}
          </DialogTitle>
          <DialogDescription>
            Quanto mais você cresce na plataforma, mais benefícios você desbloqueia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {score.perks.length === 0 && (
            <p className="text-sm text-muted-foreground">Continue interagindo para desbloquear seus primeiros benefícios.</p>
          )}
          {score.perks.map((p, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/30"
            >
              <div className="mt-0.5 h-7 w-7 grid place-items-center rounded-full"
                   style={{ background: `hsl(${score.glow_color} / 0.2)`, color: glow }}>
                <Check className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{p.label}</div>
                {p.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                )}
                <div className="text-[11px] mt-1" style={{ color: glow }}>
                  {LABEL[p.kind] ?? p.kind}
                  {['discount_sub','discount_vip','discount_fee'].includes(p.kind) && ` — ${p.value}%`}
                  {['boost_aura','boost_radar'].includes(p.kind) && ` — ×${p.value}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        {score.next_level_name && (
          <div className="mt-3 p-3 rounded-lg border border-dashed border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Próximo nível: <strong className="text-foreground">{score.next_level_name}</strong>
              {' '}— faltam <strong className="text-foreground">{Math.max(0, (score.next_level_xp ?? 0) - score.xp)} XP</strong>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
