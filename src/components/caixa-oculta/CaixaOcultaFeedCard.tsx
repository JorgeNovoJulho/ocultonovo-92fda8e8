/**
 * CaixaOcultaFeedCard — card distinto no feed para campanhas Caixa Oculta.
 * Estados: ativa, sem-xp, já-participando, aguardando-apuração, apurada, cancelada.
 * Performance: lazy cover, countdown 60s, sem animação pesada, modais sob demanda.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Clock, Users, Sparkles, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import {
  type CoxCampaign,
  useCaixaOcultaCampaign,
} from '@/hooks/useCaixaOculta';
import { ConfirmParticiparCaixaOcultaModal } from './ConfirmParticiparCaixaOcultaModal';
import { CaixaOcultaParticipantsModal } from './CaixaOcultaParticipantsModal';
import { CaixaOcultaWinnersView } from './CaixaOcultaWinnersView';

interface Props { campaign: CoxCampaign; }

function formatRemaining(target: string): { label: string; ended: boolean } {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return { label: 'Encerrada — aguardando apuração', ended: true };
  const m = Math.floor(diff / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return { label: `${d}d ${h}h restantes`, ended: false };
  if (h > 0) return { label: `${h}h ${mm}min restantes`, ended: false };
  return { label: `${mm}min restantes`, ended: false };
}

export function CaixaOcultaFeedCard({ campaign }: Props) {
  const { user } = useAuth();
  const { progress } = useAuraProgress(false);
  const { data: detail, isLoading } = useCaixaOcultaCampaign(campaign.id);
  const [, force] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // countdown leve: 60s
  useEffect(() => {
    const i = window.setInterval(() => force((x) => x + 1), 60_000);
    return () => window.clearInterval(i);
  }, []);

  const { label: remainingLabel, ended } = useMemo(
    () => formatRemaining(campaign.draw_at),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign.draw_at, force]
  );

  const xp = progress?.xp ?? 0;
  const isCreator = user?.id && user.id === campaign.creator_id;
  const alreadyIn = !!detail?.myEntry;
  const isCancelled = campaign.status === 'cancelled';
  const isDrawn = campaign.winners_drawn || campaign.status === 'drawn';
  const isClosedWaiting = !isDrawn && !isCancelled && (ended || campaign.status === 'closed');
  const isActive = !isDrawn && !isCancelled && !isClosedWaiting && campaign.status === 'active';
  const insufficientXp = isActive && !alreadyIn && xp < campaign.xp_cost;

  // ---------- CTA principal por estado ----------
  let primaryCta: React.ReactNode = null;
  if (isCancelled) {
    primaryCta = (
      <div className="rounded-lg bg-muted/60 p-3 text-center text-sm font-medium text-muted-foreground">
        Caixa encerrada
      </div>
    );
  } else if (isDrawn) {
    primaryCta = <CaixaOcultaWinnersView campaignId={campaign.id} />;
  } else if (isClosedWaiting) {
    primaryCta = (
      <div className="rounded-lg bg-muted/60 p-3 text-center text-sm font-medium">
        <Loader2 className="inline h-3.5 w-3.5 mr-1 animate-spin" />
        Aguardando apuração
      </div>
    );
  } else if (isCreator) {
    primaryCta = (
      <div className="rounded-lg bg-amber-500/10 p-3 text-center text-xs text-amber-600 dark:text-amber-300">
        Você é o criador desta Caixa
      </div>
    );
  } else if (alreadyIn) {
    primaryCta = (
      <div className="rounded-lg bg-amber-500/10 p-3 text-center text-sm font-medium text-amber-600 dark:text-amber-300">
        Você está participando · Entrada #{detail?.myEntry?.entry_number}
      </div>
    );
  } else if (insufficientXp) {
    primaryCta = (
      <div className="space-y-2">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center text-xs text-destructive">
          XP insuficiente para participar (faltam {campaign.xp_cost - xp} XP).
        </div>
        <Button className="w-full" variant="outline" disabled>
          Participar por {campaign.xp_cost} XP
        </Button>
      </div>
    );
  } else {
    primaryCta = (
      <Button className="w-full" onClick={() => setConfirmOpen(true)} disabled={!user}>
        <Sparkles className="mr-2 h-4 w-4" />
        Participar por {campaign.xp_cost} XP
      </Button>
    );
  }

  return (
    <>
      <article className="overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-card">
        {campaign.cover_url && (
          <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
            <img
              src={campaign.cover_url}
              alt={campaign.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-amber-400/50 text-amber-500">
              <Box className="mr-1 h-3 w-3" /> Caixa Oculta
            </Badge>
            {isDrawn && <Badge variant="secondary">Apurada</Badge>}
            {isCancelled && <Badge variant="destructive">Cancelada</Badge>}
            {isClosedWaiting && <Badge variant="secondary">Aguardando</Badge>}
            {isActive && !alreadyIn && <Badge className="bg-amber-500 text-white hover:bg-amber-500">Aberta</Badge>}
          </div>

          <h3 className="font-semibold text-base leading-tight line-clamp-2">{campaign.title}</h3>
          {campaign.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{campaign.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> {campaign.xp_cost} XP
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {campaign.participants_count} participantes
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {remainingLabel}
            </span>
          </div>

          {isLoading && !detail ? (
            <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
          ) : (
            primaryCta
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2"
              onClick={() => setParticipantsOpen(true)}
            >
              <Users className="mr-1 h-3.5 w-3.5" /> Ver participantes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2"
              onClick={() => setRulesOpen(true)}
            >
              <Info className="mr-1 h-3.5 w-3.5" /> Ver regras
            </Button>
          </div>
        </div>
      </article>

      {confirmOpen && (
        <ConfirmParticiparCaixaOcultaModal
          campaign={campaign}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
        />
      )}

      {participantsOpen && (
        <CaixaOcultaParticipantsModal
          campaign={campaign}
          open={participantsOpen}
          onOpenChange={setParticipantsOpen}
        />
      )}

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Regras da Caixa Oculta</DialogTitle>
            <DialogDescription className="line-clamp-2">{campaign.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Cada usuário pode participar <strong>uma única vez</strong> por Caixa.</li>
              <li>Custo de <strong>{campaign.xp_cost} XP</strong>, debitado imediatamente ao confirmar.</li>
              <li>Apuração automática em <strong>{new Date(campaign.draw_at).toLocaleString('pt-BR')}</strong>.</li>
              <li>O sorteio é determinístico e auditável (hash registrado).</li>
              <li>Criadores não podem participar das próprias Caixas.</li>
              <li>Caso a Caixa seja cancelada, o XP pode ser estornado conforme política.</li>
            </ul>
            {detail?.prizes?.length ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Prêmios
                </p>
                <ul className="space-y-1 text-sm">
                  {detail.prizes.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate"><strong>#{p.prize_position}</strong> {p.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{p.prize_kind}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CaixaOcultaFeedCard;
