/**
 * Acompanhamento público de uma Caixa Oculta.
 * Mostra status, prêmios, vencedores e linha do tempo (audit logs públicos).
 * Rota: /caixa-oculta/:id
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Box,
  CalendarClock,
  CheckCircle2,
  Trophy,
  XCircle,
  Hourglass,
  Users,
  Sparkles,
  Radio,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useCaixaOcultaCampaign } from '@/hooks/useCaixaOculta';
import { CaixaOcultaWinnersView } from '@/components/caixa-oculta/CaixaOcultaWinnersView';

type TimelineItem = {
  key: string;
  label: string;
  at: string | null;
  icon: typeof CheckCircle2;
  tone: 'ok' | 'warn' | 'bad' | 'muted';
};

export default function CaixaOcultaTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useCaixaOcultaCampaign(id);
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [rtStatus, setRtStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [pulse, setPulse] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const prevRef = useRef<{ winners_drawn: boolean; approval_status: string; status: string; winnersCount: number } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const camp = data?.campaign;
  const prizes = data?.prizes ?? [];
  const winners = data?.winners ?? [];

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!camp) return [];
    return [
      { key: 'created', label: 'Campanha criada', at: camp.created_at, icon: Sparkles, tone: 'muted' },
      {
        key: 'submitted',
        label: 'Enviada para aprovação',
        at: camp.approval_status !== 'draft' ? camp.created_at : null,
        icon: Hourglass,
        tone: 'muted',
      },
      {
        key: 'approval',
        label:
          camp.approval_status === 'approved'
            ? 'Aprovada pelo Admin Master'
            : camp.approval_status === 'rejected'
              ? `Reprovada · ${camp.rejection_reason ?? 'sem motivo'}`
              : 'Aguardando aprovação',
        at: camp.approval_status === 'pending_approval' ? null : camp.created_at,
        icon: camp.approval_status === 'rejected' ? XCircle : CheckCircle2,
        tone:
          camp.approval_status === 'approved' ? 'ok' : camp.approval_status === 'rejected' ? 'bad' : 'warn',
      },
      {
        key: 'draw_at',
        label: `Sorteio programado · ${new Date(camp.draw_at).toLocaleString('pt-BR')}`,
        at: camp.draw_at,
        icon: CalendarClock,
        tone: 'muted',
      },
      {
        key: 'drawn',
        label: camp.winners_drawn
          ? 'Apuração concluída'
          : camp.status === 'cancelled'
            ? 'Campanha cancelada'
            : 'Aguardando apuração',
        at: camp.drawn_at,
        icon: camp.status === 'cancelled' ? XCircle : Trophy,
        tone: camp.winners_drawn ? 'ok' : camp.status === 'cancelled' ? 'bad' : 'warn',
      },
    ];
  }, [camp]);

  // Subscribe to realtime updates of winners + campaign
  useEffect(() => {
    if (!id) return;
    const onChange = () => {
      setNow(Date.now());
      setPulse((p) => p + 1);
      setLastEventAt(Date.now());
      qc.invalidateQueries({ queryKey: ['cox-campaign', id] });
    };
    setRtStatus('live');
    const unsubCamp = subscribeTable('oculto_caixa_oculta_campaigns', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.id !== id) return;
      onChange();
    });
    const unsubWin = subscribeTable('oculto_caixa_oculta_winners', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.campaign_id !== id) return;
      onChange();
    });

    const onOffline = () => setRtStatus('offline');
    const onOnline = () => setRtStatus('live');
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      unsubCamp();
      unsubWin();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [id, qc]);

  // Detect status transitions and notify with toasts
  useEffect(() => {
    if (!camp) return;
    const curr = {
      winners_drawn: !!camp.winners_drawn,
      approval_status: camp.approval_status,
      status: camp.status,
      winnersCount: winners.length,
    };
    const prev = prevRef.current;
    if (prev) {
      if (!prev.winners_drawn && curr.winners_drawn) {
        toast.success('🏆 Vencedores apurados!', {
          description: `${curr.winnersCount} vencedor(es) acabaram de ser sorteados.`,
        });
      } else if (prev.winnersCount < curr.winnersCount && curr.winners_drawn) {
        toast.success(`Novo vencedor registrado (${curr.winnersCount})`);
      }
      if (prev.approval_status !== curr.approval_status) {
        if (curr.approval_status === 'approved') toast.success('Campanha aprovada pelo Admin Master.');
        else if (curr.approval_status === 'rejected') toast.error(`Campanha reprovada${camp.rejection_reason ? `: ${camp.rejection_reason}` : '.'}`);
      }
      if (prev.status !== curr.status && curr.status === 'cancelled') {
        toast.warning('Campanha cancelada.');
      }
    }
    prevRef.current = curr;
  }, [camp, winners.length]);


  if (isLoading) {
    return (
      <div className="container mx-auto p-4 max-w-3xl">
        <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  if (!camp) {
    return (
      <div className="container mx-auto p-6 max-w-3xl text-center">
        <p className="text-sm text-muted-foreground">Caixa Oculta não encontrada.</p>
        <Button variant="ghost" asChild className="mt-3">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link>
        </Button>
      </div>
    );
  }

  const drawTs = new Date(camp.draw_at).getTime();
  const eta = drawTs - now;
  const etaText =
    eta > 0
      ? `Faltam ${formatDuration(eta)} para o sorteio`
      : camp.winners_drawn
        ? `Sorteado em ${new Date(camp.drawn_at!).toLocaleString('pt-BR')}`
        : 'Apuração disponível';

  return (
    <div className="container mx-auto p-4 max-w-3xl pb-24 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Voltar ao feed</Link>
        </Button>
        <RealtimeIndicator status={rtStatus} pulse={pulse} lastEventAt={lastEventAt} />
      </div>

      <Card>
        <CardContent className="p-0 overflow-hidden">
          {camp.cover_url ? (
            <img loading="lazy" decoding="async"
              src={camp.cover_url}
              alt=""
              className="w-full h-48 object-cover"
            />
          ) : (
            <div className="h-32 bg-gradient-to-br from-amber-500/20 to-rose-500/20 grid place-items-center">
              <Box className="h-10 w-10 text-amber-500" />
            </div>
          )}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-xl font-bold truncate">{camp.title}</h1>
                <p className="text-xs text-muted-foreground">
                  {camp.xp_cost} XP por participação
                </p>
              </div>
              <Badge variant="outline" className="capitalize">{camp.approval_status}</Badge>
            </div>
            {camp.description && <p className="text-sm text-foreground/90">{camp.description}</p>}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{camp.participants_count} participantes</span>
              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{etaText}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status / Vencedores */}
      {camp.winners_drawn ? (
        <CaixaOcultaWinnersView campaignId={camp.id} />
      ) : (
        <Card>
          <CardContent className="p-4 text-center space-y-2">
            <Trophy className="h-6 w-6 mx-auto text-amber-500" />
            <p className="text-sm font-medium">
              {camp.status === 'cancelled' ? 'Esta campanha foi cancelada' : 'Vencedores ainda não foram apurados'}
            </p>
            <p className="text-xs text-muted-foreground">
              {camp.status === 'cancelled'
                ? 'Os XPs gastos foram (ou serão) reembolsados conforme política da plataforma.'
                : 'Esta página atualiza automaticamente quando o sorteio for realizado.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Prêmios */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3">Prêmios</h2>
          <ul className="space-y-2">
            {prizes.map((p) => {
              const won = winners.find((w) => w.prize_position === p.prize_position);
              return (
                <li key={p.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-500/15 text-amber-600 text-sm font-bold">
                    {p.prize_position}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1 capitalize">{p.prize_kind}</p>
                  </div>
                  {won && (
                    <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 shrink-0">
                      Vencedor
                    </Badge>
                  )}
                </li>
              );
            })}
            {!prizes.length && <p className="text-xs text-muted-foreground">Nenhum prêmio cadastrado.</p>}
          </ul>
        </CardContent>
      </Card>

      {/* Linha do tempo */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold mb-3">Linha do tempo</h2>
          <ol className="relative border-l border-border/60 pl-4 space-y-3">
            {timeline.map((t) => {
              const Icon = t.icon;
              const tone =
                t.tone === 'ok'
                  ? 'text-emerald-600'
                  : t.tone === 'warn'
                    ? 'text-amber-600'
                    : t.tone === 'bad'
                      ? 'text-rose-600'
                      : 'text-muted-foreground';
              return (
                <li key={t.key} className="relative">
                  <span className={`absolute -left-[22px] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-background ring-2 ring-border ${tone}`}>
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <p className="text-sm">{t.label}</p>
                  {t.at && (
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(t.at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function RealtimeIndicator({
  status,
  pulse,
  lastEventAt,
}: {
  status: 'connecting' | 'live' | 'offline';
  pulse: number;
  lastEventAt: number | null;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!pulse) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1200);
    return () => window.clearTimeout(t);
  }, [pulse]);

  const cfg =
    status === 'live'
      ? { dot: 'bg-emerald-500', text: 'Ao vivo', icon: Radio, tone: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/5' }
      : status === 'connecting'
        ? { dot: 'bg-amber-500', text: 'Conectando…', icon: Radio, tone: 'text-amber-600 border-amber-500/30 bg-amber-500/5' }
        : { dot: 'bg-zinc-400', text: 'Sem conexão', icon: WifiOff, tone: 'text-zinc-600 border-zinc-400/30 bg-zinc-400/5' };

  const Icon = cfg.icon;
  const sinceText = lastEventAt
    ? ` · atualizado ${formatRelative(Date.now() - lastEventAt)}`
    : '';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        cfg.tone,
        flash && 'ring-2 ring-emerald-400/60',
      )}
      title={status === 'live' ? 'Você está vendo atualizações em tempo real' : 'Tentando reconectar para atualizações ao vivo'}
      aria-live="polite"
    >
      <span className="relative inline-flex h-2 w-2">
        {status === 'live' && (
          <span className={cn('absolute inset-0 rounded-full opacity-70 animate-ping', cfg.dot)} />
        )}
        <span className={cn('relative inline-block h-2 w-2 rounded-full', cfg.dot)} />
      </span>
      <Icon className="h-3 w-3" aria-hidden />
      <span>{cfg.text}{sinceText}</span>
    </div>
  );
}

function formatRelative(ms: number) {
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

