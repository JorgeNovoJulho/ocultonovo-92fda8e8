import { useState } from 'react';
import { Loader2, RotateCw, Flag, SkipForward, ThumbsUp } from 'lucide-react';
import { useSocialBetaRuntime } from '@/hooks/useSocialBetaModules';
import { SocialBetaReportDialog } from '@/components/social-beta/SocialBetaReportDialog';

interface Props { sessionId: string; moduleCode: string; moduleName: string; }

/** Roda da Interação — roleta gira ao sortear. Paleta ciano. */
export default function RodaInteracaoModule({ sessionId, moduleCode, moduleName }: Props) {
  const { card, drawing, error, drawCard, logEvent } = useSocialBetaRuntime(sessionId, moduleCode);
  const [report, setReport] = useState<null | { type: 'module' } | { type: 'card'; cardId: string; content: string }>(null);

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-sky-500/5 to-transparent p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold truncate">{moduleName}</p>
        <button onClick={() => setReport({ type: 'module' })} aria-label="Denunciar módulo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
          <Flag className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 py-2">
        <div className={`inline-flex h-20 w-20 items-center justify-center rounded-full border-2 border-cyan-500/40 bg-cyan-500/10 text-cyan-500 ${drawing ? 'animate-spin' : ''}`}>
          <RotateCw className="h-8 w-8" />
        </div>
        <button onClick={drawCard} disabled={drawing}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-500 px-5 text-sm font-medium text-white disabled:opacity-60">
          {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
          {card ? 'Girar de novo' : 'Girar a roda'}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {card && (
        <div className="rounded-xl border border-cyan-500/20 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded bg-cyan-500/15 text-cyan-600 px-2 py-0.5 capitalize">{card.level}</span>
            {card.category && <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">{card.category}</span>}
            <button onClick={() => setReport({ type: 'card', cardId: card.id, content: card.content })}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-destructive" aria-label="Denunciar card">
              <Flag className="h-3 w-3" />
            </button>
          </div>
          <p className="text-base leading-relaxed">{card.content}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => logEvent('answer', { card_id: card.id, vote: 'up', level: card.level })}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm">
              <ThumbsUp className="h-4 w-4" /> Curti
            </button>
            <button onClick={() => { logEvent('round_end', { card_id: card.id, reason: 'skip' }); drawCard(); }}
              className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground">
              <SkipForward className="h-4 w-4" /> Pular
            </button>
          </div>
        </div>
      )}

      {report && (
        <SocialBetaReportDialog open onOpenChange={(v) => { if (!v) setReport(null); }}
          target={report.type === 'module'
            ? { type: 'module', moduleCode, moduleName, sessionId }
            : { type: 'card', cardId: report.cardId, cardPreview: report.content, moduleCode, sessionId }} />
      )}
    </div>
  );
}
