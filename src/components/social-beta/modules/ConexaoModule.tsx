import { useState } from 'react';
import { Loader2, Sparkles, Heart, SkipForward, Flag } from 'lucide-react';
import { useSocialBetaRuntime } from '@/hooks/useSocialBetaModules';
import { SocialBetaReportDialog } from '@/components/social-beta/SocialBetaReportDialog';

interface Props { sessionId: string; moduleCode: string; moduleName: string; }

/** Conexão — card de revelação, paleta âmbar/rosa. */
export default function ConexaoModule({ sessionId, moduleCode, moduleName }: Props) {
  const { card, drawing, error, drawCard, logEvent } = useSocialBetaRuntime(sessionId, moduleCode);
  const [report, setReport] = useState<null | { type: 'module' } | { type: 'card'; cardId: string; content: string }>(null);

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-rose-500/5 to-transparent p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500"><Sparkles className="h-4 w-4" /></span>
          <p className="text-sm font-semibold truncate">{moduleName}</p>
        </div>
        <button onClick={() => setReport({ type: 'module' })} aria-label="Denunciar módulo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
          <Flag className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!card && !error && (
        <p className="text-sm text-muted-foreground">Toque para revelar uma carta de conexão para a rodada.</p>
      )}

      {card && (
        <div className="rounded-xl border border-amber-500/20 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded bg-amber-500/15 text-amber-600 px-2 py-0.5 capitalize">{card.level}</span>
            {card.category && <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">{card.category}</span>}
            <button onClick={() => setReport({ type: 'card', cardId: card.id, content: card.content })}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-destructive" aria-label="Denunciar card">
              <Flag className="h-3 w-3" />
            </button>
          </div>
          <p className="text-base leading-relaxed">{card.content}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={drawCard} disabled={drawing}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 px-4 text-sm font-medium text-white disabled:opacity-60">
          {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {card ? 'Outra carta' : 'Revelar carta'}
        </button>
        {card && (
          <>
            <button onClick={() => logEvent('answer', { card_id: card.id, vote: 'up', level: card.level })}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm">
              <Heart className="h-4 w-4 text-rose-500" /> Curti
            </button>
            <button onClick={() => { logEvent('round_end', { card_id: card.id, reason: 'skip' }); drawCard(); }}
              className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground">
              <SkipForward className="h-4 w-4" /> Pular
            </button>
          </>
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
