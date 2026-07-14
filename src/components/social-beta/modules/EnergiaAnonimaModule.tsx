import { useState } from 'react';
import { Loader2, Zap, Flag, ThumbsUp, ThumbsDown, SkipForward } from 'lucide-react';
import { useSocialBetaRuntime } from '@/hooks/useSocialBetaModules';
import { SocialBetaReportDialog } from '@/components/social-beta/SocialBetaReportDialog';

interface Props { sessionId: string; moduleCode: string; moduleName: string; }

/** Energia Anônima — pulso animado e voto sem identidade. Paleta amarela. */
export default function EnergiaAnonimaModule({ sessionId, moduleCode, moduleName }: Props) {
  const { card, drawing, error, drawCard, logEvent } = useSocialBetaRuntime(sessionId, moduleCode);
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);
  const [report, setReport] = useState<null | { type: 'module' } | { type: 'card'; cardId: string; content: string }>(null);

  const vote = (v: 'up' | 'down') => {
    if (!card || voted) return;
    setVoted(v);
    logEvent('answer', { card_id: card.id, vote: v, level: card.level, anonymous: true });
  };

  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 via-orange-500/5 to-transparent p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/15 text-yellow-500">
            <Zap className="h-4 w-4" />
            <span className="absolute inset-0 rounded-lg bg-yellow-500/20 animate-ping" />
          </span>
          <p className="text-sm font-semibold truncate">{moduleName}</p>
        </div>
        <button onClick={() => setReport({ type: 'module' })} aria-label="Denunciar módulo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
          <Flag className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!card && !error && (
        <p className="text-sm text-muted-foreground">Sorteie um sinal e responda em silêncio. Ninguém vê quem votou o quê.</p>
      )}

      {card && (
        <div className="rounded-xl border border-yellow-500/20 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded bg-yellow-500/15 text-yellow-600 px-2 py-0.5 capitalize">{card.level}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">anônimo</span>
            <button onClick={() => setReport({ type: 'card', cardId: card.id, content: card.content })}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-destructive" aria-label="Denunciar card">
              <Flag className="h-3 w-3" />
            </button>
          </div>
          <p className="text-base leading-relaxed">{card.content}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => vote('up')} disabled={!!voted}
              className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border text-sm transition ${voted === 'up' ? 'border-yellow-500 bg-yellow-500/15 text-yellow-700' : 'border-border'} ${voted ? 'opacity-60' : ''}`}>
              <ThumbsUp className="h-4 w-4" /> Sinto
            </button>
            <button onClick={() => vote('down')} disabled={!!voted}
              className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border text-sm transition ${voted === 'down' ? 'border-muted-foreground bg-muted text-foreground' : 'border-border'} ${voted ? 'opacity-60' : ''}`}>
              <ThumbsDown className="h-4 w-4" /> Não sinto
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setVoted(null); drawCard(); }} disabled={drawing}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-4 text-sm font-medium text-white disabled:opacity-60">
          {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {card ? 'Outro sinal' : 'Captar sinal'}
        </button>
        {card && (
          <button onClick={() => { logEvent('round_end', { card_id: card.id, reason: 'skip' }); setVoted(null); drawCard(); }}
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground">
            <SkipForward className="h-4 w-4" /> Pular
          </button>
        )}
      </div>

      {report && (
        <SocialBetaReportDialog open onOpenChange={(v) => { if (!v) setReport(null); }}
          target={report.type === 'module'
            ? { type: 'module', moduleCode, moduleName, sessionId }
            : { type: 'card', cardId: report.cardId, cardPreview: report.content, moduleCode, sessionId }} />
      )}
    </div>
  );
}
