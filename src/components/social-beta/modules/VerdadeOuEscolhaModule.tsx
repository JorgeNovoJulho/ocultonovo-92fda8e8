import { useState } from 'react';
import { Loader2, Eye, Footprints, Flag, SkipForward, ThumbsUp } from 'lucide-react';
import { useSocialBetaRuntime } from '@/hooks/useSocialBetaModules';
import { SocialBetaReportDialog } from '@/components/social-beta/SocialBetaReportDialog';

interface Props { sessionId: string; moduleCode: string; moduleName: string; }
type Choice = 'verdade' | 'escolha';

/** Verdade ou Escolha — usuário escolhe o tipo antes de sortear. Paleta rosa/violeta. */
export default function VerdadeOuEscolhaModule({ sessionId, moduleCode, moduleName }: Props) {
  const { card, drawing, error, drawCard, logEvent } = useSocialBetaRuntime(sessionId, moduleCode);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [report, setReport] = useState<null | { type: 'module' } | { type: 'card'; cardId: string; content: string }>(null);

  const onChoose = (c: Choice) => { setChoice(c); logEvent('choice', { choice: c }); drawCard(); };

  return (
    <div className="rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 via-violet-500/5 to-transparent p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold truncate">{moduleName}</p>
        <button onClick={() => setReport({ type: 'module' })} aria-label="Denunciar módulo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
          <Flag className="h-4 w-4" />
        </button>
      </div>

      {!card && !drawing && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onChoose('verdade')}
            className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-600 hover:bg-fuchsia-500/15 active:scale-[0.99] transition-transform">
            <Eye className="h-5 w-5" /><span className="text-sm font-medium">Verdade</span>
          </button>
          <button onClick={() => onChoose('escolha')}
            className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-600 hover:bg-violet-500/15 active:scale-[0.99] transition-transform">
            <Footprints className="h-5 w-5" /><span className="text-sm font-medium">Escolha</span>
          </button>
        </div>
      )}

      {drawing && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Sorteando…</div>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {card && (
        <div className="rounded-xl border border-fuchsia-500/20 bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px]">
            {choice && <span className="rounded bg-fuchsia-500/15 text-fuchsia-600 px-2 py-0.5 capitalize">{choice}</span>}
            <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground capitalize">{card.level}</span>
            <button onClick={() => setReport({ type: 'card', cardId: card.id, content: card.content })}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-destructive" aria-label="Denunciar card">
              <Flag className="h-3 w-3" />
            </button>
          </div>
          <p className="text-base leading-relaxed">{card.content}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => logEvent('answer', { card_id: card.id, vote: 'up', level: card.level })}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm">
              <ThumbsUp className="h-4 w-4" /> Cumprido
            </button>
            <button onClick={() => { setChoice(null); logEvent('round_end', { card_id: card.id, reason: 'skip' }); }}
              className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground">
              <SkipForward className="h-4 w-4" /> Nova rodada
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
