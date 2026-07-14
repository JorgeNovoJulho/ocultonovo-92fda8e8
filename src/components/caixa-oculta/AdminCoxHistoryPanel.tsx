/**
 * AdminCoxHistoryPanel — lista campanhas apuradas/canceladas e mostra
 * quais prêmios estão "validados" (dentro das regras 1-3) ou "bloqueados"
 * pelas configurações atuais (allow_second/third_prize, allow_physical_prizes).
 */
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trophy,
  Ban,
} from 'lucide-react';
import { useCoxHistory, useCaixaOcultaSettings } from '@/hooks/useCaixaOculta';

export function AdminCoxHistoryPanel() {
  const { data, isLoading } = useCoxHistory(100);
  const { data: settings } = useCaixaOcultaSettings();

  if (isLoading) return <p className="text-sm text-muted-foreground mt-4">Carregando histórico…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground mt-4">Nenhum sorteio realizado ainda.</p>;

  const allow2 = settings?.allow_second_prize ?? true;
  const allow3 = settings?.allow_third_prize ?? true;
  const allowPhys = settings?.allow_physical_prizes ?? false;

  const ruleFor = (pos: number, kind: string) => {
    if (pos < 1 || pos > 3) return { ok: false, reason: 'Posição fora do intervalo 1-3' };
    if (pos === 2 && !allow2) return { ok: false, reason: '2º prêmio desabilitado nas configurações' };
    if (pos === 3 && !allow3) return { ok: false, reason: '3º prêmio desabilitado nas configurações' };
    if ((kind === 'money' || kind === 'physical') && !allowPhys) {
      return { ok: false, reason: 'Categoria física/dinheiro desabilitada' };
    }
    return { ok: true, reason: 'Validado pelas regras vigentes' };
  };

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Validação calculada com as regras vigentes. Prêmios marcados como bloqueados
        seriam recusados pelo trigger backend em novas inserções.
      </p>
      {data.map((c) => (
        <div key={c.id} className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{c.title}</h3>
                <Badge variant={c.status === 'drawn' ? 'secondary' : 'outline'}>
                  {c.status === 'drawn' ? 'Apurada' : 'Cancelada'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {c.drawn_at
                  ? `Apurada em ${new Date(c.drawn_at).toLocaleString('pt-BR')}`
                  : `Criada em ${new Date(c.created_at).toLocaleString('pt-BR')}`}
                {' · '}{c.participants_count} participantes · {c.xp_cost} XP
              </p>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/caixa-oculta/${c.id}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />Abrir
              </Link>
            </Button>
          </div>

          <ul className="space-y-1.5">
            {c.prizes.map((p) => {
              const r = ruleFor(p.prize_position, p.prize_kind);
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
                    r.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
                  }`}
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Ban className="h-4 w-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-semibold">#{p.prize_position}</span>
                  <span className="truncate">{p.title}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] capitalize">{p.prize_kind}</Badge>
                  <span className={`text-[10px] ${r.ok ? 'text-emerald-700' : 'text-rose-700'} hidden sm:inline`}>
                    {r.reason}
                  </span>
                </li>
              );
            })}
            {!c.prizes.length && (
              <li className="text-xs text-muted-foreground">Sem prêmios cadastrados.</li>
            )}
          </ul>

          {c.winners_drawn && (
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Trophy className="h-3 w-3 text-amber-500" />Vencedores publicados.
            </p>
          )}
          {c.status === 'cancelled' && (
            <p className="text-[11px] text-rose-600 inline-flex items-center gap-1">
              <XCircle className="h-3 w-3" />Campanha cancelada.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default AdminCoxHistoryPanel;
