import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Flame, TrendingUp, ShieldCheck, Heart, MessageCircle, UserPlus, Crown, Sparkles, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Item = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  xp: string;
  hint?: string;
  negative?: boolean;
};

const POSITIVE: Item[] = [
  { icon: ShieldCheck, label: "Concluir verificação (KYC)", xp: "+200 XP", hint: "uma única vez" },
  { icon: Sparkles, label: "Completar 100% do perfil", xp: "+100 XP", hint: "uma única vez" },
  { icon: Crown, label: "Receber novo assinante VIP", xp: "+100 XP" },
  { icon: TrendingUp, label: "Vender conteúdo PPV", xp: "+50 XP" },
  { icon: Flame, label: "Publicar um post", xp: "+25 XP", hint: "até 10x por dia" },
  { icon: Sparkles, label: "Subir de nível na Aura Match", xp: "+20 XP" },
  { icon: UserPlus, label: "Ganhar um novo seguidor", xp: "+10 XP" },
  { icon: MessageCircle, label: "Receber um comentário", xp: "+5 XP" },
  { icon: Heart, label: "Receber uma curtida", xp: "+2 XP" },
  { icon: MessageCircle, label: "Enviar mensagem no chat", xp: "+1 XP", hint: "1 a cada 5s" },
];

const NEGATIVE: Item[] = [
  { icon: AlertTriangle, label: "Receber denúncia válida", xp: "−150 XP", negative: true },
  { icon: AlertTriangle, label: "Chargeback confirmado", xp: "−300 XP", negative: true },
  { icon: AlertTriangle, label: "Ser bloqueado por usuário", xp: "−10 XP", negative: true },
];

function Row({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
          item.negative
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-primary/30 bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1 text-[12.5px] text-foreground/90 leading-tight">
        {item.label}
        {item.hint && <span className="block text-[10.5px] text-muted-foreground">{item.hint}</span>}
      </span>
      <span
        className={`shrink-0 text-[11px] font-semibold tabular-nums ${
          item.negative ? "text-destructive" : "text-primary"
        }`}
      >
        {item.xp}
      </span>
    </li>
  );
}

export function EvolutionXpInfoDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:w-full max-w-[95vw] sm:max-w-md max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto p-4 sm:p-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            Como sua Trilha de Evolução sobe
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Seu nível de Prestígio cresce com <b>XP social</b>. Quanto mais você
            interage de forma autêntica na plataforma, mais XP acumula e mais
            rápido desbloqueia o próximo tier.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Ações que somam XP
          </p>
          <ul className="divide-y divide-border/40">
            {POSITIVE.map((it) => (
              <Row key={it.label} item={it} />
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            O que reduz seu XP
          </p>
          <ul className="divide-y divide-border/40">
            {NEGATIVE.map((it) => (
              <Row key={it.label} item={it} />
            ))}
          </ul>
        </div>

        <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-[11.5px] text-foreground/85 leading-relaxed">
          <p className="font-semibold text-primary mb-1">Dica</p>
          Foque em <b>perfil completo</b> + <b>verificação</b> — juntos eles
          rendem <b>+300 XP de uma vez</b>. Depois, mantenha o ritmo
          publicando, conversando e respondendo aos seguidores. Cada nível
          desbloqueia novos perks e mais destaque no Radar.
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
