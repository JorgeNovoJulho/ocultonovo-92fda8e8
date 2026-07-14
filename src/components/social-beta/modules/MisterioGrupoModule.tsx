import { useEffect, useState } from 'react';
import { Loader2, EyeOff, Eye, Flag, SkipForward, ThumbsUp } from 'lucide-react';
import { useSocialBetaRuntime } from '@/hooks/useSocialBetaModules';
import { SocialBetaReportDialog } from '@/components/social-beta/SocialBetaReportDialog';

interface Props { sessionId: string; moduleCode: string; moduleName: string; }

/** Mistério do Grupo — card vem com véu/blur, revela ao tocar. Paleta índigo. */
export default function MisterioGrupoModule({ sessionId, moduleCode, moduleName }: Props) {
  const { card, drawing, error, drawCard, logEvent } = useSocialBetaRuntime(sessionId, moduleCode);
  const [revealed, setRevealed] = useState(false);
  const [report, setReport] = useState<null | { type: 'module' } | { type: 'card'; cardId: string; content: string }>(null);

  useEffect(() => { setRevealed(false); }, [card?.id]);

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold truncate">{moduleName}</p>
        <button onClick={() => setReport({ type: 'module' })} aria-label="Denunciar módulo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
          <Flag className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!card && !error && (
        <p className="text-sm text-muted-foreground">Toque para receber um mistério velado. Toque novamente para revelar.</p>
      )}

      {card && (
        <button type="button" onClick={() => { if (!revealed) { setRevealed(true); logEvent('reveal', { card_id: card.id, level: card.level }); } }}
          className="w-full text-left rounded-xl border border-indigo-500/20 bg-card p-4 space-y-3 active:scale-[0.995] transition-transform">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded bg-indigo-500/15 text-indigo-600 px-2 py-0.5 capitalize">{card.level}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground inline-flex items-center gap-1">
              {revealed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {revealed ? 'Revelado' : 'Velado'}
            </span>
            <span onClick={(e) => { e.stopPropagation(); setReport({ type: 'card', cardId: card.id, content: card.content }); }}
              role="button" className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-destructive" aria-label="Denunciar card">
              <Flag className="h-3 w-3" />
            </span>
          </div>
          <p className={`text-base leading-relaxed transition ${revealed ? '' : 'blur-md select-none'}`}>{card.content}</p>
          {!revealed && <p className="text-xs text-indigo-500/80">Toque para revelar</p>}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={drawCard} disabled={drawing}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-4 text-sm font-medium text-white disabled:opacity-60">
          {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
          {card ? 'Novo mistério' : 'Sortear mistério'}
        </button>
        {card && revealed && (
          <>
            <button onClick={() => logEvent('answer', { card_id: card.id, vote: 'up', level: card.level })}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm">
              <ThumbsUp className="h-4 w-4" /> Top
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
