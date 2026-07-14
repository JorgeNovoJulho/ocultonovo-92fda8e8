/**
 * CaixaOcultaWinnersView — exibe vencedores apurados com posição, prêmio e data.
 * Compacto: usado dentro do card e do modal de regras.
 */
import { Trophy, Medal, Award } from 'lucide-react';
import { useCaixaOcultaCampaign } from '@/hooks/useCaixaOculta';

interface Props { campaignId: string; }

const ICONS = [Trophy, Medal, Award];
const COLORS = ['text-amber-500', 'text-slate-400', 'text-orange-600'];

export function CaixaOcultaWinnersView({ campaignId }: Props) {
  const { data, isLoading } = useCaixaOcultaCampaign(campaignId);

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-lg bg-muted/40" />;
  }
  const winners = data?.winners ?? [];
  const prizes = data?.prizes ?? [];
  const drawnAt = data?.campaign?.drawn_at;

  if (!winners.length) {
    return (
      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        Aguardando apuração dos vencedores.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vencedores</p>
      <ul className="space-y-1.5">
        {winners.map((w) => {
          const Icon = ICONS[w.prize_position - 1] ?? Trophy;
          const color = COLORS[w.prize_position - 1] ?? 'text-muted-foreground';
          const prize = prizes.find((p) => p.prize_position === w.prize_position);
          return (
            <li key={w.prize_position} className="flex items-center gap-2 text-sm">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="font-semibold">#{w.prize_position}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {w.user_id.slice(0, 8)}…
              </span>
              {prize && <span className="ml-auto truncate text-xs">{prize.title}</span>}
            </li>
          );
        })}
      </ul>
      {drawnAt && (
        <p className="text-[10px] text-muted-foreground">
          Apurada em {new Date(drawnAt).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}

export default CaixaOcultaWinnersView;
