/**
 * PlayWeeklyChallengeCard — Etapa 54
 * Mostra o desafio ativo da semana e top 5 do leaderboard.
 */
import { useState } from 'react';
import { Trophy, CalendarClock, Hash, Gift } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useOcultoPlayWeeklyChallenge,
  useOcultoPlayChallengeLeaderboard,
} from '@/hooks/useOcultoPlayExtras';
import { cn } from '@/lib/utils';

interface Props { className?: string; onOpenItem?: (itemId: string) => void; }

export function PlayWeeklyChallengeCard({ className, onOpenItem }: Props) {
  const { data: challenge, isLoading } = useOcultoPlayWeeklyChallenge();
  const [open, setOpen] = useState(false);

  if (isLoading || !challenge) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'w-full text-left rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-fuchsia-500/5 to-transparent p-3 md:p-4 flex items-center gap-3 hover:border-amber-400/70 transition-all',
          className,
        )}
      >
        <div className="grid place-items-center h-10 w-10 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
          <Trophy className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold">
            Desafio da semana
          </div>
          <div className="text-sm font-bold truncate">{challenge.theme_title}</div>
          {challenge.theme_description && (
            <div className="text-[11px] text-muted-foreground truncate">
              {challenge.theme_description}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-bold text-amber-300">{challenge.submissions_count}</div>
          <div className="text-[10px] text-muted-foreground">envios</div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              {challenge.theme_title}
            </DialogTitle>
          </DialogHeader>
          <ChallengeBody
            challenge={challenge}
            onOpenItem={(id) => { setOpen(false); onOpenItem?.(id); }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChallengeBody({
  challenge,
  onOpenItem,
}: {
  challenge: ReturnType<typeof useOcultoPlayWeeklyChallenge>['data'];
  onOpenItem?: (id: string) => void;
}) {
  const { data: board = [] } = useOcultoPlayChallengeLeaderboard(challenge?.id ?? null);
  if (!challenge) return null;
  return (
    <div className="space-y-3 text-sm">
      {challenge.theme_description && (
        <p className="text-muted-foreground text-[13px]">{challenge.theme_description}</p>
      )}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <Info icon={<CalendarClock className="h-3 w-3" />} label="Período">
          {new Date(challenge.week_start).toLocaleDateString('pt-BR')} —{' '}
          {new Date(challenge.week_end).toLocaleDateString('pt-BR')}
        </Info>
        {challenge.hashtag && (
          <Info icon={<Hash className="h-3 w-3" />} label="Tag">
            #{challenge.hashtag.replace(/^#/, '')}
          </Info>
        )}
        {challenge.prize_description && (
          <Info icon={<Gift className="h-3 w-3" />} label="Prêmio">
            {challenge.prize_description}
          </Info>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Top 5 da semana
        </div>
        {board.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum envio ainda. Seja o primeiro.</p>
        ) : (
          <ul className="space-y-1.5">
            {board.slice(0, 5).map((row, i) => (
              <li key={row.item_id}>
                <button
                  type="button"
                  onClick={() => onOpenItem?.(row.item_id)}
                  className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/40 text-left"
                >
                  <div className="w-6 text-center text-xs font-bold text-amber-300">{i + 1}</div>
                  {row.thumb_url ? (
                    <img
                      src={row.thumb_url}
                      alt=""
                      className="h-9 w-9 rounded object-cover bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">{row.title || 'Sem título'}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      @{row.author_username || '—'} · {row.view_count} views ·{' '}
                      {row.recent_reactions} reações
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 p-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 font-medium text-foreground truncate">{children}</div>
    </div>
  );
}
