import { useState } from 'react';
import { Loader2, Shuffle, ThumbsUp, ThumbsDown, SkipForward, Flag } from 'lucide-react';
import { useSocialBetaRuntime } from '@/hooks/useSocialBetaModules';
import { SocialBetaReportDialog } from '@/components/social-beta/SocialBetaReportDialog';

interface Props {
  sessionId: string;
  moduleCode: string;
  moduleName: string;
  ctaLabel?: string;
}

/**
 * Componente genérico para módulos baseados em sorteio de cards.
 * Usa o schema real: `code` no módulo, `content` no card, `kind` no evento.
 */
export function GenericCardModule({ sessionId, moduleCode, moduleName, ctaLabel = 'Sortear card' }: Props) {
  const { card, drawing, error, drawCard, logEvent } = useSocialBetaRuntime(sessionId, moduleCode);
  const [reportTarget, setReportTarget] = useState<
    | null
    | { type: 'module' }
    | { type: 'card'; cardId: string; content: string }
  >(null);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground truncate">{moduleName}</p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setReportTarget({ type: 'module' })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive"
            title="Denunciar este módulo"
            aria-label="Denunciar módulo"
          >
            <Flag className="h-3 w-3" />
          </button>
          <button
            onClick={drawCard}
            disabled={drawing}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {drawing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
            {ctaLabel}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!card && !error && (
        <p className="text-sm text-muted-foreground">
          Toque em <strong>{ctaLabel}</strong> para abrir uma rodada deste módulo.
        </p>
      )}

      {card && (
        <div className="rounded-lg border border-border bg-background p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-2 py-0.5 capitalize">{card.level}</span>
            {card.category && <span className="rounded bg-muted px-2 py-0.5">{card.category}</span>}
            <button
              onClick={() => setReportTarget({ type: 'card', cardId: card.id, content: card.content })}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-destructive"
              title="Denunciar este card"
              aria-label="Denunciar card"
            >
              <Flag className="h-3 w-3" /> Denunciar
            </button>
          </div>
          <p className="text-base leading-relaxed">{card.content}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              onClick={() => logEvent('answer', { card_id: card.id, vote: 'up', level: card.level })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
            >
              <ThumbsUp className="h-3 w-3" /> Curti
            </button>
            <button
              onClick={() => logEvent('answer', { card_id: card.id, vote: 'down', level: card.level })}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
            >
              <ThumbsDown className="h-3 w-3" /> Não curti
            </button>
            <button
              onClick={() => { logEvent('round_end', { card_id: card.id, reason: 'skip' }); drawCard(); }}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
            >
              <SkipForward className="h-3 w-3" /> Pular
            </button>
          </div>
        </div>
      )}

      {reportTarget && (
        <SocialBetaReportDialog
          open
          onOpenChange={(v) => { if (!v) setReportTarget(null); }}
          target={
            reportTarget.type === 'module'
              ? { type: 'module', moduleCode, moduleName, sessionId }
              : { type: 'card', cardId: reportTarget.cardId, cardPreview: reportTarget.content, moduleCode, sessionId }
          }
        />
      )}
    </div>
  );
}

export default GenericCardModule;
